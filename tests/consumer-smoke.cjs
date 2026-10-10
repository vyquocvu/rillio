const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "tests", "consumer-fixture");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zui-consumer-"));

try {
  fs.cpSync(fixtureRoot, temporaryRoot, { recursive: true });
  const modulesRoot = path.join(temporaryRoot, "node_modules");
  fs.mkdirSync(modulesRoot);
  fs.symlinkSync(repoRoot, path.join(modulesRoot, "zui"), "dir");

  const tsc = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  childProcess.execFileSync(process.execPath, [tsc, "-p", path.join(temporaryRoot, "tsconfig.json")], {
    cwd: temporaryRoot,
    stdio: "inherit"
  });
  console.log("consumer: PASS — generated package ESM, declarations, JSX runtime, and subpaths resolve");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
