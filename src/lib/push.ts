"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";

// Phía trình duyệt của thông báo đẩy + cài đặt ứng dụng (PWA) + số chưa đọc trên biểu tượng ứng dụng.

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Đăng ký service worker (idempotent). Trả về null nếu trình duyệt không hỗ trợ. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

const b64ToUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = "unsupported" | "denied" | "off" | "on";

/** Trạng thái đẩy của THIẾT BỊ NÀY (không phải của tài khoản). */
export function usePushDevice(vapidPublicKey: string | null | undefined) {
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!pushSupported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!pushSupported() || !vapidPublicKey) throw new Error("Thiết bị hoặc máy chủ chưa hỗ trợ thông báo đẩy.");
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        throw new Error(perm === "denied" ? "Bạn đã chặn thông báo — hãy cho phép trong cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ)." : "Bạn chưa cho phép thông báo.");
      }
      const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidPublicKey) });
      const j = sub.toJSON();
      await api.post("/api/v1/push/subscribe", { endpoint: j.endpoint, keys: j.keys });
      setState("on");
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.del("/api/v1/push/subscribe", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable, refresh };
}

// ---------------------------------------------------------------------
// Cài ứng dụng (PWA). Chrome/Edge/Android bắn `beforeinstallprompt` MỘT lần, thường ngay sau khi trang tải xong — có thể trước khi trang
// con (Cài đặt → Thông báo, gợi ý cài ở Tổng quan) kịp gắn bộ nghe. Vì vậy sự kiện được bắt ngay khi mô-đun này được nạp (PwaRegister ở
// layout gốc nạp nó cho mọi trang) và giữ trong kho dùng chung; mọi nơi đọc qua useInstallApp() nên nút "Cài ứng dụng" luôn dùng được.
// ---------------------------------------------------------------------
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Đã cài ứng dụng trên thiết bị này (đặt khi trình duyệt báo `appinstalled`). */
export const INSTALLED_KEY = "luuxa-app-installed";

interface InstallSnapshot {
  evt: BeforeInstallPromptEvent | null;
  installed: boolean;
}
const SERVER_SNAPSHOT: InstallSnapshot = { evt: null, installed: false };
let snapshot: InstallSnapshot = SERVER_SNAPSHOT;
const installSubs = new Set<() => void>();
const setSnapshot = (next: Partial<InstallSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  installSubs.forEach((f) => f());
};
const subscribeInstall = (f: () => void) => {
  installSubs.add(f);
  return () => {
    installSubs.delete(f);
  };
};

/** Gắn bộ nghe cài đặt (idempotent). Gọi tự động khi mô-đun được nạp trên trình duyệt. */
export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __luuxaInstallHook?: boolean };
  if (w.__luuxaInstallHook) return;
  w.__luuxaInstallHook = true;
  let installed = false;
  try {
    installed = localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    /* chế độ riêng tư — bỏ qua */
  }
  snapshot = { evt: null, installed };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    // Trình duyệt chỉ bắn sự kiện khi ứng dụng CHƯA cài trên máy này ⇒ gỡ dấu "đã cài" cũ (vd. người dùng đã gỡ ứng dụng)
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {
      /* bỏ qua */
    }
    setSnapshot({ evt: e as BeforeInstallPromptEvent, installed: false });
  });
  window.addEventListener("appinstalled", () => {
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
    } catch {
      /* bỏ qua */
    }
    setSnapshot({ evt: null, installed: true });
  });
}
captureInstallPrompt();

/** Đang chạy như ứng dụng đã cài (mở từ biểu tượng trên màn hình chính). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export const isIosDevice = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

export const isAndroidDevice = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export interface InAppBrowserInfo {
  app: "zalo" | "facebook" | "messenger" | "instagram" | "tiktok" | "line";
  label: string;
}

/**
 * Trình duyệt NHÚNG trong ứng dụng khác (Zalo, Facebook, Messenger, Instagram, TikTok, LINE): không cài ứng dụng được, không nhận thông báo đẩy,
 * thường không giữ đăng nhập ⇒ nên mở bằng Safari / Chrome.
 */
export function detectInAppBrowser(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): InAppBrowserInfo | null {
  if (/Zalo/i.test(ua)) return { app: "zalo", label: "Zalo" };
  if (/FBAN\/Messenger|MessengerForiOS|FB_IAB\/MESSENGER|\bMessenger\b/i.test(ua)) return { app: "messenger", label: "Messenger" };
  if (/Instagram/i.test(ua)) return { app: "instagram", label: "Instagram" };
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|\[FB/i.test(ua)) return { app: "facebook", label: "Facebook" };
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return { app: "tiktok", label: "TikTok" };
  if (/\bLine\/\d/i.test(ua)) return { app: "line", label: "LINE" };
  return null;
}

/** Liên kết mở trang hiện tại bằng Chrome trên Android (intent) — trình duyệt nhúng của Zalo/Facebook thường cho phép. */
export function chromeIntentUrl(href: string = typeof location !== "undefined" ? location.href : ""): string | null {
  try {
    const u = new URL(href);
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  } catch {
    return null;
  }
}

/**
 * Cài ứng dụng lên màn hình chính: Chrome/Edge/Android có nút bấm (sự kiện đã được bắt sẵn từ lúc tải trang); iOS Safari hướng dẫn thủ công.
 * `installed` = đang mở dạng ứng dụng đã cài HOẶC trình duyệt đã báo cài xong trên máy này.
 */
export function useInstallApp() {
  const snap = useSyncExternalStore(subscribeInstall, () => snapshot, () => SERVER_SNAPSHOT);
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean; android: boolean; inApp: InAppBrowserInfo | null }>({
    standalone: false,
    ios: false,
    android: false,
    inApp: null,
  });

  useEffect(() => {
    captureInstallPrompt();
    const update = () => setEnv({ standalone: isStandalone(), ios: isIosDevice(), android: isAndroidDevice(), inApp: detectInAppBrowser() });
    update();
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const e = snapshot.evt;
    if (!e) return "unavailable";
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    // Mỗi sự kiện chỉ gọi prompt() được một lần
    setSnapshot({ evt: null, installed: choice.outcome === "accepted" ? true : snapshot.installed });
    return choice.outcome;
  }, []);

  return {
    canInstall: !!snap.evt && !env.standalone,
    installed: env.standalone || snap.installed,
    standalone: env.standalone,
    /** iPhone/iPad mở bằng trình duyệt (chưa phải ứng dụng đã cài) ⇒ hướng dẫn "Thêm vào Màn hình chính" */
    ios: env.ios && !env.standalone,
    android: env.android,
    inApp: env.inApp,
    install,
  };
}

// ---------------------------------------------------------------------
// Danh sách "Bắt đầu với Lưu Xá" (OnboardingChecklist) đang nhắc cài ứng dụng / bật thông báo ⇒ InstallPrompt không nhắc trùng
// ---------------------------------------------------------------------
let onboardingTips = false;
const onboardingSubs = new Set<() => void>();
export function setOnboardingTipsActive(active: boolean) {
  if (onboardingTips === active) return;
  onboardingTips = active;
  onboardingSubs.forEach((f) => f());
}
export function useOnboardingTipsActive(): boolean {
  return useSyncExternalStore(
    (f) => {
      onboardingSubs.add(f);
      return () => {
        onboardingSubs.delete(f);
      };
    },
    () => onboardingTips,
    () => false
  );
}

// ---------------------------------------------------------------------
// Số chưa đọc trên biểu tượng ứng dụng (Badging API: Chrome/Edge ứng dụng đã cài, Android, iOS 16.4+ khi đã cho phép thông báo)
// ---------------------------------------------------------------------
type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export const appBadgeSupported = () => typeof navigator !== "undefined" && typeof (navigator as BadgeNavigator).setAppBadge === "function";

let lastBadge = -1;
/** Đặt / xóa số trên biểu tượng ứng dụng. Trình duyệt không hỗ trợ (hoặc chưa cài ứng dụng) ⇒ bỏ qua, không lỗi. */
export function syncAppBadge(count: number) {
  if (!appBadgeSupported()) return;
  const n = Math.max(0, Math.min(Math.floor(count), 999));
  if (n === lastBadge) return;
  lastBadge = n;
  const nav = navigator as BadgeNavigator;
  try {
    const p = n > 0 ? nav.setAppBadge!(n) : nav.clearAppBadge ? nav.clearAppBadge() : nav.setAppBadge!(0);
    void p?.catch?.(() => {});
  } catch {
    /* NotAllowedError (chưa cho phép thông báo) — bỏ qua */
  }
}
