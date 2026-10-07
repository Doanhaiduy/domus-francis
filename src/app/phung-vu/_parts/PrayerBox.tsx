"use client";

import React, { useRef, useState } from "react";
import { Heart, Send, Flag, EyeOff, Eye, CheckCircle2, Trash2, ShieldCheck, UserSearch } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { PrayerDto, PrayerListDto } from "@/lib/types/community";
import { prayersApi, refreshPrayers } from "@/lib/data/community";
import { formatRelative } from "@/lib/community-format";
import { CustomTextarea } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PurgeButton } from "@/components/ui/PurgeButton";
import { ReasonDialog } from "@/app/dien-dan/_parts/ReasonDialog";

interface Props {
  data: PrayerListDto | undefined;
  canModerate: boolean;
  canReveal: boolean;
  canPost: boolean;
  showToast: (type: "success" | "error" | "info", msg: string) => void;
  mutate: (fn?: (d: PrayerListDto | undefined) => PrayerListDto | undefined, opts?: { revalidate?: boolean }) => Promise<unknown>;
}

export default function PrayerBox({ data, canModerate, canReveal, canPost, showToast, mutate }: Props) {
  const [intentionInput, setIntentionInput] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<PrayerDto | null>(null);
  const [revealTarget, setRevealTarget] = useState<PrayerDto | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [closeTarget, setCloseTarget] = useState<PrayerDto | null>(null);
  const prayers = data?.items ?? [];
  const prayPending = useRef(new Set<string>());

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await refreshPrayers();
      if (ok) showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const togglePraying = async (p: PrayerDto) => {
    if (prayPending.current.has(p.id)) return;
    prayPending.current.add(p.id);
    mutate(
      (d) =>
        d && {
          ...d,
          items: d.items.map((x) => (x.id === p.id ? { ...x, hasPrayed: !p.hasPrayed, prayingCount: Math.max(0, p.prayingCount + (p.hasPrayed ? -1 : 1)) } : x)),
        },
      { revalidate: false }
    );
    try {
      const r = await prayersApi.pray(p.id, !p.hasPrayed);
      mutate((d) => d && { ...d, items: d.items.map((x) => (x.id === p.id ? { ...x, hasPrayed: r.hasPrayed, prayingCount: r.prayingCount } : x)) }, { revalidate: false });
      refreshPrayers();
    } catch (e) {
      mutate();
      showToast("error", errorMessage(e));
    } finally {
      prayPending.current.delete(p.id);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Ý cầu nguyện cộng đoàn</h2>
          <p className="text-xs text-gray-500">Cùng hiệp thông nâng đỡ anh em trong lời cầu</p>
        </div>
        <span className="px-2.5 py-1 bg-emerald-100 text-secondary text-xs font-bold rounded-full">{data?.stats.total ?? prayers.length} ý</span>
      </div>

      {/* SEND INTENTION FORM */}
      {canPost && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const text = intentionInput.trim();
            if (text.length < 5) return showToast("error", "Ý cầu nguyện tối thiểu 5 ký tự.");
            const ok = await run(
              () => prayersApi.create(text, isAnonymous),
              isAnonymous ? "Đã gửi ý cầu nguyện ẩn danh — không ai thấy tên bạn." : "Đã gửi ý cầu nguyện. Cả nhà sẽ cùng hiệp thông!"
            );
            if (ok) {
              setIntentionInput("");
              setIsAnonymous(false);
            }
          }}
          className="space-y-2"
        >
          <CustomTextarea
            id="prayer-input"
            value={intentionInput}
            maxLength={1000}
            onChange={(e) => setIntentionInput(e.target.value)}
            placeholder="Ghi ý nguyện của bạn để anh em cùng hiệp thông..."
            rows={2}
          />

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer">
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="rounded text-primary" />
              <span>Gửi ẩn danh</span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs transition shadow-2xs flex items-center gap-1 disabled:opacity-60"
            >
              <Send className="w-3 h-3" />
              <span>Gửi ý cầu</span>
            </button>
          </div>
        </form>
      )}

      {/* PRAYER CARDS */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        {prayers.map((p) => (
          <div
            key={p.id}
            className={`p-3.5 rounded-2xl border text-xs ${
              p.visibility === "hidden" ? "bg-rose-50/40 border-rose-100" : p.status === "answered" ? "bg-emerald-50/40 border-emerald-100" : "bg-surface-container-low/60 border-purple-50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-gray-900 leading-relaxed font-medium">“{p.text}”</p>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {p.status === "answered" && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Đã được nhậm lời 🙏</span>
                )}
                {p.visibility === "hidden" && <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Đã ẩn</span>}
                {!!p.openReports && <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">{p.openReports} báo cáo</span>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-purple-50/50 text-[11px] text-gray-400">
              <span className="truncate">
                {p.author}
                {p.isMine ? " (bạn)" : ""}
                {revealed[p.id] ? <b className="text-rose-600"> · {revealed[p.id]}</b> : null} · {formatRelative(p.createdAt)}
              </span>
              <button
                disabled={p.status !== "open" && !p.hasPrayed}
                onClick={() => togglePraying(p)}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 shrink-0 disabled:opacity-60 ${
                  p.hasPrayed ? "bg-primary text-white shadow-2xs" : "bg-white text-gray-700 hover:bg-purple-100 border border-gray-200"
                }`}
              >
                <Heart className={`w-3 h-3 ${p.hasPrayed ? "fill-white" : ""}`} />
                <span>{p.prayingCount} người cầu nguyện</span>
              </button>
            </div>

            {/* Hành động: chính chủ / kiểm duyệt / báo cáo */}
            <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-gray-400 flex-wrap">
              {(p.isMine || canModerate) && p.status === "open" && (
                <button
                  onClick={() => run(() => prayersApi.setStatus(p.id, "answered"), "Tạ ơn Chúa! Đã đánh dấu ý cầu nguyện được nhậm lời.")}
                  className="flex items-center gap-0.5 hover:text-emerald-700"
                >
                  <CheckCircle2 className="w-3 h-3" /> Đã được nhậm lời
                </button>
              )}
              {(p.isMine || canModerate) && (
                <button onClick={() => setCloseTarget(p)} className="flex items-center gap-0.5 hover:text-rose-600">
                  <Trash2 className="w-3 h-3" /> Gỡ
                </button>
              )}
              {canModerate && (
                <button
                  onClick={() =>
                    run(
                      () => prayersApi.setHidden(p.id, p.visibility !== "hidden"),
                      p.visibility === "hidden" ? "Đã hiện lại ý cầu nguyện." : "Đã ẩn ý cầu nguyện."
                    )
                  }
                  className="flex items-center gap-0.5 hover:text-rose-600"
                >
                  {p.visibility === "hidden" ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {p.visibility === "hidden" ? "Hiện" : "Ẩn"}
                </button>
              )}
              {canModerate && !!p.openReports && (
                <button
                  onClick={() => run(() => prayersApi.resolveReports(p.id, "dismissed"), "Đã đóng báo cáo — ý cầu nguyện không vi phạm.")}
                  className="flex items-center gap-0.5 hover:text-amber-700"
                >
                  <ShieldCheck className="w-3 h-3" /> Bỏ qua báo cáo
                </button>
              )}
              <PurgeButton variant="text" url={`/api/v1/prayers/${p.id}`} what="ý cầu nguyện này" className="!px-2 !py-0.5 !text-[10px]" />
              {canReveal && p.revealable && !revealed[p.id] && (
                <button onClick={() => setRevealTarget(p)} className="flex items-center gap-0.5 text-rose-500 hover:text-rose-700">
                  <UserSearch className="w-3 h-3" /> Xem tác giả (có báo cáo)
                </button>
              )}
              {!p.isMine && (
                <button
                  disabled={p.myReported}
                  onClick={() => setReportTarget(p)}
                  className="flex items-center gap-0.5 hover:text-amber-700 disabled:opacity-60 ml-auto"
                >
                  <Flag className="w-3 h-3" /> {p.myReported ? "Đã báo cáo" : "Báo cáo"}
                </button>
              )}
            </div>
          </div>
        ))}
        {prayers.length === 0 && <div className="text-xs text-gray-400 italic text-center py-3">Chưa có ý cầu nguyện nào.</div>}
      </div>

      <ReasonDialog
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title="Báo cáo ý cầu nguyện vi phạm"
        description="Báo cáo được gửi tới người quản lý. Chỉ khi có báo cáo, Trưởng nhà mới được xem tác giả ý ẩn danh (có ghi nhật ký)."
        placeholder="Ý cầu nguyện này vi phạm nội quy như thế nào?"
        confirmText="Gửi báo cáo"
        onConfirm={async (reason) => {
          try {
            await prayersApi.report(reportTarget!.id, reason);
            await refreshPrayers();
            showToast("success", "Đã gửi báo cáo tới người quản lý.");
          } catch (e) {
            showToast("error", errorMessage(e));
            throw e;
          }
        }}
      />

      <ReasonDialog
        isOpen={!!revealTarget}
        onClose={() => setRevealTarget(null)}
        title="Xem tác giả ý cầu nguyện ẩn danh"
        description="Chỉ dùng để xử lý báo cáo vi phạm. Mỗi lần xem được ghi vào nhật ký truy cập dữ liệu nhạy cảm."
        placeholder="Lý do cần xem tác giả (tối thiểu 10 ký tự)…"
        confirmText="Xem tác giả"
        minLength={10}
        onConfirm={async (reason) => {
          try {
            const r = await prayersApi.reveal(revealTarget!.id, reason);
            setRevealed((m) => ({ ...m, [revealTarget!.id]: r.fullName ?? "Không xác định" }));
            showToast("info", r.fullName ? `Tác giả: ${r.fullName}` : "Không tìm thấy tác giả (đã ẩn danh hóa).");
          } catch (e) {
            showToast("error", errorMessage(e));
            throw e;
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        onConfirm={() => closeTarget && run(() => prayersApi.setStatus(closeTarget.id, "closed"), "Đã gỡ ý cầu nguyện.")}
        title="Gỡ ý cầu nguyện này?"
        message="Ý cầu nguyện sẽ không còn hiển thị trên bảng hiệp thông."
        confirmText="Gỡ"
        variant="warning"
      />
    </div>
  );
}
