import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The app lives at the site root locally and under /photofinance/ on GitHub Pages.
// The deploy workflow sets VITE_BASE; everywhere else the default "/" applies.
export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, ".", "VITE_").VITE_BASE || "/";
  return {
  base,
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
        start_url: base,
        scope: base,
        icons: [{ src: `${base}icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      // Never cache API traffic: balances and availability must always be live.
      workbox: { navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//] },
    }),
  ],
};
});
