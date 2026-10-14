import { useState, ErrorBoundary } from "zui";
import { api } from "../api.js";
import { useAppStore } from "../store.js";
import { AlertIcon, CheckIcon, MoonIcon, SunIcon } from "./Icons.js";

interface SettingsViewProps {
  onResetDatabase: () => void;
}

let simulatedErrorTriggered = false;

function FragileSubtree() {
  if (simulatedErrorTriggered) {
    throw new Error("Simulated rendering exception caught by ZUI ErrorBoundary!");
  }

  return (
    <div
      style={{
        padding: "12px",
        backgroundColor: "#064e3b",
        border: "1px solid #059669",
        borderRadius: "6px",
        color: "#6ee7b7",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <CheckIcon size={16} />
      <span>Protected subtree is operating normally with zero render exceptions.</span>
    </div>
  );
}

export function SettingsView({ onResetDatabase }: SettingsViewProps) {
  const theme = useAppStore(state => state.theme);
  const toggleTheme = useAppStore(state => state.toggleTheme);
  const addToast = useAppStore(state => state.addToast);
  const toggleDevTools = useAppStore(state => state.toggleDevTools);

  const [, forceUpdate] = useState(0);
  const [resetting, setResetting] = useState(false);

  const handleTriggerError = () => {
    simulatedErrorTriggered = true;
    forceUpdate(c => c + 1);
  };

  const handleRecover = (reset: () => void) => {
    simulatedErrorTriggered = false;
    reset();
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      await api.resetDatabase();
      onResetDatabase();
      addToast({
        type: "success",
        title: "Workspace reset",
        message: "Sample database restored to clean initial state.",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ padding: "24px", height: "100%", overflowY: "auto", boxSizing: "border-box", maxWidth: "800px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700, color: "var(--text-main, #f8fafc)" }}>
        Workspace Settings & Diagnostics
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#94a3b8" }}>
        Configure preferences, test runtime resiliency, and inspect Flat Index telemetry.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Appearance Section */}
        <div
          style={{
            backgroundColor: "#0f172a",
            borderRadius: "10px",
            border: "1px solid #1e293b",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
            Appearance & Theme
          </h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#cbd5e1", fontWeight: 500 }}>
                Interface Color Scheme
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Toggle between dark mode (default) and clean high-contrast light mode.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>

        {/* Resiliency & ErrorBoundary Showcase */}
        <div
          style={{
            backgroundColor: "#0f172a",
            borderRadius: "10px",
            border: "1px solid #1e293b",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
            ZUI ErrorBoundary & Transaction Savepoints
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
            In ZUI, <code>ErrorBoundary</code> uses transactional savepoints (<code>savepoint()</code> / <code>rollbackTo()</code>).
            When a child subtree throws during rendering, only the failed sub-transaction is rolled back while the parent boundary remains stable.
          </p>

          <div style={{ marginBottom: "16px" }}>
            <ErrorBoundary
              fallback={(err, reset) => (
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#450a0a",
                    border: "1px solid #dc2626",
                    borderRadius: "8px",
                    color: "#fecaca",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, marginBottom: "4px" }}>
                    <AlertIcon size={16} />
                    <span>ErrorBoundary caught render exception:</span>
                  </div>
                  <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#fca5a5", marginBottom: "12px" }}>
                    {err.message}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRecover(reset)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#dc2626",
                      border: "none",
                      borderRadius: "4px",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Recover Subtree
                  </button>
                </div>
              )}
            >
              <FragileSubtree />
            </ErrorBoundary>
          </div>

          <button
            type="button"
            onClick={handleTriggerError}
            style={{
              padding: "7px 14px",
              backgroundColor: simulatedErrorTriggered ? "#334155" : "#7f1d1d",
              border: "1px solid #dc2626",
              borderRadius: "6px",
              color: "#fecaca",
              cursor: simulatedErrorTriggered ? "default" : "pointer",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Trigger Simulated Render Error
          </button>
        </div>

        {/* Database & Data Management */}
        <div
          style={{
            backgroundColor: "#0f172a",
            borderRadius: "10px",
            border: "1px solid #1e293b",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
            Workspace Data Management
          </h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#cbd5e1", fontWeight: 500 }}>
                Reset Mock Database
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Clear local storage modifications and reset back to initial seed data.
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetData}
              disabled={resetting}
              style={{
                padding: "8px 14px",
                backgroundColor: "#334155",
                border: "1px solid #475569",
                borderRadius: "6px",
                color: "#f8fafc",
                cursor: resetting ? "not-allowed" : "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {resetting ? "Resetting..." : "Reset to Initial Seed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
