const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const port = 4177;
const origin = `http://127.0.0.1:${port}`;
const vite = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const browserCandidates = [
  process.env.BROWSER_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser"
].filter(Boolean);

function findBrowser() {
  for (const candidate of browserCandidates) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
    try {
      return childProcess.execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      continue;
    }
  }
  throw new Error("Chrome/Chromium not found; set BROWSER_BIN to run browser smoke");
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/index.html`);
      if (response.ok) return;
    } catch {
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Vite preview did not start within 15 seconds");
}

function captureBrowserDom(browser, profile, target) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(browser, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=5000",
      "--dump-dom",
      `${origin}${target}`
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let dom = "";
    let diagnostics = "";
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      if (error) reject(error);
      else resolve({ dom, diagnostics });
    };
    let timeout = setTimeout(() => finish(new Error("Chrome did not emit the browser smoke DOM within 30 seconds")), 30000);
    child.stdout.on("data", chunk => {
      dom += chunk;
      if (dom.includes('data-e2e-status="pass"') || dom.includes('data-e2e-status="fail"')) finish();
    });
    child.stderr.on("data", chunk => { diagnostics += chunk; });
    child.on("error", finish);
    child.on("close", code => {
      if (dom.includes('data-e2e-status="pass"') || dom.includes('data-e2e-status="fail"')) finish();
      else finish(new Error(`Chrome exited before browser smoke completed (code ${code})`));
    });
  });
}

async function main() {
  const browser = findBrowser();
  const server = childProcess.spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let errorOutput = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { errorOutput += chunk; });

  try {
    await waitForServer();
    const scenarios = [
      {
        target: "/index.html?e2e",
        label: "Studio dashboard flow",
        message: "metrics, chart, navigation, controlled member form, table updates, and runtime errors"
      }
    ];
    for (const scenario of scenarios) {
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), "zui-browser-"));
      try {
        const { dom, diagnostics } = await captureBrowserDom(browser, profile, scenario.target);
        if (!dom.includes('data-e2e-status="pass"')) {
          const status = dom.match(/data-e2e-status="([^"]*)"/)?.[1] ?? "missing";
          const failure = dom.match(/data-e2e-error="([^"]*)"/)?.[1] ?? "unknown browser assertion failure";
          throw new Error(`${scenario.label} ${status}: ${failure}`);
        }
        console.log(`browser: PASS — ${scenario.label}: ${scenario.message}`);
        if (diagnostics && process.env.DEBUG_BROWSER_SMOKE) process.stderr.write(diagnostics);
      } finally {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  } finally {
    server.kill("SIGTERM");
    if (server.exitCode === null) server.kill("SIGKILL");
    if (errorOutput && process.env.DEBUG_BROWSER_SMOKE) process.stderr.write(errorOutput);
    if (output && process.env.DEBUG_BROWSER_SMOKE) process.stdout.write(output);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
