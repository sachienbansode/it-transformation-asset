import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installChangeGuard, setConfirmChanges } from "@/components/confirm-dialog";

// Ask in-app before every change sent to the server (Admin can switch it off in Settings)
installChangeGuard();
fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/config`, { credentials: "include" }).then(r => r.json()).then(c => setConfirmChanges(c.confirmChanges !== false)).catch(() => { /* keep on */ });

createRoot(document.getElementById("root")!).render(<App />);
