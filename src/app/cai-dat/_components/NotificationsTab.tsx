"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Bell, BellOff, BellRing, Download, Loader2, Moon, Smartphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import { useInstallApp, usePushDevice } from "@/lib/push";
import { CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

interface Prefs {
  categories: { code: string; label: string; text: string }[];
  push: Record<string, boolean>;
  quiet: { start: string; end: string } | null;
  devices: number;
  pushAvailable: boolean;
  vapidPublicKey: string | null;
}

const KEY = "/api/v1/notifications/preferences";
const card = "bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4";
const btnPrimary = "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60";
const btnGhost = "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition disabled:opacity-60";

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 ? "30" : "00";
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

/** Cài đặt → Thông báo: cài ứng dụng, bật thông báo đẩy trên thiết bị này, chọn nhóm nhận, giờ yên tĩnh. */
export default function NotificationsTab() {
  const { showToast } = useApp();
  const { data: prefs, mutate } = useSWR<Prefs>(KEY, swrFetcher, { revalidateOnFocus: false });
  const device = usePushDevice(prefs?.vapidPublicKey);
  const app = useInstallApp();
  const [qStart, setQStart] = useState<string | null>(null);
  const [qEnd, setQEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = qStart ?? prefs?.quiet?.start ?? "22:00";
  const end = qEnd ?? prefs?.quiet?.end ?? "06:00";
  const quietChanged = useMemo(() => !!prefs && (prefs.quiet ? prefs.quiet.start !== start || prefs.quiet.end !== end : qStart !== null || qEnd !== null), [prefs, start, end, qStart, qEnd]);

  const toggleCategory = async (code: string, enabled: boolean) => {
    if (!prefs) return;
    void mutate({ ...prefs, push: { ...prefs.push, [code]: enabled } }, { revalidate: false });
    try {
      await api.put(KEY, { category: code, enabled });
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutate();
    }
  };

  const saveQuiet = async (clear = false) => {
    setSaving(true);
    try {
      await api.put(KEY, { quiet: clear ? null : { start, end } });
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
      {/* CÀI ỨNG DỤNG */}
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold text-gray-900">Cài ứng dụng lên màn hình chính</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Mở nhanh như ứng dụng thường, toàn màn hình, và nhận được thông báo đẩy trên iPhone.</p>
          </div>
          {app.installed && <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">ĐÃ CÀI</span>}
        </div>
        {!app.installed && app.canInstall && (
          <button type="button" onClick={app.install} className={btnPrimary}><Download className="w-3.5 h-3.5" /> Cài ứng dụng</button>
        )}
        {!app.installed && !app.canInstall && app.ios && (
          <p className="text-xs text-gray-600 leading-relaxed rounded-xl bg-surface p-3.5">
            Trên iPhone/iPad (Safari): bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) → chọn <b>“Thêm vào Màn hình chính”</b>. Mở ứng dụng từ biểu tượng mới rồi quay lại đây để bật thông báo.
          </p>
        )}
        {!app.installed && !app.canInstall && !app.ios && (
          <p className="text-xs text-gray-500 leading-relaxed">Trên Chrome/Edge: bấm biểu tượng cài đặt ở thanh địa chỉ hoặc menu ⋮ → “Cài đặt Lưu Xá”.</p>
        )}
      </div>

      {/* THIẾT BỊ NÀY */}
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", device.state === "on" ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-primary")}>
            {device.state === "on" ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
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
          <p className="text-xs text-gray-500 leading-relaxed">Trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone cần iOS 16.4+ và phải cài ứng dụng lên màn hình chính trước.</p>
        ) : device.state === "denied" ? (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3 leading-relaxed">Bạn đã chặn thông báo cho trang này. Mở cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) → cho phép Thông báo → tải lại trang.</p>
        ) : device.state === "on" ? (
          <button type="button" onClick={() => device.disable().then(() => mutate())} disabled={device.busy} className={btnGhost}>
            {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />} Tắt trên thiết bị này
          </button>
        ) : (
          <button type="button" onClick={enable} disabled={device.busy} className={btnPrimary}>
            {device.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Bật thông báo đẩy
          </button>
        )}
      </div>

      {/* GIỜ YÊN TĨNH */}
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Moon className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Giờ yên tĩnh</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Trong khoảng này thông báo đẩy được giữ lại, gửi sau khi hết giờ yên tĩnh (trừ thông báo khẩn/bắt buộc).</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <CustomSelect label="Từ" value={start} onChange={setQStart} options={HALF_HOURS} />
          <CustomSelect label="Đến" value={end} onChange={setQEnd} options={HALF_HOURS} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => saveQuiet(false)} disabled={saving || !quietChanged} className={btnPrimary}>Lưu giờ yên tĩnh</button>
          {prefs?.quiet && <button type="button" onClick={() => saveQuiet(true)} disabled={saving} className={btnGhost}>Tắt</button>}
        </div>
      </div>
      </div>
      <div className="space-y-6 min-w-0">
      {/* NHÓM NHẬN */}
      <div className={card}>
        <div>
          <h3 className="text-base font-extrabold text-gray-900">Nhận thông báo đẩy về…</h3>
          <p className="text-xs text-gray-500 mt-0.5">Tắt nhóm nào thì không đẩy về điện thoại nữa (vẫn thấy trong chuông thông báo của ứng dụng). Thông báo bắt buộc luôn được gửi.</p>
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
