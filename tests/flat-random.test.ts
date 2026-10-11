// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, jsx, nodeRegistry, getAddressableRoot } from "../src/compat.js";

type Row = { id: number; value: number };

function nextRandom(seed: { value: number }): number {
  seed.value = (seed.value * 1664525 + 1013904223) >>> 0;
  return seed.value / 0x1_0000_0000;
}

function view(rows: readonly Row[]) {
  return jsx("ul", {
    children: rows.map(row => jsx("li", {
      "data-id": String(row.id),
      children: `${row.id}:${row.value}`
    }, row.id))
  });
}

describe("flat index randomized consistency", () => {
  it("keeps DOM order and registry order equal across seeded keyed updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const seed = { value: 0x5eed1234 };
    let rows: Row[] = Array.from({ length: 8 }, (_, id) => ({ id, value: id }));
    const identities = new Map<number, number>();

    const assertState = () => {
      const handle = getAddressableRoot(container)!;
      nodeRegistry.assertConsistent(handle.rootId);
      const list = container.querySelector("ul")!;
      const domRows = [...list.querySelectorAll("li")].map(node => ({
        id: Number(node.getAttribute("data-id")),
        value: Number(node.textContent?.split(":")[1])
      }));
      expect(domRows).toEqual(rows);
      const listId = nodeRegistry.children(handle.nodeId)[0]!;
      const indexed = nodeRegistry.children(listId).map(id => {
        const record = nodeRegistry.getNode(id);
        expect(record.key).not.toBeUndefined();
        return { id: Number(record.key), nodeId: id };
      });
      expect(indexed.map(entry => entry.id)).toEqual(rows.map(row => row.id));
      const activeKeys = new Set(rows.map(row => row.id));
      for (const id of identities.keys()) if (!activeKeys.has(id)) identities.delete(id);
      for (const entry of indexed) {
        const prior = identities.get(entry.id);
        if (prior !== undefined) expect(entry.nodeId).toBe(prior);
        identities.set(entry.id, entry.nodeId);
      }
    };

    root.render(view(rows));
    assertState();
    for (let step = 0; step < 120; step++) {
      const choice = Math.floor(nextRandom(seed) * 4);
      if (choice === 0 && rows.length < 14) {
        const id = rows.length === 0 ? 0 : Math.max(...rows.map(row => row.id)) + 1;
        rows = [...rows, { id, value: step }];
      } else if (choice === 1 && rows.length > 1) {
        const index = Math.floor(nextRandom(seed) * rows.length);
        rows = rows.filter((_, current) => current !== index);
      } else if (choice === 2 && rows.length > 1) {
        const from = Math.floor(nextRandom(seed) * rows.length);
        const to = Math.floor(nextRandom(seed) * rows.length);
        const moved = rows[from]!;
        const rest = rows.filter((_, index) => index !== from);
        rest.splice(to, 0, moved);
        rows = rest;
      } else if (rows.length > 0) {
        const index = Math.floor(nextRandom(seed) * rows.length);
        rows = rows.map((row, current) => current === index ? { ...row, value: step * 10 } : row);
      }
      root.render(view(rows));
      assertState();
    }
    root.unmount();
  });
});
