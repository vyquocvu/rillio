// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createRoot,
  ErrorBoundary,
  jsx,
  useState,
  type Child
} from "../src/compat.js";

describe("ErrorBoundary", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);
  });

  it("renders children normally when no error occurs", () => {
    function Good(): Child {
      return jsx("span", { id: "good", children: "All good" });
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: jsx("div", { id: "fallback", children: "Something went wrong" }),
        children: jsx(Good, {})
      })
    );

    expect(container.querySelector("#good")?.textContent).toBe("All good");
    expect(container.querySelector("#fallback")).toBeNull();
    root.unmount();
  });

  it("catches render errors during initial mount and renders static fallback UI", () => {
    function Broken(): Child {
      throw new Error("Crash during mount");
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: jsx("div", { id: "fallback", children: "Fallback Active" }),
        children: jsx(Broken, {})
      })
    );

    expect(container.querySelector("#fallback")?.textContent).toBe("Fallback Active");
    root.unmount();
    expect(container.innerHTML).toBe("");
  });

  it("passes error and reset function to fallback callback", () => {
    let capturedReset: (() => void) | undefined;

    function Broken(): Child {
      throw new Error("Explosion in component");
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: (error: Error, reset: () => void) => {
          capturedReset = reset;
          return jsx("div", { id: "fallback", children: `Caught: ${error.message}` });
        },
        children: jsx(Broken, {})
      })
    );

    expect(container.querySelector("#fallback")?.textContent).toBe("Caught: Explosion in component");
    expect(typeof capturedReset).toBe("function");
    root.unmount();
  });

  it("supports recovery via reset() when error condition is resolved", () => {
    let shouldCrash = true;
    let triggerReset!: () => void;

    function MaybeBroken(): Child {
      if (shouldCrash) {
        throw new Error("Temporary failure");
      }
      return jsx("p", { id: "recovered", children: "Successfully recovered!" });
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: (_error: Error, reset: () => void) => {
          triggerReset = reset;
          return jsx("button", { id: "retry-btn", children: "Retry" });
        },
        children: jsx(MaybeBroken, {})
      })
    );

    expect(container.querySelector("#retry-btn")).not.toBeNull();
    expect(container.querySelector("#recovered")).toBeNull();

    // Resolve the issue and trigger reset
    shouldCrash = false;
    triggerReset();

    expect(container.querySelector("#retry-btn")).toBeNull();
    expect(container.querySelector("#recovered")?.textContent).toBe("Successfully recovered!");

    root.unmount();
  });

  it("invokes onError callback with error and component stack info", () => {
    const onError = vi.fn();

    function FailingChild(): Child {
      throw new Error("Boom");
    }

    function ParentWrapper(): Child {
      return jsx(FailingChild, {});
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: jsx("div", { children: "Error" }),
        onError,
        children: jsx(ParentWrapper, {})
      })
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [caughtError, info] = onError.mock.calls[0]!;
    expect(caughtError.message).toBe("Boom");
    expect(info.componentStack).toContain("FailingChild");
    expect(info.componentStack).toContain("ParentWrapper");

    root.unmount();
  });

  it("handles nested Error Boundaries: inner catches inner error, outer remains intact", () => {
    function InnerBroken(): Child {
      throw new Error("Inner fail");
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: jsx("div", { id: "outer-fallback", children: "Outer Fallback" }),
        children: [
          jsx("header", { children: "Header Content" }),
          jsx(ErrorBoundary, {
            fallback: jsx("div", { id: "inner-fallback", children: "Inner Fallback" }),
            children: jsx(InnerBroken, {})
          }),
          jsx("footer", { children: "Footer Content" })
        ]
      })
    );

    // Inner fallback is shown; outer fallback is NOT shown; header and footer exist
    expect(container.querySelector("#inner-fallback")?.textContent).toBe("Inner Fallback");
    expect(container.querySelector("#outer-fallback")).toBeNull();
    expect(container.querySelector("header")?.textContent).toBe("Header Content");
    expect(container.querySelector("footer")?.textContent).toBe("Footer Content");

    root.unmount();
  });

  it("bubbles to outer boundary if inner boundary fallback throws", () => {
    function InnerBroken(): Child {
      throw new Error("Inner initial fail");
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: jsx("div", { id: "outer-fallback", children: "Outer Fallback Active" }),
        children: jsx(ErrorBoundary, {
          fallback: () => {
            throw new Error("Fallback itself broke!");
          },
          children: jsx(InnerBroken, {})
        })
      })
    );

    expect(container.querySelector("#outer-fallback")?.textContent).toBe("Outer Fallback Active");
    root.unmount();
  });

  it("catches errors occurring during child state updates (updateComponent)", () => {
    let triggerCrash!: () => void;

    function Counter(): Child {
      const [count, setCount] = useState(0);
      triggerCrash = () => setCount(c => c + 1);

      if (count > 0) {
        throw new Error("Crashed on update!");
      }

      return jsx("span", { id: "count", children: `Count: ${count}` });
    }

    const root = createRoot(container);
    root.render(
      jsx(ErrorBoundary, {
        fallback: (error: Error) => jsx("div", { id: "update-error", children: error.message }),
        children: jsx(Counter, {})
      })
    );

    expect(container.querySelector("#count")?.textContent).toBe("Count: 0");

    // Trigger state update that causes crash
    triggerCrash();

    // Nearest ErrorBoundary should have caught the error
    expect(container.querySelector("#update-error")?.textContent).toBe("Crashed on update!");
    expect(container.querySelector("#count")).toBeNull();

    root.unmount();
  });

  it("catches a child render error during a parent update with unchanged child props", () => {
    let shouldCrash = false;
    let rerender!: () => void;

    function FragileChild(): Child {
      if (shouldCrash) throw new Error("Parent update exposed failure");
      return jsx("span", { id: "parent-update-child", children: "Healthy" });
    }

    function Parent(): Child {
      const [, setVersion] = useState(0);
      rerender = () => setVersion(version => version + 1);
      return jsx("section", {
        children: jsx(ErrorBoundary, {
          fallback: (error: Error) => jsx("div", { id: "parent-update-fallback", children: error.message }),
          children: jsx(FragileChild, {})
        })
      });
    }

    const root = createRoot(container);
    root.render(jsx(Parent, {}));
    expect(container.querySelector("#parent-update-child")?.textContent).toBe("Healthy");

    shouldCrash = true;
    rerender();

    expect(container.querySelector("#parent-update-fallback")?.textContent)
      .toBe("Parent update exposed failure");
    expect(container.querySelector("#parent-update-child")).toBeNull();
    root.unmount();
  });

  it("re-throws error when no ErrorBoundary is present in the tree", () => {
    function Explode(): Child {
      throw new Error("Uncaught boom");
    }

    const root = createRoot(container);
    expect(() => {
      root.render(jsx(Explode, {}));
    }).toThrow("Uncaught boom");

    root.unmount();
  });
});
