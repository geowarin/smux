import { describe, it, expect } from "vitest";
import type { MachineConfig } from "../createStateMachine.ts";
import { buildMermaidDiagram } from "./buildMermaidDiagram.ts";

type S = "idle" | "loading" | "success";
type E = "FETCH" | "RESOLVE";

const cfg: MachineConfig<S, E> = {
  initial: "idle",
  states: {
    idle: { on: { FETCH: "loading" } },
    loading: { on: { RESOLVE: "success" } },
    success: { on: {} },
  },
};

describe("buildMermaidStateDiagram", () => {
  it("produces a stateDiagram definition with initial and transitions", () => {
    const out = buildMermaidDiagram(cfg);
    expect(out.startsWith("stateDiagram-v2\n")).toBe(true);
    expect(out).toContain("[*] --> idle");
    expect(out).toContain("idle --> loading: FETCH");
    expect(out).toContain("loading --> success: RESOLVE");
  });
});
