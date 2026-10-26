// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createStore, engine } from "../src/reactive-api.js";
import { jsx, mount } from "../src/dom.js";

describe("React-friendly Rillio DX", () => {
  it("supports direct store children and controlled value props without rerender", () => {
    const count = createStore(0);
    const root = document.createElement("div");
    let renders = 0;
    const dispose = mount(() => {
      renders++;
      return jsx("input", { value: count });
    }, root);
    const input = root.querySelector("input")!;
    expect(input.value).toBe("0");
    count.set(3);
    expect(input.value).toBe("3");
    expect(renders).toBe(1);
    dispose();
  });

  it("supports conditional function children and disposes old branches", () => {
    const visible = createStore(true);
    const label = createStore("Initial");
    const root = document.createElement("div");
    const baseline = engine.diagnostics().activeComputations;
    const dispose = mount(jsx("main", {
      children: () => visible.get() ? jsx("span", { children: label }) : null
    }), root);
    expect(root.querySelector("span")?.textContent).toBe("Initial");
    visible.set(false);
    expect(root.querySelector("span")).toBeNull();
    label.set("New");
    visible.set(true);
    expect(root.querySelector("span")?.textContent).toBe("New");
    dispose();
    expect(engine.diagnostics().activeComputations).toBe(baseline);
  });

  it("assigns and clears React-style object refs", () => {
    const ref: { current: HTMLElement | null } = { current: null };
    const root = document.createElement("div");
    const dispose = mount(jsx("button", { ref, children: "Click" }), root);
    expect(ref.current).toBe(root.querySelector("button"));
    dispose();
    expect(ref.current).toBeNull();
  });
  it("does not remount a conditional branch when only a nested component store changes", () => {
    const visible = createStore(true);
    const nested = createStore("before");
    const root = document.createElement("div");
    let mounts = 0;
    const baseline = engine.diagnostics().activeComputations;
    function Child() {
      mounts++;
      // This plain read runs during initial child mounting. It must not
      // subscribe the parent's conditional reactive computation.
      nested.get();
      return jsx("strong", { children: nested });
    }
    const dispose = mount(jsx("section", {
      children: () => visible.get() ? jsx(Child, {}) : null
    }), root);
    const node = root.querySelector("strong");
    expect(mounts).toBe(1);
    nested.set("after");
    expect(root.querySelector("strong")).toBe(node);
    expect(node?.textContent).toBe("after");
    expect(mounts).toBe(1);
    visible.set(false);
    expect(root.querySelector("strong")).toBeNull();
    visible.set(true);
    expect(mounts).toBe(2);
    dispose();
    expect(engine.diagnostics().activeComputations).toBe(baseline);
  });

  it("untrack prevents unintentional subscriptions", () => {
    const trigger = createStore(0);
    const ignored = createStore(0);
    const root = document.createElement("div");
    let evaluations = 0;
    const dispose = mount(jsx("div", {
      children: () => {
        evaluations++;
        const v = trigger.get();
        engine.untrack(() => ignored.get());
        return jsx("span", { children: String(v) });
      }
    }), root);
    ignored.set(1);
    expect(evaluations).toBe(1);
    trigger.set(2);
    expect(evaluations).toBe(2);
    dispose();
  });

});
