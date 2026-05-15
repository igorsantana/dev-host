import type { Config } from "tailwindcss";
import preset from "@cyberdeck/ui/tailwind-preset";

export default {
  presets: [preset],
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@cyberdeck/ui/dist/**/*.js",
  ],
} satisfies Config;
