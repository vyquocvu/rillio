// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, jsx, useState } from "../src/compat.js";
import { create } from "../src/external-store.js";

describe("render diagnostics", () => {
  it("shows local updates stay in their owner and parent updates skip unchanged descendants", () => {
    const events: string[] = [];
    let updateApp!: (next: number) => void;
    let updateLeaf!: (next: number) => void;

    function Leaf() {
      const [count, setCount] = useState(0);
      updateLeaf = setCount;
      events.push("Leaf");
      console.log("[render-check] Leaf render", count);
      return jsx("button", { id: "leaf", children: count });
    }

    function Sibling() {
      events.push("Sibling");
      console.log("[render-check] Sibling render");
      return jsx("span", { id: "sibling", children: "stable" });
    }

    function App() {
      const [version, setVersion] = useState(0);
      updateApp = setVersion;
      events.push("App");
      console.log("[render-check] App render", version);
      return jsx("main", { children: [jsx(Leaf, {}, "leaf"), jsx(Sibling, {}, "sibling")] });
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx(App, {}));
    const leafNode = container.querySelector("#leaf");
    const siblingNode = container.querySelector("#sibling");

    events.length = 0;
    updateLeaf(1);
    expect(events).toEqual(["Leaf"]);
    expect(container.querySelector("#leaf")).toBe(leafNode);
    expect(leafNode?.textContent).toBe("1");
    console.log("[render-check] local update =>", events.join(" > "));

    events.length = 0;
    updateApp(1);
    expect(events).toEqual(["App"]);
    expect(container.querySelector("#leaf")).toBe(leafNode);
    expect(container.querySelector("#sibling")).toBe(siblingNode);
    console.log("[render-check] parent update =>", events.join(" > "));

    root.unmount();
  });

  it("only invalidates changed Zustand selectors and keeps the App component quiet", () => {
    const events: string[] = [];
    const useDemoStore = create<{
      count: number;
      label: string;
      increase: () => void;
      rename: () => void;
    }>(set => ({
      count: 0,
      label: "initial",
      increase: () => set(state => ({ count: state.count + 1 })),
      rename: () => set(state => ({ label: state.label === "initial" ? "updated" : "initial" })),
    }));

    function CountSlice() {
      const count = useDemoStore(state => state.count);
      events.push("CountSlice");
      console.log("[render-check] CountSlice render", count);
      return jsx("output", { id: "count-slice", children: count });
    }

    function LabelSlice() {
      const label = useDemoStore(state => state.label);
      events.push("LabelSlice");
      console.log("[render-check] LabelSlice render", label);
      return jsx("output", { id: "label-slice", children: label });
    }

    function App() {
      events.push("StoreApp");
      console.log("[render-check] StoreApp render");
      return jsx("main", { children: [jsx(CountSlice, {}, "count"), jsx(LabelSlice, {}, "label")] });
    }

    const root = createRoot(document.createElement("div"));
    root.render(jsx(App, {}));
    events.length = 0;

    useDemoStore.getState().increase();
    expect(events).toEqual(["CountSlice"]);
    console.log("[render-check] count selector update =>", events.join(" > "));

    events.length = 0;
    useDemoStore.getState().rename();
    expect(events).toEqual(["LabelSlice"]);
    console.log("[render-check] label selector update =>", events.join(" > "));

    root.unmount();
  });
});
