import { fileURLToPath, URL } from "node:url";

const source = file => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
const page = file => fileURLToPath(new URL(`./${file}`, import.meta.url));

export default {
  resolve: {
    alias: {
      "zui/jsx-runtime": source("jsx-runtime.ts"),
      "zui/jsx-dev-runtime": source("jsx-dev-runtime.ts"),
      "zui/ui": source("ui.ts"),
      "zui/external-store": source("external-store.ts"),
      "zui/zustand": source("zustand.ts"),
      "zui/dom": source("dom.ts"),
      "zui/legacy": source("dom.ts"),
      "zui/flat": source("flat.ts"),
      "zui/reactive": source("reactive.ts"),
      "zui/devtools": source("devtools.ts"),
      zui: source("index.ts")
    }
  },
  build: {
    rollupOptions: {
      input: {
        index: page("index.html"),
        admin: page("admin.html"),
        demos: page("demos.html"),
        realworld: page("realworld.html"),
        renderLab: page("render-lab.html"),
        storeLab: page("store-lab.html"),
        dataLab: page("data-lab.html"),
        docs: page("docs.html")
      }
    }
  }
};
