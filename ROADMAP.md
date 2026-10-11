# ZUI Release Roadmap

ZUI is a small addressable-DOM runtime. JSX is the authoring syntax; the Flat Index is the runtime architecture. React/Preact compatibility is not a product goal.

## Release policy

- Release target: `v0.1.0`.
- Stability target: dependable small browser applications.
- Breaking changes are allowed before `v1.0.0`, but must be documented.
- `zui/legacy` remains a compatibility alias for the explicit reactive API while the public naming settles.
- There is one production DOM mutation path: `PatchEngine`.

## v0.1 scope

### Included

- Automatic JSX runtime with `jsx`, `jsxs`, `jsxDEV`, and `Fragment`.
- Function components, `useState`, `useEffect`, `useMemo`, `useCallback`, and `useRef`.
- Conditional rendering, fragments, arrays, keyed `.map()`, and stable keyed DOM identity.
- Explicit stores, bindings, `Show`, `For`, batching, ownership, and disposal through the same flat runtime.
- `NodeRegistry` with stable `NodeId`, `RootId`, `OwnerId`, linked structure, and versioning.
- Transactional `PatchEngine` with validate → commit → dispose semantics.
- ESM JavaScript, declarations, strict external consumer verification, lifecycle tests, randomized consistency tests, and measured benchmarks.

### Explicitly excluded

- React API parity, synthetic events, React scheduling semantics, and ecosystem drop-in compatibility.
- SSR/hydration/streaming, portals, async resources, Suspense, and server components.
- Full SVG/property normalization, compiler optimizations, devtools, and router/data-layer integrations.

## Work plan

### M0 — Contract and invariants — complete

- [x] Define Flat Index as the source of truth for node identity and structure.
- [x] Define stable root/owner/node ids and versioning.
- [x] Define the single Patch Engine mutation boundary.

### M1 — Addressable foundation — complete

- [x] Implement `NodeRegistry` and linked parent/sibling index.
- [x] Implement transactional creation, insertion, movement, property patching, removal, and disposal.
- [x] Add unit tests for ids, rollback, refs, events, ownership, and index consistency.

### M2 — JSX runtime migration — complete

- [x] Replace the renderer's authoritative `Instance` tree with registry node ids.
- [x] Preserve hooks, effects, fragments, conditional output, keyed arrays, focus, and caret behavior.
- [x] Keep DOM writes inside `PatchEngine`.

### M3 — Reactive surface migration — complete

- [x] Route the explicit reactive surface through the same registry and patch engine.
- [x] Attach reactive computation ownership to the registry owner host.
- [x] Add randomized keyed consistency and repeated lifecycle disposal tests.
- [x] Add a flat-index benchmark that reports measured local output only.

### M4 — Release hardening — next

- [ ] Add transaction snapshots for renderer metadata and state rollback on failed updates.
- [ ] Expand the DOM contract for SVG namespaces, form properties, custom elements, and accessibility-oriented properties.
- [ ] Strengthen TypeScript JSX intrinsic types and event types.
- [ ] Add memory-retention diagnostics for removed nodes, owners, listeners, and effects.
- [ ] Run all gates from a clean checkout and record the exact code revision.

## Post-v0.1 options

- Async resources and an explicit loading/error primitive.
- Portal support through addressable mount targets.
- SSR/hydration if a server-rendered use case is confirmed.
- Compiler and devtools work only after the runtime contract is stable.

## Release gates

| Gate | Requirement |
|---|---|
| API | Public exports and semantic contract match implementation |
| Index | Registry parent/sibling/owner invariants pass randomized checks |
| Transactions | Invalid patches fail before commit; removed subtrees dispose once |
| DOM | Props, events, refs, forms, keyed identity, focus, and caret pass |
| Lifecycle | Repeated mount/unmount leaves no active indexed nodes or owners |
| Browser | Counter, keyed, smoke, and Todo flows pass without uncaught errors |
| Package | Built ESM/declarations resolve from an external consumer |
| Docs | README, roadmap, API, architecture, changelog, and status agree |

## Definition of done

ZUI is ready for `v0.1.0` when the release gates pass on one recorded code revision, the package is reproducible from a clean install, and the documentation distinguishes measured evidence from future work.
