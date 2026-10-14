import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let server;
let browser;

try {
  server = await preview({
    root: projectRoot,
    configFile: resolve(projectRoot, "vite.config.mjs"),
    preview: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Could not determine preview server port");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  const response = await page.goto(`http://127.0.0.1:${address.port}/index.html?e2e`, { waitUntil: "load" });
  if (!response?.ok()) throw new Error(`Dashboard returned HTTP ${response?.status() ?? "no response"}`);

  await page.waitForFunction(() => document.body.dataset.e2eStatus, undefined, { timeout: 15_000 });
  const result = await page.evaluate(() => ({
    status: document.body.dataset.e2eStatus,
    checks: document.body.dataset.e2eChecks,
    error: document.body.dataset.e2eError
  }));
  if (result.status !== "pass") throw new Error(`Dashboard browser smoke failed: ${result.error ?? "unknown error"}`);
  if (runtimeErrors.length) throw new Error(`Uncaught browser errors: ${runtimeErrors.join(" | ")}`);

  await page.evaluate(async () => {
    const { createRoot, jsx, useState, Modal, StyleSheet } = await import("/package/index.js");
    const container = document.createElement("div");
    container.id = "playwright-modal-smoke";
    document.body.append(container);

    function ModalApp() {
      const [open, setOpen] = useState(false);
      return jsx("main", {
        children: [
          jsx(StyleSheet, {}),
          jsx("button", {
            id: "playwright-modal-opener",
            onClick: () => setOpen(true),
            children: "Open modal"
          }),
          Modal({
            open,
            title: "Playwright modal smoke",
            description: "Keyboard behavior check",
            onClose: () => setOpen(false),
            children: jsx("button", { children: "Save" })
          })
        ]
      });
    }

    const root = createRoot(container);
    root.render(jsx(ModalApp, {}));
    window.__zuiModalSmokeRoot = root;
  });

  await page.getByRole("button", { name: "Open modal" }).click();
  const dialog = page.getByRole("dialog", { name: "Playwright modal smoke" });
  await dialog.waitFor({ state: "visible" });
  if (!await page.locator(".zui-modal__close").evaluate(element => element === document.activeElement)) {
    throw new Error("ZUI Modal did not focus its initial control");
  }
  await page.keyboard.press("Shift+Tab");
  if (!await page.locator(".zui-modal__body button").evaluate(element => element === document.activeElement)) {
    throw new Error("ZUI Modal did not wrap keyboard focus");
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if (await page.locator("#playwright-modal-opener").evaluate(element => element !== document.activeElement)) {
    throw new Error("ZUI Modal did not restore focus to its opener");
  }

  await page.getByRole("button", { name: "Open modal" }).click();
  await page.getByRole("dialog", { name: "Playwright modal smoke" }).waitFor({ state: "visible" });
  await page.locator(".zui-modal__backdrop").click({ position: { x: 1, y: 1 } });
  await page.locator("[role=dialog]").waitFor({ state: "detached" });
  if (await page.locator("#playwright-modal-opener").evaluate(element => element !== document.activeElement)) {
    throw new Error("Backdrop dismissal did not restore focus to the opener");
  }
  if (runtimeErrors.length) throw new Error(`Uncaught browser errors: ${runtimeErrors.join(" | ")}`);
  await page.evaluate(() => {
    window.__zuiModalSmokeRoot.unmount();
    document.querySelector("#playwright-modal-smoke")?.remove();
  });

  await page.evaluate(async () => {
    const { createRoot, jsx } = await import("/package/index.js");
    const { useStore } = await import("/package/zustand.js");
    let state = { count: 0 };
    const listeners = new Set();
    const store = {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const increment = () => {
      const previous = state;
      state = { count: state.count + 1 };
      for (const listener of listeners) listener(state, previous);
    };
    const container = document.createElement("div");
    document.body.append(container);

    function Counter() {
      const count = useStore(store, snapshot => snapshot.count);
      return jsx("button", { type: "button", onClick: increment, children: count });
    }

    const root = createRoot(container);
    root.render(jsx(Counter, {}));
    const button = container.querySelector("button");
    if (button?.textContent !== "0") throw new Error("Zustand adapter did not read the initial store snapshot");
    button.click();
    if (button.textContent !== "1") throw new Error("Zustand adapter did not render a selected store update");
    root.unmount();
    increment();
    if (listeners.size !== 0) throw new Error("Zustand adapter did not unsubscribe after unmount");
    container.remove();
  });

  await page.evaluate(async () => {
    const { createRoot, jsx, Input, Progress } = await import("/package/index.js");
    const { createStore, mount } = await import("/package/dom.js");
    const sharedContainer = document.createElement("div");
    document.body.append(sharedContainer);
    const value = createStore("reactive root");
    const dispose = mount(jsx("span", { children: value }), sharedContainer);

    let rootCollisionRejected = false;
    try { createRoot(sharedContainer); }
    catch (error) { rootCollisionRejected = error.message === "ZUI_ROOT_OCCUPIED"; }
    if (!rootCollisionRejected || sharedContainer.textContent !== "reactive root") {
      throw new Error("Overlapping root was not rejected without disturbing the live tree");
    }
    value.set("still reactive");
    if (sharedContainer.textContent !== "still reactive") throw new Error("Rejected root collision disposed the reactive owner");
    dispose();
    sharedContainer.remove();

    const safeContainer = document.createElement("div");
    document.body.append(safeContainer);
    const root = createRoot(safeContainer);
    root.render(jsx("p", { children: "safe text" }));
    let htmlSinkRejected = false;
    try { root.render(jsx("div", { innerHTML: "<img src=x onerror=alert(1)>" })); }
    catch (error) { htmlSinkRejected = error.message === "ZUI_UNSAFE_HTML_PROP"; }
    if (!htmlSinkRejected || safeContainer.textContent !== "safe text" || safeContainer.querySelector("img")) {
      throw new Error("Unsafe HTML prop was not rejected before mutating the rendered tree");
    }
    let urlSinkRejected = false;
    try { root.render(jsx("a", { href: "java\nscript:alert(1)", children: "unsafe link" })); }
    catch (error) { urlSinkRejected = error.message === "ZUI_UNSAFE_URL_PROP"; }
    if (!urlSinkRejected || safeContainer.textContent !== "safe text") {
      throw new Error("Executable URL was not rejected before mutating the rendered tree");
    }
    let emptyHTMLRejected = false;
    try { root.render(jsx("div", { innerHTML: "" })); }
    catch (error) { emptyHTMLRejected = error.message === "ZUI_UNSAFE_HTML_PROP"; }
    if (!emptyHTMLRejected || safeContainer.textContent !== "safe text") {
      throw new Error("Empty HTML sink was not rejected before mutating the rendered tree");
    }
    let inlineHandlerRejected = false;
    try { root.render(jsx("img", { onerror: "alert(1)" })); }
    catch (error) { inlineHandlerRejected = error.message === "ZUI_UNSAFE_EVENT_PROP"; }
    if (!inlineHandlerRejected || safeContainer.textContent !== "safe text") {
      throw new Error("String-valued inline event handler was not rejected before mutating the rendered tree");
    }
    root.unmount();
    safeContainer.remove();

    const uiContainer = document.createElement("div");
    document.body.append(uiContainer);
    const uiRoot = createRoot(uiContainer);
    uiRoot.render(jsx("main", {
      children: [
        jsx(Input, { label: "Workspace name", hint: "Visible to teammates", error: "Required" }),
        jsx(Progress, { value: 150, max: 100, label: "Upload progress" })
      ]
    }));
    const label = uiContainer.querySelector("label");
    const input = uiContainer.querySelector("input");
    if (!label?.htmlFor || label.control !== input || !input?.getAttribute("aria-describedby")) {
      throw new Error("Input labels or descriptions are not associated in the browser");
    }
    const progress = uiContainer.querySelector('[role="progressbar"]');
    if (progress?.getAttribute("aria-valuenow") !== "100" || progress.getAttribute("aria-label") !== "Upload progress") {
      throw new Error("Progressbar accessible value or name is invalid");
    }
    uiRoot.unmount();
    uiContainer.remove();
  });

  await page.evaluate(async () => {
    const { createRoot, jsx } = await import("/package/index.js");
    const { inspectRoot, createInspectorOverlay, highlightNode } = await import("/package/devtools.js");
    const dtContainer = document.createElement("div");
    document.body.append(dtContainer);
    const dtRoot = createRoot(dtContainer);
    dtRoot.render(jsx("button", { id: "dt-btn", children: "DevTools Button" }));

    const snapshot = inspectRoot(dtContainer);
    if (!snapshot || snapshot.totalNodes < 2) {
      throw new Error("DevTools inspectRoot did not serialize active tree in browser");
    }

    const overlay = createInspectorOverlay({ targetRoot: dtContainer });
    if (!document.querySelector("[data-zui-devtools]")) {
      throw new Error("DevTools overlay was not rendered in browser DOM");
    }

    const hl = highlightNode(snapshot.tree.children[0].id);
    if (!hl) {
      throw new Error("DevTools highlightNode failed to create highlight box in browser");
    }

    overlay.dispose();
    if (document.querySelector("[data-zui-devtools]")) {
      throw new Error("DevTools overlay was not cleanly disposed in browser DOM");
    }

    dtRoot.unmount();
    dtContainer.remove();
  });

  console.log(`browser: PASS — dashboard (${result.checks}); Modal keyboard/focus; Zustand store lifecycle; root ownership; HTML/URL/event sink guards; Input/Progress semantics; DevTools Flat Index inspector`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
