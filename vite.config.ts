import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("node_modules") === -1) {
            return undefined;
          }

          if (id.indexOf("recharts") !== -1) {
            return "recharts";
          }

          if (id.indexOf("framer-motion") !== -1) {
            return "framer-motion";
          }

          return undefined;
        },
      },
    },
  },
});
