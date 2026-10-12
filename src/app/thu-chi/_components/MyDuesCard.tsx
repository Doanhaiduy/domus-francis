"use client";

// Thẻ "Khoản của tôi" (Thu chi → Tổng quan): MỌI khoản thu người xem còn phải đóng (quỹ kỳ, điện nước, khoản thu một lần…) ở một chỗ —
// mỗi khoản: Nộp qua QR, "Tôi đã đóng" (chờ Thủ quỹ xác nhận) hoặc "Đã đóng" (người có quyền ghi thu), trạng thái chờ xác nhận + Hủy báo.
// "Báo đã đóng nhiều khoản": một lần chuyển khoản / đưa tiền cho nhiều khoản ⇒ báo cùng lúc.
import React, { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, HandCoins, Hourglass, QrCode, Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy, shiftMonth } from "@/lib/finance-format";
import { financeApi, refreshFinance, useContributionMatrix, usePendingClaims } from "@/lib/data/finance";
import { FEE_TYPE_LABEL, type ContributionCellDto, type ContributionClaimDto, type ContributionRowDto, type PaymentMethod } from "@/lib/types/finance";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "./dialogs";

const owing = (c: ContributionCellDto) => c.remainingVnd > 0 && (c.status === "unpaid" || c.status === "partial");
const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "cash", label: "Tiền mặt" },
];

/** Khoản còn phải đóng của chính người xem (24 tháng gần nhất + kỳ lập trước 6 tháng) — dùng chung cho thẻ và liên kết ?pay=. */
export function useMyDues(memberId: string | null | undefined, currentMonth: string) {
  const { matrix, isLoading, error } = useContributionMatrix({ member: memberId ?? undefined, to: shiftMonth(currentMonth, 6), months: 24 }, !!memberId);
  const row = useMemo(() => matrix?.rows.find((r) => r.memberId === memberId) ?? null, [matrix, memberId]);
  const items = useMemo(
    () => (row ? Object.values(row.cells).filter(owing).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.planName.localeCompare(b.planName)) : []),
    [row]
  );
  return { row, items, loaded: !!matrix || !!error || (!isLoading && !memberId) };
}

// ---------------------------------------------------------------------
// Báo đã đóng nhiều khoản cùng lúc
// ---------------------------------------------------------------------
function ClaimManyDialog({ row, cells, onClose }: { row: ContributionRowDto | null; cells: ContributionCellDto[]; onClose: () => void }) {
  const { showToast } = useApp();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!row && cells.length > 0;
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(cells.map((c) => c.contributionId)));
    setMethod("bank_transfer");
    setRef("");
    setNote("");
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = cells.filter((c) => picked.has(c.contributionId));
  const total = chosen.reduce((s, c) => s + c.remainingVnd, 0);
  const save = async () => {
    if (!chosen.length) return setError("Chọn ít nhất một khoản.");
    setBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const c of chosen) {
        await financeApi.claimPaid({ contributionId: c.contributionId, method, referenceCode: ref.trim() || null, note: note.trim() || (chosen.length > 1 ? `Đóng gộp ${chosen.length} khoản` : null) });
        done++;
      }
      await refreshFinance();
      showToast("success", `Đã báo đã đóng ${done} khoản (${formatVND(total)}) — chờ Thủ quỹ xác nhận.`);
      onClose();
    } catch (e) {
      if (done) await refreshFinance();
      setError(`${done ? `Đã báo ${done} khoản; ` : ""}${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };
  if (!open) return null;
  return (
    <DialogShell
      open
      onClose={onClose}
      icon={<HandCoins className="w-5 h-5" />}
      title="Báo đã đóng nhiều khoản"
      subtitle="Một lần chuyển khoản / đưa tiền cho nhiều khoản — Thủ quỹ xác nhận từng khoản"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !chosen.length} onClick={save} className={btnPrimary}>
            {busy ? "Đang gửi..." : `Báo đã đóng ${formatVND(total)}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {cells.map((c) => {
          const on = picked.has(c.contributionId);
          return (
            <label key={c.contributionId} className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs cursor-pointer ${on ? "border-primary bg-purple-50/50" : "border-gray-100"}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (n.has(c.contributionId)) n.delete(c.contributionId);
                    else n.add(c.contributionId);
                    return n;
                  })
                }
                className="w-4 h-4 accent-[#5f3add] shrink-0"
              />
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-gray-900 truncate">{c.planName}</span>
                <span className="text-[11px] text-gray-500">hạn {dmy(c.dueDate)}</span>
              </span>
              <b className="tabular-nums text-gray-900 shrink-0">{formatVND(c.remainingVnd)}</b>
            </label>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect<PaymentMethod> label="Bạn đã đóng bằng" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
        {method === "bank_transfer" && <CustomInput label="Mã giao dịch (nếu có)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ví dụ: FT26277123456" />}
      </div>
      <CustomInput label="Ghi chú cho Thủ quỹ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Chuyển một lần cho quỹ kỳ + điện nước" />
      <ErrorBox error={error} />
    </DialogShell>
  );
}

export default function MyDuesCard({
  memberId,
  currentMonth,
  canRecord,
  onPayQr,
  onClaim,
  onQuickPay,
  onOpenCell,
  onCancelClaim,
}: {
  memberId: string | null;
  currentMonth: string;
  /** Người có quyền ghi thu tự xác nhận "Đã đóng" thay vì báo chờ xác nhận */
  canRecord: boolean;
  onPayQr: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onClaim: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onQuickPay: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onOpenCell: (row: ContributionRowDto, cell: ContributionCellDto) => void;
  onCancelClaim: (claim: ContributionClaimDto) => void;
}) {
  const { row, items, loaded } = useMyDues(memberId, currentMonth);
  const { claims } = usePendingClaims(null, !!memberId);
  const [many, setMany] = useState(false);
  const claimOf = useMemo(() => new Map(claims.filter((c) => c.memberId === memberId).map((c) => [c.contributionId, c])), [claims, memberId]);
  if (!memberId || !loaded || !row) return null;
  const total = items.reduce((s, c) => s + c.remainingVnd, 0);
  const unclaimed = items.filter((c) => !claimOf.has(c.contributionId));
  const overdue = items.filter((c) => c.overdue).length;

  if (!items.length) {
    // Người quản lý không cần thẻ "đủ rồi"; thành viên thấy một dòng xác nhận nhỏ
    if (canRecord) return null;
    return (
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-xs text-emerald-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" /> Bạn đã đóng đủ mọi khoản thu. Cảm ơn bạn! 🎉
      </div>
    );
  }

  return (
    <div id="khoan-cua-toi" className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-100 shadow-xs flex flex-col gap-3 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Khoản của tôi</h2>
            <p className="text-xs text-gray-500">
              Còn <b className={overdue ? "text-rose-600" : "text-gray-900"}>{formatVND(total)}</b> · {items.length} khoản
              {overdue ? <span className="text-rose-600 font-semibold"> · {overdue} quá hạn</span> : null}
            </p>
          </div>
        </div>
        {!canRecord && unclaimed.length > 1 && (
          <button
            onClick={() => setMany(true)}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold active:scale-95 transition"
            title="Một lần chuyển khoản / đưa tiền cho nhiều khoản"
          >
            <Check className="w-3.5 h-3.5" /> Báo đã đóng nhiều khoản
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((c) => {
          const claim = claimOf.get(c.contributionId);
          return (
            <div key={c.contributionId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 bg-surface-container-low/40">
              <button type="button" onClick={() => onOpenCell(row, c)} className="text-left min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-gray-900">{c.planName}</span>
                  {c.feeType !== "periodic_dues" && c.feeType !== "utility" && (
                    <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-[10px] font-bold text-primary">{FEE_TYPE_LABEL[c.feeType]}</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500">
                  Còn <b className="text-gray-900 tabular-nums">{formatVND(c.remainingVnd)}</b>
                  {c.status === "partial" && <> (đã đóng {formatVND(c.paidVnd)})</>} ·{" "}
                  <span className={c.overdue ? "text-rose-600 font-semibold" : ""}>
                    hạn {dmy(c.dueDate)}
                    {c.overdue ? " — quá hạn" : ""}
                  </span>
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {claim ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold" title={claim.note ?? undefined}>
                      <Hourglass className="w-3 h-3" /> Chờ Thủ quỹ xác nhận
                    </span>
                    {!canRecord && (
                      <button onClick={() => onCancelClaim(claim)} className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold">
                        Hủy báo
                      </button>
                    )}
                  </>
                ) : canRecord ? (
                  <button onClick={() => onQuickPay(row, c)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold active:scale-95 transition">
                    <Check className="w-3.5 h-3.5" /> Đã đóng
                  </button>
                ) : (
                  <button onClick={() => onClaim(row, c)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold active:scale-95 transition">
                    <Check className="w-3.5 h-3.5" /> Tôi đã đóng
                  </button>
                )}
                <button onClick={() => onPayQr(row, c)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold active:scale-95 transition">
                  <QrCode className="w-3.5 h-3.5" /> Nộp qua QR
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <ClaimManyDialog row={many ? row : null} cells={many ? unclaimed : []} onClose={() => setMany(false)} />
    </div>
  );
}
