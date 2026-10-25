import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the app build does not depend on
// Vitest's type augmentation of Vite's config. The unit tests only cover
// plain TypeScript helpers, so they need no plugins.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
