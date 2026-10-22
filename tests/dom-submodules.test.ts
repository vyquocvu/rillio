// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { BINDING } from "../src/dom/types.js";
import {
  select,
  derive,
  isStore,
  isBinding,
  readReactive,
  stringify,
  evaluate,
  resolveChild,
  registry,
  patches,
  engine,
} from "../src/dom/bindings.js";
import { createStore, computed, batch, untrack } from "../src/reactive-api.js";
import {
  jsx,
  jsxs,
  Fragment,
  Show,
  For,
  isConditional,
  isRepetition,
} from "../src/dom/control-flow.js";
import { longestIncreasingIds, mount } from "../src/dom/mount.js";
import * as domIndex from "../src/dom/index.js";
import * as domFacade from "../src/dom.js";

describe("src/dom submodules isolated tests", () => {
  describe("types.ts & bindings.ts", () => {
    it("creates stores, bindings, and derived reactive values", () => {
      const count = createStore(10);
      expect(isStore(count)).toBe(true);
      expect(isBinding(count)).toBe(false);
      expect(count.get()).toBe(10);

      const doubled = select(count, c => c * 2);
      expect(isBinding(doubled)).toBe(true);
      expect(isStore(doubled)).toBe(false);
      expect(readReactive(doubled)).toBe(20);

      count.set(15);
      expect(readReactive(doubled)).toBe(30);

      const derived = derive(() => count.get() + 5);
      expect(isBinding(derived)).toBe(true);
      expect(readReactive(derived)).toBe(20);
    });

    it("evaluates, stringifies, and resolves children correctly", () => {
      const name = createStore("ZUI");
      const bound = select(name, n => n.toUpperCase());

      expect(stringify(null)).toBe("");
      expect(stringify(undefined)).toBe("");
      expect(stringify(true)).toBe("");
      expect(stringify(false)).toBe("");
      expect(stringify("text")).toBe("text");
      expect(stringify(42)).toBe("42");

      expect(evaluate(name)).toBe("ZUI");
      expect(evaluate(bound)).toBe("ZUI");
      expect(evaluate(100)).toBe(100);

      expect(resolveChild("static")).toBe("static");
      expect(resolveChild(() => "computed")).toBe("computed");
    });

    it("exposes store creation, batch, and untrack from the reactive API", () => {
      let runs = 0;
      const s = createStore(0);
      const c = computed(() => {
        runs++;
        return s.get();
      });
      expect(c.get()).toBe(0);

      batch(() => {
        s.set(1);
        s.set(2);
      });
      expect(c.get()).toBe(2);

      const untrackedVal = untrack(() => s.get());
      expect(untrackedVal).toBe(2);
    });
  });

  describe("control-flow.ts", () => {
    it("constructs JSX VNodes and Fragment", () => {
      const node = jsx("div", { id: "test" }, "key1");
      expect(node.type).toBe("div");
      expect(node.props.id).toBe("test");
      expect(node.key).toBe("key1");
      expect(jsxs).toBe(jsx);

      const frag = Fragment({ children: ["a", "b"] });
      expect(frag).toEqual(["a", "b"]);
    });

    it("creates and identifies Show conditionals", () => {
      const cond = Show({ when: true, fallback: "loading", children: "content" });
      expect(cond.kind).toBe("show");
      expect(isConditional(cond)).toBe(true);
      expect(isRepetition(cond)).toBe(false);
      expect(isConditional({})).toBe(false);
    });

    it("creates and identifies For repetitions", () => {
      const rep = For({ each: [1, 2, 3], by: x => x, children: x => String(x) });
      expect(rep.kind).toBe("for");
      expect(isRepetition(rep)).toBe(true);
      expect(isConditional(rep)).toBe(false);
      expect(isRepetition(null)).toBe(false);
    });
  });

  describe("mount.ts algorithm & public API parity", () => {
    it("calculates longest increasing subsequence of NodeIds", () => {
      // old order: [10, 20, 30, 40, 50]
      const oldIndexById = new Map<number, number>([
        [10, 0],
        [20, 1],
        [30, 2],
        [40, 3],
        [50, 4],
      ]);
      // next order: [10, 30, 20, 50, 40]
      const stationary = longestIncreasingIds([10, 30, 20, 50, 40], oldIndexById);
      expect(stationary.has(10)).toBe(true);
      expect(stationary.size).toBeGreaterThanOrEqual(3);
    });

    it("verifies dom index and dom facade re-export exact same public API", () => {
      const indexKeys = Object.keys(domIndex).sort();
      const facadeKeys = Object.keys(domFacade).sort();
      expect(indexKeys).toEqual(facadeKeys);
      expect(indexKeys).not.toContain("createStore");

      for (const key of indexKeys) {
        expect((domFacade as any)[key]).toBe((domIndex as any)[key]);
      }
    });

    it("mounts and unmounts clean DOM trees", () => {
      const container = document.createElement("div");
      const text = createStore("Hello");
      const dispose = mount(() => jsx("span", { children: text }), container);

      expect(container.textContent).toBe("Hello");
      text.set("World");
      expect(container.textContent).toBe("World");

      dispose();
      expect(container.childNodes.length).toBe(0);
    });
  });
});
