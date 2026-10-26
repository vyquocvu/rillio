const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "tests", "consumer-fixture");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rillio-consumer-"));

try {
  fs.cpSync(fixtureRoot, temporaryRoot, { recursive: true });
  const modulesRoot = path.join(temporaryRoot, "node_modules");
  fs.mkdirSync(modulesRoot);
  const scopeRoot = path.join(modulesRoot, "@vyquocvu");
  fs.mkdirSync(scopeRoot);
  fs.symlinkSync(repoRoot, path.join(scopeRoot, "rillio"), "dir");

  const tsc = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  for (const config of ["tsconfig.json", "tsconfig.dev.json"]) {
    childProcess.execFileSync(process.execPath, [tsc, "-p", path.join(temporaryRoot, config)], {
      cwd: temporaryRoot,
      stdio: "inherit"
    });
  }
  console.log("consumer: PASS — package ESM, declarations, JSX runtime, dev JSX runtime, and subpaths resolve");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
