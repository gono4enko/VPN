import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);
const basePath = process.env.BASE_PATH || "/";
const isReplit = !!process.env.REPL_ID;

async function getReplitPlugins() {
  if (!isReplit) return [];
  try {
    const plugins = [];
    try {
      const { default: runtimeErrorOverlay } = await import("@replit/vite-plugin-runtime-error-modal");
      plugins.push(runtimeErrorOverlay());
    } catch {}
    if (process.env.NODE_ENV !== "production") {
      try {
        const { cartographer } = await import("@replit/vite-plugin-cartographer");
        plugins.push(cartographer({ root: path.resolve(import.meta.dirname, "..") }));
      } catch {}
      try {
        const { devBanner } = await import("@replit/vite-plugin-dev-banner");
        plugins.push(devBanner());
      } catch {}
    }
    return plugins;
  } catch {
    return [];
  }
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(await getReplitPlugins()),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
