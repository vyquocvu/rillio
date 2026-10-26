// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoot,
  createPortal,
  PORTAL_TYPE,
  jsx,
  useState,
  useEffect,
  nodeRegistry
} from "../src/compat.js";

describe("createPortal", () => {
  let hostContainer: HTMLDivElement;
  let portalContainer: HTMLDivElement;

  beforeEach(() => {
    hostContainer = document.createElement("div");
    hostContainer.id = "host";
    portalContainer = document.createElement("div");
    portalContainer.id = "portal";
    document.body.appendChild(hostContainer);
    document.body.appendChild(portalContainer);
  });

  it("exports PORTAL_TYPE and createPortal function", () => {
    expect(typeof PORTAL_TYPE).toBe("function");
    expect(typeof createPortal).toBe("function");
  });

  it("throws if container is null, undefined, or not a DOM element", () => {
    expect(() => createPortal("hello", null as any)).toThrow("RILLIO_INVALID_PORTAL_CONTAINER");
    expect(() => createPortal("hello", undefined as any)).toThrow("RILLIO_INVALID_PORTAL_CONTAINER");
    expect(() => createPortal("hello", {} as any)).toThrow("RILLIO_INVALID_PORTAL_CONTAINER");
    expect(() => createPortal("hello", document.createTextNode("text") as any)).toThrow("RILLIO_INVALID_PORTAL_CONTAINER");
  });

  it("renders children into the portal target container, not the host container", () => {
    const root = createRoot(hostContainer);

    root.render(
      jsx("div", {
        id: "wrapper",
        children: [
          jsx("h1", { children: "Host Title" }),
          createPortal(jsx("p", { id: "modal-text", children: "Portal Content" }), portalContainer)
        ]
      })
    );

    // Host should have wrapper and h1, plus the portal placeholder comment
    const wrapper = hostContainer.querySelector("#wrapper");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("h1")?.textContent).toBe("Host Title");
    expect(hostContainer.querySelector("#modal-text")).toBeNull();

    // Portal container should have the modal text
    const modalText = portalContainer.querySelector("#modal-text");
    expect(modalText).not.toBeNull();
    expect(modalText?.textContent).toBe("Portal Content");

    root.unmount();
    expect(portalContainer.innerHTML).toBe("");
    expect(hostContainer.innerHTML).toBe("");
  });

  it("supports reactive state updates inside a component rendered in a portal", () => {
    let incrementState: (() => void) | undefined;

    function CounterInPortal() {
      const [count, setCount] = useState(0);
      incrementState = () => setCount(c => c + 1);
      return jsx("div", {
        id: "counter",
        children: `Count: ${count}`
      });
    }

    const root = createRoot(hostContainer);
    root.render(
      jsx("div", {
        children: createPortal(jsx(CounterInPortal, {}), portalContainer)
      })
    );

    const counterDiv = portalContainer.querySelector("#counter");
    expect(counterDiv?.textContent).toBe("Count: 0");

    // Trigger state update
    incrementState?.();
    expect(counterDiv?.textContent).toBe("Count: 1");

    incrementState?.();
    expect(counterDiv?.textContent).toBe("Count: 2");

    root.unmount();
    expect(portalContainer.innerHTML).toBe("");
  });

  it("runs useEffect mount and unmount lifecycles for components in a portal", () => {
    let mounted = false;
    let cleanedUp = false;

    function Modal() {
      useEffect(() => {
        mounted = true;
        return () => {
          cleanedUp = true;
        };
      }, []);
      return jsx("span", { children: "Modal active" });
    }

    const root = createRoot(hostContainer);
    root.render(createPortal(jsx(Modal, {}), portalContainer));

    expect(mounted).toBe(true);
    expect(cleanedUp).toBe(false);

    root.unmount();
    expect(cleanedUp).toBe(true);
    expect(portalContainer.innerHTML).toBe("");
  });

  it("supports multiple portals targeting the same container without conflict", () => {
    const root = createRoot(hostContainer);

    root.render(
      jsx("div", {
        children: [
          createPortal(jsx("div", { id: "portal-1", children: "First" }), portalContainer, "p1"),
          createPortal(jsx("div", { id: "portal-2", children: "Second" }), portalContainer, "p2")
        ]
      })
    );

    expect(portalContainer.querySelector("#portal-1")?.textContent).toBe("First");
    expect(portalContainer.querySelector("#portal-2")?.textContent).toBe("Second");

    // Remove first portal conditionally
    root.render(
      jsx("div", {
        children: [
          null,
          createPortal(jsx("div", { id: "portal-2", children: "Second Updated" }), portalContainer, "p2")
        ]
      })
    );

    expect(portalContainer.querySelector("#portal-1")).toBeNull();
    expect(portalContainer.querySelector("#portal-2")?.textContent).toBe("Second Updated");

    root.unmount();
    expect(portalContainer.innerHTML).toBe("");
  });

  it("moves the portal DOM when target container changes", () => {
    const otherContainer = document.createElement("div");
    otherContainer.id = "other-portal";
    document.body.appendChild(otherContainer);

    const root = createRoot(hostContainer);

    // Initial render in portalContainer
    root.render(createPortal(jsx("span", { id: "dynamic-portal", children: "Moving" }), portalContainer));
    expect(portalContainer.querySelector("#dynamic-portal")?.textContent).toBe("Moving");
    expect(otherContainer.querySelector("#dynamic-portal")).toBeNull();

    // Re-render targeting otherContainer
    root.render(createPortal(jsx("span", { id: "dynamic-portal", children: "Moved" }), otherContainer));
    expect(portalContainer.querySelector("#dynamic-portal")).toBeNull();
    expect(otherContainer.querySelector("#dynamic-portal")?.textContent).toBe("Moved");

    root.unmount();
    expect(otherContainer.innerHTML).toBe("");
    otherContainer.remove();
  });

  it("does not move a portal while a later sibling is still being planned", () => {
    const otherContainer = document.createElement("div");
    const root = createRoot(hostContainer);
    let shouldThrow = false;

    function MaybeBroken() {
      if (shouldThrow) throw new Error("later sibling failed");
      return jsx("span", { id: "stable-sibling", children: "Ready" });
    }

    const render = (target: Element) => root.render(jsx("main", {
      children: [
        createPortal(jsx("p", { id: "transactional-portal", children: "Portal" }), target, "portal"),
        jsx(MaybeBroken, {})
      ]
    }));

    render(portalContainer);
    shouldThrow = true;
    expect(() => render(otherContainer)).toThrow("later sibling failed");

    expect(portalContainer.querySelector("#transactional-portal")?.textContent).toBe("Portal");
    expect(otherContainer.querySelector("#transactional-portal")).toBeNull();
    expect(hostContainer.querySelector("#stable-sibling")?.textContent).toBe("Ready");
    root.unmount();
  });

  it("restores a moved portal if a later commit callback throws", () => {
    const otherContainer = document.createElement("div");
    const root = createRoot(hostContainer);
    root.render(jsx("main", {
      children: createPortal(jsx("p", { id: "rollback-portal", children: "Portal" }), portalContainer)
    }));

    expect(() => root.render(jsx("main", {
      children: [
        createPortal(jsx("p", { id: "rollback-portal", children: "Portal" }), otherContainer),
        jsx("button", { ref: () => { throw new Error("ref failed after portal move"); } })
      ]
    }))).toThrow("ref failed after portal move");

    expect(portalContainer.querySelector("#rollback-portal")?.textContent).toBe("Portal");
    expect(otherContainer.querySelector("#rollback-portal")).toBeNull();
    root.unmount();
    expect(portalContainer.innerHTML).toBe("");
  });

  it("cleans up portal DOM and registry nodes on unmount", () => {
    const diagBefore = nodeRegistry.diagnostics();
    const root = createRoot(hostContainer);

    root.render(
      jsx("main", {
        children: createPortal(
          jsx("ul", {
            children: [
              jsx("li", { children: "A" }),
              jsx("li", { children: "B" })
            ]
          }),
          portalContainer
        )
      })
    );

    expect(portalContainer.querySelectorAll("li").length).toBe(2);

    root.unmount();

    expect(portalContainer.innerHTML).toBe("");
    expect(hostContainer.innerHTML).toBe("");

    const diagAfter = nodeRegistry.diagnostics();
    expect(diagAfter.activeNodes).toBe(diagBefore.activeNodes);
    expect(diagAfter.activeOwners).toBe(diagBefore.activeOwners);
  });

  it("handles nested portals targeting different containers", () => {
    const thirdContainer = document.createElement("div");
    thirdContainer.id = "third-portal";
    document.body.appendChild(thirdContainer);

    const root = createRoot(hostContainer);

    root.render(
      jsx("div", {
        children: createPortal(
          jsx("div", {
            id: "nested-parent",
            children: [
              "Outer Portal Content",
              createPortal(jsx("div", { id: "inner-portal", children: "Inner Content" }), thirdContainer)
            ]
          }),
          portalContainer
        )
      })
    );

    expect(portalContainer.querySelector("#nested-parent")?.textContent).toContain("Outer Portal Content");
    expect(thirdContainer.querySelector("#inner-portal")?.textContent).toBe("Inner Content");

    root.unmount();
    expect(portalContainer.innerHTML).toBe("");
    expect(thirdContainer.innerHTML).toBe("");
    thirdContainer.remove();
  });
});
