import { fileURLToPath, URL } from "node:url";

const source = file => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
const page = file => fileURLToPath(new URL(`./${file}`, import.meta.url));

export default {
  resolve: {
    alias: {
      "rillio/jsx-runtime": source("jsx-runtime.ts"),
      "rillio/jsx-dev-runtime": source("jsx-dev-runtime.ts"),
      "rillio/dom": source("dom.ts"),
      "rillio/flat": source("flat.ts"),
      "rillio/reactive": source("reactive-api.ts"),
      "rillio/devtools": source("devtools.ts"),
      rillio: source("index.ts")
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
        benchmarks: page("benchmarks.html"),
        pokemon: page("pokemon.html"),
        docs: page("docs.html")
      }
    }
  }
};
