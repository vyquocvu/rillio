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
  const browserLogs = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "log") browserLogs.push(message.text());
  });
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
    const { useStore } = await import("/package/external-store.js");
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
    const { createStore } = await import("/package/reactive-api.js");
    const { mount } = await import("/package/dom.js");
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

  // Verify component and selector invalidation behavior through example console logs.
  await page.goto(`http://127.0.0.1:${address.port}/render-lab.html`, { waitUntil: "load" });
  await page.waitForSelector("#local-increment");
  browserLogs.length = 0;
  await page.evaluate(() => {
    window.__renderLabStaticNode = document.querySelector("#static-child");
    window.__renderLabLocalButton = document.querySelector("#local-increment");
  });
  await page.locator("#local-increment").click();
  await page.waitForFunction(() => document.querySelector("#local-count")?.textContent === "1");
  const localUpdateLogs = browserLogs.filter(line => line.startsWith("[render-lab]"));
  if (localUpdateLogs.length !== 1 || !localUpdateLogs[0].includes("LocalCounter render #2")) {
    throw new Error(`Local state rendered unexpected components: ${localUpdateLogs.join(" | ")}`);
  }
  if (!await page.locator("#local-increment").evaluate(node => node === window.__renderLabLocalButton)) {
    throw new Error("Local component update replaced its button DOM node");
  }

  browserLogs.length = 0;
  await page.locator("#root-increment").click();
  await page.waitForFunction(() => document.querySelector("#root-updates")?.textContent === "1");
  const rootUpdateLogs = browserLogs.filter(line => line.startsWith("[render-lab]"));
  if (!rootUpdateLogs.some(line => line.includes("App render"))) {
    throw new Error(`Parent update did not re-render App: ${rootUpdateLogs.join(" | ")}`);
  }
  // Parent-owned updates rerun all matched child components, while preserving
  // their existing host DOM nodes.
  for (const component of ["LocalCounter", "StoreCount", "StoreLabel", "StaticChild"]) {
    if (!rootUpdateLogs.some(line => line.includes(`${component} render`))) {
      throw new Error(`Parent update skipped ${component}: ${rootUpdateLogs.join(" | ")}`);
    }
  }
  if (!await page.locator("#static-child").evaluate(node => node === window.__renderLabStaticNode)) {
    throw new Error("Parent update replaced an unchanged child DOM node");
  }

  browserLogs.length = 0;
  await page.locator("#store-increment").click();
  await page.waitForFunction(() => document.querySelector("#store-count")?.textContent === "1");
  const storeCountLogs = browserLogs.filter(line => line.startsWith("[render-lab]"));
  if (storeCountLogs.length !== 1 || !storeCountLogs[0].includes("StoreCount render")) {
    throw new Error(`Count slice update rendered unexpected components: ${storeCountLogs.join(" | ")}`);
  }

  browserLogs.length = 0;
  await page.locator("#store-rename").click();
  await page.waitForFunction(() => document.querySelector("#store-label")?.textContent === "Flat Index");
  const storeLabelLogs = browserLogs.filter(line => line.startsWith("[render-lab]"));
  if (storeLabelLogs.length !== 1 || !storeLabelLogs[0].includes("StoreLabel render")) {
    throw new Error(`Label slice update rendered unexpected components: ${storeLabelLogs.join(" | ")}`);
  }

  // Verify atomic and shallow selector notifications in a dedicated page.
  await page.goto(`http://127.0.0.1:${address.port}/store-lab.html`, { waitUntil: "load" });
  await page.waitForSelector("#increase-count");
  browserLogs.length = 0;
  await page.locator("#increase-count").click();
  await page.waitForFunction(() => document.querySelector("#slice-count")?.textContent === "1");
  const countSliceLogs = browserLogs.filter(line => line.startsWith("[store-lab]"));
  if (!countSliceLogs.some(line => line.includes("CountSlice render")) ||
      !countSliceLogs.some(line => line.includes("CombinedSlice render")) ||
      countSliceLogs.some(line => line.includes("NameSlice render") || line.includes("App render"))) {
    throw new Error(`Count selector fan-out was unexpected: ${countSliceLogs.join(" | ")}`);
  }

  browserLogs.length = 0;
  await page.locator("#rename").click();
  await page.waitForFunction(() => document.querySelector("#slice-name")?.textContent === "Grace Hopper");
  const nameSliceLogs = browserLogs.filter(line => line.startsWith("[store-lab]"));
  if (!nameSliceLogs.some(line => line.includes("NameSlice render")) ||
      !nameSliceLogs.some(line => line.includes("CombinedSlice render")) ||
      nameSliceLogs.some(line => line.includes("CountSlice render") || line.includes("App render"))) {
    throw new Error(`Name selector fan-out was unexpected: ${nameSliceLogs.join(" | ")}`);
  }

  // Verify mount-once reactive data, keyed row identity, and async resource logs.
  await page.goto(`http://127.0.0.1:${address.port}/data-lab.html`, { waitUntil: "load" });
  await page.waitForSelector("#task-list [data-task-id='1']");
  await page.waitForSelector("#resource-data", { timeout: 5000 });
  browserLogs.length = 0;
  await page.locator("#task-list [data-task-id='1']").evaluate(node => { window.__taskRowOne = node; });
  await page.locator("#task-list [data-task-id='2']").evaluate(node => { window.__taskRowTwo = node; });
  await page.locator("#task-list [data-task-id='1'] button").click();
  await page.waitForFunction(() => document.querySelector("#task-list [data-task-id='1']")?.textContent?.includes("✓"));
  const editDataLogs = browserLogs.filter(line => line.startsWith("[data-lab]"));
  if (!editDataLogs.some(line => line.includes("row data id=1")) || editDataLogs.some(line => line.includes("App mount render"))) {
    throw new Error(`Keyed data edit did not stay in the row binding: ${editDataLogs.join(" | ")}`);
  }
  if (!await page.locator("#task-list [data-task-id='1']").evaluate(node => node === window.__taskRowOne)) {
    throw new Error("Editing keyed row data replaced its DOM node");
  }

  browserLogs.length = 0;
  await page.locator("#reorder-tasks").click();
  const taskOrder = await page.locator("#task-list [data-task-id]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-task-id")));
  if (taskOrder.join(",") !== "2,1") throw new Error(`Keyed task order was not updated: ${taskOrder.join(",")}`);
  if (!await page.locator("#task-list [data-task-id='1']").evaluate(node => node === window.__taskRowOne) ||
      !await page.locator("#task-list [data-task-id='2']").evaluate(node => node === window.__taskRowTwo)) {
    throw new Error("Reordering keyed rows replaced their DOM nodes");
  }

  browserLogs.length = 0;
  await page.locator("#add-task").click();
  await page.waitForSelector("#task-list [data-task-id='3']");
  const addedTaskLogs = browserLogs.filter(line => line.startsWith("[data-lab]"));
  if (!addedTaskLogs.some(line => line.includes("row mount id=3")) || addedTaskLogs.some(line => line.includes("App mount render"))) {
    throw new Error(`Adding a keyed row had unexpected render logs: ${addedTaskLogs.join(" | ")}`);
  }

  browserLogs.length = 0;
  await page.locator("#refetch-resource").click();
  await page.waitForFunction(() => document.querySelector("#resource-data strong")?.textContent?.includes("Version 2"), undefined, { timeout: 5000 });
  const resourceLogs = browserLogs.filter(line => line.startsWith("[data-lab]"));
  if (!resourceLogs.some(line => line.includes("resource fetch start v2")) ||
      !resourceLogs.some(line => line.includes("resource fetch success v2"))) {
    throw new Error(`Resource refetch logs were incomplete: ${resourceLogs.join(" | ")}`);
  }

  // Verify real-world TaskFlow app in Playwright browser
  await page.goto(`http://127.0.0.1:${address.port}/realworld.html`, { waitUntil: "load" });
  await page.waitForSelector("header");
  await page.waitForSelector("text=Loading TaskFlow Workspace...", { state: "detached" });
  const taskflowHeader = await page.textContent("header");
  if (!taskflowHeader?.includes("New Issue")) {
    throw new Error("TaskFlow workspace header was not rendered");
  }

  // A Kanban status change should update its data without replacing the application shell.
  await page.evaluate(() => {
    window.__taskflowHeader = document.querySelector("header");
    window.__taskflowSidebar = document.querySelector("aside");
  });
  const todoCard = page.getByText("TF-106", { exact: true }).locator("xpath=../..");
  await todoCard.getByRole("button", { name: "→ Prog" }).click();
  await page.getByText("Status updated", { exact: true }).waitFor();
  if (await page.locator("#app").innerText().then(text => text.includes("Loading TaskFlow Workspace..."))) {
    throw new Error("Kanban status update displayed the full-page loading state");
  }
  if (!await page.locator("header").evaluate(node => node === window.__taskflowHeader) ||
      !await page.locator("aside").evaluate(node => node === window.__taskflowSidebar)) {
    throw new Error("Kanban status update replaced the TaskFlow application shell");
  }
  if (await page.getByText("TF-106", { exact: true }).count() !== 1) {
    throw new Error("Kanban status update lost or duplicated the moved issue");
  }

  // Click on "Issues List" tab
  const listTab = page.locator('nav button:has-text("Issues List")');
  await listTab.click();
  await page.waitForSelector("table");

  // Click on "Analytics" tab
  const analyticsTab = page.locator('nav button:has-text("Analytics")');
  await analyticsTab.click();
  await page.waitForSelector('h2:has-text("Workspace Analytics")');

  // Click on "Settings" tab
  const settingsTab = page.locator('nav button:has-text("Settings")');
  await settingsTab.click();
  await page.waitForSelector('h2:has-text("Workspace Settings")');

  // Test ErrorBoundary recovery in settings
  const triggerBtn = page.locator('button:has-text("Trigger Simulated Render Error")');
  await triggerBtn.click();
  await page.waitForSelector('button:has-text("Recover Subtree")');
  const recoverBtn = page.locator('button:has-text("Recover Subtree")');
  await recoverBtn.click();
  await page.waitForSelector('text=Protected subtree is operating normally');

  // Toggle DevTools HUD
  const devToolsBtn = page.locator('header button:has-text("Flat Index")');
  await devToolsBtn.click();
  await page.waitForSelector("[data-zui-devtools]");
  await devToolsBtn.click(); // Close

  if (runtimeErrors.length) throw new Error(`Uncaught browser errors: ${runtimeErrors.join(" | ")}`);
  console.log(`browser: PASS — dashboard (${result.checks}); render scopes and console traces; atomic/shallow store selectors; keyed data DOM identity; async resource refetch; Modal keyboard/focus; Zustand store lifecycle; root ownership; HTML/URL/event sink guards; Input/Progress semantics; DevTools Flat Index inspector; TaskFlow real-world app`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
