// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "../src/flat/registry.js";
import { PatchEngine } from "../src/flat/engine.js";

type Action =
  | { kind: "create"; label: string; value: string }
  | { kind: "text"; label: string; value: string }
  | { kind: "move"; label: string; before: string | null }
  | { kind: "reorder"; order: string[] }
  | { kind: "remove"; label: string }
  | { kind: "invalid"; label: string; value: string };

type ModelRecord = {
  label: string;
  elementId: number;
  textId: number;
  element: HTMLDivElement;
  text: Text;
  value: string;
};

function random(seed: { value: number }): number {
  seed.value = (seed.value * 1664525 + 1013904223) >>> 0;
  return seed.value / 0x1_0000_0000;
}

function generate(seedValue: number, steps: number): Action[] {
  const seed = { value: seedValue >>> 0 };
  const actions: Action[] = [];
  const order: string[] = [];
  const values = new Map<string, string>();
  let nextLabel = 0;
  for (let i = 0; i < 4; i++) {
    const label = `n${nextLabel++}`;
    const value = `v${i}`;
    actions.push({ kind: "create", label, value });
    order.push(label);
    values.set(label, value);
  }
  for (let step = 0; step < steps; step++) {
    const choices = ["text", "invalid"];
    if (order.length < 12) choices.push("create");
    if (order.length > 0) choices.push("remove");
    if (order.length > 1) choices.push("move", "reorder");
    const kind = choices[Math.floor(random(seed) * choices.length)]!;
    if (kind === "create") {
      const label = `n${nextLabel++}`;
      const value = `v${step}`;
      actions.push({ kind, label, value });
      order.push(label);
      values.set(label, value);
    } else if (kind === "text" || kind === "invalid") {
      if (order.length === 0) continue;
      const label = order[Math.floor(random(seed) * order.length)]!;
      const value = `${kind}-${step}`;
      actions.push({ kind, label, value });
      if (kind === "text") values.set(label, value);
    } else if (kind === "remove") {
      const index = Math.floor(random(seed) * order.length);
      const [label] = order.splice(index, 1);
      actions.push({ kind, label: label! });
      values.delete(label!);
    } else if (kind === "move") {
      const from = Math.floor(random(seed) * order.length);
      const label = order[from]!;
      const rest = order.filter((_, index) => index !== from);
      const to = Math.floor(random(seed) * (rest.length + 1));
      const before = rest[to] ?? null;
      rest.splice(to, 0, label);
      order.splice(0, order.length, ...rest);
      actions.push({ kind, label, before });
    } else {
      const next = [...order];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(random(seed) * (i + 1));
        [next[i], next[j]] = [next[j]!, next[i]!];
      }
      order.splice(0, order.length, ...next);
      actions.push({ kind: "reorder", order: next });
    }
  }
  return actions;
}

function replay(actions: readonly Action[]): void {
  const registry = new NodeRegistry();
  const container = document.createElement("main");
  const root = registry.createRoot(container);
  const ownerId = registry.createOwner(root.rootId, root.ownerId);
  const patches = new PatchEngine(registry, document);
  const records = new Map<string, ModelRecord>();
  const order: string[] = [];
  const allRecords: ModelRecord[] = [];

  const assertModel = () => {
    registry.assertConsistent(root.rootId);
    expect(registry.children(root.nodeId)).toEqual(order.map(label => records.get(label)!.elementId));
    expect([...container.children].map(node => node.getAttribute("data-label"))).toEqual(order);
    for (const [label, record] of records) {
      if (!order.includes(label)) continue;
      expect(container.querySelector(`[data-label="${label}"]`)).toBe(record.element);
      expect(record.element.textContent).toBe(record.value);
      expect(registry.getNode(record.elementId).key).toBe(label);
      expect(registry.getNode(record.elementId).domStart).toBe(record.element);
      expect(registry.getNode(record.textId).domStart).toBe(record.text);
      expect(registry.getNode(record.textId).parentId).toBe(record.elementId);
      expect(registry.getNode(record.textId).value).toBe(record.value);
    }
    const expectedOwned = new Set<number>();
    for (const label of order) {
      const record = records.get(label)!;
      expectedOwned.add(record.elementId);
      expectedOwned.add(record.textId);
    }
    expect(new Set(registry.ownerNodeIds(ownerId))).toEqual(expectedOwned);
    for (const record of allRecords) {
      if (!order.includes(record.label)) {
        expect(registry.getNode(record.elementId).disposed).toBe(true);
        expect(registry.getNode(record.textId).disposed).toBe(true);
      }
    }
  };

  for (const action of actions) {
    if (action.kind === "create") {
      let elementId = 0;
      let textId = 0;
      patches.transaction(root.rootId, tx => {
        elementId = tx.createElement(ownerId, "div", "div", action.label);
        textId = tx.createText(ownerId, action.value);
        tx.patchProps(elementId, {}, { "data-label": action.label });
        tx.setMeta(elementId, { value: action.label });
        tx.insert(elementId, root.nodeId);
        tx.insert(textId, elementId);
      });
      const element = registry.getNode(elementId).domStart as HTMLDivElement;
      const text = registry.getNode(textId).domStart as Text;
      const record = { label: action.label, elementId, textId, element, text, value: action.value };
      records.set(action.label, record);
      allRecords.push(record);
      order.push(action.label);
    } else if (action.kind === "text") {
      const record = records.get(action.label);
      if (!record || !order.includes(action.label)) continue;
      patches.transaction(root.rootId, tx => tx.setText(record.textId, action.value));
      record.value = action.value;
    } else if (action.kind === "move") {
      const record = records.get(action.label);
      if (!record || !order.includes(action.label)) continue;
      const beforeRecord = action.before === null ? undefined : records.get(action.before);
      const before = beforeRecord && order.includes(action.before!) ? beforeRecord.elementId : null;
      patches.transaction(root.rootId, tx => tx.move(record.elementId, root.nodeId, before));
      const rest = order.filter(label => label !== action.label);
      const index = before === null ? rest.length : rest.indexOf(action.before!);
      rest.splice(index < 0 ? rest.length : index, 0, action.label);
      order.splice(0, order.length, ...rest);
    } else if (action.kind === "reorder") {
      const next = [...action.order.filter(label => order.includes(label))];
      for (const label of order) if (!next.includes(label)) next.push(label);
      patches.transaction(root.rootId, tx => {
        for (let i = next.length - 1; i >= 0; i--) {
          const record = records.get(next[i]!)!;
          const beforeId = next[i + 1] === undefined ? null : records.get(next[i + 1]!)!.elementId;
          tx.move(record.elementId, root.nodeId, beforeId);
        }
      });
      order.splice(0, order.length, ...next);
    } else if (action.kind === "remove") {
      const record = records.get(action.label);
      if (!record || !order.includes(action.label)) continue;
      patches.transaction(root.rootId, tx => tx.remove(record.elementId));
      order.splice(order.indexOf(action.label), 1);
    } else {
      const record = records.get(action.label);
      if (!record || !order.includes(action.label)) continue;
      expect(() => patches.transaction(root.rootId, tx => {
        tx.setText(record.textId, action.value);
        tx.move(record.elementId, 999_999, null);
      })).toThrow();
    }
    assertModel();
  }
}

function shrink(actions: Action[], stillFails: (candidate: Action[]) => boolean): Action[] {
  let current = actions;
  let chunkSize = Math.max(1, Math.floor(current.length / 2));
  while (chunkSize > 0) {
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkSize) {
      const candidate = current.filter((_, index) => index < start || index >= start + chunkSize);
      if (candidate.length > 0 && stillFails(candidate)) {
        current = candidate;
        reduced = true;
        break;
      }
    }
    if (!reduced) chunkSize = Math.floor(chunkSize / 2);
  }
  return current;
}

describe("independent transaction tree oracle", () => {
  it("matches DOM, Flat Index, ownership, identity and disposal for seeded operations", () => {
    const seeds = [0x5eed1234, 0x1badb002, 0xc0ffee11];
    for (const seed of seeds) {
      const actions = generate(seed, 100);
      try {
        replay(actions);
      } catch (error) {
        const minimal = shrink(actions, candidate => {
          try { replay(candidate); return false; }
          catch { return true; }
        });
        throw new Error(`seed=${seed} actions=${JSON.stringify(minimal)}\n${String(error)}`);
      }
    }
  });
});
