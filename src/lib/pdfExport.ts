"use client";

/**
 * Utility to export a DOM element to PDF using html2pdf.js
 * Dynamically imports html2pdf.js to avoid SSR issues.
 * Handles modern CSS color functions (like oklch) unsupported by html2canvas
 * and cleans up any lingering containers to prevent UI freeze.
 */

export interface ExportPdfOptions {
  /** The DOM element to convert to PDF */
  element: HTMLElement;
  /** Output filename (without .pdf extension) */
  filename: string;
  /** Page margin in mm (default: 8) */
  margin?: number;
  /** Image quality 0-1 (default: 0.98) */
  imageQuality?: number;
  /** Scale factor for rendering (default: 2) */
  scale?: number;
  /** Page format (default: 'a4') */
  pageFormat?: string;
  /** Orientation (default: 'portrait') */
  orientation?: "portrait" | "landscape";
}

/**
 * Converts any oklch(...) color string occurrences into standard rgb(...) or rgba(...)
 * so html2canvas's parser does not fail with "unsupported color function oklch".
 */
export function replaceOklchWithRgb(str: string): string {
  if (!str || !str.includes("oklch")) return str;

  // Regex to match oklch(L C H [/ A])
  const oklchRegex = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)/gi;

  const converted = str.replace(oklchRegex, (_match, lStr, cStr, hStr, aStr) => {
    try {
      const L = lStr.endsWith("%") ? parseFloat(lStr) / 100 : parseFloat(lStr);
      const C = cStr.endsWith("%") ? parseFloat(cStr) / 100 : parseFloat(cStr);
      const H = parseFloat(hStr);
      const A = aStr ? (aStr.endsWith("%") ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1;

      const hRad = (H * Math.PI) / 180;
      const a = C * Math.cos(hRad);
      const b = C * Math.sin(hRad);

      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;

      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;

      const r_lin = +4.0767439362 * l - 3.3077115913 * m + 0.2309699292 * s;
      const g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

      const gamma = (c: number) =>
        c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
      const R = Math.round(Math.min(255, Math.max(0, gamma(r_lin) * 255)));
      const G = Math.round(Math.min(255, Math.max(0, gamma(g_lin) * 255)));
      const B = Math.round(Math.min(255, Math.max(0, gamma(b_lin) * 255)));

      return A < 1 ? `rgba(${R}, ${G}, ${B}, ${A})` : `rgb(${R}, ${G}, ${B})`;
    } catch {
      return "rgb(100, 100, 100)";
    }
  });

  // Catch-all fallback for any non-standard oklch expressions
  return converted.replace(/oklch\([^)]+\)/gi, "rgb(95, 58, 221)");
}

/** Chờ font web nạp đủ các độ đậm (kèm ký tự có dấu) trước khi chụp — tránh chụp khi còn dùng font dự phòng. */
async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = "ăâêôơưđẠẬỐỂỮỵ";
  const specs = ["400", "500", "600", "700", "800", "900", "italic 400", "italic 600"].map((w) => `${w} 14px "Be Vietnam Pro"`);
  await Promise.all(specs.map((f) => document.fonts.load(f, sample).catch(() => [])));
  await document.fonts.ready;
}

/** Chuẩn hóa mọi đoạn chữ về dạng NFC (dấu gộp sẵn) để dấu tiếng Việt luôn đặt đúng chỗ khi vẽ lên canvas. */
function normalizeTextNfc(root: Node) {
  const doc = (root as Document).createTreeWalker ? (root as Document) : root.ownerDocument;
  if (!doc) return;
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const v = n.nodeValue;
    if (v) {
      const t = v.normalize("NFC");
      if (t !== v) n.nodeValue = t;
    }
  }
}

export async function exportElementToPdf({
  element,
  filename,
  margin = 8,
  imageQuality = 0.95,
  scale = 3,
  pageFormat = "a4",
  orientation = "portrait",
}: ExportPdfOptions): Promise<boolean> {
  try {
    await ensureFonts();
    // Dynamic import to avoid SSR issues
    const html2pdfModule = await import("html2pdf.js");
    let html2pdf = (html2pdfModule as any).default || html2pdfModule;
    if (typeof html2pdf !== "function" && (html2pdf as any)?.default) {
      html2pdf = (html2pdf as any).default;
    }

    if (typeof html2pdf === "function") {
      const opt = {
        margin,
        filename: `${filename}.pdf`,
        image: { type: "jpeg" as const, quality: imageQuality },
        html2canvas: {
          scale,
          useCORS: true,
          letterRendering: false,
          logging: false,
          onclone: (clonedDoc: Document, clonedEl?: HTMLElement) => {
            // 1. Sanitize all <style> tags in cloned document
            const styleTags = clonedDoc.querySelectorAll("style");
            styleTags.forEach((styleTag) => {
              if (styleTag.textContent && styleTag.textContent.includes("oklch")) {
                styleTag.textContent = replaceOklchWithRgb(styleTag.textContent);
              }
            });

            // 1b. Chữ tiếng Việt: về NFC để dấu không lệch
            normalizeTextNfc(clonedDoc.body);

            // 2. Expand scroll container so full multi-page document is rendered
            if (clonedEl) {
              clonedEl.style.height = "auto";
              clonedEl.style.maxHeight = "none";
              clonedEl.style.overflow = "visible";
              clonedEl.style.overflowY = "visible";
              clonedEl.style.position = "static";
            }

            // 3. Walk all elements in the cloned document to sanitize inline styles
            const allElements = clonedDoc.querySelectorAll("*");
            allElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (htmlEl.style) {
                for (let i = 0; i < htmlEl.style.length; i++) {
                  const prop = htmlEl.style[i];
                  const val = htmlEl.style.getPropertyValue(prop);
                  if (val && val.includes("oklch")) {
                    htmlEl.style.setProperty(prop, replaceOklchWithRgb(val));
                  }
                }
              }
            });

            // 4. Wrap getComputedStyle on clonedDoc.defaultView
            const win = clonedDoc.defaultView;
            if (win) {
              const originalGCS = win.getComputedStyle.bind(win);
              win.getComputedStyle = function (elt: Element, pseudo?: string | null) {
                const computed = originalGCS(elt, pseudo);
                return new Proxy(computed, {
                  get(target, prop) {
                    const orig = (target as any)[prop];
                    if (typeof orig === "function") {
                      if (prop === "getPropertyValue") {
                        return (name: string) => {
                          const val = target.getPropertyValue(name);
                          return typeof val === "string" && val.includes("oklch")
                            ? replaceOklchWithRgb(val)
                            : val;
                        };
                      }
                      return orig.bind(target);
                    }
                    if (typeof orig === "string" && orig.includes("oklch")) {
                      return replaceOklchWithRgb(orig);
                    }
                    return orig;
                  },
                });
              };
            }
          },
        },
        jsPDF: {
          unit: "mm",
          format: pageFormat,
          orientation,
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      await html2pdf().set(opt).from(element).save();
      return true;
    } else {
      throw new Error("html2pdf library is not available");
    }
  } catch (error) {
    console.error("PDF download failed:", error);
    return false;
  } finally {
    // Clean up any lingering containers added by html2pdf to prevent UI freeze
    if (typeof document !== "undefined") {
      const containers = document.querySelectorAll(".html2pdf__container");
      containers.forEach((c) => c.remove());
    }
  }
}
