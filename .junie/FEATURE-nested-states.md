# Nested States

Allow nested states, we want to keep the code simple.

## Core principles

- States can be state machines
- We still have one active state in the state machine
- We want to address the most common use case where state machines are usually one or two levels deep

## Possible simplifications

- Only allow state machines to transition to their own states (like today) and to the root state machine with `#root` 
  - Maybe to absolute paths like `#start.idle` if it does not make the code more complex
- "Flatten" the state machine when building it so that the code remains mostly untouched

## Questions

- Is this design too limiting compared to true Hierarchical State Machines?

## Examples:

```typescript
type State = "start" | "idle" | "loading" | "success" | "stop";
type Event = "FETCH" | "RESOLVE" | "FINISH" | "RESTART";

const config: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
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
          on: { FINISH: "#stop" },
        },
      }
    },
    stop: {
      on: { RESTART: "start" },
    },
  },
};
```

Types of state machines should allow nesting a state machine in another state machine:

```typescript
type StartState = "idle" | "loading" | "success";
type StartEvent = "FETCH" | "RESOLVE" | "FINISH";

const startMachine: MachineConfig<StartState, StartEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {FETCH: "loading"},
    },
    loading: {
      on: {RESOLVE: "success"},
    },
    success: {
      // references root state
      on: {FINISH: "#stop"},
    },
  }
}

type State = "start" | "stop";
type Event = "RESTART";

const config: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: startMachine,
    stop: {
      on: {RESTART: "start"},
    },
  },
};
```

## Flattening

```typescript
type State = "start" | "idle" | "loading" | "success" | "stop";
type Event = "FETCH" | "RESOLVE" | "FINISH" | "RESTART";

const config: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    "start.idle": {
      on: {FETCH: "start.loading"},
    },
    "start.loading": {
      on: {RESOLVE: "start.success"},
    },
    "start.success": {
      on: {FINISH: "stop"},
    },
    stop: {
      // resolved to "start.idle" because "idle" is the initial state of "start"
      on: {RESTART: "start.idle"},
    },
  },
};
```

Flattening of run effects looks not necessary. It seems that you can only have one run effect per state, even with nesting.

```typescript
const nested1: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
      on: {FETCH: "loading"},
      run: () => {
        console.log("start")
        return () => console.log("start cleanup")
      }
    }
  },
};

const nested2: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
      initial: "start",
      states: {
        start: nested1
      }
    }
  },
};

const nested3: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
      initial: "start",
      states: {
        start: nested2
      }
    }
  },
};
```
