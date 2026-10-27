export interface StudioPresetPropDefinition {
  name: string;
  type: "text" | "number" | "boolean" | "select";
  defaultValue: any;
  options?: string[];
  description: string;
}

export interface StudioPreset {
  id: string;
  name: string;
  description: string;
  category: "Basics" | "Reactivity" | "Lists & Keying" | "Complex UI";
  props: StudioPresetPropDefinition[];
  generateCode: (props: Record<string, any>) => string;
}

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: "counter",
    name: "Interactive Counter",
    description: "Addressable reactive button tracking click counts and step sizes.",
    category: "Basics",
    props: [
      { name: "label", type: "text", defaultValue: "Clicks", description: "Label prefix displayed on button" },
      { name: "step", type: "number", defaultValue: 1, description: "Increment amount per click" },
      { name: "showReset", type: "boolean", defaultValue: true, description: "Display a reset counter button" },
    ],
    generateCode: (props) => `import { createRoot, useState } from "@vyquocvu/rillio";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      <button 
        style={{ padding: "8px 16px", borderRadius: "6px", background: "#6366f1", color: "#fff", border: "none", cursor: "pointer" }}
        onClick={() => setCount(c => c + ${props.step || 1})}
      >
        ${props.label || "Clicks"}: {count}
      </button>
      ${props.showReset ? `
      <button 
        style={{ padding: "8px 12px", borderRadius: "6px", background: "#475569", color: "#fff", border: "none", cursor: "pointer" }}
        onClick={() => setCount(0)}
      >
        Reset
      </button>` : ""}
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Counter />);`,
  },
  {
    id: "keyed-list",
    name: "Keyed Task List",
    description: "Fine-grained addressable DOM reordering and removals via LIS algorithm.",
    category: "Lists & Keying",
    props: [
      { name: "initialCount", type: "number", defaultValue: 3, description: "Initial number of items" },
      { name: "badgeColor", type: "select", defaultValue: "indigo", options: ["indigo", "emerald", "amber"], description: "Item badge highlight color" },
    ],
    generateCode: (props) => `import { createRoot, useState } from "@vyquocvu/rillio";

export function KeyedList() {
  const [items, setItems] = useState([
    ${Array.from({ length: props.initialCount || 3 }, (_, i) => `{ id: ${i + 1}, title: "Item ${i + 1}" }`).join(",\n    ")}
  ]);

  const addItem = () => {
    const nextId = Date.now();
    setItems(list => [...list, { id: nextId, title: "Item #" + nextId.toString().slice(-4) }]);
  };

  const removeItem = (id: number) => {
    setItems(list => list.filter(item => item.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <button onClick={addItem} style={{ alignSelf: "flex-start", padding: "6px 12px", background: "#6366f1", color: "#fff", borderRadius: "4px" }}>
        + Add Item
      </button>
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
        {items.map(item => (
          <li key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#1e293b", margin: "4px 0", borderRadius: "4px", color: "#f8fafc" }}>
            <span>{item.title}</span>
            <button onClick={() => removeItem(item.id)} style={{ color: "#ef4444", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<KeyedList />);`,
  },
  {
    id: "reactive-card",
    name: "Interactive Status Card",
    description: "Configurable status badge with dynamic themes and real-time state binding.",
    category: "Complex UI",
    props: [
      { name: "title", type: "text", defaultValue: "System Operational", description: "Card header title" },
      { name: "status", type: "select", defaultValue: "online", options: ["online", "degraded", "maintenance"], description: "System status flag" },
      { name: "showTimestamp", type: "boolean", defaultValue: true, description: "Show current time indicator" },
    ],
    generateCode: (props) => `import { createRoot, useState } from "@vyquocvu/rillio";

export function StatusCard() {
  const [status, setStatus] = useState("${props.status || "online"}");

  return (
    <div style={{ padding: "16px", borderRadius: "8px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", maxWidth: "340px" }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>${props.title || "Status Card"}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ 
          display: "inline-block", 
          width: "10px", 
          height: "10px", 
          borderRadius: "50%", 
          background: status === "online" ? "#10b981" : status === "degraded" ? "#f59e0b" : "#ef4444" 
        }} />
        <span style={{ textTransform: "capitalize", fontSize: "14px" }}>{status}</span>
      </div>
      ${props.showTimestamp ? `<p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>Verified Live via Rillio Engine</p>` : ""}
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<StatusCard />);`,
  }
];

export function getDefaultPropsForPreset(preset: StudioPreset): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const prop of preset.props) {
    defaults[prop.name] = prop.defaultValue;
  }
  return defaults;
}
