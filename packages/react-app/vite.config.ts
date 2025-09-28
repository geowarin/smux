import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  base: "",
  plugins: [react()],
  // hack to not have to build the library in dev mode
  resolve: {
    alias: {
      smux: path.resolve(__dirname, "../../packages/smux/src/index.ts"),
    },
  },
});
