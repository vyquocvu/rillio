// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NodeRegistry, PatchEngine } from "../src/flat.js";

describe("addressable DOM foundation", () => {
  it("retains only bounded, lightweight disposal tombstones", () => {
    const registry = new NodeRegistry({ maxTombstones: 2 });
    const patches = new PatchEngine(registry, document);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    const ids: number[] = [];

    patches.transaction(root.rootId, tx => {
      for (let index = 0; index < 3; index++) {
        const nodeId = tx.createElement(owner, "button", "button", index);
        ids.push(nodeId);
        tx.insert(nodeId, root.nodeId);
        tx.patchProps(nodeId, {}, { onClick: () => undefined, title: `row-${index}` });
      }
    });
    const firstDomNode = registry.getNode(ids[0]!).domStart;
    patches.transaction(root.rootId, tx => ids.forEach(nodeId => tx.remove(nodeId)));

    expect(() => registry.getNode(ids[0]!)).toThrow("ZUI_UNKNOWN_NODE");
    const retained = registry.getNode(ids[2]!);
    expect(retained.disposed).toBe(true);
    expect(retained.domStart).not.toBe(firstDomNode);
    expect(retained.domStart.nodeType).toBe(Node.COMMENT_NODE);
    expect(retained.props).toEqual({});
    expect(retained.payload).toBeUndefined();
    expect(registry.allNodes().filter(node => node.disposed)).toHaveLength(2);

    const owners = [0, 1, 2].map(() => registry.createOwner(root.rootId, root.ownerId));
    owners.forEach(ownerId => registry.disposeOwner(ownerId));
    expect(() => registry.getOwner(owners[0]!)).toThrow("ZUI_UNKNOWN_OWNER");
    expect(registry.allOwners().filter(item => item.disposed)).toHaveLength(2);
    expect(registry.allNodes().filter(node => node.disposed)).toHaveLength(0);
  });

  it("supports disabling tombstone retention", () => {
    const registry = new NodeRegistry({ maxTombstones: 0 });
    const patches = new PatchEngine(registry, document);
    const root = registry.createRoot(document.createElement("div"));
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let nodeId!: number;
    patches.transaction(root.rootId, tx => {
      nodeId = tx.createElement(owner, "span");
      tx.insert(nodeId, root.nodeId);
    });
    patches.transaction(root.rootId, tx => tx.remove(nodeId));
    registry.disposeOwner(owner);

    expect(() => registry.getNode(nodeId)).toThrow("ZUI_UNKNOWN_NODE");
    expect(() => registry.getOwner(owner)).toThrow("ZUI_UNKNOWN_OWNER");
    expect(registry.allNodes().some(node => node.disposed)).toBe(false);
    expect(registry.allOwners().some(item => item.disposed)).toBe(false);
    expect(() => new NodeRegistry({ maxTombstones: -1 })).toThrow("ZUI_INVALID_TOMBSTONE_LIMIT");
  });

  it("allocates listener and style bookkeeping only while those props are active", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let elementId!: number;
    let textId!: number;
    const onClick = () => undefined;

    patches.transaction(root.rootId, tx => {
      elementId = tx.createElement(owner, "button");
      textId = tx.createText(owner, "Save");
      tx.insert(elementId, root.nodeId);
      tx.insert(textId, elementId);
    });
    expect(registry.getNode(elementId).listeners).toBeUndefined();
    expect(registry.getNode(elementId).styleSnapshot).toBeUndefined();
    expect(registry.getNode(textId).listeners).toBeUndefined();
    expect(registry.getNode(textId).styleSnapshot).toBeUndefined();

    patches.transaction(root.rootId, tx => {
      tx.patchProps(elementId, {}, { onClick, style: { color: "red" } });
    });
    expect(registry.getNode(elementId).listeners?.get("click")).toBe(onClick);
    expect(registry.getNode(elementId).styleSnapshot).toEqual({ color: "red" });

    patches.transaction(root.rootId, tx => {
      tx.patchProps(elementId, { onClick, style: { color: "red" } }, { style: {} });
    });
    expect(registry.getNode(elementId).listeners).toBeUndefined();
    expect(registry.getNode(elementId).styleSnapshot).toBeUndefined();
  });

  it("refuses to replace a live root or dispose it while indexed children remain", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry, document);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let child!: number;
    patches.transaction(root.rootId, tx => {
      child = tx.createElement(owner, "span");
      tx.insert(child, root.nodeId);
    });

    expect(() => registry.createRoot(container)).toThrow("ZUI_ROOT_OCCUPIED");
    expect(() => registry.disposeRoot(root.rootId)).toThrow("ZUI_ROOT_NOT_EMPTY");
    expect(registry.rootFor(container)?.rootId).toBe(root.rootId);
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("rejects HTML parsing sinks before any transaction writes", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry, document);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    let parent!: number;
    patches.transaction(root.rootId, tx => {
      parent = tx.createElement(owner, "div");
      const child = tx.createElement(owner, "span");
      tx.insert(parent, root.nodeId);
      tx.insert(child, parent);
      tx.patchProps(parent, {}, { "data-safe": "retained" });
    });
    const originalHTML = container.innerHTML;

    for (const [name, value] of [
      ["innerHTML", "<img src=x onerror=alert(1)>"],
      ["innerHTML", ""],
      ["outerHTML", ""],
      ["srcdoc", undefined]
    ] as const) {
      expect(() => patches.transaction(root.rootId, tx => {
        tx.patchProps(parent, { "data-safe": "retained" }, { "data-safe": "retained", [name]: value });
      })).toThrow("ZUI_UNSAFE_HTML_PROP");
      expect(container.innerHTML).toBe(originalHTML);
      registry.assertConsistent(root.rootId);
    }
  });

  it("rejects executable URL schemes before committing attributes", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry, document);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    expect(() => patches.transaction(root.rootId, tx => {
      const link = tx.createElement(owner, "a");
      tx.insert(link, root.nodeId);
      tx.patchProps(link, {}, { href: "java\nscript:alert(1)" });
    })).toThrow("ZUI_UNSAFE_URL_PROP");
    expect(container.childNodes).toHaveLength(0);
  });

  it("rejects string-valued inline event attributes and supports lowercase listener props", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry, document);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let image!: number;
    let errors = 0;
    patches.transaction(root.rootId, tx => {
      image = tx.createElement(owner, "img");
      tx.insert(image, root.nodeId);
    });

    expect(() => patches.transaction(root.rootId, tx => {
      tx.patchProps(image, {}, { onerror: "alert(1)" });
    })).toThrow("ZUI_UNSAFE_EVENT_PROP");
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();

    patches.transaction(root.rootId, tx => {
      tx.patchProps(image, {}, { onerror: () => { errors++; } });
    });
    container.querySelector("img")!.dispatchEvent(new Event("error"));
    expect(errors).toBe(1);
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("keeps full-tree verification opt-in for transaction hot paths", () => {
    const registry = new NodeRegistry();
    const root = registry.createRoot(document.createElement("div"));
    const allNodes = vi.spyOn(registry, "allNodes");
    const assertConsistent = vi.spyOn(registry, "assertConsistent");

    new PatchEngine(registry, document).transaction(root.rootId, () => undefined);
    expect(allNodes).not.toHaveBeenCalled();
    expect(assertConsistent).not.toHaveBeenCalled();

    new PatchEngine(registry, document, { assertAfterCommit: true })
      .transaction(root.rootId, () => undefined);
    expect(assertConsistent).toHaveBeenCalledWith(root.rootId);
  });

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

  it("rejects cross-root node ownership before registering the record", () => {
    const registry = new NodeRegistry();
    const first = registry.createRoot(document.createElement("div"));
    const second = registry.createRoot(document.createElement("div"));

    expect(() => registry.createNode({
      rootId: first.rootId,
      ownerId: second.ownerId,
      kind: "element",
      domStart: document.createElement("span")
    })).toThrow("ZUI_OWNER_ROOT_MISMATCH");
    expect(registry.allNodes()).toHaveLength(2);
  });

  it("discards records created by a transaction that schedules no patches", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const root = registry.createRoot(document.createElement("div"));
    let orphan!: number;

    patches.transaction(root.rootId, tx => {
      orphan = tx.createElement(root.ownerId, "span");
    });

    expect(registry.getNode(orphan).disposed).toBe(true);
    expect(registry.children(root.nodeId)).toEqual([]);
  });

  it("rejects cycles formed between fresh nodes while skipping safe leaf checks", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const root = registry.createRoot(document.createElement("div"));
    const owner = registry.createOwner(root.rootId, root.ownerId);

    expect(() => patches.transaction(root.rootId, tx => {
      const first = tx.createElement(owner, "div");
      const second = tx.createElement(owner, "span");
      tx.insert(first, second);
      tx.insert(second, first);
    })).toThrow("ZUI_TRANSACTION_CYCLE");
    expect(registry.children(root.nodeId)).toEqual([]);
    expect(registry.allNodes().filter(node => node.kind === "element" && !node.disposed)).toHaveLength(0);
  });

  it("reorders same-parent single-node ranges and linked siblings consistently", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    const ids: number[] = [];

    patches.transaction(root.rootId, tx => {
      for (const label of ["a", "b", "c"]) {
        const id = tx.createElement(owner, "i");
        ids.push(id);
        tx.patchProps(id, {}, { "data-id": label });
        tx.insert(id, root.nodeId);
      }
    });

    const [first, second, third] = ids;
    patches.transaction(root.rootId, tx => tx.move(first!, root.nodeId, null));
    expect(registry.children(root.nodeId)).toEqual([second, third, first]);
    expect([...container.children].map(node => node.getAttribute("data-id"))).toEqual(["b", "c", "a"]);

    patches.transaction(root.rootId, tx => tx.move(first!, root.nodeId, second!));
    expect(registry.children(root.nodeId)).toEqual(ids);
    expect([...container.children].map(node => node.getAttribute("data-id"))).toEqual(["a", "b", "c"]);

    patches.transaction(root.rootId, tx => tx.moveMany(root.nodeId, ids, [third!, first!, second!], [third!], [first!]));
    expect(registry.children(root.nodeId)).toEqual([third, first, second]);
    expect([...container.children].map(node => node.getAttribute("data-id"))).toEqual(["c", "a", "b"]);

    patches.transaction(root.rootId, tx => tx.moveMany(
      root.nodeId,
      [third!, first!, second!],
      [second!, first!, third!],
      [second!, first!],
      [third!, third!]
    ));
    expect(registry.children(root.nodeId)).toEqual([second, first, third]);
    expect([...container.children].map(node => node.getAttribute("data-id"))).toEqual(["b", "a", "c"]);

    const originalInsertBefore = container.insertBefore.bind(container);
    let failNextInsert = true;
    const insertSpy = vi.spyOn(container, "insertBefore").mockImplementation((node, before) => {
      if (failNextInsert) {
        failNextInsert = false;
        throw new Error("INJECTED_DOM_FAILURE");
      }
      return originalInsertBefore(node, before);
    });
    expect(() => patches.transaction(root.rootId, tx => {
      tx.moveMany(
        root.nodeId,
        [second!, first!, third!],
        [third!, first!, second!],
        [third!, first!],
        [second!, second!]
      );
    })).toThrow("INJECTED_DOM_FAILURE");
    insertSpy.mockRestore();

    expect(registry.children(root.nodeId)).toEqual([second, first, third]);
    expect([...container.children].map(node => node.getAttribute("data-id"))).toEqual(["b", "a", "c"]);
    registry.assertConsistent(root.rootId);
  });

  it("rolls back earlier writes when a text-only batch fails validation", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);
    let first!: number;
    let second!: number;
    patches.transaction(root.rootId, tx => {
      first = tx.createText(owner, "first");
      second = tx.createText(owner, "second");
      tx.insert(first, root.nodeId);
      tx.insert(second, root.nodeId);
    });

    expect(() => patches.transaction(root.rootId, tx => {
      tx.setText(first, "updated-first", registry.getNode(first));
      tx.setText(second, "updated-second", registry.getNode(first));
    })).toThrow("ZUI_TRANSACTION_NODE");

    expect(container.textContent).toBe("firstsecond");
    expect(registry.getNode(first).value).toBe("first");
    expect(registry.getNode(second).value).toBe("second");
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
