export interface RunContext<TEvent extends string = string> {
  send: (event: TEvent) => void;
}

export type StateConfig<TEvent extends string = string> = {
  on?: Record<string, string>;
  /** Effect that runs on entering the state. If it returns a function, it will be called when exiting the state. */
  run?: (ctx: RunContext<TEvent>) => void | (() => void);
};

export type MachineConfig<
  TState extends string = string,
  TEvent extends string = string,
> = {
  initial: TState;
  states: Record<
    TState,
    StateConfig<TEvent> & { on?: Partial<Record<TEvent, TState>> }
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
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (
    listener: (state: MachineState<TState, TEvent>) => void,
  ) => () => void;
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
  let epoch = 0;

  // subscribers to state changes
  const listeners = new Set<(state: MachineState<TState, TEvent>) => void>();

  // cached state object to maintain referential stability when not changing
  let cachedState: MachineState<TState, TEvent> = {
    value: currentState,
    nextEvents: [],
  };

  const recomputeCachedState = () => {
    cachedState = {
      value: currentState,
      nextEvents: getNextEvents(),
    };
  };

  const runEnterEffect = () => {
    const effect = config.states[currentState]?.run as
      | ((ctx: RunContext<TEvent>) => void | (() => void))
      | undefined;
    if (typeof effect === "function") {
      const myEpoch = epoch;
      const guardedSend = (event: TEvent) => {
        if (epoch !== myEpoch) {
          return;
        }
        machine.send(event);
      };
      const maybeCleanup = effect({ send: guardedSend });
      if (typeof maybeCleanup === "function") cleanup = maybeCleanup;
    }
  };

  const getNextEvents = (): TEvent[] => {
    const on = config.states[currentState]?.on ?? {};
    return Object.keys(on) as TEvent[];
  };

  const notify = () => {
    // ensure cached state matches current before notifying
    recomputeCachedState();
    for (const listener of listeners) {
      listener(cachedState);
    }
  };

  const machine: StateMachine<TState, TEvent> = {
    get state() {
      return cachedState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(event: TEvent) {
      const on = config.states[currentState]?.on as
        | Partial<Record<TEvent, TState>>
        | undefined;
      const target = on?.[event];
      if (!target || target === currentState) return; // no change

      // run cleanup for current state if exists
      if (cleanup) {
        try {
          cleanup();
        } finally {
          cleanup = undefined;
        }
      }

      // invalidate previous run's send and prepare a new epoch for the new state
      epoch++;
      currentState = target;
      runEnterEffect();
      notify();
    },
    stop() {
      if (cleanup) {
        try {
          cleanup();
        } finally {
          cleanup = undefined;
        }
      }
      // invalidate any pending sends after stop
      epoch++;
    },
  };

  // initialize cached state and run enter effect for initial state
  recomputeCachedState();
  epoch++;
  runEnterEffect();

  return machine;
}
