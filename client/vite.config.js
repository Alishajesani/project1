import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // IMPORTANT for GitHub Pages project sites:
  // https://alishajesani.github.io/project1/
  base: "/project1/",

  // Build output goes to repo root /docs (so Pages can serve it)
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});