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

  it("rejects structural operations that overlap a move-many batch", () => {
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
        tx.insert(id, root.nodeId);
      }
    });
    const [first, second, third] = ids;

    expect(() => patches.transaction(root.rootId, tx => {
      tx.insert(tx.createElement(owner, "i"), root.nodeId);
      tx.moveMany(root.nodeId, ids, [third!, first!, second!], [third!], [first!]);
    })).toThrow("ZUI_INVALID_CHILD_ORDER");

    expect(() => patches.transaction(root.rootId, tx => {
      tx.moveMany(root.nodeId, ids, [third!, first!, second!], [third!], [first!]);
      tx.move(first!, root.nodeId, null);
    })).toThrow("ZUI_INVALID_CHILD_ORDER");

    expect(() => patches.transaction(root.rootId, tx => {
      tx.moveMany(root.nodeId, ids, [third!, first!, second!], [third!], [first!]);
      tx.remove(second!);
    })).toThrow("ZUI_INVALID_CHILD_ORDER");

    expect(() => patches.transaction(root.rootId, tx => {
      tx.moveMany(root.nodeId, ids, [third!, first!, second!], [third!], [first!]);
      tx.moveMany(root.nodeId, ids, [first!, second!, third!], [first!], [second!]);
    })).toThrow("ZUI_INVALID_CHILD_ORDER");

    expect(registry.children(root.nodeId)).toEqual(ids);
    expect([...container.children].map(node => node.tagName)).toEqual(["I", "I", "I"]);
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

  it("creates SVG elements with proper namespaces and normalizes attributes", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    let svgId!: number;
    let circleId!: number;
    let foreignId!: number;
    let htmlDivId!: number;

    patches.transaction(root.rootId, tx => {
      svgId = tx.createElement(owner, "svg", "svg", undefined, { viewBox: "0 0 100 100" }, undefined, root.nodeId);
      tx.insert(svgId, root.nodeId);
      tx.patchProps(svgId, {}, { viewBox: "0 0 100 100", className: "icon" });

      circleId = tx.createElement(owner, "circle", "circle", undefined, undefined, undefined, svgId);
      tx.insert(circleId, svgId);
      tx.patchProps(circleId, {}, {
        cx: 50,
        cy: 50,
        r: 40,
        strokeWidth: 2,
        fillRule: "evenodd",
        xlinkHref: "#test"
      });

      foreignId = tx.createElement(owner, "foreignObject", "foreignObject", undefined, undefined, undefined, svgId);
      tx.insert(foreignId, svgId);

      htmlDivId = tx.createElement(owner, "div", "div", undefined, undefined, undefined, foreignId);
      tx.insert(htmlDivId, foreignId);
    });

    const svgEl = registry.getNode(svgId).domStart as SVGSVGElement;
    const circleEl = registry.getNode(circleId).domStart as SVGCircleElement;
    const foreignEl = registry.getNode(foreignId).domStart as SVGElement;
    const htmlDivEl = registry.getNode(htmlDivId).domStart as HTMLDivElement;

    expect(svgEl.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svgEl.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svgEl.getAttribute("class")).toBe("icon");

    expect(circleEl.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circleEl.getAttribute("cx")).toBe("50");
    expect(circleEl.getAttribute("stroke-width")).toBe("2");
    expect(circleEl.getAttribute("fill-rule")).toBe("evenodd");
    expect(circleEl.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("#test");

    expect(foreignEl.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(htmlDivEl.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });

  it("handles form properties, validation attributes, and restores drifted controlled state", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    let inputId!: number;
    let selectId!: number;
    let optionId!: number;
    let labelId!: number;
    let btnId!: number;

    patches.transaction(root.rootId, tx => {
      inputId = tx.createElement(owner, "input");
      tx.insert(inputId, root.nodeId);
      tx.patchProps(inputId, {}, {
        type: "checkbox",
        checked: true,
        value: "active",
        indeterminate: true,
        readOnly: true,
        required: true,
        autoFocus: true
      });

      selectId = tx.createElement(owner, "select");
      tx.insert(selectId, root.nodeId);
      tx.patchProps(selectId, {}, { multiple: true });

      optionId = tx.createElement(owner, "option", "option", undefined, undefined, undefined, selectId);
      tx.insert(optionId, selectId);
      tx.patchProps(optionId, {}, { value: "opt1", selected: true });

      labelId = tx.createElement(owner, "label");
      tx.insert(labelId, root.nodeId);
      tx.patchProps(labelId, {}, { htmlFor: "input-1" });

      btnId = tx.createElement(owner, "button");
      tx.insert(btnId, root.nodeId);
      tx.patchProps(btnId, {}, { formNoValidate: true });
    });

    const input = registry.getNode(inputId).domStart as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.value).toBe("active");
    expect(input.indeterminate).toBe(true);
    expect(input.readOnly).toBe(true);
    expect(input.required).toBe(true);
    expect(input.autofocus).toBe(true);
    expect(input.getAttribute("readonly")).toBe("");
    expect(input.getAttribute("required")).toBe("");

    const select = registry.getNode(selectId).domStart as HTMLSelectElement;
    expect(select.multiple).toBe(true);
    expect(select.getAttribute("multiple")).toBe("");

    const option = registry.getNode(optionId).domStart as HTMLOptionElement;
    expect(option.selected).toBe(true);
    expect(option.getAttribute("selected")).toBe("");
    expect(option.value).toBe("opt1");

    const label = registry.getNode(labelId).domStart as HTMLLabelElement;
    expect(label.htmlFor).toBe("input-1");
    expect(label.getAttribute("for")).toBe("input-1");

    const btn = registry.getNode(btnId).domStart as HTMLButtonElement;
    expect(btn.formNoValidate).toBe(true);
    expect(btn.getAttribute("formnovalidate")).toBe("");

    // Simulate user editing DOM input
    input.value = "user-typed-something";
    input.checked = false;

    // Patch with unchanged props -> should restore expected controlled values
    patches.transaction(root.rootId, tx => {
      tx.patchProps(inputId, { checked: true, value: "active" }, { checked: true, value: "active" });
    });
    expect(input.value).toBe("active");
    expect(input.checked).toBe(true);
  });

  it("handles accessibility properties with correct ARIA boolean and token semantics", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    let divId!: number;
    patches.transaction(root.rootId, tx => {
      divId = tx.createElement(owner, "div");
      tx.insert(divId, root.nodeId);
      tx.patchProps(divId, {}, {
        "aria-expanded": false,
        "aria-hidden": true,
        role: "dialog",
        tabIndex: 0
      });
    });

    const div = registry.getNode(divId).domStart as HTMLDivElement;
    expect(div.getAttribute("aria-expanded")).toBe("false");
    expect(div.getAttribute("aria-hidden")).toBe("true");
    expect(div.getAttribute("role")).toBe("dialog");
    expect(div.getAttribute("tabindex")).toBe("0");
    expect(div.tabIndex).toBe(0);

    patches.transaction(root.rootId, tx => {
      tx.patchProps(divId, {
        "aria-expanded": false,
        "aria-hidden": true,
        role: "dialog",
        tabIndex: 0
      }, {
        "aria-expanded": true,
        "aria-hidden": null,
        role: false,
        tabIndex: -1
      });
    });

    expect(div.getAttribute("aria-expanded")).toBe("true");
    expect(div.hasAttribute("aria-hidden")).toBe(false);
    expect(div.hasAttribute("role")).toBe(false);
    expect(div.getAttribute("tabindex")).toBe("-1");
    expect(div.tabIndex).toBe(-1);
  });

  it("supports custom elements with property assignment and 'is' attribute", () => {
    const registry = new NodeRegistry();
    const patches = new PatchEngine(registry);
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    const complexConfig = { enabled: true, tags: ["zui"] };
    let customBtnId!: number;
    let customElId!: number;

    patches.transaction(root.rootId, tx => {
      customBtnId = tx.createElement(owner, "button", "button", undefined, { is: "fancy-button" });
      tx.insert(customBtnId, root.nodeId);

      customElId = tx.createElement(owner, "x-widget");
      tx.insert(customElId, root.nodeId);
      tx.patchProps(customElId, {}, { config: complexConfig, active: true, title: "Widget" });
    });

    const customBtn = registry.getNode(customBtnId).domStart as HTMLButtonElement;
    expect(customBtn.getAttribute("is")).toBe("fancy-button");

    const customEl = registry.getNode(customElId).domStart as HTMLElement;
    expect((customEl as any).config).toBe(complexConfig);
    expect(customEl.getAttribute("title")).toBe("Widget");
    expect(customEl.getAttribute("active")).toBe("");
  });

  it("reports accurate diagnostics for active and tombstoned nodes, owners, and roots", () => {
    const registry = new NodeRegistry({ maxTombstones: 5 });
    const patches = new PatchEngine(registry);

    // Initial state
    const d0 = registry.diagnostics();
    expect(d0.activeNodes).toBe(0);
    expect(d0.tombstoneNodes).toBe(0);
    expect(d0.totalNodes).toBe(0);
    expect(d0.activeOwners).toBe(0);
    expect(d0.tombstoneOwners).toBe(0);
    expect(d0.totalOwners).toBe(0);
    expect(d0.totalRoots).toBe(0);
    expect(d0.maxTombstones).toBe(5);

    // Create root and owner
    const container = document.createElement("div");
    const root = registry.createRoot(container);
    const owner = registry.createOwner(root.rootId, root.ownerId);

    const d1 = registry.diagnostics();
    expect(d1.totalRoots).toBe(1);
    expect(d1.activeNodes).toBe(1); // root node
    expect(d1.activeOwners).toBe(2); // root owner + child owner
    expect(d1.tombstoneNodes).toBe(0);
    expect(d1.tombstoneOwners).toBe(0);

    // Create 10 nodes
    const nodeIds: number[] = [];
    patches.transaction(root.rootId, tx => {
      for (let i = 0; i < 10; i++) {
        const id = tx.createElement(owner, "div");
        tx.insert(id, root.nodeId);
        nodeIds.push(id);
      }
    });

    const d2 = registry.diagnostics();
    expect(d2.activeNodes).toBe(11); // 1 root + 10 elements
    expect(d2.totalNodes).toBe(11);
    expect(d2.tombstoneNodes).toBe(0);

    // Dispose 3 nodes
    patches.transaction(root.rootId, tx => {
      tx.remove(nodeIds[0]!);
      tx.remove(nodeIds[1]!);
      tx.remove(nodeIds[2]!);
    });

    const d3 = registry.diagnostics();
    expect(d3.activeNodes).toBe(8);
    expect(d3.tombstoneNodes).toBe(3);
    expect(d3.totalNodes).toBe(11);

    // Dispose remaining 7 nodes (total 10 disposed, capped at maxTombstones=5)
    patches.transaction(root.rootId, tx => {
      for (let i = 3; i < 10; i++) {
        tx.remove(nodeIds[i]!);
      }
    });

    const d4 = registry.diagnostics();
    expect(d4.activeNodes).toBe(1); // only root remains
    expect(d4.tombstoneNodes).toBe(5); // capped at maxTombstones
    expect(d4.totalNodes).toBe(6); // 1 active + 5 tombstones

    // Dispose owner
    registry.disposeOwner(owner);
    const d5 = registry.diagnostics();
    expect(d5.activeOwners).toBe(1); // only root owner remains
    expect(d5.tombstoneOwners).toBe(1);
    expect(d5.totalOwners).toBe(2);

    // Dispose root
    registry.disposeRoot(root.rootId);
    const d6 = registry.diagnostics();
    expect(d6.totalRoots).toBe(0);
  });
});
