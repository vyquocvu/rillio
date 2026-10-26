const { JSDOM } = require("jsdom");
const { performance } = require("node:perf_hooks");

async function main() {
  const dom = new JSDOM("<!doctype html><div id=app></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Comment = dom.window.Comment;

  const { createRoot } = await import("../dist/package/index.js");
  const { jsx } = await import("../dist/package/jsx-runtime.js");
  const { nodeRegistry, getAddressableRoot } = await import("../dist/package/devtools.js");

  function list(items) {
    return jsx("ul", {
      children: items.map(item => jsx("li", {
        children: `${item.id}:${item.value}`
      }, item.id))
    });
  }

  for (const [size, iterations] of [[100, 50], [1_000, 20], [2_000, 5]]) {
    const container = document.createElement("div");
    const root = createRoot(container);
    let items = Array.from({ length: size }, (_, id) => ({ id, value: id }));
    root.render(list(items));
    for (let iteration = 0; iteration < 3; iteration++) {
      items = items.map(item => ({ ...item, value: item.value + 1 }));
      root.render(list(items));
    }
    const started = performance.now();
    for (let iteration = 0; iteration < iterations; iteration++) {
      items = items.slice(1).concat(items[0]);
      root.render(list(items));
    }
    const elapsed = performance.now() - started;
    const handle = getAddressableRoot(container);
    if (!handle) throw new Error("benchmark root missing");
    nodeRegistry.assertConsistent(handle.rootId);
    console.log(JSON.stringify({
      architecture: "flat-index",
      size,
      iterations,
      averageMs: elapsed / iterations,
      nodes: container.querySelectorAll("li").length
    }));
    root.unmount();
  }

  const groupCount = 16;
  const itemsPerGroup = 64;
  const reorderIterations = 30;
  const container = document.createElement("div");
  const root = createRoot(container);
  let shuffled = false;
  function groupedLists() {
    return jsx("main", {
      children: Array.from({ length: groupCount }, (_, group) => {
        const ids = Array.from({ length: itemsPerGroup }, (_, id) => id);
        const order = shuffled
          ? ids.filter((_, index) => index % 2 === 1).concat(ids.filter((_, index) => index % 2 === 0))
          : ids;
        return jsx("section", {
          children: jsx("ul", {
            children: order.map(id => jsx("li", { children: `${group}:${id}` }, id))
          })
        }, group);
      })
    });
  }
  root.render(groupedLists());
  shuffled = true;
  root.render(groupedLists());
  const reorderStarted = performance.now();
  for (let iteration = 0; iteration < reorderIterations; iteration++) {
    shuffled = !shuffled;
    root.render(groupedLists());
  }
  const reorderElapsed = performance.now() - reorderStarted;
  const reorderRoot = getAddressableRoot(container);
  if (!reorderRoot) throw new Error("multi-list benchmark root missing");
  nodeRegistry.assertConsistent(reorderRoot.rootId);
  console.log(JSON.stringify({
    architecture: "flat-index",
    scenario: "multi-list-keyed-reorder",
    groups: groupCount,
    itemsPerGroup,
    iterations: reorderIterations,
    averageMs: reorderElapsed / reorderIterations,
    nodes: container.querySelectorAll("li").length
  }));
  root.unmount();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
