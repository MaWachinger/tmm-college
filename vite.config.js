import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base = "/<Repository-Name>/" fuer GitHub Pages im Unterordner.
// Bei einer eigenen Domain oder <org>.github.io als Repo-Name: base auf "/" setzen.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/tmm-college/",
});
