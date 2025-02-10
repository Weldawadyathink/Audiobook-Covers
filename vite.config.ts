import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact() as any,
    deno(),
  ],
  server: {
    proxy: {
      "/trpc": "http://localhost:8000",
    },
    strictPort: true,
    port: 5137,
  },
});
