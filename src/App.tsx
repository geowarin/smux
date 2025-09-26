import { useEffect, useMemo, useState } from "react";
import mermaid from "mermaid";
import type { MachineConfig } from "./smux/createStateMachine.ts";
import {
  buildMermaidDiagram,
  createStateMachine,
  useStateMachine,
} from "./smux";

const smConfig: MachineConfig<"inactive" | "active", "TOGGLE"> = {
  initial: "inactive",
  states: {
    inactive: { on: { TOGGLE: "active" } },
    active: { on: { TOGGLE: "inactive" } },
  },
};

export function App() {
  const machine = useMemo(() => createStateMachine(smConfig), []);
  const [state, send] = useStateMachine(machine);

  return (
    <div className="app">
      <h1>State Machine Diagram</h1>
      <div className="controls">
        <div>
          Current state: <strong>{state.value}</strong>
        </div>
        <div className="button-row">
          {state.nextEvents.map((evt) => (
            <button key={evt} onClick={() => send(evt as never)}>
              {evt}
            </button>
          ))}
        </div>
      </div>
      <MermaidDiagram smConfig={smConfig} />
    </div>
  );
}

function MermaidDiagram({ smConfig }: { smConfig: MachineConfig }) {
  const definition = buildMermaidDiagram(smConfig);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = mql.matches ? "dark" : "default";

    mermaid.initialize({
      startOnLoad: false,
      theme,
      // darkMode: true,
      themeVariables: { background: "transparent" },
    });

    mermaid
      .render("diagram", definition)
      .then(({ svg }) => {
        setSvg(svg);
      })
      .catch((e) => {
        setError((e as Error).message);
      });
  }, [definition]);

  if (error != null) {
    return <pre className="error-text">{error}</pre>;
  }

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
