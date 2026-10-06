import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { paletteVariables, solidBackgrounds, themedColors, whiteSurface } from "./tailwind.palette";

const palette = paletteVariables();

const config: Config = {
  // Giao diện tối: thêm lớp "dark" lên <html> (xem src/lib/theme.tsx). Màu đã đảo qua biến CSS nên hầu hết giao diện không cần lớp dark:.
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: themedColors(),
      backgroundColor: { ...solidBackgrounds(), white: whiteSurface },
      gradientColorStops: { ...solidBackgrounds(), white: whiteSurface },
      ringColor: { white: whiteSurface },
      ringOffsetColor: { white: whiteSurface },
      fontFamily: {
        sans: ["\"Be Vietnam Pro\"", "system-ui", "-apple-system", "\"Segoe UI\"", "Roboto", "sans-serif"],
        mono: ["\"JetBrains Mono\"", "ui-monospace", "monospace"],
      },
      spacing: {
        "space-2xs": "0.25rem",
        "space-xs": "0.375rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem",
        "space-2xl": "2rem",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.2s ease-out forwards",
        fadeSlideUp: "fadeSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        scaleIn: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        slideInRight: "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": palette.light,
        // @media screen: khi in luôn dùng bảng màu sáng cho đỡ tốn mực
        "@media screen": { "html.dark": { ...palette.dark, colorScheme: "dark" } },
      });
    }),
  ],
};
export default config;
