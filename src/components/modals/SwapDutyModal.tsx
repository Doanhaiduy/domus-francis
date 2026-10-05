"use client";

// Đơn đổi ca trực 3 bước (người xin → người nhận xác nhận → Ban điều hành duyệt) — dữ liệu thật từ /api/v1/duty/swaps.
// Mở toàn cục bằng openModal("swapDuty") (Tổng quan, Lịch sự kiện, Command palette) hoặc từ thẻ ca trực ở trang Hậu cần.
import React, { useEffect, useMemo, useState } from "react";
import { X, ArrowRightLeft, Check, Loader2, Clock } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomTextarea } from "@/components/ui/FormControls";
import { dutyApi, refreshDuty, useDutySwaps } from "@/lib/data/duty";
import { SWAP_STATUS_LABEL, dm, relativeHours, weekdayLabel } from "@/lib/duty-format";
import type { DutySwapDto } from "@/lib/types/duty";

export function SwapDutyCard({ initialAssignmentId, onClose }: { initialAssignmentId?: string | null; onClose: () => void }) {
  const { members, showToast } = useApp();
  const { session, can } = useSession();
  const me = session?.member?.id ?? null;
  const { swaps, isLoading, mutate } = useDutySwaps();
  const upcoming = useMemo(() => swaps?.upcoming ?? [], [swaps]);
  const pending = (swaps?.requests ?? []).filter((r) => r.canRespond || r.canCancel || r.canDecide);

  const [assignmentId, setAssignmentId] = useState<string>(initialAssignmentId ?? "");
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (assignmentId || !upcoming.length) return;
    const first = upcoming.find((u) => u.swappable);
    if (first) setAssignmentId(first.assignmentId);
  }, [upcoming, assignmentId]);

  const selected = upcoming.find((u) => u.assignmentId === assignmentId) ?? null;
  const candidates = useMemo(
    () => members.filter((m) => m.status === "active" && m.id !== me && !(selected?.members ?? []).some((x) => x.id === m.id)),
    [members, me, selected]
  );
  useEffect(() => {
    if (toId && !candidates.some((c) => c.id === toId)) setToId("");
  }, [candidates, toId]);

  const canRequest = can("duty.swap.request");
  const submit = async () => {
    if (!selected || !toId) return;
    if (reason.trim().length < 5) {
      showToast("warning", "Ghi lý do xin đổi ca (tối thiểu 5 ký tự).");
      return;
    }
    setBusy("submit");
    try {
      await dutyApi.requestSwap(selected.assignmentId, toId, reason.trim());
      const to = members.find((m) => m.id === toId);
      showToast("success", `Đã gửi yêu cầu đổi ca tới ${to?.fullName ?? "anh em"} — chờ xác nhận, sau đó Ban điều hành duyệt.`);
      setReason("");
      setToId("");
      await Promise.all([mutate(), refreshDuty()]);
      onClose();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900">Yêu Cầu Đổi Ca Trực</h3>
            <p className="text-xs text-gray-500 truncate">
              {selected
                ? `Ca hiện tại: ${selected.area.icon} ${selected.area.name} (${weekdayLabel(selected.date)}, ${dm(selected.date)} · ${selected.shift.label})`
                : "Chọn ca trực sắp tới của bạn và người nhận đổi"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100" aria-label="Đóng">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        {isLoading && !swaps ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải ca trực của bạn…
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">1. Ca trực bạn muốn đổi:</p>
              {upcoming.length === 0 ? (
                <p className="text-xs text-gray-500 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  Bạn không có ca trực nào sắp tới trong lịch đã công bố.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                  {upcoming.map((u) => (
                    <label
                      key={u.assignmentId}
                      className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition ${
                        u.swappable ? "border-gray-200 hover:bg-purple-50/50 cursor-pointer" : "border-gray-100 bg-gray-50/60 opacity-70 cursor-not-allowed"
                      } ${assignmentId === u.assignmentId ? "border-primary bg-purple-50/60" : ""}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="radio"
                          name="swapAssignment"
                          disabled={!u.swappable}
                          checked={assignmentId === u.assignmentId}
                          onChange={() => setAssignmentId(u.assignmentId)}
                          className="text-primary accent-primary"
                        />
                        <span className="text-xs font-bold text-gray-900 truncate">
                          {u.area.icon} {u.area.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0 text-right">
                        {weekdayLabel(u.date)} {dm(u.date)} · {u.shift.label}
                        {u.blockedReason && <span className="block text-amber-600">{u.blockedReason}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <>
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">2. Chọn anh em bạn muốn nhờ đổi ca:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll pr-1">
                    {candidates.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between p-3 rounded-xl border hover:bg-purple-50/50 cursor-pointer transition ${
                          toId === m.id ? "border-primary bg-purple-50/60" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input type="radio" name="swapMember" checked={toId === m.id} onChange={() => setToId(m.id)} className="text-primary accent-primary" />
                          <span className="text-xs font-bold text-gray-900">
                            {m.fullName} {m.room && m.room !== "Chưa xếp phòng" ? `(${m.room})` : ""}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400">{m.role}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <CustomTextarea
                  label="3. Lý do xin đổi ca *"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: Trùng lịch thi môn Giải tích, đi thực tập cả ngày…"
                />
                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Phải xin trước giờ ca ít nhất {swaps?.minNoticeHours ?? 12} giờ. Người nhận xác nhận xong, Ban điều hành duyệt mới
                  đổi người trực.
                </p>
              </>
            )}

            {pending.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-2">Đơn đổi ca đang chờ xử lý:</p>
                <PendingSwapList requests={pending} onDone={() => Promise.all([mutate(), refreshDuty()])} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
          Hủy bỏ
        </button>
        <button
          onClick={submit}
          disabled={!canRequest || !selected || !selected.swappable || !toId || busy === "submit"}
          title={!canRequest ? "Tài khoản không có quyền xin đổi ca" : undefined}
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {busy === "submit" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Gửi yêu cầu tới anh em
        </button>
      </div>
    </div>
  );
}

/** Danh sách đơn đổi ca cần mình xử lý (trả lời / duyệt / rút đơn). */
export function PendingSwapList({ requests, onDone }: { requests: DutySwapDto[]; onDone: () => Promise<unknown> }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (r: DutySwapDto, kind: "accept" | "decline" | "cancel" | "approve" | "reject") => {
    setBusy(`${r.id}:${kind}`);
    try {
      if (kind === "accept" || kind === "decline") await dutyApi.respondSwap(r.id, kind === "accept");
      else if (kind === "cancel") await dutyApi.cancelSwap(r.id);
      else await dutyApi.decideSwap(r.id, kind === "approve");
      const msg: Record<typeof kind, string> = {
        accept: "Đã đồng ý trực thay — chờ Ban điều hành duyệt.",
        decline: "Đã từ chối đổi ca.",
        cancel: "Đã rút đơn đổi ca.",
        approve: `Đã duyệt: ${r.to.fullName} trực thay ${r.from.fullName}.`,
        reject: "Đã từ chối đơn đổi ca.",
      };
      showToast(kind === "decline" || kind === "reject" ? "info" : "success", msg[kind]);
      await onDone();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="p-3 rounded-xl border border-purple-100 bg-purple-50/40 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-gray-900 truncate">
              {r.area.icon} {r.area.name} · {weekdayLabel(r.date)} {dm(r.date)} ({r.shift.label})
            </span>
            <span className="text-[10px] font-bold text-amber-700 shrink-0">{SWAP_STATUS_LABEL[r.status]}</span>
          </div>
          <p className="text-gray-600 mt-1">
            {r.from.fullName} → {r.to.fullName}: <i>“{r.reason}”</i>
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Hết hạn sau {relativeHours(r.expiresAt)}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.canRespond && (
              <>
                <button
                  onClick={() => act(r, "accept")}
                  disabled={!!busy}
                  className="px-2.5 py-1 rounded-lg bg-primary text-white font-bold hover:bg-[#4d2dbf] disabled:opacity-60 inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Đồng ý trực thay
                </button>
                <button onClick={() => act(r, "decline")} disabled={!!busy} className="px-2.5 py-1 rounded-lg bg-gray-100 font-bold text-gray-700 hover:bg-gray-200">
                  Từ chối
                </button>
              </>
            )}
            {r.canDecide && (
              <>
                <button onClick={() => act(r, "approve")} disabled={!!busy} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700">
                  Duyệt đổi ca
                </button>
                <button onClick={() => act(r, "reject")} disabled={!!busy} className="px-2.5 py-1 rounded-lg bg-gray-100 font-bold text-gray-700 hover:bg-gray-200">
                  Từ chối
                </button>
              </>
            )}
            {r.canCancel && (
              <button onClick={() => act(r, "cancel")} disabled={!!busy} className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50">
                Rút đơn
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SwapDutyModal() {
  const { closeModal } = useApp();
  return <SwapDutyCard onClose={closeModal} />;
}
