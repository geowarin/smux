import type { MachineConfig } from "../createStateMachine.js";

/**
 * Build a Mermaid state diagram definition from a MachineConfig.
 * Example output:
 * stateDiagram-v2\n[*] --> idle\nidle --> loading: FETCH\nloading --> success: RESOLVE
 */
export function buildMermaidDiagram<TState extends string, TEvent extends string>(
  config: MachineConfig<TState, TEvent>,
  opts?: { highlight?: TState },
): string {
  if (config == null) throw new Error("config must not be null or undefined");
  const lines: string[] = [];
  lines.push("stateDiagram-v2");

  // initial marker
  lines.push(`[*] --> ${config.initial}`);

  // transitions per state
  const states = config.states;
  const stateKeys = Object.keys(states) as TState[];
  for (const state of stateKeys) {
    const on = states[state]?.on as Partial<Record<TEvent, TState>> | undefined;
    if (on == null) continue;
    for (const [event, target] of Object.entries(on) as [TEvent, TState][]) {
      if (target == null) continue;
      // idle --> loading: FETCH
      lines.push(`${state} --> ${target}: ${String(event)}`);
    }
  }

  // Define highlight style and apply to the highlighted state if provided
  lines.push("classDef activeState fill:#ffd54f,stroke:#f57f17,color:#000,stroke-width:2px;");
  if (opts?.highlight != null) {
    lines.push(`class ${opts.highlight} activeState`);
  }

  return lines.join("\n");
}
