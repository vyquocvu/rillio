import { createPortal } from "zui";
import { useAppStore } from "../store.js";
import { AlertIcon, CheckIcon, CloseIcon } from "./Icons.js";

export function ToastContainer() {
  const toasts = useAppStore(state => state.toasts);
  const removeToast = useAppStore(state => state.removeToast);

  if (toasts.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "360px",
      }}
    >
      {toasts.map(toast => {
        const isSuccess = toast.type === "success";
        const isError = toast.type === "error";
        const isWarning = toast.type === "warning";

        const bg = isSuccess
          ? "#064e3b"
          : isError
          ? "#7f1d1d"
          : isWarning
          ? "#78350f"
          : "#1e293b";

        const border = isSuccess
          ? "#059669"
          : isError
          ? "#dc2626"
          : isWarning
          ? "#d97706"
          : "#3b82f6";

        return (
          <div
            key={toast.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 16px",
              backgroundColor: bg,
              color: "#f8fafc",
              borderRadius: "8px",
              border: `1px solid ${border}`,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
              fontSize: "13px",
              lineHeight: "1.4",
              animation: "slideIn 0.2s ease-out",
            }}
          >
            <div style={{ marginTop: "2px", color: border }}>
              {isSuccess ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontWeight: 600 }}>{toast.title}</strong>
              {toast.message && (
                <div style={{ color: "#cbd5e1", marginTop: "2px", fontSize: "12px" }}>
                  {toast.message}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px",
                borderRadius: "4px",
                display: "grid",
                placeItems: "center",
              }}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
