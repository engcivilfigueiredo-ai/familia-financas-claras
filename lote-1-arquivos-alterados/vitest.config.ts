import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config separada do vite.config.ts de propósito: os testes cobrem só código puro
// (src/lib), sem precisar subir o plugin do TanStack Start / Nitro.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
