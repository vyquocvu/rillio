// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, jsx, nodeRegistry, getAddressableRoot, useEffect, useState } from "../src/compat.js";
import { createStore } from "../src/reactive-api.js";
import { mount, Show, select, registry } from "../src/dom.js";

describe("addressable lifecycle", () => {
  it("rejects overlapping JSX and reactive roots without orphaning the mounted tree", () => {
    const value = createStore("before");
    const container = document.createElement("div");
    const disposeReactive = mount(jsx("span", { children: value }), container);

    expect(() => createRoot(container)).toThrow("RILLIO_ROOT_OCCUPIED");
    expect(container.textContent).toBe("before");
    value.set("after");
    expect(container.textContent).toBe("after");

    disposeReactive();
    const jsxRoot = createRoot(container);
    jsxRoot.render(jsx("strong", { children: "new root" }));
    expect(container.textContent).toBe("new root");
    jsxRoot.unmount();
  });

  it("leaves no active flat nodes or owners after repeated component disposal", () => {
    for (let cycle = 0; cycle < 40; cycle++) {
      const container = document.createElement("div");
      let cleanup = 0;
      function App() {
        const [value] = useState(cycle);
        useEffect(() => () => { cleanup++; }, [value]);
        return jsx("section", { children: jsx("span", { children: value }) });
      }
      const root = createRoot(container);
      root.render(jsx(App, {}));
      const handle = getAddressableRoot(container)!;
      const rootId = handle.rootId;
      root.unmount();
      expect(cleanup).toBe(1);
      expect(nodeRegistry.allNodes().some(node => node.rootId === rootId && !node.disposed)).toBe(false);
      expect(nodeRegistry.allOwners().some(owner => owner.rootId === rootId && !owner.disposed)).toBe(false);
      expect(container.childNodes).toHaveLength(0);
    }
  });

  it("disposes reactive branches and their shared owner graph", () => {
    const visible = createStore(true);
    const target = document.createElement("div");
    const baseline = registry.allNodes().filter(node => !node.disposed).length;
    const dispose = mount(Show({
      when: select(visible, value => value),
      children: () => jsx("strong", { children: "active" })
    }), target);
    expect(target.textContent).toBe("active");
    visible.set(false);
    expect(target.textContent).toBe("");
    dispose();
    expect(registry.allNodes().filter(node => !node.disposed).length).toBe(baseline);
    expect(target.childNodes).toHaveLength(0);
  });
});
