import { createServer } from "vite";
import { chromium } from "playwright";

function readInteger(name, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}; received ${raw ?? fallback}`);
  }
  return value;
}

const size = readInteger("RILLIO_PROFILE_SIZE", 2_000);
const mountRoots = readInteger("RILLIO_PROFILE_MOUNT_ROOTS", 20);
const updateCount = readInteger("RILLIO_PROFILE_UPDATES", 80);
const samplingIntervalUs = readInteger("RILLIO_PROFILE_INTERVAL_US", 100, 50, 10_000);
const viteServer = await createServer({
  configFile: "vite.config.mjs",
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
let browser;
let context;

try {
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Could not determine profiler server port");

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/benchmarks/browser.html`);
  await page.waitForFunction(() => typeof window.runListBenchmark === "function");

  const profiler = await context.newCDPSession(page);
  await profiler.send("Profiler.enable");
  await profiler.send("Profiler.setSamplingInterval", { interval: samplingIntervalUs });

  for (const scenario of ["mount", "text", "noop", "reverse"]) {
    await page.evaluate(async ({ scenario, size, mountRoots }) => {
      const runtime = await import("/src/compat.ts");
      const rootCount = scenario === "mount" ? mountRoots : 1;
      const host = document.querySelector("#app");
      host.replaceChildren();
      const containers = Array.from({ length: rootCount }, () => document.createElement("div"));
      host.append(...containers);
      const rows = Array.from({ length: size }, (_, id) => ({ id, value: String(id) }));
      const makeTree = entries => runtime.jsx("ul", {
        children: entries.map(row => runtime.jsx("li", {
          "data-id": String(row.id), children: row.value
        }, row.id))
      });
      const roots = containers.map(container => runtime.createRoot(container));
      const state = { runtime, roots, containers, rows, makeTree, iteration: 0 };
      if (scenario !== "mount") roots[0].render(makeTree(rows));
      window.__rillioProfileState = state;
    }, { scenario, size, mountRoots });

    await profiler.send("Profiler.start");
    await page.evaluate(({ scenario, updateCount }) => {
      const state = window.__rillioProfileState;
      if (scenario === "mount") {
        for (const root of state.roots) root.render(state.makeTree(state.rows));
        return;
      }
      for (let index = 0; index < updateCount; index++) {
        if (scenario === "text") {
          state.iteration++;
          state.rows = state.rows.map(row => ({ ...row, value: `${row.id}:${state.iteration}` }));
        } else if (scenario === "reverse") {
          state.rows = [...state.rows].reverse();
        }
        state.roots[0].render(state.makeTree(state.rows));
      }
    }, { scenario, updateCount });
    const { profile } = await profiler.send("Profiler.stop");

    const frames = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
    const counts = new Map();
    for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    const totals = new Map();
    for (const [id, samples] of counts) {
      const frame = frames.get(id);
      if (!frame) continue;
      const source = frame.url?.replace(/^.*\/(src|benchmarks)\//, "$1/").split("?")[0] ?? "";
      const name = frame.functionName || "(anonymous)";
      const key = `${source}:${name}`;
      const total = totals.get(key) ?? { function: name, source, samples: 0 };
      total.samples += samples;
      totals.set(key, total);
    }
    const top = [...totals.values()].sort((left, right) => right.samples - left.samples).slice(0, 15);
    process.stdout.write(`${JSON.stringify({
      browser: browser.version(),
      scenario,
      size,
      samplingIntervalUs,
      profiledMountRoots: scenario === "mount" ? mountRoots : 1,
      profiledUpdates: scenario === "mount" ? mountRoots : updateCount,
      leafSampleCount: profile.samples?.length ?? 0,
      note: "CPU sampling ranks visible hot functions; it is not a timing benchmark or exact self-time attribution.",
      top
    }, null, 2)}\n`);

    await page.evaluate(() => {
      const state = window.__rillioProfileState;
      for (const root of state.roots) root.unmount();
      for (const container of state.containers) container.remove();
      delete window.__rillioProfileState;
    });
  }

  await profiler.detach();
} finally {
  await context?.close();
  await browser?.close();
  await viteServer.close();
}
