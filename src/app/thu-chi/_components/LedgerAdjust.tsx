"use client";

// Điều chỉnh sổ quỹ: ghi thêm một bút toán thu/chi (kèm lý do) khi số liệu lệch — vd. nhập sai số dư đầu kỳ, tiền thực tế thừa/thiếu so với sổ.
// Sổ quỹ bất biến: không sửa/xóa bút toán cũ, chỉ ghi thêm bút toán ngược lại. Chỉ Trưởng nhà / Admin (finance.ledger.adjust).
import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Scale } from "lucide-react";
import { CustomDatePicker, CustomInput, CustomTextarea } from "@/components/ui/FormControls";
import { FundSelect } from "@/components/finance/FundSelect";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn, formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { newRequestId } from "@/lib/data/finance";
import { useOpeningBalances } from "@/lib/data/finance-opening";
import { adjustmentApi, useManualEntries } from "@/lib/data/finance-adjust";
import { MANUAL_ENTRY_LABEL, type AdjustDirection, type ManualEntryDto } from "@/lib/types/finance-adjust";
import type { OpeningBalanceDto } from "@/lib/types/finance-opening";
import { btnGhost, btnPrimary, DialogShell, ErrorBox } from "./dialogs";

const toAmount = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** Nút "Điều chỉnh sổ quỹ" (chỉ người có finance.ledger.adjust). */
export function AdjustButton() {
  const { can } = useSession();
  const allowed = can("finance.ledger.adjust");
  const { data } = useOpeningBalances(allowed);
  const [open, setOpen] = useState(false);
  if (!allowed || !data || data.funds.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-lg border border-purple-200 text-[11px] font-bold text-primary hover:bg-purple-50 transition"
      >
        Điều chỉnh sổ quỹ
      </button>
      {open && <AdjustDialog funds={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdjustDialog({ funds, onClose }: { funds: OpeningBalanceDto; onClose: () => void }) {
  const { showToast } = useApp();
  const { data: manual } = useManualEntries(true);
  const [direction, setDirection] = useState<AdjustDirection>("in");
  const [fundId, setFundId] = useState(funds.funds[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(funds.today);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => newRequestId());

  const fund = funds.funds.find((f) => f.id === fundId);
  const amountVnd = toAmount(amount);
  const after = fund ? fund.balanceVnd + (direction === "in" ? amountVnd : -amountVnd) : 0;

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fund) return setError("Chọn túi quỹ cần điều chỉnh.");
    if (fund.canOpen) return setError("Quỹ chưa có số dư đầu kỳ — hãy nhập “Số dư đầu kỳ” trước (bút toán điều chỉnh đầu tiên sẽ khiến không nhập được nữa).");
    if (!(amountVnd >= 1)) return setError("Hãy nhập số tiền điều chỉnh.");
    if (entryDate > funds.today) return setError("Ngày hạch toán không được ở tương lai.");
    if (reason.trim().length < 10) return setError("Lý do tối thiểu 10 ký tự — ghi rõ vì sao điều chỉnh để sau này đối chiếu.");
    if (direction === "out" && after < 0) return setError(`Quỹ chỉ còn ${formatVND(fund.balanceVnd)}, không trừ được ${formatVND(amountVnd)}.`);
    setStep("confirm");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adjustmentApi.post({ fundId, direction, amountVnd, entryDate, reason: reason.trim(), clientRequestId: requestId });
      showToast("success", direction === "in" ? "Đã cộng vào sổ quỹ." : "Đã trừ khỏi sổ quỹ.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setStep("edit");
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === "confirm" ? (
      <>
        <button type="button" onClick={() => setStep("edit")} disabled={busy} className={`${btnGhost} inline-flex items-center gap-1.5`}>
          <ArrowLeft className="w-3.5 h-3.5" /> Sửa lại
        </button>
        <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>
          {busy ? "Đang ghi…" : "Xác nhận ghi sổ"}
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={onClose} className={btnGhost}>
          Hủy
        </button>
        <button type="submit" form="adjust-form" className={btnPrimary}>
          Xem lại
        </button>
      </>
    );

  return (
    <DialogShell open onClose={() => !busy && onClose()} icon={<Scale className="w-5 h-5" />} title="Điều chỉnh sổ quỹ" subtitle="Ghi thêm một bút toán kèm lý do" footer={footer} z="z-[999]">
      {step === "confirm" ? (
        <>
          <p className="text-sm text-gray-700">
            Ghi bút toán <b>{direction === "in" ? "cộng vào" : "trừ khỏi"}</b> quỹ ngày <b>{dmy(entryDate)}</b>. <b>Không sửa hay xóa được</b> — nếu sai, phải ghi thêm bút toán ngược lại.
          </p>
          <div className="rounded-2xl border border-gray-100 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-gray-600">{fund?.name}</span>
              <span className={cn("font-extrabold", direction === "in" ? "text-emerald-700" : "text-rose-600")}>
                {direction === "in" ? "+" : "−"}
                {formatVND(amountVnd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
              <span>Số dư quỹ</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-gray-800">
                {formatVND(fund?.balanceVnd ?? 0)} <ArrowRight className="w-3 h-3 text-gray-400" /> {formatVND(after)}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            <b>Lý do:</b> {reason.trim()}
          </p>
          <ErrorBox error={error} />
        </>
      ) : (
        <form id="adjust-form" onSubmit={review} className="space-y-4">
          <div className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
            {(
              [
                ["in", "Cộng vào quỹ"],
                ["out", "Trừ khỏi quỹ"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDirection(k)}
                className={cn("px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", direction === k ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700")}
              >
                {label}
              </button>
            ))}
          </div>
          <FundSelect label="Túi quỹ" value={fundId} onChange={setFundId} funds={funds.funds} />
          {fund && (
            <p className="text-xs text-gray-500">
              Số dư hiện tại của <b className="text-gray-800">{fund.name}</b>: <b className="text-gray-900">{formatVND(fund.balanceVnd)}</b>
              {fund.canOpen && <span className="text-amber-700 font-semibold"> — chưa có số dư đầu kỳ, hãy nhập số dư đầu kỳ trước.</span>}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomInput label="Số tiền (đồng) *" inputMode="numeric" value={amount ? toAmount(amount).toLocaleString("vi-VN") : ""} onChange={(e) => setAmount(e.target.value)} placeholder="500.000" rightSuffix="đ" />
            <CustomDatePicker label="Ngày hạch toán" format="YYYY-MM-DD" value={entryDate} onChange={(d) => d && setEntryDate(d)} required />
          </div>
          <CustomTextarea
            label="Lý do *"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="VD: Nhập sai số dư đầu kỳ, thực tế quỹ có thêm 500.000đ; hoặc: chi mua đồ ngoài hệ thống ngày 05/10 (hóa đơn giữ ở Thủ quỹ)"
          />
          <ErrorBox error={error} />
          <HistoryList entries={manual?.entries ?? []} />
        </form>
      )}
    </DialogShell>
  );
}

function HistoryList({ entries }: { entries: ManualEntryDto[] }) {
  const shown = useMemo(() => entries.slice(0, 8), [entries]);
  if (shown.length === 0) return null;
  return (
    <div className="pt-3 border-t border-gray-100">
      <p className="text-xs font-extrabold text-gray-700 mb-2">Bút toán ghi tay gần đây</p>
      <ul className="space-y-2">
        {shown.map((e) => (
          <li key={e.id} className="rounded-xl bg-gray-50/70 border border-gray-100 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-gray-700">
                {MANUAL_ENTRY_LABEL[e.kind]} · {dmy(e.entryDate)}
              </span>
              <span className={cn("font-extrabold", e.direction === "in" ? "text-emerald-700" : "text-rose-600")}>
                {e.direction === "in" ? "+" : "−"}
                {formatVND(e.amountVnd)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 break-words">{e.description}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {e.fundName}
              {e.recordedByName ? ` · ${e.recordedByName}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
