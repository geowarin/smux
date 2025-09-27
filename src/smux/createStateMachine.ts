import { isFunction, isPromiseLike } from "./utils.ts";

export interface RunContext<TEvent extends string = string> {
  send: (event: TEvent) => void;
  payload?: unknown;
}

export type StateConfig<TEvent extends string = string> = {
  on?: Record<string, string>;
  /** Effect that runs on entering the state. If it returns a function, it will be called when exiting the state. */
  run?: (ctx: RunContext<TEvent>) => void | (() => void) | Promise<unknown>;
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
  let token: symbol = Symbol("smux_token");
  let lastPayload: unknown | undefined;

  const listeners = new Set<(state: MachineState<TState, TEvent>) => void>();

  // cached state object to maintain referential stability when not changing
  let cachedState: MachineState<TState, TEvent> = {
    value: currentState,
    nextEvents: [],
  };

  function invalidateToken() {
    token = Symbol("smux_token");
  }

  function safeCleanup() {
    try {
      cleanup?.();
    } finally {
      cleanup = undefined;
    }
  }

  function recomputeCachedState() {
    cachedState = {
      value: currentState,
      nextEvents: getNextEvents(),
    };
  }

  function runEnterEffect() {
    const effect = config.states[currentState]?.run;
    if (!isFunction(effect)) {
      return;
    }

    const myToken = token;
    const guardedSend = (event: TEvent) => {
      if (token !== myToken) {
        return;
      }
      machine.send(event);
    };

    const result = effect({ send: guardedSend, payload: lastPayload });

    // clear payload after delivering it to the effect of the entered state
    lastPayload = undefined;

    if (isFunction(result)) {
      cleanup = result as () => void;
      return;
    }

    if (isPromiseLike(result)) {
      function dispatchWithPayload(event: TEvent, payload: unknown) {
        if (token !== myToken) {
          return;
        }
        lastPayload = payload;
        try {
          guardedSend(event);
        } finally {
          lastPayload = undefined;
        }
      }

      result
        .then(value => dispatchWithPayload("SUCCESS" as TEvent, value))
        .catch(err => dispatchWithPayload("ERROR" as TEvent, err))
        .catch(() => {});
    }
  }

  function getNextEvents(): TEvent[] {
    const on = config.states[currentState]?.on ?? {};
    return Object.keys(on) as TEvent[];
  }

  function notify() {
    // ensure cached state matches current before notifying
    recomputeCachedState();
    for (const listener of listeners) {
      listener(cachedState);
    }
  }

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
      const target = config.states[currentState]?.on?.[event];
      if (!target || target === currentState) {
        return;
      }

      safeCleanup();

      invalidateToken();
      currentState = target;
      runEnterEffect();
      notify();
    },
    stop() {
      safeCleanup();
      invalidateToken();
    },
  };

  recomputeCachedState();
  invalidateToken();
  runEnterEffect();

  return machine;
}
