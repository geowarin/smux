import { isFunction, isPromiseLike } from "./utils.js";
import { SmuxError } from "./error.js";

export interface RunMeta<TState extends string = string, TEvent extends string = string> {
  to: TState;
  from?: TState;
  event?: TEvent;
}

export interface RunContext<TState extends string = string, TEvent extends string = string> {
  send: (event: TEvent, payload?: unknown) => void;
  payload?: unknown;
  meta?: RunMeta<TState, TEvent>;
}

export type StateConfig<TState extends string = string, TEvent extends string = string> = {
  on?: Partial<Record<TEvent, TState>>;
  /** Effect that runs on entering the state. If it returns a function, it will be called when exiting the state. */
  run?: (ctx: RunContext<TState, TEvent>) => void | (() => void) | Promise<unknown>;
};

export type MachineConfig<TState extends string = string, TEvent extends string = string> = {
  initial: TState;
  states: Record<TState, StateConfig<TState, TEvent>>;
};

export type MachineState<TState extends string = string, TEvent extends string = string> = {
  value: TState;
  nextEvents: TEvent[];
  payload: unknown;
};

export type StateMachine<TState extends string = string, TEvent extends string = string> = {
  state: MachineState<TState, TEvent>;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (listener: (state: MachineState<TState, TEvent>) => void) => () => void;
  send: (event: TEvent, payload?: unknown) => void;
  /** Stops the machine and runs any pending cleanup. */
  stop: () => void;
};

/**
 * A tiny finite state machine.
 */
export function createStateMachine<TState extends string, TEvent extends string>(
  config: MachineConfig<TState, TEvent>,
): StateMachine<TState, TEvent> {
  let currentState = config.initial;
  let cleanup: (() => void) | undefined;
  let token: symbol = Symbol("smux_token");

  const listeners = new Set<(state: MachineState<TState, TEvent>) => void>();

  // cached state object to maintain referential stability when not changing
  let cachedState: MachineState<TState, TEvent> = {
    value: currentState,
    nextEvents: [],
    payload: undefined,
  };

  function invalidateToken() {
    token = Symbol("smux_token");
  }

  function safeCleanup(meta?: RunMeta<TState, TEvent>) {
    try {
      cleanup?.();
    } catch (e) {
      throw new SmuxError({ phase: "cleanup", ...meta }, { cause: e });
    } finally {
      cleanup = undefined;
    }
  }

  function recomputeCachedState(payload?: unknown) {
    cachedState = {
      value: currentState,
      nextEvents: getNextEvents(),
      payload,
    };
  }

  function runEnterEffect(meta?: RunMeta<TState, TEvent>, payload?: unknown) {
    const effect = config.states[currentState]?.run;
    if (!isFunction(effect)) {
      return;
    }

    const myToken = token;
    const guardedSend = (event: TEvent, payload?: unknown) => {
      if (token === myToken) {
        machine.send(event, payload);
      }
    };

    try {
      const result = effect({ send: guardedSend, payload, meta });

      if (isFunction(result)) {
        cleanup = result;
        return;
      }

      if (isPromiseLike(result)) {
        result
          .then(value => guardedSend("SUCCESS" as TEvent, value))
          .catch(err => guardedSend("ERROR" as TEvent, err))
          .catch(() => {});
      }
    } catch (e) {
      const beforeToken = token;
      guardedSend("ERROR" as TEvent, e);
      if (token === beforeToken) {
        throw new SmuxError({ phase: "enter", ...meta }, { cause: e });
      }
    }
  }

  function getNextEvents(): TEvent[] {
    const on = config.states[currentState]?.on ?? {};
    return Object.keys(on) as TEvent[];
  }

  function notify() {
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
    send(event: TEvent, payload?: unknown) {
      const target = config.states[currentState]?.on?.[event];
      if (!target || target === currentState) {
        return;
      }

      const meta: RunMeta<TState, TEvent> = {
        from: currentState,
        event,
        to: target,
      };
      safeCleanup(meta);

      invalidateToken();
      currentState = target;
      recomputeCachedState(payload);
      runEnterEffect(meta, payload);
      notify();
    },
    stop() {
      safeCleanup();
      invalidateToken();
    },
  };

  invalidateToken();
  recomputeCachedState();
  try {
    runEnterEffect({ to: currentState });
  } catch (e) {
    throw new SmuxError({ phase: "init", from: currentState }, { cause: e });
  }

  return machine;
}
