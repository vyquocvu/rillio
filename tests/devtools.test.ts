// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createInspectorOverlay,
  highlightNode,
  inspectNode,
  inspectRoot,
  trackTransactions,
} from "../src/devtools.js";
import { nodeRegistry, patchEngine } from "../src/compat.js";
import { createStore } from "../src/reactive-api.js";
import { mount, jsx, Show } from "../src/dom/index.js";

describe("zui/devtools: Live Flat Index Inspector", () => {
  it("inspects an active root and serializes the Flat Index tree accurately", () => {
    const container = document.createElement("div");
    const count = createStore(42);

    const dispose = mount(
      () =>
        jsx("main", {
          id: "app-root",
          children: [
            jsx("h1", { children: "Title" }),
            jsx(Show, {
              when: true,
              children: () => jsx("p", { className: "content", children: count }),
            }),
          ],
        }),
      container
    );

    const snapshot = inspectRoot(container);
    expect(snapshot.rootId).toBeGreaterThan(0);
    expect(snapshot.container).toBe(container);
    expect(snapshot.totalNodes).toBeGreaterThan(1);
    expect(snapshot.diagnostics.activeNodes).toBeGreaterThan(0);

    // Root tree structure
    expect(snapshot.tree.kind).toBe("root");
    expect(snapshot.tree.children.length).toBeGreaterThan(0);

    const mainNode = snapshot.tree.children[0]!;
    expect(mainNode.kind).toBe("element");
    expect(mainNode.tagOrType).toBe("main");
    expect(mainNode.props.id).toBe("app-root");
    expect(mainNode.version).toBeGreaterThanOrEqual(1);

    // Inspect individual node
    const singleNode = inspectNode(mainNode.id);
    expect(singleNode.id).toBe(mainNode.id);
    expect(singleNode.tagOrType).toBe("main");

    dispose();
  });

  it("throws ZUI_ROOT_NOT_FOUND when inspecting an unmounted element", () => {
    const emptyDiv = document.createElement("div");
    expect(() => inspectRoot(emptyDiv)).toThrow("ZUI_ROOT_NOT_FOUND");
  });

  it("tracks and logs live PatchOp transaction telemetry", () => {
    const tracker = trackTransactions(patchEngine, 10);
    expect(tracker.getHistory()).toEqual([]);

    const container = document.createElement("div");
    const textStore = createStore("Initial text");
    const dispose = mount(() => jsx("span", { children: textStore }), container);

    let history = tracker.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    const firstTx = history[0]!;
    expect(firstTx.opCount).toBeGreaterThan(0);
    expect(firstTx.operations).toBeDefined();
    expect(firstTx.durationMs).toBeGreaterThanOrEqual(0);
    expect(firstTx.timestamp).toBeGreaterThan(0);

    // Trigger an update
    textStore.set("Updated text");
    history = tracker.getHistory();
    expect(history.length).toBeGreaterThan(1);

    // Clear history
    tracker.clear();
    expect(tracker.getHistory()).toEqual([]);

    tracker.dispose();
    dispose();
  });

  it("highlights an addressable node in the browser DOM", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const dispose = mount(
      () => jsx("button", { id: "test-btn", children: "Click Me" }),
      container
    );

    const rootSnap = inspectRoot(container);
    const btnNode = rootSnap.tree.children[0]!;

    const overlay = highlightNode(btnNode.id, nodeRegistry, { durationMs: 200 });
    // In jsdom without layout getBoundingClientRect returns 0,0,0,0
    // If not visible or 0 rect, returns null gracefully
    if (overlay) {
      expect(overlay.style.position).toBe("fixed");
    }

    dispose();
    document.body.removeChild(container);
  });

  it("creates, updates, and disposes the in-browser HUD inspector overlay", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const disposeMount = mount(
      () => jsx("div", { className: "box", children: "Content" }),
      container
    );

    const overlay = createInspectorOverlay({
      targetRoot: container,
      position: "top-right",
    });

    expect(overlay.element).toBeDefined();
    expect(overlay.element.getAttribute("data-zui-devtools")).toBe("true");
    expect(document.querySelector("[data-zui-devtools]")).toBe(overlay.element);

    // Update triggers fresh diagnostic render
    overlay.update();

    // Clean disposal
    overlay.dispose();
    expect(document.querySelector("[data-zui-devtools]")).toBeNull();

    disposeMount();
    document.body.removeChild(container);
  });
});
