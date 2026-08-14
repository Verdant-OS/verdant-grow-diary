import { defineApp } from "convex/server";

import abuseGuard from "./components/abuse_guard/convex.config";

const app = defineApp();
app.use(abuseGuard, { name: "abuse_guard" });

export default app;
