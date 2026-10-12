"use client";

// Gói H: "Bắt đầu với Lưu Xá" — danh sách việc cho thành viên mới (vào nhà ≤ 30 ngày) hoặc người chưa làm xong: ảnh đại diện, tài khoản
// nhận tiền, bật thông báo, cài ứng dụng, đọc + xác nhận Luật nhà, xem các mục đồng ý dữ liệu. Ẩn được (nhớ trên máy này).
// Dữ liệu dùng chung lần tải của thẻ "Việc của tôi hôm nay" (GET /api/v1/me/today → onboarding); cài ứng dụng / thông báo của THIẾT BỊ NÀY
// do trình duyệt tự kiểm (lib/push.ts).
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Check, ChevronDown, Download, ImagePlus, Landmark, Loader2, Rocket, ScrollText, ShieldCheck, Smartphone, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMyToday } from "@/lib/data/me-today";
import { useNotificationPrefs } from "@/lib/data/notification-prefs";
import { pushSupported, setOnboardingTipsActive, useInstallApp, usePushDevice } from "@/lib/push";
import { rulesVersionLabel } from "@/lib/types/house-rules-ack";

const HIDE_KEY = (memberId: string) => `luuxa-onboarding-hidden:${memberId}`;
const CONSENT_SEEN_KEY = (memberId: string) => `luuxa-onboarding-consent-seen:${memberId}`;

interface Step {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  done: boolean;
  action: React.ReactNode;
}

const cta =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-60 whitespace-nowrap";
const ctaGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-purple-200 hover:text-primary text-xs font-bold transition active:scale-95 whitespace-nowrap";

export default function OnboardingChecklist() {
  const { showToast } = useApp();
  const { session } = useSession();
  const memberId = session?.member?.id ?? null;
  const { today } = useMyToday(!!memberId);
  const ob = today?.onboarding ?? null;
  const app = useInstallApp();
  const [hidden, setHidden] = useState(true);
  const [consentSeen, setConsentSeen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    try {
      setHidden(localStorage.getItem(HIDE_KEY(memberId)) === "1");
      setConsentSeen(localStorage.getItem(CONSENT_SEEN_KEY(memberId)) === "1");
    } catch {
      setHidden(false);
    }
  }, [memberId]);

  // Thông báo đẩy của THIẾT BỊ NÀY: cần khóa VAPID của máy chủ ⇒ chỉ tải tùy chọn khi bước này còn dở và trình duyệt hỗ trợ
  const canPushHere = typeof window !== "undefined" && pushSupported();
  const needPushInfo = !!ob && !hidden && canPushHere;
  const { prefs } = useNotificationPrefs(needPushInfo);
  const device = usePushDevice(prefs?.vapidPublicKey);

  const steps = useMemo((): Step[] => {
    if (!ob) return [];
    const pushDone = device.state === "on" || ob.pushDevices > 0;
    const list: Step[] = [
      {
        key: "avatar",
        icon: ImagePlus,
        title: "Thêm ảnh đại diện",
        hint: "Để anh em dễ nhận ra bạn trong danh bạ, lịch trực, điểm danh.",
        done: ob.avatar,
        action: (
          <Link href="/cai-dat?tab=profile" className={ctaGhost}>
            Thêm ảnh
          </Link>
        ),
      },
      {
        key: "payment",
        icon: Landmark,
        title: "Khai báo tài khoản nhận tiền",
        hint: "Thủ quỹ chuyển khoản hoàn ứng / tiền chợ cho bạn bằng mã QR.",
        done: ob.paymentAccount,
        action: (
          <Link href="/cai-dat?tab=profile" className={ctaGhost}>
            Khai báo
          </Link>
        ),
      },
      {
        key: "push",
        icon: BellRing,
        title: "Bật thông báo trên điện thoại",
        hint: !canPushHere
          ? app.ios
            ? "Trên iPhone: cài ứng dụng lên màn hình chính trước, rồi bật thông báo trong ứng dụng."
            : "Trình duyệt này chưa hỗ trợ thông báo đẩy — thử Chrome / Safari."
          : device.state === "denied"
            ? "Bạn đã chặn thông báo — mở cài đặt trang (ổ khóa cạnh địa chỉ) để cho phép lại."
            : "Nhận ngay nhắc trực, điểm danh, kết quả đơn — kể cả khi không mở ứng dụng.",
        done: pushDone,
        action:
          canPushHere && device.state === "off" && prefs?.pushAvailable ? (
            <button
              type="button"
              disabled={device.busy}
              onClick={async () => {
                try {
                  await device.enable();
                  showToast("success", "Đã bật thông báo trên thiết bị này.");
                } catch (e) {
                  showToast("error", errorMessage(e));
                }
              }}
              className={cta}
            >
              {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Bật
            </button>
          ) : (
            <Link href="/cai-dat?tab=notifications" className={ctaGhost}>
              Xem cách bật
            </Link>
          ),
      },
      {
        key: "install",
        icon: Smartphone,
        title: "Cài ứng dụng lên màn hình chính",
        hint: app.inApp
          ? `Đang mở trong ${app.inApp.label} — mở bằng Safari / Chrome để cài được.`
          : app.ios
            ? "Mở nhanh như ứng dụng thường; iPhone cần cài thì mới nhận được thông báo."
            : "Mở nhanh như ứng dụng thường, toàn màn hình.",
        done: app.installed,
        action: app.canInstall ? (
          <button
            type="button"
            onClick={async () => {
              const r = await app.install();
              if (r === "accepted") showToast("success", "Đã cài ứng dụng Lưu Xá. Mở từ biểu tượng trên màn hình chính nhé!");
            }}
            className={cta}
          >
            <Download className="w-3.5 h-3.5" /> Cài
          </button>
        ) : app.ios && !app.inApp ? (
          <button type="button" onClick={() => setIosHelp((v) => !v)} aria-expanded={iosHelp} className={ctaGhost}>
            Hướng dẫn
          </button>
        ) : (
          <Link href="/cai-dat?tab=notifications" className={ctaGhost}>
            Xem cách cài
          </Link>
        ),
      },
      {
        key: "rules",
        icon: ScrollText,
        title: "Đọc Luật nhà và xác nhận",
        hint: ob.houseRules.version
          ? `Bấm “Tôi đã đọc” ở cuối Luật nhà${ob.houseRules.updatedAt ? ` (phiên bản ${rulesVersionLabel(ob.houseRules.updatedAt)})` : ""}.`
          : "Nhà chưa đăng luật nhà — bước này tự xong.",
        done: !ob.houseRules.version || !!ob.houseRules.ackedAt,
        action: (
          <Link href="/thong-bao?tab=luat#xac-nhan-luat-nha" className={cta}>
            Đọc ngay
          </Link>
        ),
      },
      {
        key: "consent",
        icon: ShieldCheck,
        title: "Xem các mục đồng ý dữ liệu",
        hint: "Chọn có chia sẻ hồ sơ Công giáo, kết quả học tập… hay không — đổi lại lúc nào cũng được.",
        done: ob.consentChoice || consentSeen,
        action: (
          <Link
            href="/cai-dat?tab=profile"
            onClick={() => {
              try {
                if (memberId) localStorage.setItem(CONSENT_SEEN_KEY(memberId), "1");
              } catch {
                /* bỏ qua */
              }
            }}
            className={ctaGhost}
          >
            Xem
          </Link>
        ),
      },
    ];
    return list;
  }, [ob, device, prefs?.pushAvailable, canPushHere, app, consentSeen, iosHelp, memberId, showToast]);

  const doneCount = steps.filter((s) => s.done).length;
  const complete = steps.length > 0 && doneCount === steps.length;
  const visible = !!ob && !hidden && !complete;
  const pendingInstallOrPush = visible && steps.some((s) => (s.key === "install" || s.key === "push") && !s.done);

  // Đang nhắc cài ứng dụng / bật thông báo ở đây ⇒ dải gợi ý chung (InstallPrompt) không nhắc trùng
  useEffect(() => {
    setOnboardingTipsActive(pendingInstallOrPush);
    return () => setOnboardingTipsActive(false);
  }, [pendingInstallOrPush]);

  if (!visible || !ob) return null;
  const pct = Math.round((doneCount / steps.length) * 100);
  const pending = steps.filter((s) => !s.done);
  const finished = steps.filter((s) => s.done);
  const hide = () => {
    try {
      if (memberId) localStorage.setItem(HIDE_KEY(memberId), "1");
    } catch {
      /* bỏ qua */
    }
    setHidden(true);
  };

  return (
    <section aria-labelledby="onboarding-title" className="relative rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/60 p-4 sm:p-5 shadow-xs">
      <button type="button" onClick={hide} aria-label="Ẩn danh sách bắt đầu" title="Ẩn danh sách này" className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/70">
        <X className="w-4 h-4" />
      </button>
      <header className="flex items-start gap-3 pr-8">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-300/40">
          <Rocket className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="onboarding-title" className="text-base font-extrabold text-gray-900">
            {ob.isNew ? "Chào mừng bạn về nhà! Bắt đầu với Lưu Xá" : "Hoàn thiện tài khoản của bạn"}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Đã xong {doneCount}/{steps.length} bước{ob.isNew ? " — vài phút là xong, giúp anh em liên lạc và nhắc việc cho bạn dễ hơn." : "."}
          </p>
          <div className="h-1.5 mt-2.5 rounded-full bg-white/80 overflow-hidden max-w-sm border border-violet-100" role="progressbar" aria-label="Tiến độ bắt đầu" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <ol className="mt-4 flex flex-col gap-2">
        {pending.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="rounded-2xl bg-white border border-violet-100/70 px-3 py-2.5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
                <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 leading-snug">{s.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.hint}</p>
                </div>
                <div className="col-start-2 sm:col-start-3 sm:row-start-1 flex flex-wrap gap-1.5">{s.action}</div>
              </div>
              {s.key === "install" && iosHelp && (
                <p className="mt-2 ml-12 text-[11px] text-gray-600 leading-relaxed rounded-xl bg-surface-container-low p-3">
                  Trên iPhone/iPad (Safari): bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) → chọn <b>“Thêm vào Màn hình chính”</b> → <b>Thêm</b>. Sau đó mở
                  Lưu Xá từ biểu tượng mới và bật thông báo.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {finished.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
            <Check className="w-3.5 h-3.5" aria-hidden /> {finished.length} bước đã xong
            <ChevronDown className={cn("w-3.5 h-3.5 transition", showDone && "rotate-180")} aria-hidden />
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {finished.map((s) => (
                <li key={s.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 text-[11px] font-semibold">
                  <Check className="w-3 h-3" aria-hidden /> {s.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
