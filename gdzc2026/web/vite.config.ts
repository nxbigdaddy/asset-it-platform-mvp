import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 开发时前端走 5173，通过代理访问后端 3000；host:true 允许局域网 IP 访问本机 */
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
      "/uploads": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyDirBeforeWrite: true,
  },
});
