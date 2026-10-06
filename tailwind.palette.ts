// Bảng màu hai giao diện (sáng / tối) cho Tailwind.
//
// Ứng dụng viết màu trực tiếp bằng lớp Tailwind mặc định (text-gray-500, bg-purple-50, border-rose-200…) cùng các token
// riêng (surface, primary…). Thay vì sửa hàng nghìn chỗ, mọi màu này trỏ tới BIẾN CSS dạng "r g b"; `:root` giữ giá trị
// giao diện sáng (đúng như trước đây), `.dark` đảo sang bảng tối. Nhờ `rgb(var(--x) / <alpha-value>)` các lớp có độ mờ
// (bg-purple-50/60) vẫn chạy.
//
// Quy ước đảo (cho các bảng màu sắc — rose, emerald, amber…):
//   • Sắc nhạt 50–300 (nền, viền dịu)  → pha loãng màu gốc vào nền thẻ tối (nền thẻ ≈ #1c1b2a).
//   • Sắc đậm 600–900 dùng làm CHỮ     → chuyển thành sắc sáng để đọc được trên nền tối.
//   • Nền đặc từ 400 trở lên (bg-X-600 + chữ trắng: nút, huy hiệu, dải màu) GIỮ NGUYÊN giá trị gốc — chỉ áp cho
//     backgroundColor/gradientColorStops (xem `solidBackgrounds`), nên nút vẫn chữ trắng trên nền đậm ở cả hai giao diện.
import colors from "tailwindcss/colors";

type Shade = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950";
export const SHADES: Shade[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

type Rgb = [number, number, number];
const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const triplet = (c: Rgb) => `${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Nền thẻ ở giao diện tối (cũng là màu mà `bg-white` đổi sang — xem globals.css). */
export const DARK_CARD: Rgb = hexToRgb("#1c1b2a");

// Các bảng màu của Tailwind đang được dùng trong ứng dụng.
const HUES = ["purple", "violet", "indigo", "blue", "sky", "cyan", "teal", "emerald", "green", "yellow", "amber", "orange", "rose", "pink", "red"] as const;
const NEUTRALS = ["gray", "slate", "stone"] as const;

type Scale = Record<Shade, string>;
const scaleOf = (name: string): Scale => (colors as unknown as Record<string, Scale>)[name];

// Thang xám tối (hơi ngả tím để hợp màu thương hiệu): 50–200 là nền/viền, 400+ là chữ.
const DARK_NEUTRAL: Record<Shade, string> = {
  "50": "#201f30",
  "100": "#272640",
  "200": "#32314a",
  "300": "#45435f",
  "400": "#9593b3", // đạt 4,5:1 trên nền thẻ tối (#1c1b2a) và nền thẻ nhạt (#232234)
  "500": "#9d9bb7",
  "600": "#b7b5cd",
  "700": "#d0cfe2",
  "800": "#e4e3f0",
  "900": "#f3f2f9",
  "950": "#faf9fd",
};

// Giao diện sáng: chữ xám 400/500 của Tailwind (#9ca3af, #6b7280) không đạt tỉ lệ tương phản WCAG AA (4,5:1) trên nền trắng/nền
// xám nhạt/nền tím nhạt (#f2f3ff) — đậm hơn một nấc. Chỉ ảnh hưởng chữ/viền/biểu tượng: nền đặc (bg-gray-400…) vẫn dùng giá trị gốc.
const LIGHT_NEUTRAL_OVERRIDE: Partial<Record<(typeof NEUTRALS)[number], Partial<Record<Shade, string>>>> = {
  gray: { "400": "#656c7a", "500": "#555e6d" },
};

// Chữ đỏ/cam đậm hơn một nấc ở giao diện sáng (rose-600 #e11d48 và amber-600 #d97706 chỉ đạt 3,2–4,4:1 trên nền trắng/nhạt).
const LIGHT_HUE_TEXT_OVERRIDE: Record<string, Partial<Record<Shade, string>>> = {
  rose: { "600": "#d4143f" },
  amber: { "600": "#b45309" },
  orange: { "600": "#c2410c" },
};

function darkHue(name: string): Record<Shade, Rgb> {
  const p = scaleOf(name);
  const base = hexToRgb(p["500"]);
  const px = (s: Shade) => hexToRgb(p[s]);
  return {
    "50": mix(DARK_CARD, base, 0.1),
    "100": mix(DARK_CARD, base, 0.16),
    "200": mix(DARK_CARD, base, 0.26),
    "300": mix(DARK_CARD, base, 0.42),
    "400": px("400"),
    "500": px("400"),
    "600": px("400"),
    "700": px("300"),
    "800": px("200"),
    "900": px("100"),
    "950": px("50"),
  };
}

/** Token riêng của ứng dụng (Material-style) → [sáng, tối]. */
export const TOKENS: Record<string, [string, string]> = {
  surface: ["#faf8ff", "#12111a"],
  "surface-dim": ["#d2d9f4", "#0e0d15"],
  "surface-bright": ["#faf8ff", "#2a2940"],
  "surface-container-lowest": ["#ffffff", "#15141f"],
  "surface-container-low": ["#f2f3ff", "#232234"],
  "surface-container": ["#eaedff", "#2a2940"],
  "surface-container-high": ["#e2e7ff", "#32314a"],
  "surface-container-highest": ["#dae2fd", "#3b3a55"],
  "on-surface": ["#131b2e", "#ece9f8"],
  "on-surface-variant": ["#484555", "#b6b2cb"],
  primary: ["#5f3add", "#a384ff"], // tối: đạt 4,5:1 khi làm CHỮ trên nền thẻ tối; nền đặc bg-primary giữ #5f3add (xem solidBackgrounds)
  "primary-container": ["#7857f8", "#6d4ce6"],
  "on-primary": ["#ffffff", "#ffffff"],
  "primary-fixed": ["#e6deff", "#2b2552"],
  "primary-fixed-dim": ["#cabeff", "#4a3f8f"],
  "on-primary-fixed": ["#1c0062", "#e4dcff"],
  "on-primary-fixed-variant": ["#4918c8", "#cbbfff"],
  secondary: ["#006c49", "#10a06d"],
  "secondary-container": ["#6cf8bb", "#10392c"],
  "secondary-fixed": ["#6ffbbe", "#134536"],
  "on-secondary-fixed-variant": ["#005236", "#7ff0c3"],
  tertiary: ["#825100", "#f0b45a"],
  "tertiary-fixed": ["#ffddb8", "#3d2a0c"],
  "tertiary-fixed-dim": ["#ffb95f", "#f2b45a"],
  error: ["#ba1a1a", "#f2706b"],
  "error-container": ["#ffdad6", "#4a1d21"],
  "on-error-container": ["#93000a", "#ffb4ab"],
  outline: ["#797587", "#8b87a3"],
  "outline-variant": ["#c9c4d8", "#3d3b56"],
};

const varRef = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** Mọi màu theo biến CSS (dùng cho chữ, viền, vòng, bóng… và nền nhạt). */
export function themedColors() {
  const out: Record<string, string | Record<string, string>> = {};
  for (const n of [...HUES, ...NEUTRALS]) out[n] = Object.fromEntries(SHADES.map((s) => [s, varRef(`${n}-${s}`)]));
  for (const t of Object.keys(TOKENS)) out[t] = varRef(t);
  return out;
}

/**
 * Nền/dải màu ĐẶC từ sắc 400 trở lên giữ giá trị gốc ở cả hai giao diện (nút, huy hiệu, banner có chữ trắng).
 * Áp cho backgroundColor và gradientColorStops; sắc 50–300 vẫn theo biến (nền dịu đảo sang tối).
 */
export function solidBackgrounds() {
  const out: Record<string, Record<string, string>> = {};
  for (const n of [...HUES, ...NEUTRALS]) {
    const p = scaleOf(n);
    out[n] = {};
    for (const s of SHADES) out[n][s] = SHADES.indexOf(s) >= SHADES.indexOf("400") ? p[s] : varRef(`${n}-${s}`);
  }
  // Nút/huy hiệu chữ trắng nền thương hiệu: giữ tím đậm ở cả hai giao diện (tím sáng #8a69f5 của giao diện tối chỉ đạt 3,9:1 với chữ trắng)
  // Nút xanh lục chữ trắng: emerald-600 (#059669) chỉ đạt 3,8:1 với chữ trắng ⇒ dùng emerald-700
  out.emerald["600"] = "#047857";
  (out as Record<string, unknown>).primary = "#5f3add";
  (out as Record<string, unknown>)["primary-container"] = "#7857f8";
  return out;
}

/** Trắng làm NỀN = màu thẻ (trắng ở giao diện sáng, tím than ở giao diện tối). Chữ trắng (text-white) giữ nguyên. */
export const whiteSurface = varRef("card");

/** CSS biến cho `:root` (sáng) và `.dark` (tối). */
export function paletteVariables() {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const n of HUES) {
    const d = darkHue(n);
    for (const s of SHADES) {
      light[`--c-${n}-${s}`] = triplet(hexToRgb(LIGHT_HUE_TEXT_OVERRIDE[n]?.[s] ?? scaleOf(n)[s]));
      dark[`--c-${n}-${s}`] = triplet(d[s]);
    }
  }
  for (const n of NEUTRALS) {
    for (const s of SHADES) {
      light[`--c-${n}-${s}`] = triplet(hexToRgb(LIGHT_NEUTRAL_OVERRIDE[n]?.[s] ?? scaleOf(n)[s]));
      dark[`--c-${n}-${s}`] = triplet(hexToRgb(DARK_NEUTRAL[s]));
    }
  }
  for (const [t, [l, d]] of Object.entries(TOKENS)) {
    light[`--c-${t}`] = triplet(hexToRgb(l));
    dark[`--c-${t}`] = triplet(hexToRgb(d));
  }
  light["--c-card"] = "255 255 255";
  dark["--c-card"] = triplet(DARK_CARD);
  return { light, dark };
}
