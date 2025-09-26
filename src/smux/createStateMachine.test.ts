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
