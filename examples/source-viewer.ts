type SourceLoader = () => Promise<string>;

const styleId = "rillio-source-viewer-styles";

function installStyles(): void {
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .rillio-source-toggle,
    .rillio-source-panel,
    .rillio-source-panel * { box-sizing: border-box; }
    .rillio-source-toggle {
      position: fixed; z-index: 10000; left: 20px; bottom: 20px;
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 16px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px;
      background: #111827; color: #f8fafc; box-shadow: 0 12px 32px rgba(15,23,42,.24);
      font: 650 13px/1.1 ui-sans-serif, system-ui, sans-serif; cursor: pointer;
    }
    .rillio-source-toggle:hover { background: #263449; }
    .rillio-source-toggle:focus-visible,
    .rillio-source-panel button:focus-visible {
      outline: 3px solid #a78bfa; outline-offset: 3px;
    }
    .rillio-source-toggle-mark {
      color: #c4b5fd; font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .rillio-source-panel {
      position: fixed; z-index: 10001; inset: 0;
      display: flex; flex-direction: column; width: 100vw; height: 100vh; height: 100dvh;
      max-height: none; overflow: hidden;
      border: 0; border-radius: 0; background: #0b1220; color: #e5edf8;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .rillio-source-panel[hidden] { display: none; }
    .rillio-source-toolbar {
      display: flex; flex: 0 0 auto; align-items: center; gap: 12px; min-height: 64px;
      padding: 10px 24px; border-bottom: 1px solid #263247;
      background: #0f1929;
    }
    .rillio-source-filename {
      overflow: hidden; color: #dbeafe; font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .rillio-source-status { flex: 1; color: #93a4bb; font-size: 12px; text-align: right; }
    .rillio-source-panel button {
      flex: 0 0 auto; padding: 7px 10px; border: 1px solid #3b4b63; border-radius: 8px;
      background: #172235; color: #e5edf8; font: 600 12px/1.1 ui-sans-serif, system-ui, sans-serif; cursor: pointer;
    }
    .rillio-source-panel button:hover { background: #263449; }
    .rillio-source-content {
      flex: 1 1 auto; min-width: 0; min-height: 0; width: 100%; margin: 0; padding: 28px 32px;
      overflow: auto; overscroll-behavior: contain; color: #d1d9e6;
      font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      tab-size: 2; white-space: pre;
    }
    .rillio-source-content:focus-visible { outline: 2px solid #7c6ee6; outline-offset: -2px; }
    .rillio-source-content code { display: block; min-width: max-content; }
    .rillio-source-token-comment { color: #77869d; font-style: italic; }
    .rillio-source-token-string { color: #a5d6a7; }
    .rillio-source-token-keyword { color: #c4a7ff; }
    .rillio-source-token-literal { color: #ffb86c; }
    .rillio-source-token-number { color: #f2a6c2; }
    .rillio-source-token-tag { color: #7dd3fc; }
    .rillio-source-token-attribute { color: #f0c674; }
    .rillio-source-token-operator { color: #93c5fd; }
    .rillio-source-token-punctuation { color: #91a0b5; }
    .rillio-source-token-type { color: #67e8c5; }
    .rillio-source-loading { color: #93a4bb; font-style: italic; }
    .rillio-source-error { color: #fda4af; }
    @media (max-width: 560px) {
      .rillio-source-toolbar { gap: 7px; min-height: 56px; padding: 8px 12px; }
      .rillio-source-status { display: none; }
      .rillio-source-content { padding: 18px 14px; font-size: 11px; }
    }
  `;
  document.head.append(style);
}

const keywordTokens = new Set((
  "as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch throw try type typeof var void while with yield declare enum keyof infer is asserts satisfies abstract readonly namespace module unique override using"
).split(" "));
const typeTokens = new Set("Array Boolean Date Error Function Map Number Object Promise Record Set String Symbol WeakMap WeakSet unknown any never void bigint boolean number string symbol".split(" "));
const tokenPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][\w.:-]*|\/?>(?![=])|\b[A-Za-z_$][\w$-]*(?=\s*=)|\b(?:true|false|null|undefined|NaN|Infinity)\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?n?\b|\b[A-Za-z_$][\w$]*\b|===?|!==?|=>|\?\?|\?\.|&&|\|\||\+\+|--|[-+*/%=&|!<>^~?:]+|[{}()[\].,;:]/g;

function highlightSource(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) fragment.append(document.createTextNode(source.slice(lastIndex, index)));

    let kind: string | undefined;
    if (token.startsWith("//") || token.startsWith("/*")) kind = "comment";
    else if (/^["'`]/.test(token)) kind = "string";
    else if (/^<\/?[A-Za-z]/.test(token) || token === ">" || token === "/>" || token === "</") kind = "tag";
    else if (keywordTokens.has(token)) kind = "keyword";
    else if (/^(?:true|false|null|undefined|NaN|Infinity)$/.test(token)) kind = "literal";
    else if (/^\d/.test(token)) kind = "number";
    else if (/^(?:===?|!==?|=>|\?\?|\?\.|&&|\|\||\+\+|--|[-+*/%=&|!<>^~?:]+)$/.test(token)) kind = "operator";
    else if (typeTokens.has(token)) kind = "type";
    else if (/^[A-Za-z_$][\w$-]*$/.test(token) && /\s*=/.test(source.slice(index + token.length, index + token.length + 8))) kind = "attribute";
    else if (/^[{}()[\].,;:]$/.test(token)) kind = "punctuation";

    if (kind) {
      const span = document.createElement("span");
      span.className = `rillio-source-token-${kind}`;
      span.textContent = token;
      fragment.append(span);
    } else {
      fragment.append(document.createTextNode(token));
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < source.length) fragment.append(document.createTextNode(source.slice(lastIndex)));
  return fragment;
}

/** Adds an on-demand source viewer to a demo page without loading its source until opened. */
export function installSourceViewer(filename: string, loadSource: SourceLoader): void {
  if (typeof document === "undefined" || document.querySelector(".rillio-source-toggle")) return;
  installStyles();

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "rillio-source-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "rillio-source-panel");
  const mark = document.createElement("span");
  mark.className = "rillio-source-toggle-mark";
  mark.textContent = "</>";
  toggle.append(mark, document.createTextNode("View code"));

  const panel = document.createElement("section");
  panel.id = "rillio-source-panel";
  panel.className = "rillio-source-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "rillio-source-filename");
  panel.hidden = true;

  const toolbar = document.createElement("div");
  toolbar.className = "rillio-source-toolbar";
  const name = document.createElement("span");
  name.id = "rillio-source-filename";
  name.className = "rillio-source-filename";
  name.textContent = filename;
  const status = document.createElement("span");
  status.className = "rillio-source-status";
  status.setAttribute("role", "status");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  copy.disabled = true;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close source code viewer");
  toolbar.append(name, status, copy, close);

  const pre = document.createElement("pre");
  pre.className = "rillio-source-content";
  pre.tabIndex = 0;
  pre.setAttribute("aria-label", `${filename} source code`);
  const code = document.createElement("code");
  pre.append(code);
  panel.append(toolbar, pre);
  document.body.append(toggle, panel);

  let source: string | undefined;
  let pendingSource: Promise<string> | undefined;
  let previousBodyOverflow = "";

  const closePanel = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = previousBodyOverflow;
    document.removeEventListener("keydown", onKeyDown);
    toggle.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
    if (event.key === "Tab" && !panel.hidden) {
      const focusable: HTMLElement[] = [copy, close, pre].filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  toggle.addEventListener("click", async () => {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.focus();
    document.addEventListener("keydown", onKeyDown);

    if (source !== undefined) return;
    code.className = "rillio-source-loading";
    code.textContent = "Loading source…";
    status.textContent = "Loading";
    try {
      pendingSource ??= loadSource();
      source = await pendingSource;
      code.className = "";
      code.replaceChildren(highlightSource(source));
      status.textContent = `${source.split("\n").length} lines`;
      copy.disabled = false;
    } catch (error) {
      pendingSource = undefined;
      code.className = "rillio-source-error";
      code.textContent = "Could not load this source file.";
      status.textContent = error instanceof Error ? error.message : "Load failed";
    }
  });

  close.addEventListener("click", closePanel);
  copy.addEventListener("click", async () => {
    if (source === undefined) return;
    try {
      await navigator.clipboard.writeText(source);
      status.textContent = "Copied";
    } catch {
      status.textContent = "Clipboard unavailable";
    }
  });
}
