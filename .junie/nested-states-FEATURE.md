# Nested States

Allow nested states.

Example:

```typescript
type State = "start" | "idle" | "loading" | "success" | "stop";
type Event = "FETCH" | "RESOLVE" | "FINISH" | "RESTART";

const config: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
      initial: "idle",
      idle: {
        on: { FETCH: "loading" },
      },
      loading: {
        on: { RESOLVE: "success" },
      },
      success: {
        // references parent state
        on: { FINISH: "stop" },
      },
    },
    stop: {
      on: { RESTART: "start" },
    },
  },
};
```

Types of state machines should allow nesting a state machine in another state machine.

Questions:

- how to reference parent/child state machine to avoid ambiguities and make typing work?
