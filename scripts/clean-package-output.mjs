import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../dist/package", import.meta.url));
rmSync(output, { recursive: true, force: true });
