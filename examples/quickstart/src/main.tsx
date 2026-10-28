import { createRoot } from "@vyquocvu/rillio";
import { App } from "./App";
import "./style.css";

const rootElement = document.getElementById("app");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
