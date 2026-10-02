const env = import.meta.env ?? {};
const production = env.MODE === "production";
const apiUrl = production ? env.VITE_API_URL : (env.VITE_API_URL ?? "http://localhost:3000");
const wsUrl = production ? env.VITE_WS_URL : (env.VITE_WS_URL ?? "ws://localhost:3000/ws");

if (production && (!apiUrl || !wsUrl)) {
  throw new Error("Missing VITE_API_URL or VITE_WS_URL in production build.");
}

export const API_BASE = (apiUrl as string).replace(/\/$/, "");
export const WS_BASE = wsUrl as string;
