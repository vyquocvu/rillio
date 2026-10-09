// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createStore, select, derive, mount, jsx, Show, For } from "../src/dom.js";

describe("frontend MVP", () => {
  it("mounts once and patches reactive text", () => {
    const state = createStore(0);
    const target = document.createElement("div");
    let renders = 0;
    const dispose = mount(() => {
      renders++;
      return jsx("button", {
        onClick: () => state.set(n => n + 1),
        children: ["Count ", select(state, n => n)]
      });
    }, target);
    const button = target.querySelector("button")!;
    button.click();
    expect(button.textContent).toBe("Count 1");
    expect(target.querySelector("button")).toBe(button);
    expect(renders).toBe(1);
    dispose();
    expect(target.querySelector("button")).toBeNull();
  });

  it("mounts and disposes conditional regions", () => {
    const show = createStore(true);
    const target = document.createElement("div");
    const dispose = mount(Show({
      when: select(show, x => x),
      children: () => jsx("span", { children: "Visible" })
    }), target);
    expect(target.querySelectorAll("span")).toHaveLength(1);
    show.set(false);
    expect(target.querySelectorAll("span")).toHaveLength(0);
    show.set(true);
    expect(target.querySelectorAll("span")).toHaveLength(1);
    dispose();
  });

  it("preserves keyed list nodes during reorder", () => {
    const state = createStore([{ id: "a" }, { id: "b" }]);
    const target = document.createElement("div");
    const dispose = mount(jsx("ul", {
      children: For({
        each: select(state, s => s),
        by: item => item.id,
        children: item => jsx("li", { "data-id": item.id, children: item.id })
      })
    }), target);
    const nodeA = target.querySelector('[data-id="a"]');
    state.set([{ id: "b" }, { id: "a" }]);
    expect([...target.querySelectorAll("li")].map(n => n.textContent)).toEqual(["b", "a"]);
    expect(target.querySelector('[data-id="a"]')).toBe(nodeA);
    dispose();
  });
  it("reactively updates keyed item data without replacing its DOM identity", () => {
    const state = createStore([{ id: "a", label: "Old" }]);
    const target = document.createElement("div");
    const dispose = mount(jsx("ul", {
      children: For({
        each: select(state, items => items),
        by: item => item.id,
        children: (item, current) => jsx("li", {
          children: derive(() => current().label)
        })
      })
    }), target);
    const li = target.querySelector("li");
    state.set([{ id: "a", label: "New" }]);
    expect(target.querySelector("li")).toBe(li);
    expect(li?.textContent).toBe("New");
    dispose();
  });

  it("updates controlled value without unnecessary DOM writes", () => {
    const state = createStore("first");
    const target = document.createElement("div");
    const dispose = mount(jsx("input", {
      value: select(state, value => value),
      onInput: (event: Event) => state.set((event.target as HTMLInputElement).value)
    }), target);
    const input = target.querySelector("input")!;
    expect(input.value).toBe("first");
    input.value = "edited";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(state.get()).toBe("edited");
    state.set("final");
    expect(input.value).toBe("final");
    dispose();
  });

  it("does not run disposed conditional text bindings", () => {
    const state = createStore({ visible: true, text: "One" });
    const target = document.createElement("div");
    const dispose = mount(Show({
      when: select(state, s => s.visible),
      children: () => jsx("span", {
        children: select(state, s => s.text)
      })
    }), target);
    expect(target.querySelector("span")?.textContent).toBe("One");
    state.set({ visible: false, text: "Two" });
    expect(target.querySelector("span")).toBeNull();
    state.set({ visible: true, text: "Three" });
    expect(target.querySelector("span")?.textContent).toBe("Three");
    dispose();
    expect(target.childNodes).toHaveLength(0);
  });

  it("removes stale styles when a reactive style binding changes", () => {
    const state = createStore({ color: "red", display: "block" });
    const target = document.createElement("div");
    const dispose = mount(jsx("div", {
      style: select(state, value => value)
    }), target);
    const node = target.querySelector("div")!;
    expect(node.style.color).toBe("red");
    state.set({ color: "blue" } as { color: string; display: string });
    expect(node.style.color).toBe("blue");
    expect(node.style.display).toBe("");
    dispose();
  });

});
