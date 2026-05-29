import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PracticeWebApp } from "./PracticeWebApp";
import "../styles/globals.css";
import "./practice-web.css";

// Standalone mobile practice app — no Tauri, no sql.js. Reuses the desktop design
// tokens/themes (via globals.css) and the portable scheduling + RichText logic.
document.documentElement.dataset.theme = "warm-dark";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PracticeWebApp />
  </StrictMode>
);
