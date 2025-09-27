import { describe, it, expect, vi } from "vitest";
import { createStateMachine } from "./createStateMachine.ts";
import type {
  MachineConfig,
  RunContext,
  RunMeta,
} from "./createStateMachine.ts";
import { SmuxError } from "./error.ts";

function flushMicrotasks() {
  return new Promise<void>((res) => setTimeout(res, 0));
}

describe("createStateMachine – Initialization and state shape", () => {
  it("starts in the initial state with computed nextEvents and undefined payload", () => {
    type S = "idle" | "working";
    type E = "GO" | "STOP";

    const config: MachineConfig<S, E> = {
      initial: "idle",
      states: {
        idle: { on: { GO: "working" } },
        working: { on: { STOP: "idle" } },
      },
    };

    const m = createStateMachine(config);

    expect(m.state.value).toBe("idle");
    expect(m.state.payload).toBeUndefined();
    expect(new Set(m.state.nextEvents)).toEqual(new Set(["GO"]));
  });

  it("invokes initial run effect with meta.to set and payload undefined", () => {
    type S = "idle";
    type E = "X";

    const run = vi.fn((_ctx: RunContext<S, E>) => {});

    const m = createStateMachine<S, E>({
      initial: "idle",
      states: {
        idle: { run, on: {} },
      },
    });

    expect(run).toHaveBeenCalledTimes(1);
    const arg = run.mock.calls[0][0];
    expect(arg.payload).toBeUndefined();
    expect(arg.meta).toEqual<RunMeta<S, E>>({ to: "idle" });
    expect(typeof arg.send).toBe("function");
    expect(m.state.value).toBe("idle");
  });
});

describe("createStateMachine – Transitions and event handling", () => {
  it("transitions on known event and updates payload + nextEvents", () => {
    type S = "idle" | "working";
    type E = "GO" | "STOP";

    const m = createStateMachine<S, E>({
      initial: "idle",
      states: {
        idle: { on: { GO: "working" } },
        working: { on: { STOP: "idle" } },
      },
    });

    m.send("GO", { jobId: 1 });

    expect(m.state.value).toBe("working");
    expect(m.state.payload).toEqual({ jobId: 1 });
    expect(new Set(m.state.nextEvents)).toEqual(new Set(["STOP"]));
  });

  it("ignores unknown events and self-transitions (no changes)", () => {
    type S = "idle";
    type E = "NOOP" | "SELF";

    const m = createStateMachine<S, E>({
      initial: "idle",
      states: {
        idle: { on: { SELF: "idle" } },
      },
    });

    const before = m.state;
    m.send("NOOP");
    expect(m.state).toBe(before);

    m.send("SELF");
    expect(m.state).toBe(before);
  });
});

describe("createStateMachine – Subscriptions and notifications", () => {
  it("notifies subscribers on state changes and supports unsubscribe", () => {
    type S = "a" | "b";
    type E = "TO_B" | "TO_A";

    const m = createStateMachine<S, E>({
      initial: "a",
      states: {
        a: { on: { TO_B: "b" } },
        b: { on: { TO_A: "a" } },
      },
    });

    const spy1 = vi.fn();
    const spy2 = vi.fn();
    const off1 = m.subscribe(spy1);
    const off2 = m.subscribe(spy2);

    m.send("TO_B", 123);

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(spy1.mock.calls[0][0].value).toBe("b");
    expect(spy1.mock.calls[0][0].payload).toBe(123);

    off1();

    m.send("TO_A", 456);

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(2);
    expect(spy2.mock.calls[1][0].value).toBe("a");
    expect(spy2.mock.calls[1][0].payload).toBe(456);

    off2();
  });

  it("does not notify when sending unknown or self-transition events", () => {
    type S = "x";
    type E = "UNKNOWN" | "SELF";

    const m = createStateMachine<S, E>({
      initial: "x",
      states: { x: { on: { SELF: "x" } } },
    });

    const spy = vi.fn();
    m.subscribe(spy);

    m.send("UNKNOWN");
    m.send("SELF");

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("createStateMachine – Enter effects: sync, cleanup, and errors", () => {
  it("stores cleanup returned by run and calls it on transition and stop()", () => {
    type S = "a" | "b";
    type E = "NEXT";

    const cleanup = vi.fn();
    const run = vi.fn(() => cleanup);

    const m = createStateMachine<S, E>({
      initial: "a",
      states: {
        a: { run, on: { NEXT: "b" } },
        b: { on: {} },
      },
    });

    expect(run).toHaveBeenCalledTimes(1);

    m.send("NEXT");
    expect(cleanup).toHaveBeenCalledTimes(1);

    m.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("cleanup error throws SmuxError and aborts transition (state unchanged)", () => {
    type S = "a" | "b";
    type E = "NEXT";

    const cleanup = vi.fn(() => {
      throw new Error("teardown failed");
    });

    const m = createStateMachine<S, E>({
      initial: "a",
      states: {
        a: { run: () => cleanup, on: { NEXT: "b" } },
        b: { on: {} },
      },
    });

    expect(() => m.send("NEXT")).toThrowError(SmuxError);
    expect(m.state.value).toBe("a");
    expect(new Set(m.state.nextEvents)).toEqual(new Set(["NEXT"]));
  });

  it("sync run throw without ERROR transition propagates as SmuxError(enter)", () => {
    type S = "crashy";
    type E = "X";

    const run = vi.fn(() => {
      throw new Error("boom");
    });

    expect(() =>
      createStateMachine<S, E>({
        initial: "crashy",
        states: { crashy: { run, on: {} } },
      }),
    ).toThrowError(SmuxError);
  });

  it("sync run throw with ERROR transition routes to recovery and does not throw", () => {
    type S = "crashy" | "recovered";
    type E = "ERROR";

    const err = new Error("boom");
    const run = vi.fn(() => {
      throw err;
    });

    const m = createStateMachine<S, E>({
      initial: "crashy",
      states: {
        crashy: { run, on: { ERROR: "recovered" } },
        recovered: { on: {} },
      },
    });

    expect(m.state.value).toBe("recovered");
    expect(m.state.payload).toBe(err);
  });

  it("run receives correct meta on transition", () => {
    type S = "a" | "b";
    type E = "GO";

    const runB = vi.fn();

    const m = createStateMachine<S, E>({
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: {
          run: runB,
          on: {},
        },
      },
    });

    m.send("GO", 42);

    expect(runB).toHaveBeenCalledTimes(1);
    const arg = runB.mock.calls[0][0];
    expect(arg.meta).toEqual<RunMeta<S, E>>({
      from: "a",
      event: "GO",
      to: "b",
    });
    expect(arg.payload).toBe(42);
  });
});

describe("createStateMachine – Async enter effects (promise-like results)", () => {
  it("promise resolve auto-sends SUCCESS with resolved value", async () => {
    type S = "loading" | "done";
    type E = "SUCCESS";

    const m = createStateMachine<S, E>({
      initial: "loading",
      states: {
        loading: {
          run: () => Promise.resolve(123),
          on: { SUCCESS: "done" },
        },
        done: { on: {} },
      },
    });

    await flushMicrotasks();

    expect(m.state.value).toBe("done");
    expect(m.state.payload).toBe(123);
  });

  it("promise reject auto-sends ERROR with the error", async () => {
    type S = "loading" | "error";
    type E = "ERROR";

    const err = new Error("fetch failed");

    const m = createStateMachine<S, E>({
      initial: "loading",
      states: {
        loading: {
          run: () => Promise.reject(err),
          on: { ERROR: "error" },
        },
        error: { on: {} },
      },
    });

    await flushMicrotasks();

    expect(m.state.value).toBe("error");
    expect(m.state.payload).toBe(err);
  });

  it("late promise resolution after stop() is ignored", async () => {
    type S = "loading" | "done";
    type E = "SUCCESS";

    let resolveFn: (v: number) => void = () => {};

    const m = createStateMachine<S, E>({
      initial: "loading",
      states: {
        loading: {
          run: () =>
            new Promise<number>((res) => {
              resolveFn = res;
            }),
          on: { SUCCESS: "done" },
        },
        done: { on: {} },
      },
    });

    m.stop();

    resolveFn(999);
    await flushMicrotasks();

    expect(m.state.value).toBe("loading");
    expect(new Set(m.state.nextEvents)).toEqual(new Set(["SUCCESS"]));
  });
});

describe("createStateMachine – Stop semantics and guarded send", () => {
  it("stop() runs cleanup and invalidates token; second stop() is safe", () => {
    type S = "a" | "b";
    type E = "GO";

    const cleanup = vi.fn();
    const run = vi.fn(() => cleanup);

    const m = createStateMachine<S, E>({
      initial: "a",
      states: { a: { run, on: { GO: "b" } }, b: { on: {} } },
    });

    m.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);

    m.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("guarded send from run only works with current token (no effect after transition)", () => {
    type S = "a" | "b" | "c";
    type E = "GO" | "NEXT";

    let savedSend: ((e: E, p?: unknown) => void) | undefined;

    const m = createStateMachine<S, E>({
      initial: "a",
      states: {
        a: {
          run: ({ send }) => {
            savedSend = send;
          },
          on: { GO: "b" },
        },
        b: { on: { NEXT: "c" } },
        c: { on: {} },
      },
    });

    m.send("GO");

    savedSend?.("NEXT");

    expect(m.state.value).toBe("b");
  });
});
