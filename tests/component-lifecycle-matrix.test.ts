// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, jsx, useEffect, useState } from "../src/compat.js";
import { create } from "../src/external-store.js";

const sizes = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000] as const;
const cases = [
  "initial-mount",
  "local-state-update",
  "same-value-noop",
  "parent-state-update",
  "prop-fanout-update",
  "zustand-selector-update",
  "keyed-reorder-identity",
  "keyed-remove-cleanup",
  "root-unmount-cleanup",
  "setter-after-unmount"
] as const;

type CaseName = (typeof cases)[number];

describe("component data lifecycle matrix (100 cases)", () => {
  it.each(cases.flatMap(caseName => sizes.map(size => ({ caseName, size }))))(
    "$caseName with $size component(s)",
    ({ caseName, size }) => runLifecycleCase(caseName, size)
  );
});

function runLifecycleCase(caseName: CaseName, size: number): void {
  const container = document.createElement("div");
  const renderLog: number[] = [];
  const cleanups = Array.from({ length: size }, () => 0);
  const localSetters: Array<(value: number | ((previous: number) => number)) => void> = [];
  let parentSetter: ((value: number | ((previous: number) => number)) => void) | undefined;
  let root = createRoot(container);
  let revision = 0;
  let visibleIds = Array.from({ length: size }, (_, id) => id);

  const useRowsStore = create<{ values: number[]; setValue: (id: number, value: number) => void }>(set => ({
    values: Array.from({ length: size }, () => 0),
    setValue: (id, value) => set(state => ({
      values: state.values.map((current, index) => index === id ? value : current)
    }))
  }));

  function Row({ id, rowRevision }: { id: number; rowRevision: number }) {
    const [local, setLocal] = useState(0);
    const selected = useRowsStore(state => state.values[id] ?? 0);
    localSetters[id] = setLocal;
    renderLog.push(id);
    useEffect(() => () => { cleanups[id]++; }, []);
    return jsx("output", {
      "data-id": String(id),
      "data-revision": String(rowRevision),
      children: `${id}:${local}:${selected}`
    });
  }

  function App({ appRevision = 0 }: { appRevision?: number }) {
    const [version, setVersion] = useState(0);
    parentSetter = setVersion;
    void version;
    return jsx("main", {
      "data-app-revision": String(appRevision),
      children: visibleIds.map(id => jsx(Row, { id, rowRevision: revision }, id))
    });
  }

  const render = () => root.render(jsx(App, { appRevision: revision }));
  render();
  const initialNodes = new Map(
    Array.from(container.querySelectorAll("output")).map(node => [node.getAttribute("data-id"), node])
  );

  if (caseName === "initial-mount") {
    expect(renderLog).toHaveLength(size);
    expect(container.querySelectorAll("output")).toHaveLength(size);
  } else if (caseName === "local-state-update") {
    renderLog.length = 0;
    localSetters[size - 1]!(previous => previous + 1);
    expect(renderLog).toEqual([size - 1]);
    expect(container.querySelector(`[data-id="${size - 1}"]`)?.textContent).toBe(`${size - 1}:1:0`);
    for (const [id, node] of initialNodes) {
      expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "same-value-noop") {
    renderLog.length = 0;
    localSetters[0]!(0);
    expect(renderLog).toEqual([]);
  } else if (caseName === "parent-state-update") {
    renderLog.length = 0;
    parentSetter!(previous => previous + 1);
    expect(renderLog).toEqual(Array.from({ length: size }, (_, id) => id));
    for (const [id, node] of initialNodes) {
      expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "prop-fanout-update") {
    renderLog.length = 0;
    revision++;
    render();
    expect(renderLog).toHaveLength(size);
    expect(container.querySelector("main")?.getAttribute("data-app-revision")).toBe("1");
    expect(container.querySelector("output")?.getAttribute("data-revision")).toBe("1");
    for (const [id, node] of initialNodes) {
      expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "zustand-selector-update") {
    renderLog.length = 0;
    useRowsStore.getState().setValue(size - 1, 42);
    expect(renderLog).toEqual([size - 1]);
    expect(container.querySelector(`[data-id="${size - 1}"]`)?.textContent).toBe(`${size - 1}:0:42`);
    for (const [id, node] of initialNodes) {
      expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "keyed-reorder-identity") {
    renderLog.length = 0;
    visibleIds = [...visibleIds].reverse();
    render();
    expect(Array.from(container.querySelectorAll("output")).map(node => node.getAttribute("data-id")))
      .toEqual(visibleIds.map(String));
    for (const [id, node] of initialNodes) {
      expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "keyed-remove-cleanup") {
    const removedId = size - 1;
    renderLog.length = 0;
    visibleIds = visibleIds.filter(id => id !== removedId);
    render();
    expect(container.querySelector(`[data-id="${removedId}"]`)).toBeNull();
    expect(cleanups[removedId]).toBe(1);
    expect(cleanups.slice(0, removedId).every(count => count === 0)).toBe(true);
    for (const [id, node] of initialNodes) {
      if (id !== String(removedId)) expect(container.querySelector(`[data-id="${id}"]`)).toBe(node);
    }
  } else if (caseName === "root-unmount-cleanup") {
    root.unmount();
    expect(container.childNodes).toHaveLength(0);
    expect(cleanups).toEqual(Array.from({ length: size }, () => 1));
  } else if (caseName === "setter-after-unmount") {
    root.unmount();
    renderLog.length = 0;
    expect(() => localSetters[0]!(1)).not.toThrow();
    expect(renderLog).toEqual([]);
    expect(cleanups).toEqual(Array.from({ length: size }, () => 1));
  }

  const trace = renderLog.length > 8
    ? `${renderLog.slice(0, 8).join(",")},… (${renderLog.length} component renders)`
    : renderLog.join(",") || "none";
  console.log(`[lifecycle-matrix] PASS ${caseName} size=${size}; renders=${trace}; cleanups=${cleanups.reduce((sum, count) => sum + count, 0)}`);

  if (container.childNodes.length) root.unmount();
}
