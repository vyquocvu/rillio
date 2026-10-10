// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, render, jsx, useState, useEffect, useMemo, useRef } from "../src/compat.js";

describe("React-style compatibility runtime", () => {
  it("rerenders function component state while preserving host DOM identity", () => {
    let update!: (fn: (n: number) => number) => void;
    let renders = 0;
    function Counter() {
      const [count, setCount] = useState(0);
      update = setCount;
      renders++;
      return jsx("button", { children: count });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx(Counter, {}));
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("0");
    update(n => n + 1);
    expect(container.querySelector("button")).toBe(button);
    expect(button?.textContent).toBe("1");
    expect(renders).toBe(2);
    root.unmount();
    expect(container.childNodes.length).toBe(0);
  });

  it("maintains keyed node identity while reordering and deleting list items", () => {
    let setItems!: (next: { id: string; label: string }[]) => void;
    function App() {
      const [items, update] = useState([{ id: "a", label: "A" }, { id: "b", label: "B" }]);
      setItems = update;
      return jsx("ul", { children: items.map(item => jsx("li", { children: item.label }, item.id)) });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx(App, {}));
    const first = container.querySelector("li");
    setItems([{ id: "b", label: "B2" }, { id: "a", label: "A2" }]);
    expect([...container.querySelectorAll("li")].map(el => el.textContent)).toEqual(["B2", "A2"]);
    expect(container.querySelectorAll("li")[1]).toBe(first);
    setItems([{ id: "a", label: "A3" }]);
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector("li")).toBe(first);
    root.unmount();
  });

  it("runs dependency-aware effects and cleanup on unmount", () => {
    let change!: (n: number) => void;
    const log: string[] = [];
    function App() {
      const [count, update] = useState(0);
      change = update;
      useEffect(() => {
        log.push("mount " + count);
        return () => { log.push("cleanup " + count); };
      }, [count]);
      return jsx("span", { children: count });
    }
    const root = createRoot(document.createElement("div"));
    root.render(jsx(App, {}));
    change(1);
    change(1);
    root.unmount();
    expect(log).toEqual(["mount 0", "cleanup 0", "mount 1", "cleanup 1"]);
  });

  it("does not run a superseded effect twice when cleanup updates state", () => {
    let update!: (next: number) => void;
    const log: string[] = [];
    function App() {
      const [value, setValue] = useState(0);
      update = setValue;
      useEffect(() => {
        log.push("effect " + value);
        return () => {
          log.push("cleanup " + value);
          if (value === 0) update(2);
        };
      }, [value]);
      return jsx("span", { children: value });
    }
    const root = createRoot(document.createElement("div"));
    root.render(jsx(App, {}));
    update(1);
    expect(log).toEqual(["effect 0", "cleanup 0", "effect 2"]);
    root.unmount();
  });

  it("supports memo and ref hook slots across rerenders", () => {
    let change!: (n: number) => void;
    let calculations = 0;
    let ref: { current: number } | undefined;
    function App() {
      const [value, setValue] = useState(1);
      change = setValue;
      ref = useRef(3);
      const doubled = useMemo(() => { calculations++; return value * 2; }, [value]);
      return jsx("span", { children: doubled });
    }
    const root = createRoot(document.createElement("div"));
    root.render(jsx(App, {}));
    const original = ref;
    change(2);
    change(2);
    expect(ref).toBe(original);
    expect(calculations).toBe(2);
    root.unmount();
  });
  it("reconciles fragment arrays and null branches without text placeholders", () => {
    let show!: (visible: boolean) => void;
    function App() {
      const [visible, setVisible] = useState(true);
      show = setVisible;
      return visible ? [jsx("span", { children: "A" }, "a"), jsx("span", { children: "B" }, "b")] : null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx(App, {}));
    const first = container.querySelector("span");
    expect(container.querySelectorAll("span")).toHaveLength(2);
    show(false);
    expect(container.querySelectorAll("span")).toHaveLength(0);
    show(true);
    expect(container.querySelectorAll("span")).toHaveLength(2);
    expect(container.querySelector("span")).not.toBe(first);
    root.unmount();
    expect(container.childNodes).toHaveLength(0);
  });

  it("reuses the root when the public render helper is called again", () => {
    const container = document.createElement("div");
    let update!: (next: number) => void;
    function App(props: { label: string }) {
      const [count, setCount] = useState(0);
      update = setCount;
      return jsx("button", { children: `${props.label}:${count}` });
    }
    render(jsx(App, { label: "first" }), container);
    const button = container.querySelector("button");
    update(1);
    render(jsx(App, { label: "second" }), container);
    expect(container.querySelector("button")).toBe(button);
    expect(button?.textContent).toBe("second:1");
  });

  it("keeps roots on different containers independent", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    render(jsx("span", { children: "first" }), first);
    render(jsx("span", { children: "second" }), second);
    const firstNode = first.firstChild;
    const secondNode = second.firstChild;
    createRoot(first).unmount();
    render(jsx("span", { children: "updated" }), second);
    expect(first.childNodes).toHaveLength(0);
    expect(second.firstChild).toBe(secondNode);
    expect(second.textContent).toBe("updated");
    expect(firstNode).not.toBe(secondNode);
  });

  it("rejects hook order changes and render-phase state writes", () => {
    const container = document.createElement("div");
    let setEnabled!: (next: boolean) => void;
    function ConditionalHooks() {
      const [enabled, set] = useState(false);
      setEnabled = set;
      if (enabled) useRef(null);
      return jsx("span", { children: "ok" });
    }
    const root = createRoot(container);
    root.render(jsx(ConditionalHooks, {}));
    expect(() => setEnabled(true)).toThrow("ZUI_HOOK_ORDER");
    root.unmount();

    function WritesDuringRender() {
      const [value, setValue] = useState(0);
      if (value === 0) setValue(1);
      return jsx("span", { children: value });
    }
    expect(() => createRoot(document.createElement("div")).render(jsx(WritesDuringRender, {})))
      .toThrow("ZUI_RENDER_PHASE_UPDATE");
  });

  it("removes partially mounted nodes when rendering throws", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    function Broken() {
      return [jsx("span", { children: "one" }, "same"), jsx("span", { children: "two" }, "same")];
    }
    expect(() => root.render(jsx(Broken, {}))).toThrow("ZUI_DUPLICATE_KEY");
    expect(container.childNodes).toHaveLength(0);
    root.unmount();
  });

});
