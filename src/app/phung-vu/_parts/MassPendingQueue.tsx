"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCheck, CheckCircle2, Image as ImageIcon, Inbox, Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { errorMessage, fileUrl } from "@/lib/api";
import { liturgyCalendarApi, refreshLiturgy, usePendingCheckins } from "@/lib/data/liturgy-calendar";
import type { MassPendingItemDto } from "@/lib/types/liturgy";
import { ZoomableImage } from "@/components/ui/ZoomableImage";
import { fileViewerImage } from "@/lib/image-viewer";
import { ReasonDialog } from "@/app/dien-dan/_parts/ReasonDialog";
import { dm, dmy } from "@/app/lich-su-kien/_components/liturgy-style";

const WEEKDAY = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const stamp = (isoTs: string) => new Date(isoTs).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/**
 * Hàng đợi check-in đi lễ CHỜ DUYỆT của mọi ngày (Ban Phụng vụ / Trưởng nhà / Admin): duyệt / từ chối từng bản hoặc hàng loạt.
 * "Chọn tất cả" và "Duyệt cả ngày" bỏ qua bản có cảnh báo (ảnh giống ảnh người khác, chụp sai ngày, thiếu ảnh bắt buộc) — các bản đó phải tick riêng.
 */
export default function MassPendingQueue() {
  const { showToast } = useApp();
  const { pending, isLoading, error, mutate } = usePendingCheckins(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);

  const items = useMemo(() => pending?.items ?? [], [pending]);
  // Bỏ chọn những bản không còn trong hàng đợi (đã được người khác duyệt…)
  useEffect(() => {
    setSelected((s) => {
      const live = new Set(items.map((i) => i.checkin.id));
      const next = new Set([...s].filter((id) => live.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [items]);

  const groups = useMemo(() => {
    const m = new Map<string, MassPendingItemDto[]>();
    for (const it of items) m.set(it.checkin.date, [...(m.get(it.checkin.date) ?? []), it]);
    return [...m.entries()];
  }, [items]);
  const selectable = items.filter((i) => !i.isMe);
  const quickIds = selectable.filter((i) => !i.flagged).map((i) => i.checkin.id);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const after = async (msg: string, skipped: number) => {
    await Promise.all([refreshLiturgy(), mutate()]);
    setSelected(new Set());
    showToast("success", skipped ? `${msg} · bỏ qua ${skipped} bản` : msg);
  };

  const approve = async (ids: string[], key: string) => {
    if (!ids.length) return;
    setBusy(key);
    try {
      const r = await liturgyCalendarApi.reviewMany(ids, "approved");
      await after(`Đã xác nhận ${r.reviewed} check-in.`, r.skipped.length);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const approveDay = async (date: string) => {
    setBusy(`day:${date}`);
    try {
      const r = await liturgyCalendarApi.approveDay(date);
      await after(r.reviewed ? `Đã xác nhận ${r.reviewed} check-in ngày ${dm(date)}.` : `Ngày ${dm(date)} không có bản nào duyệt nhanh được.`, r.skipped.length);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !pending) return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được hàng đợi: {errorMessage(error)}</div>;

  return (
    <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black text-gray-900">Check-in chờ duyệt</h3>
            <p className="text-[11px] text-gray-500">
              {pending ? (pending.total ? `${pending.total} bản chờ duyệt · ${pending.approvable} bản duyệt nhanh được (không cảnh báo)` : "Không còn check-in nào chờ duyệt.") : "Đang tải…"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 border border-gray-200 hover:bg-gray-50"
            title="Tải lại hàng đợi"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} /> Tải lại
          </button>
          {quickIds.length > 0 && (
            <button
              onClick={() => setSelected(new Set(quickIds))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary bg-purple-50 border border-purple-200 hover:bg-purple-100"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Chọn {quickIds.length} bản không cảnh báo
            </button>
          )}
        </div>
      </div>

      {pending && !pending.autoApproveNoPhoto && (
        <p className="mx-4 sm:mx-5 mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
          Đang TẮT tự xác nhận check-in không cần ảnh (Chúa Nhật) — mọi check-in đều phải duyệt tay. Bật lại ở{" "}
          <Link href="/lich-su-kien" className="font-bold underline">
            Lịch → Cấu hình lịch phụng vụ
          </Link>{" "}
          (thẻ “Bổn mạng, nhắc lễ & check-in”).
        </p>
      )}

      {isLoading && !pending ? (
        <div className="p-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="mt-2 text-sm font-bold text-gray-800">Đã duyệt hết — tạ ơn Chúa!</p>
          <p className="text-[11px] text-gray-500">Check-in mới cần duyệt sẽ hiện ở đây (và trong hộp “Việc cần xử lý”).</p>
        </div>
      ) : (
        <div className="p-3 sm:p-5 flex flex-col gap-4">
          {groups.map(([date, list]) => {
            const dayQuick = list.filter((i) => !i.flagged && !i.isMe).length;
            const first = list[0];
            return (
              <section key={date} className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-gray-900">
                      {weekday(date)} {dmy(date)} · {first.label}
                      {first.evidenceRequired ? <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold align-middle">cần ảnh</span> : null}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {first.dayTitle} · {list.length} chờ duyệt
                    </p>
                  </div>
                  {dayQuick > 0 && (
                    <button
                      onClick={() => approveDay(date)}
                      disabled={!!busy}
                      className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-60"
                    >
                      {busy === `day:${date}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} Duyệt cả ngày ({dayQuick})
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-gray-100">
                  {list.map((it) => (
                    <PendingRow
                      key={it.checkin.id}
                      it={it}
                      checked={selected.has(it.checkin.id)}
                      onToggle={() => toggle(it.checkin.id)}
                      busy={busy === it.checkin.id || busy === "bulk"}
                      onApprove={() => approve([it.checkin.id], it.checkin.id)}
                      onReject={() => setRejectIds([it.checkin.id])}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          {pending && pending.total > items.length && (
            <p className="text-[11px] text-gray-500 text-center">Đang hiện {items.length}/{pending.total} bản (các ngày gần nhất) — duyệt xong sẽ hiện tiếp.</p>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 border-t border-purple-100 bg-white/95 backdrop-blur-sm p-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-gray-700">Đã chọn {selected.size} check-in</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
              Bỏ chọn
            </button>
            <button
              onClick={() => setRejectIds([...selected])}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-60"
            >
              <XCircle className="w-3.5 h-3.5" /> Không hợp lệ
            </button>
            <button
              onClick={() => approve([...selected], "bulk")}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs disabled:opacity-60"
            >
              {busy === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} Xác nhận hợp lệ ({selected.size})
            </button>
          </div>
        </div>
      )}

      <ReasonDialog
        isOpen={!!rejectIds}
        onClose={() => setRejectIds(null)}
        title={rejectIds && rejectIds.length > 1 ? `Đánh dấu ${rejectIds.length} check-in chưa hợp lệ` : "Check-in chưa hợp lệ"}
        description="Người check-in nhận thông báo kèm lý do và có thể gửi lại minh chứng (lần gửi lại phải duyệt tay)."
        placeholder="Lý do (vd: ảnh không phải trong nhà thờ, ảnh của ngày khác)…"
        confirmText="Gửi"
        minLength={3}
        onConfirm={async (reason) => {
          const ids = rejectIds ?? [];
          try {
            const r = await liturgyCalendarApi.reviewMany(ids, "rejected", reason);
            await after(`Đã đánh dấu ${r.reviewed} check-in chưa hợp lệ.`, r.skipped.length);
          } catch (e) {
            showToast("error", errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

function PendingRow({
  it,
  checked,
  onToggle,
  busy,
  onApprove,
  onReject,
}: {
  it: MassPendingItemDto;
  checked: boolean;
  onToggle: () => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const c = it.checkin;
  return (
    <li className={cn("p-3 sm:px-4 flex gap-3 transition", checked && "bg-purple-50/50", it.flagged && "bg-orange-50/40")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Chọn check-in của ${it.name}`}
        disabled={it.isMe}
        onClick={onToggle}
        className={cn(
          "mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-white text-[11px] font-black transition",
          checked ? "bg-primary border-primary" : "border-gray-300 bg-white",
          it.isMe && "opacity-30 cursor-not-allowed"
        )}
      >
        {checked ? "✓" : ""}
      </button>
      {c.evidenceFileId ? (
        <ZoomableImage
          src={fileUrl(c.evidenceFileId, "thumb") ?? ""}
          viewer={fileViewerImage(c.evidenceFileId, `Check-in đi lễ — ${it.name}`, c.church ?? undefined)}
          alt={`Ảnh check-in của ${it.name}`}
          title="Xem ảnh minh chứng"
          className="shrink-0 w-14 h-14 rounded-xl object-cover border border-gray-200"
        />
      ) : (
        <span className="shrink-0 w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300">
          <ImageIcon className="w-5 h-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <p className="text-xs font-bold text-gray-900">
          {it.name}
          {it.room ? <span className="font-medium text-gray-400"> · {it.room}</span> : null}
          {it.isMe ? <span className="font-medium text-primary"> · của bạn — người khác duyệt</span> : null}
        </p>
        <p className="text-[11px] text-gray-500">
          Gửi {stamp(c.checkedInAt)}
          {c.church ? ` · ${c.church}` : ""}
        </p>
        {c.note && <p className="text-[11px] text-gray-600 whitespace-pre-line">{c.note}</p>}
        {(it.duplicateOf || it.warning) && (
          <p className="text-[11px] text-orange-700 inline-flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              {it.duplicateOf ? `Ảnh giống ảnh của ${it.duplicateOf}. ` : ""}
              {it.warning ?? ""}
            </span>
          </p>
        )}
        {!it.isMe && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            <button
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-60"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Hợp lệ
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 disabled:opacity-60"
            >
              <XCircle className="w-3.5 h-3.5" /> Không hợp lệ
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
