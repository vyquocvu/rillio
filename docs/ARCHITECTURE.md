# Addressable DOM architecture

## Core invariant

The Flat Index is the only source of truth for rendered node identity, parent/sibling structure, ownership, and lifecycle. The browser DOM is a projection of that index. Render planners may keep temporary maps while planning a transaction, but they must not retain an authoritative child tree.

```mermaid
flowchart TB
    accTitle: Flat Index source of truth
    accDescr: Both public planning surfaces send addressable operations through one transaction, registry, and patch engine; the browser DOM is only the resulting projection.

    jsx_input([📥 JSX input]) --> jsx_runtime[⚙️ JSX runtime]
    reactive_input([📥 Reactive input]) --> reactive_planner[⚙️ Reactive planner]
    jsx_runtime --> patch_transaction[[🔄 PatchTransaction]]
    reactive_planner --> patch_transaction

    node_registry[(📝 NodeRegistry)]
    patch_engine[⚙️ PatchEngine]
    browser_dom[(🌐 Browser DOM)]
    reactive_engine[⚙️ ReactiveEngine]

    reactive_planner --> reactive_engine
    patch_transaction -->|validate and plan| node_registry
    patch_transaction -->|commit and dispose| patch_engine
    node_registry -.->|read indexed state| patch_engine
    patch_engine -->|project mutations| browser_dom
    reactive_engine -->|OwnerHost integration| node_registry
```

The two public planning surfaces are:

- the JSX component runtime in `src/compat.ts`, which reruns a component for hook state updates;
- the explicit reactive surface in `src/dom.ts`, which mounts a subtree once and binds reactive text, properties, regions, and list items.

They share the same `NodeRegistry`, `PatchEngine`, DOM operation helpers, and owner host. They are not independent DOM mutation implementations.

## Flat Index records

Each indexed record has:

- monotonic `NodeId`;
- `RootId` and `OwnerId`;
- `version`, incremented on structural, metadata, property, event, and lifecycle changes;
- node kind: root, element, text, comment, or boundary;
- DOM start/end boundary nodes;
- `parentId`, `prevSibling`, `nextSibling`, `firstChild`, and `lastChild`;
- key, type, props/value metadata, listeners, ref, and cleanup state.

Parent/sibling links are stored in the registry. `children(parentId)` walks those links and checks the index invariants. Components and structural regions use two comment nodes as one addressable boundary record, so their children are still indexed without a second virtual tree.

`RootId` and `OwnerId` are never reused. Disposed records remain as tombstones for diagnostics, while active traversals reject disposed records.

The registry keeps two related graphs: solid links describe DOM/index structure, while dashed links describe owner nesting. A node can move in the structure graph without changing its stable `NodeId` or its owner.

```mermaid
flowchart TB
    accTitle: Flat Index and ownership
    accDescr: The diagram separates indexed parent-child structure from owner nesting and shows how stable node, root, and owner identifiers relate.

    root_record([🏁 Root record<br/>RootId])
    root_owner[[🛡️ Root owner<br/>OwnerId]]
    component_owner[[🛡️ Component owner<br/>OwnerId]]
    component_boundary[[🔄 Component boundary<br/>NodeId + range]]
    host_node[📦 Host node<br/>NodeId + version]
    text_node[📝 Text node<br/>NodeId + version]

    root_record -->|owns| root_owner
    root_owner -.->|parents| component_owner
    component_owner -.->|owns| component_boundary
    component_boundary -->|contains| host_node
    host_node -->|contains| text_node
```

## Transaction lifecycle

All browser writes go through `PatchEngine`:

1. A planner creates addressable records and queues operations in a `PatchTransaction`.
2. Validation checks root membership, node state, parent/anchor validity, cycles, duplicate operations, and operation-kind constraints.
3. Commit inserts or moves ranges, patches text/properties/events/refs, and updates the Flat Index.
4. Remove operations run after structural/property changes. The engine clears bindings, runs cleanup, and disposes removed records.
5. Planning failures discard newly created records. Commit failures remove newly inserted ranges where possible and preserve the original exception.

Nested reactive updates join the active transaction for the same root. This is important for initial effects and list item updates: they cannot bypass the transaction boundary or mutate DOM independently.

```mermaid
sequenceDiagram
    accTitle: Patch transaction lifecycle
    accDescr: A planner queues indexed operations, validation checks the registry before any browser write, and the patch engine commits and disposes through one boundary.

    participant planner as ⚙️ Planner
    participant transaction as 🔄 PatchTransaction
    participant registry as 📝 NodeRegistry
    participant patch_engine as ⚙️ PatchEngine
    participant browser_dom as 🌐 Browser DOM

    planner->>transaction: Queue create, move, patch, remove
    transaction->>registry: Validate roots, anchors, cycles
    registry-->>transaction: ✅ Return indexed state

    alt ✅ Validation passes
        transaction->>patch_engine: Commit structural and property ops
        patch_engine->>browser_dom: Apply the DOM mutation boundary
        patch_engine->>registry: Link nodes and bump versions
        transaction->>patch_engine: Dispose removed ranges
        patch_engine->>registry: Cleanup owners and tombstone nodes
        transaction-->>planner: ✅ Return committed result
    else ❌ Validation fails
        transaction-->>planner: Reject before browser writes
    end
```

## JSX runtime lifecycle

`createRoot(container)` creates a root record and root owner. Rendering reads indexed children, matches keyed/type-compatible records, and produces a new ordered list of `NodeId` values only for the current plan. The registry remains authoritative.

- Text changes queue a text patch on the existing `NodeId`.
- Compatible host nodes retain identity and queue property/child patches.
- Compatible components retain their boundary `NodeId` and hook state, then rerun their component function.
- New nodes are created through the transaction and moved into final order by key.
- Removed nodes are disposed after the commit, including descendant effects, listeners, refs, and component cleanups.

Keyed reconciliation reads the current `NodeId` order from the registry. The next child array is a planning result, not a second source-of-truth tree.

```mermaid
flowchart TB
    accTitle: Keyed reconciliation flow
    accDescr: Keyed updates read indexed children, reuse matching node ids, create missing records, move the resulting order, and dispose ids that disappear.

    next_values([📥 Next keyed values]) --> indexed_children[🔍 Read indexed children]
    indexed_children --> match_key{🏷️ Match key and type?}
    match_key -->|Yes| reuse_node[✅ Reuse NodeId]
    match_key -->|No| create_node[📦 Create record]
    reuse_node --> order_nodes[🔄 Queue final order]
    create_node --> order_nodes
    order_nodes --> remove_missing[🗑️ Queue missing ids]
    remove_missing --> commit_children([🏁 Commit and dispose])
```

Hooks are attached to component payloads stored on component records. A state setter addresses the owning component by `NodeId`; it cannot update a disposed record or write during render. Effects are flushed after the root transaction.

## Explicit reactive lifecycle

The explicit API uses the same index for mount-once subtrees:

- a store/binding creates an indexed text node plus an owned effect;
- a reactive property creates an owned property effect;
- function children, `Show`, and `For` create boundary records;
- keyed list entries are addressable boundary records and preserve their `NodeId` while moving;
- `current()` updates an item store without recreating the item boundary;
- owners are hosted by `NodeRegistry`, so computation disposal and DOM subtree disposal share owner identity.

Ordinary JavaScript values are still snapshots in the mount-once surface. Use `select`, `derive`, stores, or explicit reactive regions for live values.

## Ownership

`NodeRegistry` provides the owner tree. `ReactiveEngine` accepts an `OwnerHost`; the DOM engine passes the registry as that host, and computation ownership is attached to the same `OwnerId` used by DOM nodes. Standalone reactive-engine tests use an in-memory owner host, which does not participate in a DOM root.

Disposal is idempotent. A removed boundary disposes descendants first, then listeners/refs/effects, then its own owner and index record. Root disposal removes indexed children before disposing the root owner.

```mermaid
stateDiagram-v2
    accTitle: Indexed node lifecycle
    accDescr: An indexed node moves from allocation through registry linking and DOM mounting, then reaches disposal or rollback while retaining a diagnostic tombstone.

    [*] --> Allocated: 📦 Create record
    Allocated --> Indexed: 🏷️ Assign ids and owner
    Indexed --> Mounted: ✅ Commit insert or move
    Mounted --> Mounted: ✏️ Patch text, props, events
    Mounted --> Removing: 🗑️ Queue removal
    Removing --> Disposed: 🧹 Cleanup and tombstone
    Indexed --> Disposed: ❌ Planning failure
    Disposed --> [*]: 🏁 Retain diagnostics
```

## Files

- `src/flat.ts`: `NodeRegistry`, `PatchTransaction`, and the single `PatchEngine` mutation boundary.
- `src/compat.ts`: JSX component planner, hooks, reconciliation, and root API.
- `src/dom.ts`: explicit reactive planner and `Show`/`For` regions using the shared engine.
- `src/reactive.ts`: stores, computed values, effects, batching, and owner-host integration.
- `src/jsx-runtime.ts`, `src/jsx-dev-runtime.ts`: automatic JSX transform entries.
- `tests/flat.test.ts`: registry and transaction unit tests.
- `tests/flat-random.test.ts`: seeded keyed randomized consistency checks.
- `tests/lifecycle.test.ts`: repeated disposal and owner/node leak checks.

## Current limitations

- Metadata/state rollback after a failed update is not yet fully snapshot-based; release hardening tracks this as M4.
- DOM property normalization is intentionally scoped and does not yet provide full SVG/custom-element parity.
- The engine uses a singleton registry per module instance and browser `document`; SSR and concurrent server rendering are out of scope.
- No independent DOM writes are allowed outside `PatchEngine`; future features must extend its operation set rather than add renderer-specific mutation helpers.
