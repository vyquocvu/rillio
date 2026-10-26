import { createRoot, useRef, useState } from "@vyquocvu/rillio";
import { create } from "../src/external-store.ts";
import { installSourceViewer } from "./source-viewer.js";

interface LabStore {
  count: number;
  label: string;
  increment: () => void;
  rename: () => void;
}

const useLabStore = create<LabStore>(set => ({
  count: 0,
  label: "Rillio observer",
  increment: () => set(state => ({ count: state.count + 1 })),
  rename: () => set(state => ({ label: state.label === "Rillio observer" ? "Flat Index" : "Rillio observer" })),
}));

function useRenderTrace(name: string): number {
  const renders = useRef(0);
  renders.current += 1;
  console.log(`[render-lab] ${name} render #${renders.current}`);
  return renders.current;
}

function LocalCounter() {
  const [count, setCount] = useState(0);
  const renders = useRenderTrace("LocalCounter");
  return (
    <section class="lab-card" id="local-counter">
      <h2>Component-owned state</h2>
      <p class="lab-muted">Updating this state should render this component and its own subtree.</p>
      <div class="lab-value"><strong id="local-count">{count}</strong><span>local clicks</span></div>
      <div class="lab-pill">LocalCounter render #{renders}</div>
      <div class="lab-actions">
        <button class="lab-button lab-button--primary" id="local-increment" onClick={() => setCount(value => value + 1)}>
          Update this component
        </button>
      </div>
    </section>
  );
}

function StoreCount() {
  const count = useLabStore(state => state.count);
  const increment = useLabStore(state => state.increment);
  const renders = useRenderTrace("StoreCount");
  return (
    <section class="lab-card" id="store-count-panel">
      <h2>Store selector: count</h2>
      <p class="lab-muted">This component subscribes only to <code>count</code>.</p>
      <div class="lab-value"><strong id="store-count">{count}</strong><span>store count</span></div>
      <div class="lab-pill">StoreCount render #{renders}</div>
      <div class="lab-actions">
        <button class="lab-button lab-button--primary" id="store-increment" onClick={increment}>Update count slice</button>
      </div>
    </section>
  );
}

function StoreLabel() {
  const label = useLabStore(state => state.label);
  const renders = useRenderTrace("StoreLabel");
  return (
    <section class="lab-card" id="store-label-panel">
      <h2>Store selector: label</h2>
      <p class="lab-muted">A count update should leave this selector unchanged.</p>
      <div class="lab-value"><strong id="store-label" style={{ fontSize: "20px" }}>{label}</strong></div>
      <div class="lab-pill">StoreLabel render #{renders}</div>
      <div class="lab-actions">
        <button class="lab-button" id="store-rename" onClick={() => useLabStore.getState().rename()}>
          Update label slice
        </button>
      </div>
    </section>
  );
}

function StaticChild() {
  const renders = useRenderTrace("StaticChild");
  return (
    <section class="lab-card" id="static-child">
      <h2>Unsubscribed child</h2>
      <p class="lab-muted">A parent update reruns this child; local and selector updates stay within their owners.</p>
      <div class="lab-pill">StaticChild render #{renders}</div>
    </section>
  );
}

function App() {
  const [rootUpdates, setRootUpdates] = useState(0);
  const renders = useRenderTrace("App");
  return (
    <main class="lab-shell">
      <div class="lab-topline"><a href="/demos.html">Rillio examples</a><span>/</span><span>Render diagnostics</span></div>
      <header class="lab-hero">
        <h1>Render scope lab</h1>
        <p>Click each control and inspect the browser console. The <code>[render-lab]</code> lines show which function components execute for local state, selector updates, and a parent-owned update.</p>
        <div class="lab-callout">This lab measures component function calls. It also keeps visible DOM nodes keyed by identity so you can distinguish a component render from a remount.</div>
      </header>

      <section class="lab-card" style={{ marginBottom: "16px" }} id="root-panel">
        <h2>App-owned state</h2>
        <p class="lab-muted">This control updates the root component and reruns each matched child, even when child props stay equal.</p>
        <div class="lab-value"><strong id="root-updates">{rootUpdates}</strong><span>root updates · App render #{renders}</span></div>
        <div class="lab-actions">
          <button class="lab-button lab-button--primary" id="root-increment" onClick={() => setRootUpdates(value => value + 1)}>
            Update App state
          </button>
        </div>
      </section>

      <div class="lab-grid">
        <LocalCounter />
        <StoreCount />
        <StoreLabel />
        <StaticChild />
      </div>

      <footer class="lab-footer"><span>Console prefix: <code>[render-lab]</code></span><a href="/store-lab.html">Next: selector lab →</a></footer>
    </main>
  );
}

const container = document.getElementById("app");
if (container) createRoot(container).render(<App />);
installSourceViewer("render-lab.tsx", () => import("./render-lab.tsx?raw").then(module => module.default));
