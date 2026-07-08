import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";

// Global security measure: disable console logs in production/non-localhost
if (import.meta.env.PROD || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
  // Note: console.error is preserved for critical troubleshooting
}

createRoot(document.getElementById("root")!).render(<App />);
