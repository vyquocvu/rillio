// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createEngine } from "../src/reactive.js";
import {
  resource,
  createStore,
  select,
  Show,
  mount,
  jsx,
  engine,
} from "../src/dom/index.js";

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("async resource primitive (resource())", () => {
  it("transitions through pending -> success with data and loading stores", async () => {
    const res = resource(async () => {
      await delay(10);
      return { id: 1, name: "Ada Lovelace" };
    });

    // Immediate initial state
    expect(res.loading.get()).toBe(true);
    expect(res.status.get()).toBe("pending");
    expect(res.data.get()).toBeUndefined();
    expect(res.error.get()).toBeUndefined();

    const snapshot = res.get();
    expect(snapshot.loading).toBe(true);
    expect(snapshot.status).toBe("pending");

    await delay(25);

    // Resolved state
    expect(res.loading.get()).toBe(false);
    expect(res.status.get()).toBe("success");
    expect(res.data.get()).toEqual({ id: 1, name: "Ada Lovelace" });
    expect(res.error.get()).toBeUndefined();

    const finalSnapshot = res.get();
    expect(finalSnapshot.loading).toBe(false);
    expect(finalSnapshot.status).toBe("success");
    expect(finalSnapshot.data).toEqual({ id: 1, name: "Ada Lovelace" });
  });

  it("handles async rejection gracefully without throwing or breaking runtime", async () => {
    const onError = vi.fn();
    const res = resource(
      async () => {
        await delay(10);
        throw new Error("Network offline");
      },
      { onError }
    );

    expect(res.loading.get()).toBe(true);
    expect(res.status.get()).toBe("pending");

    await delay(25);

    expect(res.loading.get()).toBe(false);
    expect(res.status.get()).toBe("error");
    expect(res.data.get()).toBeUndefined();
    expect(res.error.get()?.message).toBe("Network offline");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("supports synchronous fetchers and initialValue", async () => {
    const res = resource(() => 42, { initialValue: 0 });
    expect(res.loading.get()).toBe(false);
    expect(res.status.get()).toBe("success");
    expect(res.data.get()).toBe(42);
  });

  it("automatically refetches when reactive source changes", async () => {
    const idStore = createStore(1);
    const fetchCounts: number[] = [];

    const res = resource(
      idStore,
      async id => {
        fetchCounts.push(id);
        await delay(10);
        return `User #${id}`;
      }
    );

    expect(res.loading.get()).toBe(true);
    await delay(25);
    expect(res.data.get()).toBe("User #1");
    expect(fetchCounts).toEqual([1]);

    // Change source
    idStore.set(2);
    expect(res.loading.get()).toBe(true);
    await delay(25);
    expect(res.data.get()).toBe("User #2");
    expect(fetchCounts).toEqual([1, 2]);
  });

  it("prevents race conditions when older requests resolve after newer ones", async () => {
    const idStore = createStore(1);

    const res = resource(idStore, async id => {
      // id 1 takes 50ms, id 2 takes 10ms
      const ms = id === 1 ? 50 : 10;
      await delay(ms);
      return `Resolved #${id}`;
    });

    // Fire id 1 (takes 50ms)
    expect(res.loading.get()).toBe(true);

    // Quickly switch to id 2 after 5ms
    await delay(5);
    idStore.set(2);

    // Wait 20ms: id 2 should resolve (at t = 5 + 10 = 15ms)
    await delay(25);
    expect(res.data.get()).toBe("Resolved #2");

    // Wait until t > 50ms when id 1 would have resolved
    await delay(40);
    // Must NOT be overwritten by id 1
    expect(res.data.get()).toBe("Resolved #2");
  });

  it("supports manual optimistic mutate() and cancels in-flight fetch", async () => {
    const res = resource(async () => {
      await delay(50);
      return "Original from server";
    });

    expect(res.loading.get()).toBe(true);

    // Apply optimistic mutation
    res.mutate("Optimistic update");

    expect(res.loading.get()).toBe(false);
    expect(res.status.get()).toBe("success");
    expect(res.data.get()).toBe("Optimistic update");

    // Let the original promise finish
    await delay(70);

    // Must still retain mutated value, not overwritten by delayed server response
    expect(res.data.get()).toBe("Optimistic update");
  });

  it("supports manual refetch() with previous value and refetching flag", async () => {
    let callCount = 0;
    const res = resource(async (_source, info) => {
      callCount++;
      return `Call ${callCount} (prev: ${info.previous ?? "none"}, refetching: ${info.refetching})`;
    });

    await delay(10);
    expect(res.data.get()).toBe("Call 1 (prev: none, refetching: false)");

    await res.refetch();
    expect(res.data.get()).toBe("Call 2 (prev: Call 1 (prev: none, refetching: false), refetching: true)");
  });

  it("integrates seamlessly with Show and fine-grained DOM mounting without VDOM-stack breaking", async () => {
    const container = document.createElement("div");

    const user = resource(async () => {
      await delay(20);
      return "Katherine Johnson";
    });

    // Mount explicit reactive tree with Show
    const dispose = mount(
      () =>
        jsx(
          Show,
          {
            when: user.loading,
            fallback: () => jsx("h1", { id: "user-name", children: user.data }),
            children: () => jsx("div", { id: "spinner", children: "Loading..." }),
          }
        ),
      container
    );

    // Initially loading
    expect(container.querySelector("#spinner")).not.toBeNull();
    expect(container.querySelector("#spinner")?.textContent).toBe("Loading...");
    expect(container.querySelector("#user-name")).toBeNull();

    // Await async resource resolution
    await delay(35);

    // Fine-grained DOM update transitioned cleanly to fallback
    expect(container.querySelector("#spinner")).toBeNull();
    const heading = container.querySelector("#user-name");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Katherine Johnson");

    dispose();
    expect(container.childNodes.length).toBe(0);
  });

  it("reads the source untracked inside refetch()", async () => {
    const source = createStore(1);
    const res = resource(source, async id => id * 10);
    await delay(20);
    expect(res.data.get()).toBe(10);

    let runs = 0;
    const dispose = mount(() => {
      engine.effect(() => {
        runs++;
        res.refetch();
      });
      return null;
    }, document.createElement("div"));
    expect(runs).toBe(1);
    await delay(20);

    // If refetch() had subscribed this effect to the source, the write below
    // would re-run it. Only the resource's own source effect may react.
    source.set(2);
    await delay(20);
    expect(runs).toBe(1);
    expect(res.data.get()).toBe(20);

    dispose();
    res.dispose();
  });

  it("cleans up resource subscriptions upon owner disposal", async () => {
    const customEngine = createEngine("graph");
    let res: any;

    const owner = customEngine.createOwner(() => {
      res = customEngine.resource(async () => {
        await delay(30);
        return "owner data";
      });
    });

    expect(res.loading.get()).toBe(true);

    // Dispose owner before async finishes
    owner.dispose();

    await delay(40);

    // Late resolution should have been discarded
    expect(res.data.get()).toBeUndefined();
  });
});
