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

  const { createRoot, jsx } = await import("../dist/package/compat.js");

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
    console.log(JSON.stringify({
      size,
      iterations,
      averageMs: elapsed / iterations,
      nodes: container.querySelectorAll("li").length
    }));
    root.unmount();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
