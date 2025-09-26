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
});

describe("run effect send support", () => {
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
});
