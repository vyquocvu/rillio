# Architecture Document: Rillio Studio (Interactive Workbench)
## Product: Rillio Studio

### 1. System Architecture Overview
Rillio Studio operates directly on the client side using Vite and the core `@vyquocvu/rillio` library (JSX runtime, hooks, store, and patch engine).

```mermaid
flowchart TD
    subgraph UI ["Studio Shell (examples/studio.tsx)"]
        Nav[Header & Preset Selector]
        Controls[Component Property Controls]
        Canvas[Component Sandbox Preview]
        Inspector[Live Addressable DOM & Transaction Inspector]
        Code[Export Code Snippet Panel]
    end

    subgraph State ["Studio State Engine"]
        ActivePresetStore[Preset & Prop Store]
        TransactionMonitor[Diagnostic Hook / Event Bus]
    end

    subgraph RillioEngine ["@vyquocvu/rillio Runtime"]
        JSXPlanner[JSX Planner]
        PatchTx[Patch Transaction Engine]
        FlatIndex[Flat Node Registry]
        BrowserDOM[(Browser DOM)]
    end

    Nav --> ActivePresetStore
    Controls --> ActivePresetStore
    ActivePresetStore --> Canvas
    Canvas --> JSXPlanner
    JSXPlanner --> PatchTx
    PatchTx --> FlatIndex
    PatchTx --> BrowserDOM
    PatchTx -.-> TransactionMonitor
    TransactionMonitor --> Inspector
    ActivePresetStore --> Code
```

### 2. Module Responsibilities
1. **Studio Shell (`studio.html` & `examples/studio.tsx`)**:
   - Manages workbench layout: top bar with presets, left split pane with property editor and transaction logs, center live preview sandbox, right pane with generated TSX code.
2. **Preset Registry (`examples/studio-presets.ts`)**:
   - Defines declarative component models, configurable props, and initial state configurations.
3. **Telemetry & Transaction Inspector**:
   - Listens to patch cycles and counts mounted nodes, transaction executions, and DOM mutations.
4. **Code Generator**:
   - Formats clean, executable `@vyquocvu/rillio` component code matching current property selections.

### 3. Key Technical Decisions
- **Zero Heavy External Dependencies**: Retain Rillio's pure zero-dependency footprint.
- **Client-Side Reactive Updates**: Changes in the property controls seamlessly trigger reactive re-renders in the preview canvas.
- **Vitest Verification**: All preset generators and studio state stores covered by unit and integration tests.
