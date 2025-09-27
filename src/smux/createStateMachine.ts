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

  // subscribers to state changes
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

  function getCurrentOn(): Partial<Record<TEvent, TState>> | undefined {
    return config.states[currentState]?.on as
      | Partial<Record<TEvent, TState>>
      | undefined;
  }

  function recomputeCachedState() {
    cachedState = {
      value: currentState,
      nextEvents: getNextEvents(),
    };
  }

  function isFunction(
    value: unknown,
  ): value is (...args: unknown[]) => unknown {
    return typeof value === "function";
  }
  function isPromiseLike(value: unknown): value is Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const then = (value as any)?.then;
    return typeof then === "function";
  }
  function getCurrentOnOrEmpty(): Partial<Record<TEvent, string>> {
    return (getCurrentOn() ??
      ({} as Partial<Record<TEvent, string>>)) as Partial<
      Record<TEvent, string>
    >;
  }
  function dispatchWithPayload(
    sendFn: (event: TEvent) => void,
    myToken: symbol,
    event: TEvent,
    payload: unknown,
  ) {
    if (token !== myToken) {
      return;
    }
    lastPayload = payload;
    try {
      sendFn(event);
    } finally {
      lastPayload = undefined;
    }
  }

  function runEnterEffect() {
    const effect = config.states[currentState]?.run as
      | ((ctx: RunContext<TEvent>) => void | (() => void) | Promise<unknown>)
      | undefined;
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
      const on = getCurrentOnOrEmpty();
      const hasSuccess = Object.prototype.hasOwnProperty.call(on, "SUCCESS");
      const hasError = Object.prototype.hasOwnProperty.call(on, "ERROR");
      if (!hasSuccess || !hasError) {
        // eslint-disable-next-line no-console
        console.error(
          `[smux] State "${currentState}" returned a Promise from run() but is missing transitions for SUCCESS and/or ERROR.`,
        );
      }

      (result as Promise<unknown>)
        .then((value) =>
          dispatchWithPayload(guardedSend, myToken, "SUCCESS" as TEvent, value),
        )
        .catch((err) =>
          dispatchWithPayload(guardedSend, myToken, "ERROR" as TEvent, err),
        )
        .catch(() => {});
    }
  }

  function getNextEvents(): TEvent[] {
    const on = getCurrentOn() ?? {};
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
      const target = getCurrentOn()?.[event];
      if (!target || target === currentState) {
        // no change
        return;
      }

      safeCleanup();

      // invalidate previous run's send by rotating the token and prepare for the new state
      invalidateToken();
      currentState = target;
      runEnterEffect();
      notify();
    },
    stop() {
      safeCleanup();
      // invalidate any pending sends after stop
      invalidateToken();
    },
  };

  // initialize cached state and run enter effect for initial state
  recomputeCachedState();
  invalidateToken();
  runEnterEffect();

  return machine;
}
