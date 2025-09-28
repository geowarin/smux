import { describe, it } from "vitest";
import { createStateMachine, type MachineConfig } from "./createStateMachine.js";

describe.todo("nested", () => {
  it("should ", () => {
    type StartState = "idle" | "loading" | "success";
    type StartEvent = "FETCH" | "RESOLVE" | "FINISH";

    const startMachine: MachineConfig<StartState, StartEvent> = {
      initial: "idle",
      states: {
        idle: {
          on: { FETCH: "loading" },
        },
        loading: {
          on: { RESOLVE: "success" },
        },
        success: {
          // references root state
          // @ts-ignore
          on: { FINISH: "#stop" },
        },
      },
    };

    type State = "start" | "stop";
    type Event = "RESTART";

    const config: MachineConfig<State, Event> = {
      initial: "start",
      states: {
        // @ts-ignore
        start: startMachine,
        stop: {
          on: { RESTART: "start" },
        },
      },
    };

    createStateMachine(config);
  });
});
