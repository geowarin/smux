# Nested States

Allow nested states.

Example:

```typescript
type State = "start" | "idle" | "loading" | "success" | "stop";
type Event = "FETCH" | "RESOLVE" | "FINISH" | "RESTART";

const config: MachineConfig<State, Event> = {
  initial: "start",
  states: {
    start: {
      initial: "idle",
      idle: {
        on: { FETCH: "loading" },
      },
      loading: {
        on: { RESOLVE: "success" },
      },
      success: {
        // references parent state
        on: { FINISH: "stop" },
      },
    },
    stop: {
      on: { RESTART: "start" },
    },
  },
};
```

Types of state machines should allow nesting a state machine in another state machine.

Questions:

- how to reference parent/child state machine to avoid ambiguities and make typing work?

---

### Short answer

Yes, nested states are feasible without drastic changes if you flatten the nested config into a regular, flat machine at
build time and keep the current runtime almost unchanged. The trick is to precompute:

- Fully qualified leaf state names (for example `start.idle`),
- Composed enter/exit effects for all ancestors,
- Bubbling of `on` transitions from parent to child where a child doesn’t override them,
- Resolution of `initial` targets to the correct leaf state.

This preserves the tiny runtime and avoids overcomplicating the code, while enabling most hierarchical state-machine
behavior.

---

### What you have today

Your runtime tracks a single `currentState` and an optional `cleanup` for that state. Enter effects are executed on
state entry and can return a cleanup. This is already a good foundation: if we can compile nested definitions into
leaf-only states whose `run` executes all ancestor runs, the runtime doesn’t need to know about hierarchy.

Key details of current runtime relevant to nesting:

- Single active state and single `cleanup` slot
- `run` supports sync cleanup or async resolution via `SUCCESS`/`ERROR`
- `send` only switches to a different `target` and runs cleanup/enter once

---

### Proposed approach: compile-time flattening

Add a pre-processing step (pure function) that takes a nested `MachineConfigNested` and produces a plain `MachineConfig`
the current runtime already understands. The runtime stays almost identical.

Core ideas:

- Represent nested leaf states as path strings using a delimiter (dot or slash): e.g. `start.idle`.
- For every leaf path, generate a `run` function that calls all ancestor `run`s top-down, and returns a cleanup that
  runs in reverse (bottom-up). This preserves hierarchical enter/exit semantics with a single `cleanup` variable.
- Compute `on` maps per leaf by merging child `on` with ancestor `on` where not shadowed (child overrides parent for
  shared events). This implements parent-event bubbling naturally.
- Resolve transition targets to leaf paths: if a target refers to a composite (non-leaf) state, redirect to that state’s
  `initial` leaf (recursively).

This maintains the "one current state" model while mimicking hierarchical behavior predictably.

---

### Example shape (nested vs. compiled)

Input (nested):

```ts
interface StateConfigNested<TEvent extends string> {
  on?: Partial<Record<TEvent, string>>; // targets may be relative or absolute
  run?: (ctx: RunContext<TEvent>) => void | (() => void) | Promise<unknown>;
  initial?: string; // presence of `initial` implies substates
  states?: Record<string, StateConfigNested<TEvent>>; // nested states
}

interface MachineConfigNested<TState extends string, TEvent extends string> {
  initial: TState;
  states: Record<TState, StateConfigNested<TEvent>>;
}
```

Compiled (flat):

```ts
type FlatState = `${string}.${string}` | string; // e.g. "start.idle"

interface StateConfig<TEvent extends string> {
  on?: Partial<Record<TEvent, FlatState>>;
  run?: (ctx: RunContext<TEvent>) => void | (() => void) | Promise<unknown>;
}

interface MachineConfig<TState extends FlatState, TEvent extends string> {
  initial: TState; // e.g. "start.idle" (the initial leaf)
  states: Record<TState, StateConfig<TEvent>>;
}
```

Algorithm sketch:

- DFS through nested `states`, carry ancestor chain and constructed `run`s.
- For each composite state, require `initial` and `states`.
- Materialize only leaf nodes into `MachineConfig.states` keys using joined path strings.
- Build `run` by composing ancestor runs: on enter, execute from root to leaf; collect cleanups; return a cleanup that
  calls them in reverse.
- Build `on` for a leaf by layering ancestor `on` (outer to inner), then the leaf’s own `on`.
- Normalize transition targets:
  - Absolute: `start` or `start.idle`
  - Relative: `^` (parent), `.` (self), `..child` (sibling via parent), or bare child name inside a composite. Convert
    to absolute path.
  - If target resolves to a composite state, rewrite to its initial leaf.

This keeps the runtime unchanged, including `token`/reentrancy safeguards you already have.

---

### Referencing parent/child to avoid ambiguity (typing-friendly)

A few pragmatic options, in order of simplicity:

1. Delimited strings with template-literal types (minimal changes)

- Use `.` as delimiter and outlaw `.` in state ids.
- Types can compute leaf unions like `${Parent}.${Child}` recursively.
- Pros: minimal runtime impact; easy to read; works with your existing `MachineConfig`.
- Cons: complex TS types if you expose the nested config generically; can be iterated later.

2. Structured target objects (more explicit, better types later)

- `on: { FINISH: { path: ["start", "success"] } }`
- Easier to do relative paths: `{ rel: "^" }`, `{ rel: "child", id: "loading" }`
- Pros: no delimiter conflicts; great future-proofing.
- Cons: Slightly more verbose; you still flatten to string keys internally.

3. XState-like ids with `#root` anchors

- Allow `"#start.success"` for absolute, `"^"` for parent, etc.
- Pros: Familiar to many; still string-based.
- Cons: Same delimiter caveats.

For a first cut, I would pick (1) and document the delimiter constraint. Add (2) later if you want stronger typing of
targets.

---

### Typing strategy suggestions

You can stage typing complexity to keep diffs small:

- v1: Keep external `createStateMachine` as-is; add `createNestedConfig(configNested)` that returns a plain
  `MachineConfig`. The nested config can be typed loosely at first, then tightened.
- v2: Use conditional and recursive types to infer the union of leaf path strings and allowed events:
  - Derive `LeafPaths<TConfig>` as a union of template-literal strings
  - Derive `Transitions<TConfig, TEvent>` from merged ancestor/child `on` maps
  - Use `as const` configs to keep literal types

This way, users still get autocompletion on `machine.send(event)` and `state.value` as a union of fully qualified leaf
states.

---

### Edge cases and tricky parts to watch

- Parent/child effect composition
  - Ensure parent `run` executes when entering any of its descendants and cleans up only when leaving the entire
    subtree.
  - The composition strategy (collect cleanups in order, run reverse) handles this.
- Transition within same parent vs across parents
  - Same parent (e.g., `start.idle -> start.loading`): only child cleanups/enters should run. With composed `run`,
    this happens naturally because both leafs include the parent’s `run` in their composition; moving between leaves
    cleans up the old leaf’s child portion and enters the new leaf’s child portion. Parent `run` will be re-invoked
    unless you deduplicate; see next bullet.
  - Optimization: If you want strict HSM semantics, you might avoid re-running identical ancestor `run`s for common
    prefixes. That requires the runtime to be hierarchy-aware. If you keep the runtime flat, the simple approach will
    re-run parent `run` on every leaf change. Decide whether that’s acceptable. Many small machines are fine with it;
    otherwise a slightly smarter runtime that tracks the path and runs only the LCA boundary effects is needed.
- Event bubbling and shadowing
  - Child `on` overrides parent; unhandled events bubble to parent.
  - Confirm desired behavior for multiple ancestor levels.
- Targets pointing to composite states
  - Always resolve to the initial leaf; if missing, treat as config error.
- Async `run` and synthetic `SUCCESS`/`ERROR`
  - Today you emit `"SUCCESS"`/`"ERROR"`. Names could collide with user events across levels. Consider scoping them or
    documenting reserved event names.
- Cleanup ordering
  - Confirm that cleanup runs bottom-up (leaf to root). The composed cleanup makes that explicit.
- Name collisions and delimiters
  - If using `.` or `/`, disallow in user-provided state ids, or escape them in the compiler.
- Cycles and dead targets
  - During flattening, validate that all transition targets resolve to known leaf states. Detect cycles that never hit
    a leaf if you support transitions to composites without an `initial`.
- Missing `initial` in composites
  - Enforce at compile time or throw at runtime when flattening.
- `nextEvents` semantics
  - Should `nextEvents` reflect merged bubbling events? Usually yes, expose the merged `on` for the current leaf.
- State value shape
  - You can keep `state.value` as a path string. If you later want structured state, you could add
    `state.path: string[]` without breaking changes.

---

### If you do want true hierarchical enter/exit (optional)

If you need to avoid re-running ancestor `run`s when transitioning within the same parent, you can enhance the runtime
to keep track of the active path array and compute the longest-common-ancestor (LCA) between old and new paths:

- Exit effects for segments below LCA (bottom-up)
- Enter effects for segments below LCA on the new path (top-down)

This makes the runtime hierarchy-aware and is a bigger change, but still manageable. Start with the compiler-only
approach first and only move to LCA execution if you hit performance or semantic needs.

---

### Conclusion and recommendation

- Feasible: Yes, with a small, isolated compile step and minimal runtime changes.
- Minimal-diff plan:
  1. Introduce a nested config type and a `compileNested` function that outputs your existing `MachineConfig`.
  2. Use delimited path strings for leaf state ids; document the delimiter rule.
  3. Compose ancestor `run`s and merged `on` maps at compile time; resolve composite targets to leaf initials.
  4. Optionally add relative target syntax later.
- Revisit runtime only if you need optimized enter/exit for shared ancestors.

If you want, I can sketch the `compileNested` function and an accompanying minimal test that demonstrates parent
bubbling, composite target resolution, and cleanup ordering.
