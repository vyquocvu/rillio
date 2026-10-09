// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { jsx, mount, useStore, engine } from "../src/dom.js";

describe("React-friendly ZUI DX", () => {
  it("supports direct store children and controlled value props without rerender", () => {
    const count = useStore(0);
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
    const visible = useStore(true);
    const label = useStore("Initial");
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
});
