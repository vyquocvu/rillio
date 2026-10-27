# Design Document & UI/UX Specifications
## Product: Rillio Studio

### 1. Visual Hierarchy & Theme
- **Color Palette**:
  - Background Base: `#0f172a` (slate-900)
  - Surface Card / Panels: `#1e293b` (slate-800)
  - Borders: `#334155` (slate-700)
  - Primary Brand Accent: `#6366f1` (indigo-500)
  - Secondary Accent / Highlights: `#38bdf8` (sky-400)
  - Text Primary: `#f8fafc` (slate-50)
  - Text Secondary / Muted: `#94a3b8` (slate-400)
  - Badge Success: `#10b981` (emerald-500)
  - Badge Warning: `#f59e0b` (amber-500)

### 2. Screen Flow & Layout
- **Header Bar**:
  - Logo and Title: `Rillio Studio`
  - Preset Quick-Selector tabs (Counter, Keyed List, Live Reactive Store, Feedback Card).
  - Quick action buttons: "Copy TSX", "Reset State", "Toggle Inspector".
- **Three-Column Responsive Studio Workspace**:
  - **Left Pane (Configuration & Props)**:
    - Dynamic prop editor (label strings, numeric steps, theme toggles, badge variants).
    - Real-time reactivity status indicator.
  - **Center Pane (Component Sandbox Canvas)**:
    - Clean isolated stage container with backdrop pattern.
    - Live-rendered interactive component.
    - Real-time user interaction feedback.
  - **Right / Bottom Split Pane (Telemetry & Code Export)**:
    - **Tab 1: Live Inspector**: Patch transactions count, active node count, last patch timestamp, DOM node hierarchy metrics.
    - **Tab 2: Exported Code**: Syntax-highlighted/clean formatted TSX ready to paste into any Rillio application.

### 3. Usability, Accessibility & Empty States
- Keyboard accessible navigation across preset controls.
- Clean fallback rendering and empty states when changing configurations.
- Responsive design collapsing to stacked panels on mobile/narrow viewports.
