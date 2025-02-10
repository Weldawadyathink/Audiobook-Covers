import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), deno()],
  server: {
    proxy: {
      "/trpc": "http://localhost:8000",
    },
    strictPort: true,
    port: 5137,
  },
});
