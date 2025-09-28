### Executive summary

You can support "nested states" in smux with a simple compile-time (build-time) flattening step that converts nested
configs into a flat state map with fully-qualified state IDs (for example, `start.idle`). At runtime you still keep a
single active state string, so the core interpreter barely changes.

This keeps code size and complexity low while covering the common case of 1–2 levels of nesting. It is more limited than
true hierarchical state machines (HSMs) such as xstate, but the trade-off is simplicity, smaller API surface, and easier
typing.

Below I outline how to implement it, what to watch out for, the complexity impact, and the main differences from xstate.

### How it would be implemented (practical plan)

1) Add nested config shape (no runtime changes yet)

- Allow any `state` node in `MachineConfig` to be either:
    - a “leaf state” (with `on`, `run`, etc.)
    - a “compound state” (with `initial` and `states`) which itself contains states (and may reuse another
      `MachineConfig`).
- Disallow dots `.` in state keys to avoid ambiguity (since you’ll use `.` for qualified IDs).

2) Build-time flattening

- Introduce a `flattenMachine(config, options)` that returns a flat config the current runtime already supports.
- Do a DFS over the nested config:
    - Maintain a `prefix` (empty at root, otherwise parent qualified name).
    - For each compound node, compute its implicit leaf initial by drilling down `initial` until a leaf.
    - For each leaf node, materialize a flat state with key `qualified = prefix ? `${prefix}.${key}` : key`.
    - Rewrite all transition targets inside that subtree:
        - Relative target like `"loading"` becomes `"<prefix>.loading"`.
        - `#root` means "target in the root namespace" → treat target after `#` as a root-level name (possibly a
          compound; resolve to its leaf initial).
        - `#<abs.path>` like `#start.idle` means that exact absolute qualified state.
    - When a transition points to a compound state key (e.g., `"start"`), resolve to its leaf initial (`"start.idle"` if
      `start`→`idle`→leaf).

3) Simple resolver helpers

- `qualify(prefix, local)`: returns `${prefix}.${local}` when `prefix !== ''`.
- `isCompound(node)`: node has `initial` and `states`.
- `resolveTarget(rawTarget, ctx)`:
    - If starts with `#`:
        - if exactly `#root`, require explicit root target string to follow, or support a two-token form. Simpler: use
          `"#<absolute>"`: `#stop` or `#start.idle`.
        - Strip `#` and treat remainder as absolute path in the root namespace, then resolve to leaf if it’s a compound.
    - Else treat as relative: `qualify(prefix, rawTarget)`.
    - If the resolved target is a compound, resolve to its leaf initial.

4) Effects (run) semantics

- Only allow `run` on leaf states. If a compound node has `run`, either:
    - forbid it with validation, or
    - ignore it for simplicity (forbid is better; produce a build-time error).
- Since you only end up with leaf states in the flat map, runtime effect handling remains unchanged: start the new
  leaf’s `run`, call cleanup of the previous leaf.

5) Reuse of nested machines

- Permit embedding a `MachineConfig<InnerState, InnerEvent>` as a state value inside another config:
    - During flattening, treat it like a compound state whose `states` and `initial` are those of the embedded machine,
      prefixed by the parent key.
    - Merge events at type-level (see typing below). At runtime nothing special.

6) Validation

- Ensure all referenced targets exist after flattening.
- Ensure no state name contains a `.`.
- Ensure there is exactly one flat `initial` state for the machine (resolve top-level `initial` down to a leaf).

7) Runtime

- Keep runtime identical: a single `currentState: string` and lookup in the flat `states` map.
- On transition, use the flat map’s `on[event]` target string; start/stop `run` per usual.

### Pseudocode for flattening

```ts
interface LeafStateConfig<E> {
    on?: Record<E & string, string>;
    run?: () => void | (() => void);
}

interface CompoundStateConfig<S, E> {
    initial: string; // local key
    states: Record<string, LeafStateConfig<E> | CompoundStateConfig<any, E> | MachineConfig<any, E>>;
}

interface MachineConfig<S, E> extends CompoundStateConfig<S, E> {
}

function flattenMachine<S extends string, E extends string>(config: MachineConfig<S, E>) {
    const flat: Record<string, LeafStateConfig<E>> = {};

    function isCompound(node: any): node is CompoundStateConfig<any, E> {
        return node && typeof node === 'object' && 'states' in node && 'initial' in node;
    }

    function resolveLeafInitial(node: CompoundStateConfig<any, E>, prefix: string): string {
        let curKey = node.initial;
        // climb down until leaf
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const child = node.states[curKey];
            if (!isCompound(child)) return qualify(prefix, curKey);
            prefix = qualify(prefix, curKey);
            node = child;
            curKey = node.initial;
        }
    }

    function qualify(prefix: string, local: string) {
        return prefix ? `${prefix}.${local}` : local;
    }

    function resolveTarget(raw: string, ctx: { root: CompoundStateConfig<any, E>; prefix: string }): string {
        if (raw.startsWith('#')) {
            const abs = raw.slice(1); // e.g., 'stop' or 'start.idle'
            // look up from root; if compound, resolve to its leaf initial
            const parts = abs.split('.');
            let node: any = ctx.root;
            let pathPrefix = '';
            for (const p of parts) {
                const next = node.states[p];
                if (!next) throw new Error(`Unknown target ${raw}`);
                pathPrefix = qualify(pathPrefix, p);
                node = next;
            }
            return isCompound(node) ? resolveLeafInitial(node, pathPrefix.split('.').slice(0, -1).join('.')) : pathPrefix;
        }
        // relative
        const rel = qualify(ctx.prefix, raw);
        // If rel names a compound, resolve to its leaf initial (we need to walk from root)
        const parts = rel.split('.');
        let node: any = config as any;
        for (const p of parts) {
            node = isCompound(node) ? node.states[p] : undefined;
            if (!node) break;
        }
        if (node && isCompound(node)) {
            const parentPrefix = parts.slice(0, -1).join('.');
            return resolveLeafInitial(node, parentPrefix);
        }
        return rel;
    }

    function walk(node: any, prefix: string, root: CompoundStateConfig<any, E>) {
        if (!isCompound(node)) {
            // leaf
            const leaf = node as LeafStateConfig<E>;
            const id = prefix; // at this point, prefix holds the full path
            const on: Record<string, string> = {};
            if (leaf.on) {
                for (const [evt, tgt] of Object.entries(leaf.on)) {
                    on[evt] = resolveTarget(tgt, {root, prefix: prefix.split('.').slice(0, -1).join('.')});
                }
            }
            flat[id] = {...leaf, on};
            return;
        }
        // compound: descend
        for (const [key, child] of Object.entries(node.states)) {
            const q = qualify(prefix, key);
            if (isCompound(child)) {
                walk(child, q, root);
            } else if ((child as any)?.states && (child as any)?.initial) {
                walk(child as any, q, root); // embedded machine
            } else {
                walk(child, q, root);
            }
        }
    }

    // Kick off traversal
    walk(config, '', config);

    // Resolve top-level initial to leaf
    const initial = resolveLeafInitial(config, '');

    return {initial, states: flat} as const;
}
```

You’d plug `flattenMachine` into your existing `createStateMachine` entry point, so the interpreter only sees a flat
machine.

### Targeting and transition rules (recommended)

- Relative targets inside a compound resolve within the same subtree and are qualified with the parent prefix.
- Referencing a compound by name should land in its leaf initial (like your `RESTART: "start.idle"` example, but the
  user could also write `RESTART: "start"` and you resolve it).
- Absolute targets:
    - Support `#<absolute.path>` like `#stop` or `#start.success`.
    - Optionally also allow `#root` alias to mean "treat following target as absolute" but simplest is just the
      `#<absolute>` form.

### Typing strategy (TypeScript)

You have three increasing levels of sophistication. Pick 1 or 2 to keep it simple.

1) Pragmatic: widen at the top

- Require users to declare `State` as the final flat union (or at least to include all possible qualified states) and
  `Event` as the union of all events.
- Inner machines can use narrower `Event` subsets; TypeScript will accept them as assignable to the outer `Event`.

2) Helper to infer flat `State`

- Provide `flattenMachine` as a generic that infers the qualified state names and returns a value whose `states` keys
  are strongly typed. Users can then do:

```ts
const machine = createStateMachine(flattenMachine(config));
```

- This gives them strong keys without requiring them to hand-write qualified unions.

3) Advanced mapped-type wizardry (optional)

- Compute `QualifiedStateUnion<Config>` at the type level. This is doable but adds type complexity. Given your
  simplicity goal, consider it later.

### Effects and lifecycle

- Keep one `run` per leaf. Forbid `run` on compound nodes at build time. This avoids questions like whether parent `run`
  should nest or bubble.
- Cleanup runs when leaving the leaf state, same as today. No special handling for ancestors.

### Complexity impact

- Build-time: O(N) over the number of nested states to flatten and validate. The resolver and validator are ~100–200 LOC
  total.
- Runtime: unchanged aside from possibly slightly longer state IDs and an initial "resolve to leaf" step when
  transitioning to a compound by name.
- Code complexity: modest. Main moving parts are the flattener, target resolver, and validation. Interpreter stays
  nearly identical.

### What this design cannot do vs xstate (limits)

Compared to xstate’s full HSM feature set, the proposed design deliberately drops several capabilities:

- No parallel/orthogonal regions. You keep exactly one active state.
- No ancestor entry/exit actions. Only the leaf’s `run` happens; parents don’t get their own entry/exit lifecycle.
- No event bubbling through ancestors with default handlers. In xstate, events can be handled by parent states if the
  child doesn’t. Your flattened form requires every transition to be explicit on the leaf.
- No history states (shallow or deep) for returning to prior nested substates.
- Limited target syntax. You’d support relative and absolute by string paths, but not the full variety of xstate target
  selectors.
- Likely fewer advanced features overall (guards composition, transient transitions, delays, invoked services with
  auto-cancel scoping, spawn/child interpreters, activities at multiple levels, etc.). Some of these might already exist
  in smux; the key point is they won’t have ancestor scoping semantics under flattening.

That said, for many UI flows and request lifecycles that are 1–2 levels deep with a single activity per leaf, these
omissions don’t hurt and the developer experience is simpler.

### Is the design too limiting?

- For common app flows (wizards, async loading, retry, modal subflows), this design is sufficient and pleasant. The
  mental model is clear and the runtime remains tiny.
- It becomes limiting if you need:
    - Concurrent regions (e.g., media player + network + UI selection simultaneously).
    - Parent-level default handlers or cross-cutting entry/exit behaviors.
    - History (return to last nested substate after leaving a parent compound state).
    - Deeply nested machines with lots of shared parent semantics.
- If you expect those use cases, consider either:
    - A future optional layer for parent entry/exit and event bubbling, or
    - Interop with xstate for the complex flows while using smux for simple ones.

### Recommendations and guardrails

- Keep the scope small for v1 of nested states:
    - Implement flattening + relative/absolute targets + compound-to-initial resolution.
    - Forbid `run` on compound states.
    - Validate no `.` in names; provide clear error messages for unknown targets.
- Provide a tiny doc section with rules and 2–3 examples (your file is almost there). Include:
    - How `#abs.path` works.
    - That targeting a compound resolves to its initial leaf.
    - That there is only one active state and one `run` at a time.
- Expose `flattenMachine(config)` or make `createStateMachine` call it internally. If you keep it internal, mention in
  docs that qualified IDs appear at runtime.

### Example end-to-end

```ts
type Event = 'FETCH' | 'RESOLVE' | 'FINISH' | 'RESTART';

const nested = {
    initial: 'start',
    states: {
        start: {
            initial: 'idle',
            states: {
                idle: {on: {FETCH: 'loading'}},
                loading: {on: {RESOLVE: 'success'}},
                success: {on: {FINISH: '#stop'}},
            },
        },
        stop: {on: {RESTART: 'start'}},
    },
} satisfies MachineConfig<any, Event>;

const flat = flattenMachine(nested);
/* flat === {
  initial: 'start.idle',
  states: {
    'start.idle': { on: { FETCH: 'start.loading' } },
    'start.loading': { on: { RESOLVE: 'start.success' } },
    'start.success': { on: { FINISH: 'stop' } },
    'stop': { on: { RESTART: 'start.idle' } },
  }
} */

const service = createStateMachine(flat); // runtime unchanged
```

### Bottom line

- Implementation: straightforward via compile-time flattening and qualified IDs.
- Complexity: low to moderate; interpreter stays simple.
- Limitations: you don’t get full HSM semantics like parent entry/exit, bubbling, history, or parallel states. That’s
  the main difference from xstate.
- For the 80% use case of shallow nesting with a single active state and one effect per leaf, this design is a good
  balance of power and simplicity.