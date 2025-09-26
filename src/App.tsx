import { useEffect, useState } from "react";
import mermaid from "mermaid";
import type { MachineConfig } from "./smux/createStateMachine.ts";
import { buildMermaidDiagram } from "./smux";

const smConfig: MachineConfig<"inactive" | "active", "TOGGLE"> = {
  initial: "inactive",
  states: {
    inactive: { on: { TOGGLE: "active" } },
    active: { on: { TOGGLE: "inactive" } },
  },
};

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <h1>State Machine Diagram</h1>
      <MermaidDiagram smConfig={smConfig} />
    </div>
  );
}

function MermaidDiagram({ smConfig }: { smConfig: MachineConfig }) {
  const definition = buildMermaidDiagram(smConfig);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false });

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
    return <pre style={{ color: "red" }}>{error}</pre>;
  }

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
