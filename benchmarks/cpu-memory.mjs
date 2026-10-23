import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkHtml = resolve(projectRoot, "benchmarks/browser.html");
const viteConfig = resolve(projectRoot, "vite.config.mjs");
const knownFrameworks = ["zui", "react", "preact", "vue"];
const knownScenarios = ["noop", "text", "append-remove", "rotate", "reverse"];

// Chromium reports these as cumulative seconds; deltas across a measured window are CPU time.
// Each entry below was verified to move under a synthetic load before being reported.
const durationMetrics = [
  ["ThreadTime", "CpuThreadMs"],
  ["TaskDuration", "CpuTaskMs"],
  ["RecalcStyleDuration", "CpuStyleMs"],
  ["LayoutDuration", "CpuLayoutMs"]
];
// These exist in Performance.getMetrics but stayed at exactly 0 through an 8M-iteration
// pure-JS loop that consumed 11.7 ms of ThreadTime, so a zero means "not instrumented in
// this Chromium build", never "no script ran". Reported as unavailable instead of as data.
const unpopulatedMetrics = ["ScriptDuration", "V8CompileDuration"];
const counterMetrics = [
  ["LayoutCount", "LayoutCount"],
  ["RecalcStyleCount", "RecalcStyleCount"]
];
const numericFields = [
  "mountCpuThreadMs", "mountCpuTaskMs", "mountCpuStyleMs", "mountCpuLayoutMs",
  "mountLayoutCount", "mountRecalcStyleCount",
  "updateCpuThreadMs", "updateCpuTaskMs", "updateCpuStyleMs", "updateCpuLayoutMs",
  "updateLayoutCount", "updateRecalcStyleCount",
  "mountWallMs", "mountTreeMs", "mountRenderMs",
  "updateWallMs", "updateTreeMs", "updateRenderMs", "updateWallMsPerUpdate",
  "retainedTreeBytes", "allocatedBytes", "retainedGrowthBytes", "frameworkResidualBytes", "pageResidualBytes",
  "nodesMounted", "listenersMounted", "nodesAfterUnmount", "listenersAfterUnmount"
];

function readInteger(name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}; received ${raw ?? fallback}`);
  }
  return value;
}

function readList(name, fallback, allowed) {
  const raw = process.env[name] ?? fallback;
  const values = raw.split(",").map(value => value.trim()).filter(value => value.length > 0);
  if (!values.length) throw new Error(`${name} must not be empty; received ${raw}`);
  if (new Set(values).size !== values.length) throw new Error(`${name} must not contain duplicates; received ${raw}`);
  for (const value of values) {
    if (!allowed.includes(value)) throw new Error(`${name} entry "${value}" must be one of ${allowed.join(", ")}`);
  }
  return values;
}

function readSizes(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const values = raw.split(",").map(value => Number(value.trim()));
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error(`${name} must be a comma-separated list of positive integers; received ${raw}`);
  }
  if (new Set(values).size !== values.length) throw new Error(`${name} must not contain duplicates`);
  return values;
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function medianAbsoluteDeviation(values) {
  const median = percentile(values, 0.5);
  return percentile(values.map(value => Math.abs(value - median)), 0.5);
}

const frameworks = readList("ZUI_CPU_MEM_FRAMEWORKS", knownFrameworks.join(","), knownFrameworks);
const scenarios = readList("ZUI_CPU_MEM_SCENARIOS", knownScenarios.join(","), knownScenarios);
const sizes = readSizes("ZUI_CPU_MEM_SIZES", "100,1000,2000");
const updates = readInteger("ZUI_CPU_MEM_UPDATES", 20, 1);
const warmupCycles = readInteger("ZUI_CPU_MEM_WARMUP", 3, 0, 50);
const warmupUpdates = readInteger("ZUI_CPU_MEM_WARMUP_UPDATES", 5, 1);
const repeats = readInteger("ZUI_CPU_MEM_REPEATS", 3, 1);
const seed = readInteger("ZUI_CPU_MEM_SEED", 20261023, 0, 0xFFFFFFFF);
const calibrationRuns = readInteger("ZUI_CPU_MEM_CALIBRATION", 9, 0);
const jsonOutput = process.env.ZUI_CPU_MEM_JSON === "1";
const outputFile = process.env.ZUI_CPU_MEM_OUT;
const random = makeRandom(seed);

const projectManifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const frameworkVersions = {};
for (const framework of frameworks) {
  if (framework === "zui") {
    frameworkVersions[framework] = projectManifest.version;
  } else {
    const manifest = JSON.parse(await readFile(join(projectRoot, "node_modules", framework, "package.json"), "utf8"));
    frameworkVersions[framework] = manifest.version;
  }
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"]
]);

const tempRoot = await mkdtemp(join(tmpdir(), "zui-cpu-memory-bench-"));
const outputDir = join(tempRoot, "site");
let server;
let browser;

function diffCounters(before, after, prefix, target) {
  for (const [name, suffix] of durationMetrics) {
    const delta = (after[name] - before[name]) * 1000;
    if (Number.isFinite(delta)) target[`${prefix}${suffix}`] = delta;
  }
  for (const [name, suffix] of counterMetrics) {
    const delta = after[name] - before[name];
    if (Number.isFinite(delta)) target[`${prefix}${suffix}`] = delta;
  }
  return target;
}

async function measureRun(origin, options) {
  const { framework, scenario, size, updates, validate, warmup } = options;
  const payload = { framework, scenario, size, updates };
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("HeapProfiler.enable");

    // Two passes: the first clears objects queued by the phase, the second stabilizes the reading.
    const collectGarbage = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      await cdp.send("HeapProfiler.collectGarbage");
    };
    // A double rAF lets pending style/layout work land before a heap reading is taken.
    const settle = () => page.evaluate(() => new Promise(done => {
      requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
    }));
    const heapUsed = async () => (await cdp.send("Runtime.getHeapUsage")).usedSize;
    const measureHeap = async () => {
      await settle();
      await collectGarbage();
      return heapUsed();
    };
    const counters = async () => {
      const result = await cdp.send("Memory.getDOMCounters");
      return { documents: result.documents, nodes: result.nodes, listeners: result.jsEventListeners };
    };
    const snapshot = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      const map = {};
      for (const metric of metrics) map[metric.name] = metric.value;
      return map;
    };
    const fail = stage => {
      if (pageErrors.length) {
        throw new Error(`Browser error in ${framework}/${scenario}/${size} at ${stage}: ${pageErrors.join(" | ")}`);
      }
    };

    await page.goto(origin);
    await page.waitForFunction(() =>
      typeof window.allocateCpuMemoryInputs === "function" &&
      typeof window.mountCpuMemoryWorkload === "function" &&
      typeof window.updateCpuMemoryWorkload === "function" &&
      typeof window.verifyCpuMemoryWorkload === "function" &&
      typeof window.unmountCpuMemoryWorkload === "function" &&
      typeof window.releaseCpuMemoryInputs === "function" &&
      typeof window.validateCpuMemory === "function"
    );

    if (validate) {
      await page.evaluate(entry => window.validateCpuMemory(entry), payload);
      fail("validate");
      await cdp.detach();
      return { measurement: null };
    }

    // Untimed full cycles before any baseline. This both brings V8 to steady state for this
    // framework and pays one-time lazy-compile and inline-cache costs up front; without it the
    // empty-page heap reading is cold and every framework reports a phantom residual of a few
    // hundred KB that is really compilation artifacts and unsettled old-space.
    // Warmup replays the same tree size but caps the update count: heap convergence and JIT
    // warmup come from the mount/teardown cycle, and full-length warmup would dominate runtime.
    const warmupPayload = { ...payload, updates: Math.min(updates, warmupUpdates) };
    for (let cycle = 0; cycle < warmup; cycle++) {
      await page.evaluate(entry => window.validateCpuMemory(entry), warmupPayload);
      fail(`warmup-${cycle}`);
    }

    const heapEmpty = await measureHeap();

    await page.evaluate(entry => window.allocateCpuMemoryInputs(entry), payload);
    const heapBaseline = await measureHeap();
    const countersBaseline = await counters();

    const mountBefore = await snapshot();
    const mount = await page.evaluate(() => window.mountCpuMemoryWorkload());
    const mountAfter = await snapshot();
    fail("mount");
    await page.evaluate(() => window.verifyCpuMemoryWorkload());
    fail("mount-verify");

    const heapMounted = await measureHeap();
    const countersMounted = await counters();

    const updateBefore = await snapshot();
    const update = await page.evaluate(() => window.updateCpuMemoryWorkload());
    const updateAfter = await snapshot();
    fail("update");
    // Deliberately not settled or collected: this is the allocation-pressure high-water mark.
    const heapPeak = await heapUsed();
    await page.evaluate(() => window.verifyCpuMemoryWorkload());
    fail("update-verify");
    const heapAfterUpdateGc = await measureHeap();

    await page.evaluate(() => window.unmountCpuMemoryWorkload());
    fail("unmount");
    // Inputs are still retained here, so this delta isolates what the framework failed to release.
    const heapAfterUnmount = await measureHeap();
    const countersAfterUnmount = await counters();

    await page.evaluate(() => window.releaseCpuMemoryInputs());
    fail("release");
    const heapAfterRelease = await measureHeap();
    const countersAfterRelease = await counters();

    await cdp.detach();

    const result = { framework, scenario, size };
    diffCounters(mountBefore, mountAfter, "mount", result);
    diffCounters(updateBefore, updateAfter, "update", result);
    result.mountWallMs = mount.wallMs;
    result.mountTreeMs = mount.treeMs;
    result.mountRenderMs = mount.renderMs;
    result.updateWallMs = update.wallMs;
    result.updateTreeMs = update.treeMs;
    result.updateRenderMs = update.renderMs;
    result.updateWallMsPerUpdate = update.wallMs / Math.max(update.appliedUpdates, 1);
    result.retainedTreeBytes = heapMounted - heapBaseline;
    result.allocatedBytes = heapPeak - heapMounted;
    result.retainedGrowthBytes = heapAfterUpdateGc - heapMounted;
    result.frameworkResidualBytes = heapAfterUnmount - heapBaseline;
    result.pageResidualBytes = heapAfterRelease - heapEmpty;
    result.nodesMounted = countersMounted.nodes - countersBaseline.nodes;
    result.listenersMounted = countersMounted.listeners - countersBaseline.listeners;
    result.nodesAfterUnmount = countersAfterUnmount.nodes - countersBaseline.nodes;
    result.listenersAfterUnmount = countersAfterUnmount.listeners - countersBaseline.listeners;
    result.heapEmptyBytes = heapEmpty;
    result.heapBaselineBytes = heapBaseline;
    result.heapMountedBytes = heapMounted;
    result.heapPeakBytes = heapPeak;
    result.heapAfterUpdateGcBytes = heapAfterUpdateGc;
    result.heapAfterUnmountBytes = heapAfterUnmount;
    result.heapAfterReleaseBytes = heapAfterRelease;
    result.documentsAfterRelease = countersAfterRelease.documents;
    return { measurement: result };
  } finally {
    await context.close();
  }
}

// Quantifies what an empty CDP measurement window costs, so readers can tell a real CPU delta
// from protocol noise. Reported as a resolution floor; never subtracted from results.
async function calibrateHarness(origin, runs) {
  if (runs <= 0) return [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto(origin);
    const snapshot = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
    };
    const samples = [];
    for (let index = 0; index < runs; index++) {
      const before = await snapshot();
      const started = process.hrtime.bigint();
      await page.evaluate(() => undefined);
      const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
      const after = await snapshot();
      samples.push({
        wallMs,
        threadMs: (after.ThreadTime - before.ThreadTime) * 1000,
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000
      });
    }
    await cdp.detach();
    return samples;
  } finally {
    await context.close();
  }
}

try {
  await build({
    root: projectRoot,
    configFile: viteConfig,
    mode: "production",
    logLevel: jsonOutput ? "silent" : "info",
    build: { outDir: outputDir, emptyOutDir: true, rollupOptions: { input: benchmarkHtml } }
  });
  await readFile(join(outputDir, "benchmarks", "browser.html"));

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const requested = pathname === "/" ? "/benchmarks/browser.html" : pathname;
      const filePath = resolve(outputDir, `.${requested}`);
      if (filePath !== outputDir && !filePath.startsWith(`${outputDir}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.setHeader("Content-Type", mimeTypes.get(extname(filePath)) ?? "application/octet-stream");
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine benchmark server port");
  const origin = `http://127.0.0.1:${address.port}`;

  browser = await chromium.launch({ headless: true });

  let preflightContexts = 0;
  for (const size of sizes) {
    for (const scenario of scenarios) {
      for (const framework of frameworks) {
        await measureRun(origin, { framework, scenario, size, updates, warmup: 0, validate: true });
        preflightContexts++;
      }
    }
  }
  if (!jsonOutput) console.log(`Untimed correctness preflight passed for ${preflightContexts} contexts.`);

  const calibration = await calibrateHarness(origin, calibrationRuns);

  const cases = shuffle(sizes.flatMap(size => scenarios.map(scenario => ({ size, scenario }))), random);
  const grouped = new Map();
  const orderPositionCounts = Object.fromEntries(frameworks.map(framework => [framework, Array(frameworks.length).fill(0)]));

  for (const { size, scenario } of cases) {
    const baseOrder = shuffle(frameworks, random);
    for (let repeat = 0; repeat < repeats; repeat++) {
      const rotation = repeat % frameworks.length;
      const order = frameworks.map((_, position) => baseOrder[(position + rotation) % frameworks.length]);
      order.forEach((framework, position) => orderPositionCounts[framework][position]++);

      for (const framework of order) {
        const { measurement } = await measureRun(origin, {
          framework, scenario, size, updates, warmup: warmupCycles, validate: false
        });

        const key = `${size}:${scenario}:${framework}`;
        const aggregate = grouped.get(key) ?? {
          framework,
          scenario,
          size,
          samples: Object.fromEntries(numericFields.map(field => [field, []]))
        };
        for (const field of numericFields) {
          const value = measurement[field];
          if (Number.isFinite(value)) aggregate.samples[field].push(value);
        }
        aggregate.raw = aggregate.raw ?? [];
        aggregate.raw.push(measurement);
        grouped.set(key, aggregate);
      }
    }
  }

  const userAgentContext = await browser.newContext();
  const userAgentPage = await userAgentContext.newPage();
  await userAgentPage.goto(origin);
  const userAgent = await userAgentPage.evaluate(() => navigator.userAgent);
  await userAgentContext.close();

  const summarized = [...grouped.values()].map(aggregate => {
    const summary = { framework: aggregate.framework, scenario: aggregate.scenario, size: aggregate.size };
    for (const field of numericFields) {
      const values = aggregate.samples[field];
      summary[`${field}Median`] = values.length ? percentile(values, 0.5) : null;
      summary[`${field}P95`] = values.length ? percentile(values, 0.95) : null;
      summary[`${field}Mad`] = values.length ? medianAbsoluteDeviation(values) : null;
      summary[`${field}Samples`] = values.length;
    }
    summary.runCount = aggregate.raw.length;
    return summary;
  }).sort((left, right) => left.size - right.size ||
    scenarios.indexOf(left.scenario) - scenarios.indexOf(right.scenario) ||
    frameworks.indexOf(left.framework) - frameworks.indexOf(right.framework));

  const worstResidual = {
    maxFrameworkResidualBytes: Math.max(0, ...summarized.map(row => row.frameworkResidualBytesMedian ?? 0)),
    maxPageResidualBytes: Math.max(0, ...summarized.map(row => row.pageResidualBytesMedian ?? 0)),
    maxNodesAfterUnmount: Math.max(0, ...summarized.map(row => row.nodesAfterUnmountMedian ?? 0)),
    maxListenersAfterUnmount: Math.max(0, ...summarized.map(row => row.listenersAfterUnmountMedian ?? 0))
  };

  const report = {
    metadata: {
      browser: browser.version(),
      userAgent,
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model ?? "unknown",
      node: process.version,
      frameworkVersions,
      seed,
      settings: { sizes, scenarios, frameworks, updatesPerRun: updates, warmupCycles, pairedRepeats: repeats },
      orderPositionCounts,
      preflightContexts,
      harnessOverhead: calibration.length ? {
        samples: calibration.length,
        wallMsMedian: percentile(calibration.map(value => value.wallMs), 0.5),
        cpuThreadMsMedian: percentile(calibration.map(value => value.threadMs), 0.5),
        cpuTaskMsMedian: percentile(calibration.map(value => value.taskMs), 0.5)
      } : null,
      unpopulatedChromiumMetrics: {
        names: unpopulatedMetrics,
        reason: "Verified at 0 through an 8M-iteration pure-JS loop that consumed 11.7 ms of ThreadTime on Chromium 156. Treated as unavailable rather than reported as zero-cost."
      },
      metricDefinitions: {
        cpuThreadMs: "Chromium Performance.getMetrics ThreadTime delta: main-thread CPU time, including the forced style/layout flush and any GC. Primary CPU figure.",
        cpuTaskMs: "TaskDuration delta: total time in main-thread tasks.",
        cpuStyleMs: "RecalcStyleDuration delta. cpuLayoutMs: LayoutDuration delta. Only nonzero because each phase ends by forcing a flush; Chromium otherwise defers rendering to a later frame.",
        mountWallMs: "Page-reported wall clock for tree construction, first render and the forced flush, excluding root creation.",
        updateWallMs: "Page-reported wall clock for all updates, each including tree construction and a forced flush.",
        treeMs: "Element-tree construction only, split out of the wall clock for both phases.",
        renderMs: "Wall clock minus tree construction: the framework's render/commit plus the forced style and layout flush. Not render alone.",
        retainedTreeBytes: "JS heap after forced GC with the tree mounted, minus heap after forced GC with only input data retained. Cost of holding one rendered tree.",
        allocatedBytes: "Heap immediately after the update phase with no GC, minus the post-mount GC'd heap. Allocation pressure; mostly collectable garbage.",
        retainedGrowthBytes: "Heap after forced GC post-update minus post-mount. Growth that survives collection.",
        frameworkResidualBytes: "Heap after unmount plus forced GC minus the input-data baseline, with benchmark inputs still retained. A single cycle cannot separate a true leak from framework caches or GC timing, so treat this as residual heap, not proven leakage.",
        pageResidualBytes: "Heap after unmount, input release and forced GC minus the empty-page heap measured post-warmup. Same caveat as frameworkResidualBytes.",
        nodesMounted: "Memory.getDOMCounters node delta while mounted. nodesAfterUnmount: node delta after unmount; nonzero indicates retained or detached DOM.",
        inputAllocation: "Benchmark input rows are materialized before the heap baseline, so they are excluded from every memory delta.",
        measurementNote: "DOM assertions run in a separate page phase outside every CPU window. Each run uses a fresh browser context and a fresh CDP session."
      },
      worstCaseResidualChecks: worstResidual,
      timing: "production browser bundles; CPU from Chromium cumulative counter deltas; memory from Runtime.getHeapUsage after forced GC"
    },
    results: summarized,
    rawRuns: jsonOutput || outputFile ? [...grouped.values()].flatMap(aggregate => aggregate.raw) : undefined
  };

  if (outputFile) {
    await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (!jsonOutput) console.log(`Wrote report to ${outputFile}`);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const find = (size, scenario, framework) => summarized.find(row =>
      row.size === size && row.scenario === scenario && row.framework === framework);
    const missing = (size, scenario, framework) => {
      if (!find(size, scenario, framework)) throw new Error(`Missing result for ${size}/${scenario}/${framework}`);
    };
    const ratio = (left, right) => `${(left / Math.max(right, 1e-6)).toFixed(2)}x`;
    const kb = bytes => (bytes / 1024).toFixed(1);

    console.log(`Browser: Chromium ${browser.version()} (${process.platform}-${process.arch}; ${cpus()[0]?.model ?? "unknown"})`);
    console.log(`Frameworks: ${frameworks.map(framework => `${framework} ${frameworkVersions[framework]}`).join("; ")}`);
    console.log(`Production bundle; seed=${seed}; warmup cycles=${warmupCycles}; updates/run=${updates}; paired repeats=${repeats}; sizes=${sizes.join(",")}`);
    console.log(`Framework run-position counts: ${JSON.stringify(orderPositionCounts)}`);
    if (report.metadata.harnessOverhead) {
      const overhead = report.metadata.harnessOverhead;
      console.log(`Harness overhead floor per measured window: CPU thread ${overhead.cpuThreadMsMedian.toFixed(3)} ms, task ${overhead.cpuTaskMsMedian.toFixed(3)} ms, wall ${overhead.wallMsMedian.toFixed(3)} ms (${overhead.samples} samples). CPU deltas near this floor are not resolvable.`);
    }
    console.log(`Chromium ${browser.version()} does not populate ${unpopulatedMetrics.join(" or ")}; per-phase JS-only CPU is therefore unavailable and is not reported as zero.`);

    const cpuTable = phase => {
      console.log(`\n${phase === "mount" ? "Mount" : "Update"} CPU (ms, median). Cpu = ThreadTime, main-thread CPU including style, layout and GC. Style/Layout are Chromium's own recalc and layout time.`);
      console.table(cases.map(({ size, scenario }) => {
        const row = { size, scenario };
        const thread = {};
        for (const framework of frameworks) {
          missing(size, scenario, framework);
          const result = find(size, scenario, framework);
          thread[framework] = result[`${phase}CpuThreadMsMedian`];
          row[`${framework}Cpu`] = thread[framework].toFixed(3);
          row[`${framework}Style`] = result[`${phase}CpuStyleMsMedian`].toFixed(3);
          row[`${framework}Layout`] = result[`${phase}CpuLayoutMsMedian`].toFixed(3);
        }
        if (thread.zui !== undefined) {
          for (const other of frameworks.filter(framework => framework !== "zui")) {
            row[`zui/${other}`] = ratio(thread.zui, thread[other]);
          }
        }
        return row;
      }).sort((left, right) => left.size - right.size || scenarios.indexOf(left.scenario) - scenarios.indexOf(right.scenario)));
    };
    cpuTable("mount");
    cpuTable("update");

    console.log("\nMemory (median; retained = mounted tree, allocated = update-phase garbage, nodes = DOM nodes while mounted)");
    console.table(cases.map(({ size, scenario }) => {
      const row = { size, scenario };
      const retained = {};
      for (const framework of frameworks) {
        const result = find(size, scenario, framework);
        retained[framework] = result.retainedTreeBytesMedian;
        row[`${framework}RetainKb`] = kb(retained[framework]);
        row[`${framework}AllocKb`] = kb(result.allocatedBytesMedian);
        row[`${framework}Nodes`] = result.nodesMountedMedian;
      }
      if (retained.zui !== undefined) {
        for (const other of frameworks.filter(framework => framework !== "zui")) {
          row[`zui/${other}`] = ratio(retained.zui, retained[other]);
        }
      }
      return row;
    }).sort((left, right) => left.size - right.size || scenarios.indexOf(left.scenario) - scenarios.indexOf(right.scenario)));

    console.log("\nResidual heap after unmount + forced GC (median). Not proven leakage: one cycle cannot separate a leak from framework caches or GC timing.");
    console.table(summarized.map(row => ({
      size: row.size,
      scenario: row.scenario,
      framework: row.framework,
      frameworkResidualKb: kb(row.frameworkResidualBytesMedian ?? 0),
      pageResidualKb: kb(row.pageResidualBytesMedian ?? 0),
      retainedGrowthKb: kb(row.retainedGrowthBytesMedian ?? 0),
      nodesAfterUnmount: row.nodesAfterUnmountMedian,
      listenersAfterUnmount: row.listenersAfterUnmountMedian,
      runs: row.runCount
    })));
    console.log(`Worst case across all rows: framework residual ${kb(worstResidual.maxFrameworkResidualBytes)} KB, page residual ${kb(worstResidual.maxPageResidualBytes)} KB, nodes after unmount ${worstResidual.maxNodesAfterUnmount}, listeners after unmount ${worstResidual.maxListenersAfterUnmount}.`);
    console.log("Nodes and listeners after unmount are exact counters, unlike the heap figures: nonzero means DOM or listeners genuinely survived teardown.");
    console.log("Set ZUI_CPU_MEM_JSON=1 for the full report including p95, MAD, per-window CPU counters and raw runs.");
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
  await rm(tempRoot, { recursive: true, force: true });
}
