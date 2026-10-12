"use client";

// Gói H — Gợi ý cài ứng dụng (PWA) + bật thông báo đẩy; cảnh báo khi mở trong trình duyệt nhúng của Zalo / Facebook / Messenger / Instagram
// (không cài được ứng dụng, không nhận được thông báo, hay mất đăng nhập ⇒ nên mở bằng Safari / Chrome).
//   • Dải cảnh báo trình duyệt nhúng: mọi trang ứng dụng; ẩn được trong phiên (sessionStorage).
//   • Gợi ý cài ứng dụng / bật thông báo: thẻ nhỏ góc dưới, hiện sau vài giây, ẩn được 21 ngày (localStorage). Không hiện khi danh sách
//     "Bắt đầu với Lưu Xá" (OnboardingChecklist) đang nhắc đúng việc đó, và không hiện ở Cài đặt (đã có mục riêng).
// Sự kiện `beforeinstallprompt` được bắt ngay khi tải trang (lib/push.ts — PwaRegister) nên nút "Cài" luôn dùng được.
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, Check, Copy, Download, ExternalLink, Loader2, Share, Smartphone, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNotificationPrefs } from "@/lib/data/notification-prefs";
import { chromeIntentUrl, pushSupported, useInstallApp, useOnboardingTipsActive, usePushDevice, type InAppBrowserInfo } from "@/lib/push";

const TIP_HIDE_KEY = "luuxa-install-tip-hidden";
const INAPP_HIDE_KEY = "luuxa-inapp-tip-hidden";
const TIP_HIDE_DAYS = 21;

/** Sao chép chữ: Clipboard API, không được (trình duyệt nhúng hay chặn) thì dùng ô chữ ẩn + execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* thử cách cũ */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Khối cảnh báo "đang mở trong trình duyệt của Zalo/Facebook…" — dùng được ở trang đăng nhập (variant="inline") lẫn khung ứng dụng
 * (variant="floating", nổi trên thanh điều hướng dưới).
 */
export function InAppBrowserNotice({
  info,
  ios,
  android,
  onClose,
  variant = "floating",
}: {
  info: InAppBrowserInfo;
  ios: boolean;
  android: boolean;
  onClose?: () => void;
  variant?: "floating" | "inline";
}) {
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState("");
  useEffect(() => setHref(window.location.href), []);
  const intent = android ? chromeIntentUrl(href) : null;
  const copy = async () => {
    const ok = await copyText(href);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div
      role="region"
      aria-label={`Đang mở trong trình duyệt của ${info.label}`}
      className={cn(
        "rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 shadow-lg shadow-amber-900/10",
        variant === "floating" ? "p-3.5" : "p-3.5 shadow-none"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
          <TriangleAlert className="w-[18px] h-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold leading-snug text-amber-900">Bạn đang mở trong trình duyệt của {info.label}</p>
          <p className="text-[11px] leading-relaxed text-amber-900/90 mt-0.5">
            Ở đây không cài được ứng dụng, không nhận được thông báo và hay bị mất đăng nhập. Hãy mở bằng <b>{ios ? "Safari" : "Chrome"}</b>:
            {ios ? (
              <>
                {" "}
                bấm <b>⋯</b> hoặc <Share className="inline w-3 h-3 -mt-0.5" aria-label="nút chia sẻ" /> ở góc màn hình → <b>“Mở bằng trình duyệt”</b> /{" "}
                <b>“Open in Safari”</b>, hoặc sao chép liên kết rồi dán vào Safari.
              </>
            ) : (
              <> bấm nút bên dưới, hoặc bấm ⋮ ở góc trên → “Mở bằng trình duyệt”.</>
            )}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Ẩn cảnh báo" className="p-1 -mr-1 -mt-1 rounded-lg text-amber-700 hover:bg-amber-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
        {intent && (
          <a href={intent} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition active:scale-95">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Mở bằng Chrome
          </a>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-bold hover:bg-amber-100 transition active:scale-95"
        >
          {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
          {copied ? "Đã sao chép" : "Sao chép liên kết"}
        </button>
      </div>
    </div>
  );
}

export function InstallPrompt() {
  const pathname = usePathname();
  const { showToast } = useApp();
  const { session } = useSession();
  const app = useInstallApp();
  const onboardingTips = useOnboardingTipsActive();
  const [inAppHidden, setInAppHidden] = useState(true);
  const [tipHidden, setTipHidden] = useState(true);
  const [ready, setReady] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    try {
      setInAppHidden(sessionStorage.getItem(INAPP_HIDE_KEY) === "1");
    } catch {
      setInAppHidden(false);
    }
    try {
      const at = Number(localStorage.getItem(TIP_HIDE_KEY) ?? 0);
      setTipHidden(at > 0 && Date.now() - at < TIP_HIDE_DAYS * 86_400_000);
    } catch {
      setTipHidden(false);
    }
    const t = setTimeout(() => setReady(true), 3500);
    return () => clearTimeout(t);
  }, []);

  const member = !!session?.member;
  const onSettings = pathname.startsWith("/cai-dat");
  // Thông báo đẩy của thiết bị này: chỉ tải tùy chọn (khóa VAPID) khi có thể cần nhắc
  const pushHere = typeof window !== "undefined" && pushSupported() && typeof Notification !== "undefined" && Notification.permission === "default";
  const mayTipPush = member && ready && !tipHidden && !onSettings && !app.inApp && pushHere && (app.installed || !app.ios);
  const { prefs } = useNotificationPrefs(mayTipPush);
  const device = usePushDevice(prefs?.vapidPublicKey);

  if (!member) return null;

  // 1. Trình duyệt nhúng (Zalo, Facebook…): cảnh báo + cách mở bằng trình duyệt thật
  if (app.inApp && !inAppHidden) {
    return (
      <div className="fixed z-[45] left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:bottom-6 md:w-[24rem] animate-in fade-in slide-in-from-bottom-2 duration-200">
        <InAppBrowserNotice
          info={app.inApp}
          ios={app.ios}
          android={app.android}
          onClose={() => {
            try {
              sessionStorage.setItem(INAPP_HIDE_KEY, "1");
            } catch {
              /* bỏ qua */
            }
            setInAppHidden(true);
          }}
        />
      </div>
    );
  }

  if (!ready || tipHidden || onSettings || onboardingTips || app.inApp) return null;

  const canInstallTip = !app.installed && (app.canInstall || app.ios);
  const canPushTip = !canInstallTip && mayTipPush && !!prefs?.pushAvailable && device.state === "off";
  if (!canInstallTip && !canPushTip) return null;

  const hide = () => {
    try {
      localStorage.setItem(TIP_HIDE_KEY, String(Date.now()));
    } catch {
      /* bỏ qua */
    }
    setTipHidden(true);
  };

  return (
    <div
      role="region"
      aria-label={canInstallTip ? "Gợi ý cài ứng dụng" : "Gợi ý bật thông báo"}
      className="fixed z-[45] left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:left-auto md:right-6 md:bottom-6 md:w-[22rem] animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="rounded-2xl border border-purple-100 bg-white p-3.5 shadow-xl shadow-purple-900/10">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center shrink-0">
            {canInstallTip ? <Smartphone className="w-[18px] h-[18px]" aria-hidden /> : <BellRing className="w-[18px] h-[18px]" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-gray-900 leading-snug">{canInstallTip ? "Cài Lưu Xá lên màn hình chính" : "Bật thông báo trên thiết bị này"}</p>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
              {canInstallTip
                ? app.ios
                  ? "Mở nhanh như ứng dụng thường — trên iPhone phải cài thì mới nhận được thông báo."
                  : "Mở nhanh như ứng dụng thường, toàn màn hình, không lẫn với các tab khác."
                : "Nhận ngay nhắc trực, điểm danh, kết quả đơn xin phép — kể cả khi không mở ứng dụng."}
            </p>
          </div>
          <button type="button" onClick={hide} aria-label="Ẩn gợi ý" title="Ẩn gợi ý này" className="p-1 -mr-1 -mt-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {iosHelp && canInstallTip && app.ios && (
          <p className="mt-2.5 ml-12 text-[11px] text-gray-600 leading-relaxed rounded-xl bg-surface-container-low p-3">
            Trong Safari: bấm nút <b>Chia sẻ</b> <Share className="inline w-3 h-3 -mt-0.5" aria-hidden /> (ô vuông có mũi tên lên) → <b>“Thêm vào Màn hình chính”</b> →{" "}
            <b>Thêm</b>. Sau đó mở Lưu Xá từ biểu tượng mới để bật thông báo.
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
          {canInstallTip && app.canInstall && (
            <button
              type="button"
              onClick={async () => {
                const r = await app.install();
                if (r === "accepted") showToast("success", "Đã cài ứng dụng Lưu Xá. Mở từ biểu tượng trên màn hình chính nhé!");
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition active:scale-95"
            >
              <Download className="w-3.5 h-3.5" aria-hidden /> Cài ứng dụng
            </button>
          )}
          {canInstallTip && !app.canInstall && app.ios && (
            <button
              type="button"
              onClick={() => setIosHelp((v) => !v)}
              aria-expanded={iosHelp}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition active:scale-95"
            >
              <Share className="w-3.5 h-3.5" aria-hidden /> {iosHelp ? "Ẩn hướng dẫn" : "Xem cách cài"}
            </button>
          )}
          {canPushTip && (
            <button
              type="button"
              disabled={device.busy}
              onClick={async () => {
                try {
                  await device.enable();
                  showToast("success", "Đã bật thông báo trên thiết bị này.");
                  hide();
                } catch (e) {
                  showToast("error", errorMessage(e));
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-60"
            >
              {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <BellRing className="w-3.5 h-3.5" aria-hidden />} Bật thông báo
            </button>
          )}
          <button type="button" onClick={hide} className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition">
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstallPrompt;
