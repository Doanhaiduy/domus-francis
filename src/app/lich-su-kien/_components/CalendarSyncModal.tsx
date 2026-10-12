"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarSync, Check, Copy, ExternalLink, Link2, ShieldAlert, Smartphone, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CustomInput } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isoToVnDateTime } from "@/lib/events-format";
import { calendarFeedApi, useCalendarFeeds } from "@/lib/data/events";
import type { CalendarFeedCreatedDto, CalendarFeedTokenDto } from "@/lib/types/events";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Guide = "google" | "iphone" | "android";

const GUIDES: Record<Guide, { label: string; steps: React.ReactNode[] }> = {
  google: {
    label: "Google Calendar",
    steps: [
      <>Mở <b>calendar.google.com</b> trên máy tính (điện thoại không thêm lịch theo đường dẫn được).</>,
      <>Bên trái, cạnh <b>Lịch khác</b> bấm dấu <b>+</b> → <b>Từ URL</b>.</>,
      <>Dán đường dẫn ở trên → <b>Thêm lịch</b>. Lịch hiện trên mọi thiết bị dùng cùng tài khoản Google (kể cả Android).</>,
      <>Google tự tải lại lịch vài giờ một lần — thay đổi trên ứng dụng có thể chậm hiện ra.</>,
    ],
  },
  iphone: {
    label: "iPhone / iPad",
    steps: [
      <>Bấm nút <b>Mở bằng ứng dụng Lịch</b> ở trên rồi chọn <b>Đăng ký</b>.</>,
      <>Hoặc vào <b>Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm lịch đã đăng ký</b>, dán đường dẫn.</>,
      <>Có thể đặt tần suất làm mới trong <b>Cài đặt → Lịch → Tài khoản → Tìm nạp dữ liệu mới</b>.</>,
    ],
  },
  android: {
    label: "Android",
    steps: [
      <>Thêm lịch bằng Google Calendar trên máy tính (thẻ <b>Google Calendar</b>), dùng cùng tài khoản Google với điện thoại.</>,
      <>Trên điện thoại mở ứng dụng Google Calendar → <b>Cài đặt</b> → chọn lịch vừa thêm → bật <b>Đồng bộ hóa</b>.</>,
    ],
  },
};

/** Đồng bộ lịch: tạo đường dẫn lịch cá nhân (.ics) để đăng ký trong Google Calendar / Lịch iPhone, xem và thu hồi các đường dẫn đang dùng. */
export default function CalendarSyncModal({ open, onClose }: Props) {
  const { showToast } = useApp();
  const { feeds, isLoading, mutate } = useCalendarFeeds(open);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<CalendarFeedCreatedDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [guide, setGuide] = useState<Guide>("iphone");
  const [busy, setBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CalendarFeedTokenDto | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) {
      setCreated(null);
      setLabel("");
      setCopied(false);
    } else if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) setGuide("android");
    else if (typeof navigator !== "undefined" && !/iphone|ipad|macintosh/i.test(navigator.userAgent)) setGuide("google");
  }, [open]);

  const items = feeds?.items ?? [];
  const max = feeds?.max ?? 5;

  const create = async () => {
    setBusy(true);
    try {
      const r = await calendarFeedApi.create(label.trim() || null);
      setCreated(r);
      setCopied(false);
      setLabel("");
      await mutate();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      showToast("success", "Đã sao chép đường dẫn lịch.");
    } catch {
      showToast("error", "Không sao chép được — hãy chọn và sao chép đường dẫn bằng tay.");
    }
  };

  const revoke = async (t: CalendarFeedTokenDto) => {
    try {
      const r = await calendarFeedApi.revoke(t.id);
      await mutate(r, { revalidate: false });
      if (created?.item.id === t.id) setCreated(null);
      showToast("success", "Đã thu hồi đường dẫn — ứng dụng lịch dùng đường dẫn đó sẽ không tải được nữa.");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  if (!open || !mounted) return null;

  const overlay = (
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
        >
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <CalendarSync className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-gray-900">Đồng bộ lịch với điện thoại</h3>
                <p className="text-[11px] text-gray-500 leading-snug">Thêm lịch sinh hoạt của nhà vào Google Calendar hoặc Lịch iPhone — lịch tự cập nhật.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
            <div className="rounded-2xl bg-surface-container-low/70 p-3 text-[11px] text-gray-600 space-y-1">
              <p className="font-bold text-gray-800">Lịch của bạn gồm:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Các sự kiện của nhà bạn được xem (60 ngày trước → 6 tháng tới), kể cả buổi sinh hoạt định kỳ.</li>
                <li>Các tuần bạn trực vệ sinh sân nhà (cả tuần).</li>
                <li>Các ngày lễ buộc phải check-in đi lễ trong 2 tháng tới.</li>
              </ul>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <p>
                <b>Ai có đường dẫn này đều xem được lịch của bạn</b> (không cần đăng nhập). Đừng gửi cho người khác hay đăng lên nhóm. Lỡ để lộ: bấm{" "}
                <b>Thu hồi</b> rồi tạo đường dẫn mới.
              </p>
            </div>

            {created && (
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-3 space-y-2.5">
                <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> Đã tạo đường dẫn{created.item.label ? ` "${created.item.label}"` : ""} — chỉ hiện MỘT lần, hãy thêm vào lịch ngay
                </p>
                <div
                  className="p-2.5 rounded-xl bg-white border border-emerald-100 font-mono text-[11px] text-gray-800 break-all select-all"
                  data-no-dirty
                >
                  {created.url}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition active:scale-95"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Đã sao chép" : "Sao chép đường dẫn"}
                  </button>
                  <a
                    href={created.webcalUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition"
                  >
                    <ExternalLink className="w-4 h-4" /> Mở bằng ứng dụng Lịch
                  </a>
                </div>
                <div>
                  <div className="flex gap-1 p-1 rounded-xl bg-white border border-emerald-100" role="tablist" aria-label="Hướng dẫn thêm lịch">
                    {(Object.keys(GUIDES) as Guide[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        role="tab"
                        aria-selected={guide === g}
                        onClick={() => setGuide(g)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-bold transition",
                          guide === g ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-emerald-50"
                        )}
                      >
                        {GUIDES[g].label}
                      </button>
                    ))}
                  </div>
                  <ol className="mt-2 list-decimal pl-5 space-y-1 text-[11px] text-gray-700 leading-relaxed">
                    {GUIDES[guide].steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800">
                  Đường dẫn đang dùng ({items.length}/{max})
                </span>
              </div>
              {isLoading && <p className="text-[11px] text-gray-400">Đang tải…</p>}
              {!isLoading && !items.length && <p className="text-[11px] text-gray-400">Bạn chưa có đường dẫn lịch nào.</p>}
              {items.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100 bg-white">
                  <div className="flex items-start gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{t.label || "Đường dẫn lịch"}</p>
                      <p className="text-[10px] text-gray-500">
                        Tạo {isoToVnDateTime(t.createdAt)} ·{" "}
                        {t.lastUsedAt ? `ứng dụng lịch tải lần cuối ${isoToVnDateTime(t.lastUsedAt)}` : "chưa được ứng dụng lịch nào tải"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(t)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Thu hồi
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3 space-y-2">
              <CustomInput
                label="Tên gợi nhớ (tuỳ chọn)"
                placeholder="VD: iPhone của tôi, Google Calendar"
                value={label}
                maxLength={60}
                onChange={(e) => setLabel(e.target.value)}
                leftIcon={<Link2 className="w-4 h-4" />}
              />
              <button
                type="button"
                onClick={create}
                disabled={busy || items.length >= max}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50"
              >
                <CalendarSync className="w-4 h-4" />
                {busy ? "Đang tạo..." : items.length >= max ? `Đã đủ ${max} đường dẫn — thu hồi bớt để tạo mới` : "Tạo đường dẫn lịch mới"}
              </button>
              <p className="text-[10px] text-gray-500">
                Mỗi thiết bị / ứng dụng lịch nên dùng một đường dẫn riêng để thu hồi riêng được. Muốn thêm từng sự kiện: bấm <b>Thêm vào lịch</b> ở thẻ sự kiện.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(overlay, document.body)}
      <ConfirmDialog
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revoke(revokeTarget)}
        title="Thu hồi đường dẫn lịch?"
        message={`Ứng dụng lịch đang dùng "${revokeTarget?.label || "đường dẫn này"}" sẽ không cập nhật được nữa (lịch cũ có thể vẫn hiện tới khi bạn gỡ lịch đó khỏi ứng dụng).`}
        confirmText="Thu hồi"
        variant="danger"
      />
    </>
  );
}
