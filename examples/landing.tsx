import { createRoot, useState } from "rillio";
import { installSourceViewer } from "./source-viewer.js";

type CodeMode = "jsx" | "reactive";

const codeExamples: Record<CodeMode, { label: string; code: string }> = {
  jsx: {
    label: "JSX runtime",
    code: `import { createRoot, useState } from "rillio";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(n => n + 1)}>
      Count: {count}
    </button>
  );
}`
  },
  reactive: {
    label: "Reactive DOM",
    code: `import { createStore } from "rillio/reactive";
import { select, mount } from "rillio/dom";

const count = createStore(0);

mount(() => (
  <button onClick={() => count.set(n => n + 1)}>
    {select(count, value => value)}
  </button>
), document.getElementById("app")!);`
  }
};

const runtimeStages = [
  { number: "01", title: "Author", detail: "JSX or reactive bindings" },
  { number: "02", title: "Plan", detail: "Addressable operations" },
  { number: "03", title: "Validate", detail: "One patch transaction" },
  { number: "04", title: "Commit", detail: "PatchEngine updates the DOM" }
];

const features = [
  {
    number: "01",
    title: "An address for every node",
    detail: "The Flat Index owns node identity, parent and sibling links, and component ownership."
  },
  {
    number: "02",
    title: "One DOM write boundary",
    detail: "Both rendering surfaces send changes through the same transactional PatchEngine."
  },
  {
    number: "03",
    title: "Choose how you compose",
    detail: "Use component state with JSX, or bind reactive data into a mounted DOM tree."
  }
];

const showcases = [
  {
    tag: "DASHBOARD",
    title: "Rillio Studio",
    detail: "A responsive workspace with analytics, team views, and editable members.",
    href: "/admin.html",
    className: "showcase-card--studio"
  },
  {
    tag: "APP SHOWCASE",
    title: "TaskFlow",
    detail: "A project workspace that brings stores, portals, and error recovery together.",
    href: "/realworld.html",
    className: "showcase-card--taskflow"
  },
  {
    tag: "INTERACTIVE LABS",
    title: "Explore the runtime",
    detail: "Open small demos for selectors, keyed updates, render scopes, and benchmarks.",
    href: "/demos.html",
    className: "showcase-card--labs"
  }
];

function CodeExample() {
  const [mode, setMode] = useState<CodeMode>("jsx");
  const example = codeExamples[mode];

  return <div class="code-example">
    <div class="code-example__tabs" role="tablist" aria-label="Runtime code examples">
      {(Object.keys(codeExamples) as CodeMode[]).map(key => <button
        key={key}
        type="button"
        role="tab"
        aria-selected={mode === key}
        class={`code-example__tab ${mode === key ? "code-example__tab--active" : ""}`}
        onClick={() => setMode(key)}
      >{codeExamples[key].label}</button>)}
    </div>
    <pre class="code-example__source" aria-label={example.label}><code>{example.code}</code></pre>
  </div>;
}

function CounterPreview() {
  const [count, setCount] = useState(0);

  return <div class="counter-preview">
    <div class="counter-preview__copy">
      <span class="counter-preview__eyebrow">LIVE PREVIEW</span>
      <strong>Rendered with Rillio</strong>
      <span class="counter-preview__hint">Click to update this component.</span>
    </div>
    <div class="counter-preview__control">
      <output aria-live="polite" class="counter-preview__value">{count}</output>
      <button class="counter-preview__button" onClick={() => setCount(value => value + 1)}>Increment</button>
    </div>
  </div>;
}

function LandingPage() {
  return <>
    <div class="landing-page">
      <header class="site-header shell">
        <a class="brand" href="/" aria-label="Rillio home">
          <span class="brand__mark">r</span>
          <span class="brand__name">rillio<span>.</span></span>
        </a>
        <nav class="site-nav" aria-label="Main navigation">
          <a href="#runtime">Runtime</a>
          <a href="#examples">Examples</a>
          <a href="https://github.com/vyquocvu/rillio/tree/main/docs" target="_blank" rel="noreferrer">Docs</a>
        </nav>
        <a class="header-link" href="https://github.com/vyquocvu/rillio" target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main>
        <section class="hero shell" aria-labelledby="hero-title">
          <div class="hero__copy">
            <span class="hero__badge">An experimental UI runtime</span>
            <h1 id="hero-title">A direct path<br />from <span>UI to DOM.</span></h1>
            <p class="hero__description">Compose with JSX or reactive bindings. Rillio tracks rendered nodes in a Flat Index and applies updates through one transactional patch engine.</p>
            <div class="hero__actions">
              <a class="action-link action-link--primary" href="#examples">Explore examples <span aria-hidden="true">→</span></a>
              <a class="action-link action-link--secondary" href="https://github.com/vyquocvu/rillio/blob/main/docs/API.md" target="_blank" rel="noreferrer">Read the API</a>
            </div>
            <div class="hero__notes" aria-label="Runtime highlights">
              <span><i aria-hidden="true" /> Addressable DOM</span>
              <span><i aria-hidden="true" /> Shared update path</span>
              <span><i aria-hidden="true" /> Typed JSX</span>
            </div>
          </div>

          <div class="hero__visual">
            <div class="visual-glow" aria-hidden="true" />
            <section class="runtime-window" aria-label="Interactive Rillio code preview">
              <div class="runtime-window__bar">
                <div class="window-dots" aria-hidden="true"><i /><i /><i /></div>
                <span class="runtime-window__file">counter.tsx</span>
                <span class="runtime-window__runtime">Rillio RUNTIME</span>
              </div>
              <CodeExample />
              <CounterPreview />
            </section>
            <div class="visual-caption"><span class="visual-caption__dot" /> One runtime, two authoring styles</div>
          </div>
        </section>

        <section class="runtime-section" id="runtime" aria-labelledby="runtime-title">
          <div class="shell">
            <div class="section-heading">
              <div>
                <span class="section-kicker">HOW IT WORKS</span>
                <h2 id="runtime-title">Familiar to author.<br /><span>Explicit under the hood.</span></h2>
              </div>
              <p>Both APIs converge on the same indexed identity and DOM mutation boundary.</p>
            </div>

            <ol class="runtime-flow" aria-label="Rillio rendering flow">
              {runtimeStages.map(stage => <li class="runtime-flow__step" key={stage.number}>
                <span class="runtime-flow__number">{stage.number}</span>
                <strong>{stage.title}</strong>
                <span>{stage.detail}</span>
              </li>)}
            </ol>

            <div class="feature-grid">
              {features.map(feature => <article class="feature-card" key={feature.number}>
                <span class="feature-card__number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.detail}</p>
              </article>)}
            </div>
          </div>
        </section>

        <section class="showcase-section shell" id="examples" aria-labelledby="showcase-title">
          <div class="section-heading section-heading--showcase">
            <div>
              <span class="section-kicker">MADE WITH Rillio</span>
              <h2 id="showcase-title">See the runtime<br /><span>in a real interface.</span></h2>
            </div>
            <a class="text-link" href="/demos.html">Browse all demos <span aria-hidden="true">→</span></a>
          </div>
          <div class="showcase-grid">
            {showcases.map(showcase => <a class={`showcase-card ${showcase.className}`} href={showcase.href} key={showcase.title}>
              <div class="showcase-card__top"><span class="showcase-card__mark">z</span><span class="showcase-card__arrow" aria-hidden="true">↗</span></div>
              <span class="showcase-card__tag">{showcase.tag}</span>
              <h3>{showcase.title}</h3>
              <p>{showcase.detail}</p>
            </a>)}
          </div>
        </section>

        <section class="closing-section shell" aria-labelledby="closing-title">
          <div class="closing-card">
            <div>
              <span class="closing-card__kicker">START EXPLORING</span>
              <h2 id="closing-title">Build it. Inspect it.<br />Understand every update.</h2>
            </div>
            <div class="closing-card__actions">
              <a class="action-link action-link--light" href="https://github.com/vyquocvu/rillio/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">Read the architecture guide <span aria-hidden="true">→</span></a>
              <a class="closing-card__github" href="https://github.com/vyquocvu/rillio" target="_blank" rel="noreferrer">View source on GitHub ↗</a>
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer shell">
        <a class="brand brand--footer" href="/" aria-label="Rillio home"><span class="brand__mark">r</span><span class="brand__name">rillio<span>.</span></span></a>
        <p>Experimental software. JSX syntax is familiar; runtime semantics are Rillio-owned.</p>
        <nav aria-label="Footer navigation">
          <a href="https://github.com/vyquocvu/rillio/tree/main/docs" target="_blank" rel="noreferrer">Docs</a>
          <a href="/demos.html">Demos</a>
          <a href="https://github.com/vyquocvu/rillio/blob/main/docs/STATUS.md" target="_blank" rel="noreferrer">Status</a>
        </nav>
      </footer>
    </div>
  </>;
}

createRoot(document.getElementById("app")!).render(<LandingPage />);
installSourceViewer("landing.tsx", () => import("./landing.tsx?raw").then(module => module.default));
