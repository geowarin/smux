import { describe, it, expect, vi } from "vitest";
import { createStateMachine, type MachineConfig } from "./index.ts";

type State = "idle" | "loading" | "success";
type Event = "FETCH" | "RESOLVE";

function makeConfig(): MachineConfig<State, Event> {
  return {
    initial: "idle",
    states: {
      idle: {
        on: { FETCH: "loading" },
      },
      loading: {
        on: { RESOLVE: "success" },
      },
      success: {
        on: {},
      },
    },
  };
}

describe("createStateMachine", () => {
  it("returns stable state reference when no change occurs", () => {
    const machine = createStateMachine<State, Event>(makeConfig());
    const a = machine.state;
    const b = machine.state;
    expect(a).toBe(b);
    expect(a.value).toBe("idle");
  });

  it("updates state reference only on actual transitions", () => {
    const machine = createStateMachine<State, Event>(makeConfig());
    const before = machine.state;
    machine.send("RESOLVE" as Event); // unhandled in idle
    const afterUnhandled = machine.state;
    expect(afterUnhandled).toBe(before); // same reference

    machine.send("FETCH");
    const after = machine.state;
    expect(after).not.toBe(before);
    expect(after.value).toBe("loading");
  });

  it("notifies subscribers only on changes", () => {
    const machine = createStateMachine<State, Event>(makeConfig());
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);

    // unhandled event should not trigger
    machine.send("RESOLVE" as Event);
    expect(listener).not.toHaveBeenCalled();

    machine.send("FETCH");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].value).toBe("loading");

    // unsubscribe should stop notifications
    unsubscribe();
    machine.send("RESOLVE");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("createStateMachine run effects", () => {
  it("runs enter effect for initial state", () => {
    const runIdle = vi.fn();
    const cfg: MachineConfig<State, Event> = {
      initial: "idle",
      states: {
        idle: { on: { FETCH: "loading" }, run: runIdle },
        loading: { on: { RESOLVE: "success" } },
        success: { on: {} },
      },
    };
    createStateMachine<State, Event>(cfg);
    expect(runIdle).toHaveBeenCalledTimes(1);
  });

  it("calls cleanup on transition before running next enter effect", () => {
    const cleanup = vi.fn();
    const runIdle = vi.fn(() => cleanup);
    const runLoading = vi.fn();
    const cfg: MachineConfig<State, Event> = {
      initial: "idle",
      states: {
        idle: { on: { FETCH: "loading" }, run: runIdle },
        loading: { on: { RESOLVE: "success" }, run: runLoading },
        success: { on: {} },
      },
    };
    const machine = createStateMachine<State, Event>(cfg);

    machine.send("FETCH");

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(runLoading).toHaveBeenCalledTimes(1);
  });

  it("stop() triggers pending cleanup only once", () => {
    const cleanup = vi.fn();
    const runIdle = vi.fn(() => cleanup);
    const cfg: MachineConfig<State, Event> = {
      initial: "idle",
      states: {
        idle: { on: { FETCH: "loading" }, run: runIdle },
        loading: { on: { RESOLVE: "success" } },
        success: { on: {} },
      },
    };
    const machine = createStateMachine<State, Event>(cfg);

    machine.stop();
    machine.stop();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("ignores self-transition and does not run cleanup/effect again", () => {
    const cleanup = vi.fn();
    const runIdle = vi.fn(() => cleanup);
    const cfg: MachineConfig<"idle", "STAY"> = {
      initial: "idle",
      states: {
        idle: { on: { STAY: "idle" }, run: runIdle },
      },
    };
    const machine = createStateMachine(cfg);

    expect(runIdle).toHaveBeenCalledTimes(1);

    machine.send("STAY");

    expect(cleanup).not.toHaveBeenCalled();
    expect(runIdle).toHaveBeenCalledTimes(1);
  });

  it("provides send in run and allows async transition", () => {
    vi.useFakeTimers();
    const onLoadingRun = vi.fn(({ send }: { send: (e: Event) => void }) => {
      setTimeout(() => send("RESOLVE"), 10);
    });

    const cfg: MachineConfig<State, Event> = {
      initial: "idle",
      states: {
        idle: { on: { FETCH: "loading" } },
        loading: { on: { RESOLVE: "success" }, run: onLoadingRun },
        success: { on: {} },
      },
    };

    const machine = createStateMachine<State, Event>(cfg);
    const listener = vi.fn();
    machine.subscribe(listener);

    machine.send("FETCH");
    expect(machine.state.value).toBe("loading");
    expect(onLoadingRun).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10);

    expect(machine.state.value).toBe("success");
    expect(listener).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("does not dispatch when called after transitioning away", () => {
    vi.useFakeTimers();

    type S = "a" | "b" | "c";
    type E = "GO" | "NEXT";

    const onARun = vi.fn(({ send }: { send: (e: E) => void }) => {
      setTimeout(() => {
        send("NEXT");
      }, 10);
    });

    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: {
        a: { on: { GO: "b" }, run: onARun },
        b: { on: { NEXT: "c" } },
        c: { on: {} },
      },
    };

    const machine = createStateMachine<S, E>(cfg);
    const listener = vi.fn();
    machine.subscribe(listener);

    expect(machine.state.value).toBe("a");

    machine.send("GO");
    expect(machine.state.value).toBe("b");

    vi.advanceTimersByTime(10);

    // If stale send were active, we'd move to "c" and notify again.
    expect(machine.state.value).toBe("b");
    expect(listener).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe("promise run effects", () => {
  it("resolves promise -> sends SUCCESS and passes payload to next run", async () => {
    type S = "loading" | "success" | "error";
    type E = "SUCCESS" | "ERROR";

    const onSuccessRun = vi.fn();

    const cfg: MachineConfig<S, E> = {
      initial: "loading",
      states: {
        loading: {
          on: { SUCCESS: "success", ERROR: "error" },
          run: () => Promise.resolve("Payload"),
        },
        success: {
          on: {},
          run: ({ payload }) => {
            onSuccessRun(payload);
          },
        },
        error: { on: {} },
      },
    };

    const machine = createStateMachine<S, E>(cfg);
    expect(machine.state.value).toBe("loading");

    await Promise.resolve();

    expect(machine.state.value).toBe("success");
    expect(onSuccessRun).toHaveBeenCalledTimes(1);
    expect(onSuccessRun.mock.calls[0][0]).toBe("Payload");
  });

  it("rejects promise -> sends ERROR and passes error to next run", async () => {
    type S = "loading" | "success" | "error";
    type E = "SUCCESS" | "ERROR";

    const onErrorRun = vi.fn();

    const err = new Error("Boom");

    const cfg: MachineConfig<S, E> = {
      initial: "loading",
      states: {
        loading: {
          on: { SUCCESS: "success", ERROR: "error" },
          run: () => Promise.reject(err),
        },
        success: { on: {} },
        error: {
          on: {},
          run: ({ payload }) => {
            onErrorRun(payload);
          },
        },
      },
    };

    const machine = createStateMachine<S, E>(cfg);
    expect(machine.state.value).toBe("loading");

    // allow promise microtasks to run
    await Promise.resolve();
    await Promise.resolve();

    expect(machine.state.value).toBe("error");
    expect(onErrorRun).toHaveBeenCalledTimes(1);
    expect(onErrorRun.mock.calls[0][0]).toBe(err);
  });

  it("ignores late resolve after leaving the state", async () => {
    type S = "loading" | "idle" | "success";
    type E = "SUCCESS" | "ERROR" | "CANCEL";

    let resolvePromise: ((v: unknown) => void) | undefined;
    const onSuccessRun = vi.fn();

    const cfg: MachineConfig<S, E> = {
      initial: "loading",
      states: {
        loading: {
          on: { SUCCESS: "success", ERROR: "idle", CANCEL: "idle" },
          run: () =>
            new Promise(res => {
              resolvePromise = res;
            }),
        },
        idle: { on: {} },
        success: { on: {}, run: ({ payload }) => onSuccessRun(payload) },
      },
    };

    const machine = createStateMachine<S, E>(cfg);
    expect(machine.state.value).toBe("loading");

    machine.send("CANCEL");
    expect(machine.state.value).toBe("idle");

    resolvePromise?.("Late");

    await Promise.resolve();

    expect(machine.state.value).toBe("idle");
    expect(onSuccessRun).not.toHaveBeenCalled();
  });
});

describe("payload extensions", () => {
  it("sets payload on explicit send and delivers to next run", () => {
    type S = "a" | "b";
    type E = "GO";
    const onB = vi.fn();
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: { on: {}, run: ({ payload }) => onB(payload) },
      },
    };
    const m = createStateMachine(cfg);
    m.send("GO", { x: 1 });
    expect(m.state.value).toBe("b");
    expect(m.state.payload).toEqual({ x: 1 });
    expect(onB).toHaveBeenCalledWith({ x: 1 });
  });

  it("self-transition/unhandled does not change payload", () => {
    type S = "a";
    type E = "STAY" | "NOOP";
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: { a: { on: { STAY: "a" } } },
    };
    const m = createStateMachine(cfg);
    m.send("STAY", { p: 1 });
    expect(m.state.value).toBe("a");
    expect(m.state.payload).toBeUndefined();
    m.send("NOOP" as E, { p: 2 });
    expect(m.state.payload).toBeUndefined();
  });

  it("promise resolve undefined -> payload becomes undefined", async () => {
    type S = "loading" | "success" | "error";
    type E = "SUCCESS" | "ERROR";
    const onSuccess = vi.fn();
    const cfg: MachineConfig<S, E> = {
      initial: "loading",
      states: {
        loading: {
          on: { SUCCESS: "success", ERROR: "error" },
          run: () => Promise.resolve(undefined),
        },
        success: { on: {}, run: ({ payload }) => onSuccess(payload) },
        error: { on: {} },
      },
    };
    const m = createStateMachine(cfg);
    await Promise.resolve();
    expect(m.state.value).toBe("success");
    expect(m.state.payload).toBeUndefined();
    expect(onSuccess).toHaveBeenCalledWith(undefined);
  });

  it("allows send(event, payload) from run", () => {
    type S = "a" | "b";
    type E = "GO";
    const onB = vi.fn();
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: {
        a: { on: { GO: "b" }, run: ({ send }) => send("GO", 42) },
        b: { on: {}, run: ({ payload }) => onB(payload) },
      },
    };
    const m = createStateMachine(cfg);
    expect(m.state.value).toBe("b");
    expect(m.state.payload).toBe(42);
    expect(onB).toHaveBeenCalledWith(42);
  });

  it("stop() prevents late promise from dispatching", async () => {
    type S = "loading" | "success" | "error";
    type E = "SUCCESS" | "ERROR";
    let resolve!: (v: unknown) => void;
    const cfg: MachineConfig<S, E> = {
      initial: "loading",
      states: {
        loading: {
          on: { SUCCESS: "success", ERROR: "error" },
          run: () => new Promise(res => (resolve = res)),
        },
        success: { on: {} },
        error: { on: {} },
      },
    };
    const m = createStateMachine(cfg);
    m.stop();
    resolve(1);
    await Promise.resolve();
    expect(m.state.value).toBe("loading");
  });

  it("notifies subscribers with updated payload", () => {
    type S = "a" | "b";
    type E = "GO";
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: { a: { on: { GO: "b" } }, b: { on: {} } },
    };
    const m = createStateMachine(cfg);
    const listener = vi.fn();
    m.subscribe(listener);
    m.send("GO", { n: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].payload).toEqual({ n: 5 });
  });

  it("sync send from run transitions with final payload", () => {
    type S = "a" | "b" | "c";
    type E = "GO" | "NEXT";
    const onC = vi.fn();
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: { on: { NEXT: "c" }, run: ({ send }) => send("NEXT", "p2") },
        c: { on: {}, run: ({ payload }) => onC(payload) },
      },
    };
    const m = createStateMachine(cfg);
    m.send("GO", "p1");
    expect(m.state.value).toBe("c");
    expect(m.state.payload).toBe("p2");
    expect(onC).toHaveBeenCalledWith("p2");
  });

  it("preserves payload object identity", () => {
    type S = "a" | "b";
    type E = "GO";
    const obj = { a: 1 } as { a: number };
    const cfg: MachineConfig<S, E> = {
      initial: "a",
      states: { a: { on: { GO: "b" } }, b: { on: {} } },
    };
    const m = createStateMachine(cfg);
    m.send("GO", obj);
    expect(m.state.payload).toBe(obj);
  });
});

describe("user code throws", () => {
  it("throws when initial state's run throws synchronously with context", () => {
    type S = "idle" | "loading";
    type E = "GO";
    const cfg: MachineConfig<S, E> = {
      initial: "idle",
      states: {
        idle: {
          on: { GO: "loading" },
          run: () => {
            throw new Error("boom");
          },
        },
        loading: { on: {} },
      },
    };
    try {
      createStateMachine(cfg);
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as any;
      expect(err.message).toContain("phase");
      expect(err.message).toContain("init");
      expect(err.meta).toMatchObject({ phase: "init", state: "idle" });
    }
  });

  it("run throws on transition: attempts ERROR auto-dispatch; if unhandled, throws with context", () => {
    type S = "idle" | "loading";
    type E = "GO";
    const cfg: MachineConfig<S, E> = {
      initial: "idle",
      states: {
        idle: { on: { GO: "loading" } },
        loading: {
          on: {},
          run: () => {
            throw new Error("run-err");
          },
        },
      },
    };
    const m = createStateMachine(cfg);
    const listener = vi.fn();
    m.subscribe(listener);
    try {
      m.send("GO");
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as any;
      expect(err.message).toContain("phase");
      expect(err.message).toContain("enter");
      expect(err.meta).toMatchObject({
        phase: "enter",
        state: "loading",
        from: "idle",
        event: "GO",
      });
    }
    expect(m.state.value).toBe("loading");
    expect(listener).toHaveBeenCalledTimes(0);
  });

  it("cleanup throws on transition: transition is aborted and no notify occurs, throws with context", () => {
    type S = "idle" | "loading";
    type E = "GO";
    const cleanupErr = new Error("cleanup-err");
    const cfg: MachineConfig<S, E> = {
      initial: "idle",
      states: {
        idle: {
          on: { GO: "loading" },
          run: () => () => {
            throw cleanupErr;
          },
        },
        loading: { on: {} },
      },
    };
    const m = createStateMachine(cfg);
    const listener = vi.fn();
    m.subscribe(listener);
    try {
      m.send("GO");
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as any;
      expect(err.message).toContain("cleanup");
      expect(err.message).toContain("phase");
      expect(err.meta).toMatchObject({
        phase: "cleanup",
        state: "idle",
        to: "loading",
        event: "GO",
      });
      // original error should be available as cause in modern runtimes
    }
    expect(m.state.value).toBe("idle");
    expect(listener).toHaveBeenCalledTimes(0);
  });
});
