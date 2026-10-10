import { fileURLToPath, URL } from "node:url";

const source = file => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
const page = file => fileURLToPath(new URL(`./${file}`, import.meta.url));

export default {
  resolve: {
    alias: {
      "zui/jsx-runtime": source("jsx-runtime.ts"),
      "zui/jsx-dev-runtime": source("jsx-dev-runtime.ts"),
      "zui/legacy": source("dom.ts"),
      "zui/reactive": source("reactive.ts"),
      zui: source("index.ts")
    }
  },
  build: {
    rollupOptions: {
      input: {
        index: page("index.html"),
        compat: page("compat.html"),
        todo: page("todo.html"),
        reactFriendly: page("react-friendly.html"),
        hooks: page("hooks.html"),
        keyed: page("keyed.html"),
        benchmark: page("benchmark.html"),
        legacyBenchmark: page("legacy-benchmark.html"),
        e2e: page("e2e.html"),
        demos: page("demos.html")
      }
    }
  }
};
