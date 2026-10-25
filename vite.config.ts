import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "PhotoFinance",
        short_name: "PhotoFinance",
        description: "Finanzen, Jobs und Equipment für Fotografen",
        lang: "de",
        theme_color: "#1f2937",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      // Never cache API traffic: balances and availability must always be live.
      workbox: { navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//] },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
