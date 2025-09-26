export type StateConfig = {
  on?: Record<string, string>;
  /** Effect that runs on entering the state. If it returns a function, it will be called when exiting the state. */
  effect?: () => void | (() => void);
};

export type MachineConfig<
  TState extends string = string,
  TEvent extends string = string,
> = {
  initial: TState;
  states: Record<
    TState,
    StateConfig & { on?: Partial<Record<TEvent, TState>> }
  >;
};

export type MachineState<
  TState extends string = string,
  TEvent extends string = string,
> = {
  value: TState;
  nextEvents: TEvent[];
};

export type StateMachine<
  TState extends string = string,
  TEvent extends string = string,
> = {
  state: MachineState<TState, TEvent>;
  send: (event: TEvent) => void;
  /** Stops the machine and runs any pending cleanup. */
  stop: () => void;
};

/**
 * A tiny finite state machine with enter effects and cleanup on exit.
 * Designed only to support the example use case.
 */
export function createStateMachine<
  TState extends string,
  TEvent extends string,
>(config: MachineConfig<TState, TEvent>): StateMachine<TState, TEvent> {
  let currentState = config.initial;
  let cleanup: (() => void) | undefined;

  const runEnterEffect = () => {
    const effect = config.states[currentState]?.effect;
    if (typeof effect === "function") {
      const maybeCleanup = effect();
      if (typeof maybeCleanup === "function") cleanup = maybeCleanup;
    }
  };

  const getNextEvents = (): TEvent[] => {
    const on = config.states[currentState]?.on ?? {};
    return Object.keys(on) as TEvent[];
  };

  const machine: StateMachine<TState, TEvent> = {
    get state() {
      return {
        value: currentState,
        nextEvents: getNextEvents(),
      };
    },
    send(event: TEvent) {
      const on = config.states[currentState]?.on as
        | Partial<Record<TEvent, TState>>
        | undefined;
      const target = on?.[event];
      if (!target) return;

      // run cleanup for current state if exists
      if (cleanup) {
        try {
          cleanup();
        } finally {
          cleanup = undefined;
        }
      }

      currentState = target;
      runEnterEffect();
    },
    stop() {
      if (cleanup) {
        try {
          cleanup();
        } finally {
          cleanup = undefined;
        }
      }
    },
  };

  // run enter effect for initial state
  runEnterEffect();

  return machine;
}
