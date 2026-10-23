import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { runPatchPlanningBenchmark } = await import("./benchmark.ts");
const report = runPatchPlanningBenchmark(dom.window.document);
console.log(JSON.stringify(report, null, 2));
