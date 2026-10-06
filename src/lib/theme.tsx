"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./utils";

// Giao diện sáng / tối / theo hệ thống. Lựa chọn lưu ở localStorage; lớp "dark" được gắn lên <html>.
// Bảng màu đảo qua biến CSS (xem tailwind.palette.ts) nên component không cần biết đang ở giao diện nào.

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "luuxa-theme";
const FONT_KEY = "luuxa-fontsize";

export type FontSizePreference = "normal" | "large" | "xlarge";
const FONT_PERCENT: Record<FontSizePreference, string> = { normal: "", large: "112.5%", xlarge: "125%" };

/**
 * Script chạy NGAY khi HTML tải (trong <head>, trước khi vẽ) để gắn lớp "dark" đúng giao diện — tránh nháy nền sáng
 * rồi mới chuyển tối. Phải giữ đồng bộ với applyTheme() bên dưới.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";var f=localStorage.getItem("${FONT_KEY}");if(f==="large")e.style.fontSize="112.5%";else if(f==="xlarge")e.style.fontSize="125%";}catch(_){}})();`;

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(pref: ThemePreference): boolean {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
  return dark;
}

function readFontSize(): FontSizePreference {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return v === "large" || v === "xlarge" ? v : "normal";
  } catch {
    return "normal";
  }
}

interface ThemeContextValue {
  /** Cỡ chữ người dùng chọn (Tailwind dùng rem nên đổi cỡ chữ gốc là phóng cả giao diện). */
  fontSize: FontSizePreference;
  setFontSize: (f: FontSizePreference) => void;
  /** Lựa chọn của người dùng (kể cả "theo hệ thống"). */
  preference: ThemePreference;
  /** Giao diện đang hiển thị thật sự. */
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Khởi tạo "system" cho khớp HTML phía máy chủ; đọc lựa chọn thật sau khi gắn kết (script ở <head> đã vẽ đúng màu rồi).
  const [preference, setPref] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [fontSize, setFontSizeState] = useState<FontSizePreference>("normal");

  useEffect(() => {
    setFontSizeState(readFontSize());
    const p = readPreference();
    setPref(p);
    setResolved(applyTheme(p) ? "dark" : "light");
  }, []);

  // Đang ở chế độ "theo hệ thống" thì đổi theo khi hệ điều hành đổi
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system") ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  // Đồng bộ giữa các tab đang mở
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const p = readPreference();
      setPref(p);
      setResolved(applyTheme(p) ? "dark" : "light");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      if (p === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // trình duyệt chặn lưu trữ: vẫn đổi được trong phiên này
    }
    setPref(p);
    setResolved(applyTheme(p) ? "dark" : "light");
  }, []);

  const setFontSize = useCallback((f: FontSizePreference) => {
    try {
      if (f === "normal") localStorage.removeItem(FONT_KEY);
      else localStorage.setItem(FONT_KEY, f);
    } catch {
      // trình duyệt chặn lưu trữ: vẫn đổi được trong phiên này
    }
    document.documentElement.style.fontSize = FONT_PERCENT[f];
    setFontSizeState(f);
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference, fontSize, setFontSize }), [preference, resolved, setPreference, fontSize, setFontSize]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme phải nằm trong <ThemeProvider>");
  return ctx;
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
];

/** Nút một chạm: sáng ⇄ tối (cần chọn "Hệ thống" thì dùng ThemeSegmented). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  // Trước khi gắn kết, `resolved` luôn là "light" — tránh nhấp nháy biểu tượng bằng cách render cả hai và ẩn bằng CSS.
  return (
    <button
      type="button"
      onClick={() => setPreference(resolved === "dark" ? "light" : "dark")}
      title={resolved === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      aria-label={resolved === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className={cn("relative p-2 rounded-full hover:bg-surface-container-low text-gray-600 transition-colors", className)}
    >
      <Sun className="w-4 h-4 hidden dark:block" />
      <Moon className="w-4 h-4 dark:hidden" />
    </button>
  );
}

/** Ba lựa chọn Sáng / Tối / Hệ thống (dùng ở Cài đặt → Hồ sơ). */
export function ThemeSegmented({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Giao diện" className={cn("inline-flex p-1 rounded-xl bg-gray-100 gap-1", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition",
              active ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const FONT_OPTIONS: { value: FontSizePreference; label: string; sample: string }[] = [
  { value: "normal", label: "Vừa", sample: "text-xs" },
  { value: "large", label: "Lớn", sample: "text-sm" },
  { value: "xlarge", label: "Rất lớn", sample: "text-base" },
];

/** Ba cỡ chữ: Vừa / Lớn / Rất lớn (Cài đặt → Hồ sơ → Giao diện). */
export function FontSizeSegmented({ className }: { className?: string }) {
  const { fontSize, setFontSize } = useTheme();
  return (
    <div role="radiogroup" aria-label="Cỡ chữ" className={cn("inline-flex p-1 rounded-xl bg-gray-100 gap-1", className)}>
      {FONT_OPTIONS.map(({ value, label, sample }) => {
        const active = fontSize === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setFontSize(value)}
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition", sample, active ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}
          >
            <span aria-hidden className="font-extrabold">A</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
