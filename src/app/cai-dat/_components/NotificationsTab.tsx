"use client";

import React, { useMemo, useState } from "react";
import { Bell, BellOff, BellRing, Download, Filter, Loader2, Lock, Moon, Search, Smartphone, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { appBadgeSupported, useInstallApp, usePushDevice } from "@/lib/push";
import { notificationPrefsApi, useNotificationPrefs } from "@/lib/data/notification-prefs";
import { COMMON_NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES, type NotificationPrefsDto, type NotificationTypePrefDto } from "@/lib/types/notification-prefs";
import { CustomInput, CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { InAppBrowserNotice } from "@/components/InstallPrompt";
import { cn } from "@/lib/utils";

const card = "bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs space-y-4";
const btnPrimary = "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60";
const btnGhost = "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition disabled:opacity-60";

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 ? "30" : "00";
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.code, c.label]));
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// ---------------------------------------------------------------------
// Thông báo theo TỪNG LOẠI (db/app/1052 — notification_type_mutes)
// ---------------------------------------------------------------------
function TypePrefs({ prefs, onToggle, busy }: { prefs: NotificationPrefsDto; onToggle: (t: NotificationTypePrefDto, on: boolean) => void; busy: string | null }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const common = useMemo(() => new Set(COMMON_NOTIFICATION_TYPES), []);
  const relevant = (t: NotificationTypePrefDto) => t.muted || t.received90 > 0 || common.has(t.code);
  const term = fold(q.trim());
  const shown = prefs.types.filter((t) => (term ? fold(`${t.name} ${CATEGORY_LABEL[t.category] ?? ""}`).includes(term) : all || relevant(t)));
  const hiddenCount = prefs.types.filter((t) => !relevant(t)).length;
  const muted = prefs.types.filter((t) => t.muted).length;
  const groups = NOTIFICATION_CATEGORIES.map((c) => ({ ...c, items: shown.filter((t) => t.category === c.code) })).filter((g) => g.items.length > 0);
  // Nhóm lạ (loại mới thêm sau) vẫn hiện
  const known = new Set(NOTIFICATION_CATEGORIES.map((c) => c.code));
  const others = shown.filter((t) => !known.has(t.category));
  if (others.length) groups.push({ code: "other", label: "Khác", text: "", items: others });

  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-gray-900 flex flex-wrap items-center gap-2">
            Theo từng loại thông báo
            {muted > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-extrabold">Đang tắt {muted} loại</span>}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Tắt loại nào thì bạn <b>không nhận</b> thông báo loại đó nữa — cả trong chuông thông báo lẫn đẩy về điện thoại. Loại có <Lock className="inline w-3 h-3 -mt-0.5" aria-label="ổ khóa" /> là
            bắt buộc (bảo mật, thông báo quan trọng, kết quả đơn) nên luôn được gửi.
          </p>
        </div>
      </div>
      <CustomInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm loại thông báo (vd. xin phép, sinh nhật, nhắc…)" leftIcon={<Search className="w-4 h-4" />} aria-label="Tìm loại thông báo" data-no-dirty />
      {groups.length === 0 && <p className="text-xs text-gray-500">Không có loại thông báo nào khớp “{q}”.</p>}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.code}>
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">{g.label}</div>
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 px-3">
              {g.items.map((t) => (
                <li key={t.code} className="py-1.5">
                  {t.mandatory ? (
                    <div className="flex items-center justify-between gap-3 py-1">
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-gray-900">{t.name}</span>
                        <span className="text-[11px] text-gray-500">Bắt buộc — luôn được gửi</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold shrink-0">
                        <Lock className="w-3 h-3" aria-hidden /> Luôn bật
                      </span>
                    </div>
                  ) : (
                    <div className={cn("relative", busy === t.code && "opacity-60 pointer-events-none")}>
                      <CustomToggle
                        checked={!t.muted}
                        onChange={(v) => onToggle(t, v)}
                        label={t.name}
                        description={t.muted ? "Đã tắt — bạn không nhận loại này" : t.received90 > 0 ? `Bạn đã nhận ${t.received90} lần trong 90 ngày qua` : undefined}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!term && hiddenCount > 0 && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline whitespace-normal text-left">
          <Filter className="w-3.5 h-3.5" aria-hidden />
          {all ? "Chỉ hiện loại bạn hay nhận" : `Hiện tất cả ${prefs.types.length} loại (thêm ${hiddenCount} loại của người quản lý / ít gặp)`}
        </button>
      )}
    </div>
  );
}

/** Cài đặt → Thông báo: cài ứng dụng, bật thông báo đẩy trên thiết bị này, chọn nhóm nhận, tắt từng loại, giờ yên tĩnh. */
export default function NotificationsTab() {
  const { showToast } = useApp();
  const { prefs, mutate } = useNotificationPrefs();
  const device = usePushDevice(prefs?.vapidPublicKey);
  const app = useInstallApp();
  const [qStart, setQStart] = useState<string | null>(null);
  const [qEnd, setQEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [typeBusy, setTypeBusy] = useState<string | null>(null);

  const start = qStart ?? prefs?.quiet?.start ?? "22:00";
  const end = qEnd ?? prefs?.quiet?.end ?? "06:00";
  const quietChanged = useMemo(() => !!prefs && (prefs.quiet ? prefs.quiet.start !== start || prefs.quiet.end !== end : qStart !== null || qEnd !== null), [prefs, start, end, qStart, qEnd]);

  const toggleCategory = async (code: string, enabled: boolean) => {
    if (!prefs) return;
    void mutate({ ...prefs, push: { ...prefs.push, [code]: enabled } }, { revalidate: false });
    try {
      await notificationPrefsApi.setCategory(code, enabled);
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutate();
    }
  };

  const toggleType = async (t: NotificationTypePrefDto, enabled: boolean) => {
    if (!prefs) return;
    setTypeBusy(t.code);
    void mutate({ ...prefs, types: prefs.types.map((x) => (x.code === t.code ? { ...x, muted: !enabled } : x)) }, { revalidate: false });
    try {
      const next = await notificationPrefsApi.setType(t.code, enabled);
      void mutate(next, { revalidate: false });
      showToast("success", enabled ? `Đã bật lại “${t.name}”.` : `Đã tắt “${t.name}” — bạn sẽ không nhận loại này nữa.`);
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutate();
    } finally {
      setTypeBusy(null);
    }
  };

  const saveQuiet = async (clear = false) => {
    setSaving(true);
    try {
      await notificationPrefsApi.setQuiet(clear ? null : { start, end });
      setQStart(null);
      setQEnd(null);
      await mutate();
      showToast("success", clear ? "Đã tắt giờ yên tĩnh." : "Đã lưu giờ yên tĩnh.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const enable = async () => {
    try {
      await device.enable();
      await mutate();
      showToast("success", "Đã bật thông báo đẩy trên thiết bị này.");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="space-y-6 min-w-0">
        {/* TRÌNH DUYỆT NHÚNG (Zalo, Facebook…) */}
        {app.inApp && <InAppBrowserNotice info={app.inApp} ios={app.ios} android={app.android} variant="inline" />}

        {/* CÀI ỨNG DỤNG */}
        <div className={card}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-gray-900">Cài ứng dụng lên màn hình chính</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Mở nhanh như ứng dụng thường, toàn màn hình, có số thông báo chưa đọc trên biểu tượng, và nhận được thông báo đẩy trên iPhone.</p>
            </div>
            {app.installed && <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">ĐÃ CÀI</span>}
          </div>
          {!app.installed && app.canInstall && (
            <button
              type="button"
              onClick={async () => {
                const r = await app.install();
                if (r === "accepted") showToast("success", "Đã cài ứng dụng Lưu Xá. Mở từ biểu tượng trên màn hình chính nhé!");
              }}
              className={btnPrimary}
            >
              <Download className="w-3.5 h-3.5" aria-hidden /> Cài ứng dụng
            </button>
          )}
          {!app.installed && !app.canInstall && app.ios && !app.inApp && (
            <p className="text-xs text-gray-600 leading-relaxed rounded-xl bg-surface p-3.5">
              Trên iPhone/iPad (Safari): bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) → chọn <b>“Thêm vào Màn hình chính”</b>. Mở ứng dụng từ biểu tượng mới rồi quay lại đây để bật
              thông báo.
            </p>
          )}
          {!app.installed && !app.canInstall && !app.ios && !app.inApp && (
            <p className="text-xs text-gray-500 leading-relaxed">Trên Chrome/Edge: bấm biểu tượng cài đặt ở thanh địa chỉ hoặc menu ⋮ → “Cài đặt Lưu Xá”.</p>
          )}
          {app.installed && !appBadgeSupported() && (
            <p className="text-[11px] text-gray-500 leading-relaxed">Thiết bị này chưa hỗ trợ hiện số thông báo chưa đọc trên biểu tượng ứng dụng.</p>
          )}
        </div>

        {/* THIẾT BỊ NÀY */}
        <div className={card}>
          <div className="flex items-start gap-3">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", device.state === "on" ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-primary")}>
              {device.state === "on" ? <BellRing className="w-5 h-5" aria-hidden /> : <Bell className="w-5 h-5" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-gray-900">Thông báo đẩy trên thiết bị này</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Nhận thông báo ngay cả khi không mở ứng dụng. Bạn có {prefs?.devices ?? 0} thiết bị đã đăng ký.</p>
            </div>
          </div>
          {!prefs ? (
            <div className="shimmer-box h-10 rounded-xl" />
          ) : !prefs.pushAvailable ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">Máy chủ chưa bật thông báo đẩy (thiếu khóa VAPID). Liên hệ Admin.</p>
          ) : device.state === "unsupported" ? (
            <p className="text-xs text-gray-500 leading-relaxed">
              {app.inApp
                ? `Trình duyệt của ${app.inApp.label} không nhận được thông báo — mở bằng Safari / Chrome.`
                : "Trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone cần iOS 16.4+ và phải cài ứng dụng lên màn hình chính trước."}
            </p>
          ) : device.state === "denied" ? (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3 leading-relaxed">
              Bạn đã chặn thông báo cho trang này. Mở cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) → cho phép Thông báo → tải lại trang.
            </p>
          ) : device.state === "on" ? (
            <button type="button" onClick={() => device.disable().then(() => mutate())} disabled={device.busy} className={btnGhost}>
              {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <BellOff className="w-3.5 h-3.5" aria-hidden />} Tắt trên thiết bị này
            </button>
          ) : (
            <button type="button" onClick={enable} disabled={device.busy} className={btnPrimary}>
              {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <BellRing className="w-3.5 h-3.5" aria-hidden />} Bật thông báo đẩy
            </button>
          )}
        </div>

        {/* GIỜ YÊN TĨNH */}
        <div className={card}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5" aria-hidden />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-gray-900">Giờ yên tĩnh</h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Trong khoảng này thông báo đẩy được giữ lại, gửi sau khi hết giờ yên tĩnh (trừ thông báo khẩn/bắt buộc).</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <CustomSelect label="Từ" value={start} onChange={setQStart} options={HALF_HOURS} />
            <CustomSelect label="Đến" value={end} onChange={setQEnd} options={HALF_HOURS} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => saveQuiet(false)} disabled={saving || !quietChanged} className={btnPrimary}>
              Lưu giờ yên tĩnh
            </button>
            {prefs?.quiet && (
              <button type="button" onClick={() => saveQuiet(true)} disabled={saving} className={btnGhost}>
                Tắt
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-6 min-w-0">
        {/* THEO TỪNG LOẠI */}
        {prefs ? <TypePrefs prefs={prefs} onToggle={toggleType} busy={typeBusy} /> : <div className={cn(card, "space-y-3")}><div className="shimmer-box h-6 w-48 rounded-lg" /><div className="shimmer-box h-48 rounded-xl" /></div>}

        {/* NHÓM NHẬN ĐẨY */}
        <div className={card}>
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Đẩy về điện thoại theo nhóm</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tắt nhóm nào thì thông báo của nhóm đó không đẩy về điện thoại nữa (vẫn thấy trong chuông thông báo của ứng dụng). Thông báo bắt buộc luôn được gửi.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {prefs?.categories.map((c) => (
              <CustomToggle key={c.code} checked={prefs.push[c.code] !== false} onChange={(v) => toggleCategory(c.code, v)} label={c.label} description={c.text} />
            ))}
            {!prefs && <div className="shimmer-box h-40 rounded-xl" />}
          </div>
        </div>
      </div>
    </div>
  );
}
