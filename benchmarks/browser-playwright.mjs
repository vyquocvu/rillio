import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkHtml = resolve(projectRoot, "benchmarks/browser.html");
const viteConfig = resolve(projectRoot, "vite.config.mjs");
const frameworks = ["zui", "react", "preact", "vue"];
const scenarios = ["mount", "noop", "text", "append-remove", "rotate", "reverse"];
const componentScenarios = ["mount", "local-update", "parent-update", "prop-fanout"];

function readInteger(name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}; received ${raw ?? fallback}`);
  }
  return value;
}

function readSizes() {
  const raw = process.env.ZUI_BENCH_SIZES ?? "100,1000,2000";
  const values = raw.split(",").map(value => Number(value.trim()));
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error(`ZUI_BENCH_SIZES must be a comma-separated list of positive integers; received ${raw}`);
  }
  if (new Set(values).size !== values.length) throw new Error("ZUI_BENCH_SIZES must not contain duplicates");
  return values;
}

function readComponentSizes() {
  const raw = process.env.ZUI_COMPONENT_SIZES ?? "10,100,1000";
  const values = raw.split(",").map(value => Number(value.trim()));
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error(`ZUI_COMPONENT_SIZES must be a comma-separated list of positive integers; received ${raw}`);
  }
  if (new Set(values).size !== values.length) throw new Error("ZUI_COMPONENT_SIZES must not contain duplicates");
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

const sizes = readSizes();
const componentSizes = readComponentSizes();
const suite = process.env.ZUI_BENCH_SUITE ?? "all";
if (!["all", "list", "components"].includes(suite)) {
  throw new Error(`ZUI_BENCH_SUITE must be all, list, or components; received ${suite}`);
}
const warmup = readInteger("ZUI_BENCH_WARMUP", 3, 0);
const samples = readInteger("ZUI_BENCH_SAMPLES", 9, 3);
const repeats = readInteger("ZUI_BENCH_REPEATS", 3, 2);
const seed = readInteger("ZUI_BENCH_SEED", 20261013, 0, 0xFFFFFFFF);
const random = makeRandom(seed);
const jsonOutput = process.env.ZUI_BENCH_JSON === "1";
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
const tempRoot = await mkdtemp(join(tmpdir(), "zui-playwright-bench-"));
const outputDir = join(tempRoot, "site");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"]
]);

let server;
let browser;

try {
  await build({
    root: projectRoot,
    configFile: viteConfig,
    mode: "production",
    logLevel: jsonOutput ? "silent" : "info",
    build: {
      outDir: outputDir,
      emptyOutDir: true,
      rollupOptions: { input: benchmarkHtml }
    }
  });

  const benchmarkOutput = join(outputDir, "benchmarks", "browser.html");
  await readFile(benchmarkOutput);

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
  let componentPreflightContexts = 0;
  if (suite !== "components") for (const size of sizes) {
    for (const scenario of scenarios) {
      for (const framework of frameworks) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce"
        });
        try {
          const page = await context.newPage();
          const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
          await page.goto(origin);
          await page.waitForFunction(() =>
            typeof window.validateListBenchmark === "function" && typeof window.runListBenchmark === "function"
          );
          await page.evaluate(options => window.validateListBenchmark(options), {
            framework, scenario, size, warmup, samples
          });
          if (pageErrors.length) throw new Error(`Browser error in ${framework}/${scenario}/${size}: ${pageErrors.join(" | ")}`);
          preflightContexts++;
        } finally {
          await context.close();
        }
      }
    }
  }
  if (suite !== "list") for (const size of componentSizes) {
    for (const scenario of componentScenarios) {
      for (const framework of frameworks) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce"
        });
        try {
          const page = await context.newPage();
          const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
          await page.goto(origin);
          await page.waitForFunction(() => typeof window.validateComponentLifecycle === "function");
          await page.evaluate(options => window.validateComponentLifecycle(options), {
            framework, scenario, size, warmup, samples
          });
          if (pageErrors.length) throw new Error(`Component preflight failed in ${framework}/${scenario}/${size}: ${pageErrors.join(" | ")}`);
          componentPreflightContexts++;
        } finally {
          await context.close();
        }
      }
    }
  }

  const cases = suite === "components" ? [] : shuffle(sizes.flatMap(size => scenarios.map(scenario => ({ size, scenario }))), random);
  const grouped = new Map();
  const orderPositionCounts = Object.fromEntries(frameworks.map(framework => [framework, Array(frameworks.length).fill(0)]));

  for (const { size, scenario } of cases) {
    const baseOrder = shuffle(frameworks, random);
    for (let repeat = 0; repeat < repeats; repeat++) {
      const rotation = repeat % frameworks.length;
      const order = frameworks.map((_, position) => baseOrder[(position + rotation) % frameworks.length]);
      order.forEach((framework, position) => orderPositionCounts[framework][position]++);

      for (const framework of order) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce"
        });
        try {
          const page = await context.newPage();
          const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
          await page.goto(origin);
          await page.waitForFunction(() => typeof window.runListBenchmark === "function");
          const result = await page.evaluate(options => window.runListBenchmark(options), {
            framework, scenario, size, warmup, samples
          });
          if (pageErrors.length) throw new Error(`Browser error in ${framework}/${scenario}/${size}: ${pageErrors.join(" | ")}`);

          const key = `${size}:${scenario}:${framework}`;
          const aggregate = grouped.get(key) ?? {
            framework,
            scenario,
            size,
            valuesMs: [],
            treeValuesMs: [],
            updateValuesMs: [],
            trialMediansMs: []
          };
          aggregate.valuesMs.push(...result.valuesMs);
          aggregate.treeValuesMs.push(...result.treeValuesMs);
          aggregate.updateValuesMs.push(...result.updateValuesMs);
          aggregate.trialMediansMs.push(result.medianMs);
          grouped.set(key, aggregate);
        } finally {
          await context.close();
        }
      }
    }
  }

  const componentCases = suite === "list" ? [] : shuffle(
    componentSizes.flatMap(size => componentScenarios.map(scenario => ({ size, scenario }))), random
  );
  const componentGrouped = new Map();
  const componentOrderPositionCounts = Object.fromEntries(frameworks.map(framework => [framework, Array(frameworks.length).fill(0)]));
  for (const { size, scenario } of componentCases) {
    const baseOrder = shuffle(frameworks, random);
    for (let repeat = 0; repeat < repeats; repeat++) {
      const rotation = repeat % frameworks.length;
      const order = frameworks.map((_, position) => baseOrder[(position + rotation) % frameworks.length]);
      order.forEach((framework, position) => componentOrderPositionCounts[framework][position]++);
      for (const framework of order) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce"
        });
        try {
          const page = await context.newPage();
          const pageErrors = [];
          page.on("pageerror", error => pageErrors.push(error.message));
          await page.goto(origin);
          await page.waitForFunction(() => typeof window.runComponentLifecycle === "function");
          const result = await page.evaluate(options => window.runComponentLifecycle(options), {
            framework, scenario, size, warmup, samples
          });
          if (pageErrors.length) throw new Error(`Component benchmark failed in ${framework}/${scenario}/${size}: ${pageErrors.join(" | ")}`);
          const key = `${size}:${scenario}:${framework}`;
          const aggregate = componentGrouped.get(key) ?? {
            framework, scenario, size, valuesMs: [], appRendersPerUpdate: [], childRendersPerUpdate: [], trialMediansMs: []
          };
          aggregate.valuesMs.push(...result.valuesMs);
          aggregate.appRendersPerUpdate.push(result.appRendersPerUpdate);
          aggregate.childRendersPerUpdate.push(result.childRendersPerUpdate);
          aggregate.trialMediansMs.push(result.medianMs);
          componentGrouped.set(key, aggregate);
        } finally {
          await context.close();
        }
      }
    }
  }

  const results = [...grouped.values()];
  const componentResults = [...componentGrouped.values()];
  const findResult = (size, scenario, framework) => grouped.get(`${size}:${scenario}:${framework}`);
  const findComponentResult = (size, scenario, framework) => componentGrouped.get(`${size}:${scenario}:${framework}`);
  const userAgentContext = await browser.newContext();
  const userAgentPage = await userAgentContext.newPage();
  await userAgentPage.goto(origin);
  const userAgent = await userAgentPage.evaluate(() => navigator.userAgent);
  await userAgentContext.close();

  const report = {
    metadata: {
      browser: browser.version(),
      userAgent,
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model ?? "unknown",
      node: process.version,
      frameworkVersions,
      seed,
      settings: {
        suite,
        sizes: suite === "components" ? [] : sizes,
        scenarios: suite === "components" ? [] : scenarios,
        componentSizes: suite === "list" ? [] : componentSizes,
        componentScenarios: suite === "list" ? [] : componentScenarios,
        warmup,
        samplesPerContext: samples,
        pairedRepeats: repeats
      },
      orderPositionCounts,
      preflightContexts,
      componentOrderPositionCounts,
      componentPreflightContexts,
      timing: "production browser bundles; every trial used a fresh browser context; correctness preflight is untimed; React uses flushSync and Vue updates include nextTick"
    },
    results: results.sort((left, right) => left.size - right.size ||
      scenarios.indexOf(left.scenario) - scenarios.indexOf(right.scenario) ||
      left.framework.localeCompare(right.framework)).map(result => ({
        ...result,
        sampleCount: result.valuesMs.length,
        medianMs: percentile(result.valuesMs, 0.5),
        p95Ms: percentile(result.valuesMs, 0.95),
        madMs: medianAbsoluteDeviation(result.valuesMs),
        treeMedianMs: percentile(result.treeValuesMs, 0.5),
        updateMedianMs: percentile(result.updateValuesMs, 0.5)
      })),
    componentResults: componentResults.sort((left, right) => left.size - right.size ||
      componentScenarios.indexOf(left.scenario) - componentScenarios.indexOf(right.scenario) ||
      left.framework.localeCompare(right.framework)).map(result => ({
        ...result,
        sampleCount: result.valuesMs.length,
        medianMs: percentile(result.valuesMs, 0.5),
        p95Ms: percentile(result.valuesMs, 0.95),
        madMs: medianAbsoluteDeviation(result.valuesMs),
        appRendersPerUpdateMedian: percentile(result.appRendersPerUpdate, 0.5),
        childRendersPerUpdateMedian: percentile(result.childRendersPerUpdate, 0.5)
      }))
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Browser: Chromium ${browser.version()} (${process.platform}-${process.arch}; ${cpus()[0]?.model ?? "unknown"})`);
    console.log(`Frameworks: ${frameworks.map(framework => `${framework} ${frameworkVersions[framework]}`).join("; ")}`);
    console.log(`Production bundle; suite=${suite}; seed=${seed}; warmup=${warmup}; samples/context=${samples}; paired repeats=${repeats}`);
    console.log(`List framework run-position counts: ${JSON.stringify(orderPositionCounts)}.`);
    console.log(`Component framework run-position counts: ${JSON.stringify(componentOrderPositionCounts)}.`);
    console.log(`Untimed correctness preflight passed for ${preflightContexts} list and ${componentPreflightContexts} component contexts.`);
    if (suite !== "components") console.table(sizes.flatMap(size => scenarios.map(scenario => {
      const row = { size, scenario };
      const medians = {};
      for (const framework of frameworks) {
        const result = findResult(size, scenario, framework);
        if (!result) throw new Error(`Missing benchmark result for ${size}/${scenario}/${framework}`);
        medians[framework] = percentile(result.valuesMs, 0.5);
        row[`${framework}Ms`] = medians[framework].toFixed(3);
      }
      return {
        ...row,
        zuiVsReact: `${(medians.zui / Math.max(medians.react, 0.001)).toFixed(2)}x`,
        zuiVsPreact: `${(medians.zui / Math.max(medians.preact, 0.001)).toFixed(2)}x`,
        zuiVsVue: `${(medians.zui / Math.max(medians.vue, 0.001)).toFixed(2)}x`,
        samples: findResult(size, scenario, "zui").valuesMs.length
      };
    })));
    if (suite !== "list") console.table(componentSizes.flatMap(size => componentScenarios.map(scenario => {
      const row = { size, scenario };
      const medians = {};
      const childRenders = {};
      const appRenders = {};
      for (const framework of frameworks) {
        const result = findComponentResult(size, scenario, framework);
        if (!result) throw new Error(`Missing component result for ${size}/${scenario}/${framework}`);
        medians[framework] = percentile(result.valuesMs, 0.5);
        childRenders[framework] = percentile(result.childRendersPerUpdate, 0.5);
        appRenders[framework] = percentile(result.appRendersPerUpdate, 0.5);
        row[`${framework}Ms`] = medians[framework].toFixed(3);
      }
      return {
        ...row,
        zuiVsReact: `${(medians.zui / Math.max(medians.react, 0.001)).toFixed(2)}x`,
        zuiVsPreact: `${(medians.zui / Math.max(medians.preact, 0.001)).toFixed(2)}x`,
        zuiVsVue: `${(medians.zui / Math.max(medians.vue, 0.001)).toFixed(2)}x`,
        childRenders: JSON.stringify(childRenders),
        appRenders: JSON.stringify(appRenders),
        samples: findComponentResult(size, scenario, "zui").valuesMs.length
      };
    })));
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
  await rm(tempRoot, { recursive: true, force: true });
}
