import { createStateMachine } from "./index.ts";

const stateMachine = createStateMachine({
  initial: "inactive",
  states: {
    inactive: {
      on: { TOGGLE: "active" },
    },
    active: {
      on: { TOGGLE: "inactive" },
      effect() {
        console.log("Just entered the Active state");
        // Same cleanup pattern as `useEffect`:
        // If you return a function, it will run when exiting the state.
        return () => console.log("Just Left the Active state");
      },
    },
  },
});

console.log(stateMachine.state); // { value: 'inactive', nextEvents: ['TOGGLE'] }

// Refers to the TOGGLE event name for the state we are currently in.

stateMachine.send("TOGGLE");

// Logs: Just entered the Active state

console.log(stateMachine.state); // { value: 'active', nextEvents: ['TOGGLE'] }
