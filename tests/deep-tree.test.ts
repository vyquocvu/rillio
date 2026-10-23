// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "../src/flat/registry.js";
import { PatchEngine } from "../src/flat/engine.js";

describe("depth-safe flat tree operations", () => {
  it("validates and disposes deep node and owner chains without recursion", () => {
    const registry = new NodeRegistry({ maxTombstones: 32 });
    const container = document.createElement("main");
    const root = registry.createRoot(container);
    const engine = new PatchEngine(registry, document);
    let parentId = root.nodeId;
    let firstChildId = 0;
    const depth = 12_000;

    for (let index = 0; index < depth; index++) {
      const childId = registry.createNode({
        rootId: root.rootId,
        ownerId: root.ownerId,
        kind: "element",
        domStart: document.createElement("div")
      });
      if (index === 0) firstChildId = childId;
      registry.linkChild(childId, parentId, null);
      parentId = childId;
    }

    registry.assertConsistent(root.rootId);
    engine.discardSubtree(firstChildId);
    expect(registry.getNode(firstChildId).disposed).toBe(true);
    expect(registry.children(root.nodeId)).toEqual([]);

    let ownerId = registry.createOwner(root.rootId, root.ownerId);
    const firstNestedOwner = ownerId;
    for (let index = 1; index < depth; index++) ownerId = registry.createOwner(root.rootId, ownerId);
    registry.disposeOwner(firstNestedOwner);
    expect(registry.getOwner(firstNestedOwner).disposed).toBe(true);
    expect(registry.getOwner(root.ownerId).children).not.toContain(firstNestedOwner);
  });

  it("continues postorder cleanup after a callback throws", () => {
    const registry = new NodeRegistry();
    const container = document.createElement("main");
    const root = registry.createRoot(container);
    const ownerId = registry.createOwner(root.rootId, root.ownerId);
    const engine = new PatchEngine(registry, document);
    const cleanupOrder: string[] = [];
    let parentId = 0;
    let firstId = 0;
    let secondId = 0;
    engine.transaction(root.rootId, tx => {
      parentId = tx.createElement(ownerId, "section", "section");
      firstId = tx.createElement(ownerId, "i", "i");
      secondId = tx.createElement(ownerId, "b", "b");
      tx.insert(parentId, root.nodeId);
      tx.insert(firstId, parentId);
      tx.insert(secondId, parentId);
      tx.attachCleanup(firstId, () => { cleanupOrder.push("first"); throw new Error("cleanup failure"); });
      tx.attachCleanup(secondId, () => cleanupOrder.push("second"));
      tx.attachCleanup(parentId, () => cleanupOrder.push("parent"));
    });

    expect(() => engine.transaction(root.rootId, tx => tx.remove(parentId))).toThrow("cleanup failure");
    expect(cleanupOrder).toEqual(["first", "second", "parent"]);
    expect(registry.getNode(firstId).disposed).toBe(true);
    expect(registry.getNode(secondId).disposed).toBe(true);
    expect(registry.getNode(parentId).disposed).toBe(true);
  });
});
