import { createRoot } from "react-dom/client";
import { publicEnvironment } from "./config/publicEnvironment";
import { StartupFailure } from "./components/StartupFailure";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Application root is unavailable.");

const root = createRoot(rootElement);

if (!publicEnvironment.ok) {
  root.render(<StartupFailure configuration />);
} else {
  void import("./App.tsx")
    .then(({ default: App }) => root.render(<App />))
    .catch(() => root.render(<StartupFailure />));
}
