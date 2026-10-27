import { createRoot, useState, useEffect } from "../src/index";
import { STUDIO_PRESETS, getDefaultPropsForPreset, StudioPreset } from "./studio-presets";
import { captureDOMSnapshot, DOMNodeSnapshot, formatTelemetryLog, PatchTelemetryEvent } from "./studio-telemetry";
import { runInBrowserBenchmark, BenchmarkRunResult } from "./studio-benchmark";
import "./studio.css";

function CounterPreview({ props }: { props: Record<string, any> }) {
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
      <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#38bdf8" }}>
        {count}
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          className="studio-btn"
          onClick={() => setCount((c: number) => c + (Number(props.step) || 1))}
        >
          {props.label || "Clicks"} (+{props.step || 1})
        </button>
        {props.showReset && (
          <button
            className="studio-btn studio-btn-secondary"
            onClick={() => setCount(0)}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function KeyedListPreview({ props }: { props: Record<string, any> }) {
  const [items, setItems] = useState(() =>
    Array.from({ length: Number(props.initialCount) || 3 }, (_, i) => ({
      id: i + 1,
      title: `Task #${i + 1}`,
    }))
  );

  const addItem = () => {
    const nextId = Date.now();
    setItems((list: any[]) => [...list, { id: nextId, title: `Task #${nextId.toString().slice(-4)}` }]);
  };

  const removeItem = (id: number) => {
    setItems((list: any[]) => list.filter((item) => item.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "280px" }}>
      <button className="studio-btn" onClick={addItem}>
        + Add Addressable Item
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((item: any) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              background: "#1e293b",
              borderRadius: "6px",
              border: "1px solid #334155",
            }}
          >
            <span style={{ fontSize: "0.875rem" }}>{item.title}</span>
            <button
              onClick={() => removeItem(item.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "#ef4444",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusCardPreview({ props }: { props: Record<string, any> }) {
  const [status, setStatus] = useState(props.status || "online");

  useEffect(() => {
    setStatus(props.status || "online");
  }, [props.status]);

  const color =
    status === "online" ? "#10b981" : status === "degraded" ? "#f59e0b" : "#ef4444";

  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "8px",
        background: "#0f172a",
        border: "1px solid #334155",
        minWidth: "260px",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "8px" }}>
        {props.title || "Status Card"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: color,
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: "0.875rem", textTransform: "capitalize", color: "#e2e8f0" }}>
          {status}
        </span>
      </div>
      {props.showTimestamp && (
        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "12px" }}>
          Active Addressable Node Verified
        </div>
      )}
    </div>
  );
}

function DOMNodeView({ node }: { node: DOMNodeSnapshot }) {
  return (
    <div className="tree-node">
      &lt;<span className="tree-tag">{node.tag}</span>
      {node.key ? <span className="tree-key">key="{node.key}"</span> : null}
      &gt;
      {node.text ? <span className="tree-text">"{node.text}"</span> : null}
      {node.children && node.children.length > 0 ? (
        <div style={{ marginLeft: "6px" }}>
          {node.children.map((child) => (
            <DOMNodeView key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StudioApp() {
  const [selectedPreset, setSelectedPreset] = useState<StudioPreset>(STUDIO_PRESETS[0]);
  const [propsState, setPropsState] = useState<Record<string, any>>(() =>
    getDefaultPropsForPreset(STUDIO_PRESETS[0])
  );
  const [renderCount, setRenderCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"tree" | "code" | "logs" | "bench">("tree");
  const [benchCount, setBenchCount] = useState(500);
  const [benchResults, setBenchResults] = useState<BenchmarkRunResult[] | null>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] MOUNT: <Root> — Flat index initialized`,
    `[${new Date().toLocaleTimeString()}] PRESET: Loaded ${STUDIO_PRESETS[0].name}`,
  ]);
  const [domSnapshot, setDomSnapshot] = useState<DOMNodeSnapshot | null>(null);

  useEffect(() => {
    const previewEl = document.querySelector(".studio-preview-box");
    if (previewEl) {
      setDomSnapshot(captureDOMSnapshot(previewEl));
    }
  }, [selectedPreset, propsState, renderCount]);

  const selectPreset = (preset: StudioPreset) => {
    setSelectedPreset(preset);
    setPropsState(getDefaultPropsForPreset(preset));
    setRenderCount((c: number) => c + 1);
    setLogs((prev: string[]) => [
      formatTelemetryLog({
        id: Math.random().toString(),
        timestamp: Date.now(),
        type: "mount",
        targetTag: "Preset",
        detail: `Switched preset to ${preset.name}`,
      }),
      ...prev.slice(0, 8),
    ]);
  };

  const executeBenchmark = () => {
    setBenchRunning(true);
    setTimeout(() => {
      const res = runInBrowserBenchmark(benchCount);
      setBenchResults(res);
      setBenchRunning(false);
      setLogs((prev: string[]) => [
        formatTelemetryLog({
          id: Math.random().toString(),
          timestamp: Date.now(),
          type: "update",
          targetTag: "Benchmark",
          detail: `Executed ${benchCount} node cycle in ${res.reduce((acc, r) => acc + r.durationMs, 0).toFixed(2)}ms`,
        }),
        ...prev.slice(0, 8),
      ]);
    }, 20);
  };

  const updateProp = (name: string, value: any) => {
    setPropsState((prev: Record<string, any>) => ({
      ...prev,
      [name]: value,
    }));
    setRenderCount((c: number) => c + 1);
    setLogs((prev: string[]) => [
      formatTelemetryLog({
        id: Math.random().toString(),
        timestamp: Date.now(),
        type: "update",
        targetTag: name,
        detail: `Updated prop "${name}" -> ${JSON.stringify(value)}`,
      }),
      ...prev.slice(0, 8),
    ]);
  };

  const codeSnippet = selectedPreset.generateCode(propsState);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="studio-container">
      <header className="studio-header">
        <div className="studio-header-title">
          <h1>Rillio Studio</h1>
          <span className="studio-badge">Addressable DOM Workbench</span>
        </div>
        <div className="studio-actions">
          <a
            href="/"
            className="studio-btn studio-btn-secondary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            ← Home
          </a>
          <button className="studio-btn" onClick={handleCopy}>
            {copied ? "✓ Copied!" : "Copy TSX Code"}
          </button>
        </div>
      </header>

      <main className="studio-main">
        {/* Left: Preset & Prop Configuration */}
        <aside className="studio-sidebar">
          <div>
            <div className="studio-section-title">Presets</div>
            <div className="preset-list">
              {STUDIO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`preset-btn ${selectedPreset.id === preset.id ? "active" : ""}`}
                  onClick={() => selectPreset(preset)}
                >
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-desc">{preset.category}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="studio-section-title">Component Props</div>
            {selectedPreset.props.map((propDef) => (
              <div key={propDef.name} className="prop-control">
                <label className="prop-label">{propDef.name}</label>
                {propDef.type === "text" && (
                  <input
                    type="text"
                    className="prop-input"
                    value={propsState[propDef.name] ?? ""}
                    onInput={(e: any) => updateProp(propDef.name, e.target.value)}
                  />
                )}
                {propDef.type === "number" && (
                  <input
                    type="number"
                    className="prop-input"
                    value={propsState[propDef.name] ?? 0}
                    onInput={(e: any) => updateProp(propDef.name, Number(e.target.value))}
                  />
                )}
                {propDef.type === "boolean" && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(propsState[propDef.name])}
                      onChange={(e: any) => updateProp(propDef.name, e.target.checked)}
                    />
                    <span style={{ fontSize: "0.8125rem", color: "#cbd5e1" }}>Enabled</span>
                  </div>
                )}
                {propDef.type === "select" && (
                  <select
                    className="prop-input"
                    value={propsState[propDef.name]}
                    onChange={(e: any) => updateProp(propDef.name, e.target.value)}
                  >
                    {propDef.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Center: Live Interactive Sandbox Preview */}
        <section className="studio-canvas">
          <div className="studio-preview-box">
            {selectedPreset.id === "counter" && <CounterPreview props={propsState} />}
            {selectedPreset.id === "keyed-list" && <KeyedListPreview props={propsState} />}
            {selectedPreset.id === "reactive-card" && <StatusCardPreview props={propsState} />}
          </div>
        </section>

        {/* Right: Telemetry & Generated Code */}
        <aside className="studio-inspector">
          <div>
            <div className="studio-section-title">Telemetry & Diagnostics</div>
            <div className="telemetry-card">
              <div className="telemetry-row">
                <span className="telemetry-label">Active Preset:</span>
                <span className="telemetry-val">{selectedPreset.name}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-label">Engine Architecture:</span>
                <span className="telemetry-val">Flat Index / Addressable</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-label">Studio Reconciles:</span>
                <span className="telemetry-val">{renderCount}</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-label">Reactivity Mode:</span>
                <span className="telemetry-val" style={{ color: "#10b981" }}>Direct Patch</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "260px" }}>
            <div className="tabs-nav">
              <button
                className={`tab-btn ${activeTab === "tree" ? "active" : ""}`}
                onClick={() => setActiveTab("tree")}
              >
                DOM Tree
              </button>
              <button
                className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
                onClick={() => setActiveTab("code")}
              >
                TSX Code
              </button>
              <button
                className={`tab-btn ${activeTab === "logs" ? "active" : ""}`}
                onClick={() => setActiveTab("logs")}
              >
                Patch Logs
              </button>
              <button
                className={`tab-btn ${activeTab === "bench" ? "active" : ""}`}
                onClick={() => setActiveTab("bench")}
              >
                Benchmark
              </button>
            </div>

            {activeTab === "tree" && (
              <div className="code-viewer" style={{ maxHeight: "280px" }}>
                {domSnapshot ? (
                  <DOMNodeView node={domSnapshot} />
                ) : (
                  <div style={{ color: "#94a3b8" }}>No active DOM snapshot</div>
                )}
              </div>
            )}

            {activeTab === "code" && (
              <div className="code-viewer" style={{ maxHeight: "280px" }}>
                {codeSnippet}
              </div>
            )}

            {activeTab === "logs" && (
              <div className="log-list" style={{ maxHeight: "280px" }}>
                {logs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            )}

            {activeTab === "bench" && (
              <div className="telemetry-card" style={{ maxHeight: "280px", overflowY: "auto" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Nodes:</label>
                  <select
                    className="prop-input"
                    style={{ padding: "3px 6px" }}
                    value={benchCount}
                    onChange={(e: any) => setBenchCount(Number(e.target.value))}
                  >
                    <option value={100}>100 nodes</option>
                    <option value={500}>500 nodes</option>
                    <option value={1000}>1,000 nodes</option>
                  </select>
                  <button
                    className="studio-btn"
                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                    disabled={benchRunning}
                    onClick={executeBenchmark}
                  >
                    {benchRunning ? "Running..." : "Run Test"}
                  </button>
                </div>

                {benchResults && (
                  <div className="bench-results">
                    {benchResults.map((r, idx) => (
                      <div key={idx} className="telemetry-row" style={{ alignItems: "center" }}>
                        <span className={`bench-badge bench-badge-${r.operation}`}>
                          {r.operation}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#e2e8f0" }}>
                          {r.durationMs}ms ({r.opsPerSecond.toLocaleString()} op/s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

const mountNode = document.getElementById("app");
if (mountNode) {
  createRoot(mountNode).render(<StudioApp />);
}
