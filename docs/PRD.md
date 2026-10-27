# Product Requirements Document (PRD)
## Product: Rillio Studio - Interactive Component Playground & Visual Inspector

### 1. Product Vision & Executive Summary
Rillio Studio is an autonomous developer workspace and interactive component workbench built specifically for the Rillio addressable-DOM runtime. It empowers developers and UI creators to inspect live addressable DOM nodes, test reactive stores vs JSX components side-by-side, inspect reconciliation operations in real time, and export production-ready Rillio code snippets with zero friction.

### 2. Target Users
- **Frontend Engineers & Framework Developers**: Looking for modern, low-overhead addressable DOM alternatives to heavy virtual DOM solutions.
- **Design Engineers & Prototypers**: Needing instant visual feedback on component states, props, reactive stores, and DOM layout hierarchy.
- **Technical Founders & Evaluators**: Wanting to quickly see, test, and benchmark Rillio's capabilities directly in browser.

### 3. Core User Workflows
1. **Interactive Component Sandbox**: Switch between pre-built templates (Counter, Reactive Store, Form Validator, Dynamic List) or edit props/state in real time.
2. **Live Addressable DOM & Transaction Inspector**: Visually inspect the active DOM node IDs, patch transactions, and reconcile metrics in real time.
3. **Reactive Store Lab**: Create signals/stores dynamically, trigger atomic batch mutations, and observe pinpoint DOM updates without virtual DOM diffing overhead.
4. **Code Export & Share**: Copy ready-to-run TSX snippets or download project configurations configured for `@vyquocvu/rillio`.

### 4. MVP Boundaries & Acceptance Criteria
- **In-Scope (MVP)**:
  - Studio UI: Dedicated web interface accessible via browser (`studio.html` & `examples/studio.tsx`).
  - Interactive Component Canvas with live preview rendering via `@vyquocvu/rillio`.
  - Component Preset Switcher (Counter, Todo/Keyed List, Reactive Store state, Theme Switcher).
  - Live Inspector Panel: DOM transaction log, node count, active patch operations.
  - Interactive Property Controller: Dynamically adjust component props and styles.
  - Instant Code Snippet Viewer with copy-to-clipboard functionality.
  - Automated tests validating studio state management, preset loading, and rendering integrity.
- **Out-of-Scope (Post-MVP)**:
  - Multi-user collaborative editing via WebSockets.
  - Cloud persistence / backend database sync (local storage is sufficient for MVP).
  - External npm package bundling in-browser (sandbox uses built-in Rillio libraries).

### 5. Risks & Mitigation
- **Risk**: Complex runtime DOM inspection overhead slowing down browser rendering.
  - *Mitigation*: Leverage Rillio's lightweight internal diagnostics listener and throttle inspection updates with microtasks.
- **Risk**: Styling collisions between the studio chrome and the previewed component.
  - *Mitigation*: Isolate preview rendering container with distinct CSS namespace / scoping.
