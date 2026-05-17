import { createRoot } from "react-dom/client";
import { assertSupabaseEnv } from "@/lib/verifyEnv";
import App from "./App.tsx";
import "./index.css";

// Validate required environment variables before the app mounts
assertSupabaseEnv();

createRoot(document.getElementById("root")!).render(<App />);
