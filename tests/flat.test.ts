// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NodeRegistry, PatchEngine } from "../src/flat.js";

describe("addressable DOM foundation", () => {
  it("assigns stable ids and keeps the flat structure authoritative", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let cleanupCalls = 0;
    let first!: number;
    let second!: number;

    patches.transaction(root.rootId, tx => {
      first = tx.createElement(owner, "span", "span", "a");
      second = tx.createText(owner, "hello");
      tx.insert(first, root.nodeId);
      tx.insert(second, first);
      tx.attachCleanup(first, () => { cleanupCalls++; });
      tx.patchProps(first, {}, { "data-id": "a" });
    });

    expect(registry.children(root.nodeId)).toEqual([first]);
    expect(registry.children(first)).toEqual([second]);
    expect(container.innerHTML).toBe('<span data-id="a">hello</span>');
    expect(registry.getNode(first).version).toBeGreaterThan(1);

    const stable = first;
    patches.transaction(root.rootId, tx => {
      tx.move(first, root.nodeId, null);
      tx.setMeta(first, { key: "b" });
    });
    expect(first).toBe(stable);
    expect(registry.getNode(first).key).toBe("b");

    patches.transaction(root.rootId, tx => tx.remove(first));
    expect(container.childNodes).toHaveLength(0);
    expect(registry.getNode(first).disposed).toBe(true);
    expect(registry.getNode(second).disposed).toBe(true);
    expect(cleanupCalls).toBe(1);
  });

  it("validates before commit and rolls back created records", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const root = registry.createRoot(document.createElement("div"));
    const owner = registry.createOwner(root.rootId, root.ownerId);

    expect(() => patches.transaction(root.rootId, tx => {
      const child = tx.createElement(owner, "div");
      tx.insert(child, child);
    })).toThrow("ZUI_TRANSACTION_CYCLE");

    expect(registry.children(root.nodeId)).toEqual([]);
    expect(registry.allNodes().filter(node => node.kind === "element" && !node.disposed)).toHaveLength(0);
  });

  it("routes event and ref lifecycle through the patch engine", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    const ref: { current: Element | null } = { current: null };
    let clicks = 0;

    let button!: number;
    patches.transaction(root.rootId, tx => {
      button = tx.createElement(owner, "button");
      tx.insert(button, root.nodeId);
      tx.patchProps(button, {}, { ref, onClick: () => { clicks++; }, children: "ignored" });
    });
    (container.firstElementChild as HTMLButtonElement).click();
    expect(clicks).toBe(1);
    expect(ref.current).toBe(container.firstElementChild);

    patches.transaction(root.rootId, tx => tx.remove(button));
    expect(ref.current).toBeNull();
    (container.firstElementChild as HTMLButtonElement | null)?.click();
    expect(clicks).toBe(1);
  });
});
