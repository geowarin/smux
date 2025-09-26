import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { MachineState, StateMachine } from "../createStateMachine.ts";

export function useStateMachine<TState extends string, TEvent extends string>(
  machine: StateMachine<TState, TEvent>,
): [MachineState<TState, TEvent>, (event: TEvent) => void] {
  const subscribe = (onStoreChange: () => void) => {
    return machine.subscribe(() => onStoreChange());
  };

  const getSnapshot = () => machine.state;

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const send = useMemo(() => machine.send.bind(machine), [machine]);

  // Consumers may want to stop the machine on unmount; keep it optional here.
  useEffect(() => {
    return () => {
      machine.stop();
    };
  }, [machine]);

  return [state, send];
}
