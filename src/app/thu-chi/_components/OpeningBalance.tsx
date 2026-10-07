"use client";

// Số dư quỹ khởi đầu: khi mới triển khai, Trưởng nhà / Admin nhập số tiền đang có trong từng túi quỹ (bút toán "số dư đầu kỳ").
// Mỗi túi quỹ chỉ nhập được MỘT lần, là bút toán đầu tiên của sổ, bất biến (nhập sai ⇒ ghi bút toán điều chỉnh, không sửa).
import React, { useState } from "react";
import { ArrowLeft, Landmark, Lock, PiggyBank } from "lucide-react";
import { CustomDatePicker, CustomInput, CustomTextarea } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { newRequestId } from "@/lib/data/finance";
import { openingBalanceApi, useOpeningBalances } from "@/lib/data/finance-opening";
import type { OpeningBalanceDto, OpeningFundDto } from "@/lib/types/finance-opening";
import { btnGhost, btnPrimary, DialogShell, ErrorBox } from "./dialogs";

const toAmount = (s: string) => Number(s.replace(/[^\d]/g, ""));
const TYPE_HINT: Record<string, string> = { cash: "Tiền mặt do Thủ quỹ giữ", bank: "Số dư trong tài khoản ngân hàng" };

/** Dữ liệu chỉ tải cho người có quyền ghi (Trưởng nhà / Admin) — người khác không gọi API. */
function useOpeningForAdjuster() {
  const { can } = useSession();
  const allowed = can("finance.ledger.adjust");
  const { data } = useOpeningBalances(allowed);
  return { allowed, data };
}

/** Thông báo nổi bật ở đầu Tổng quan khi sổ quỹ còn trống hoàn toàn (mới triển khai). */
export function OpeningBalanceBanner() {
  const { allowed, data } = useOpeningForAdjuster();
  const [open, setOpen] = useState(false);
  if (!allowed || !data || data.funds.length === 0 || !data.funds.every((f) => f.canOpen)) return null;
  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <PiggyBank className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-amber-900">Sổ quỹ còn trống — nhập số dư quỹ khởi đầu</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Mới triển khai? Hãy nhập số tiền đang có trong quỹ tiền mặt và tài khoản ngân hàng để tồn quỹ, biểu đồ và báo cáo tính đúng ngay từ đầu.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shrink-0 shadow-sm">
          Nhập số dư khởi đầu
        </button>
      </div>
      {open && <OpeningDialog data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Nút nhỏ cạnh số dư các túi quỹ: mở hộp thoại (xem số dư đầu kỳ đã nhập / nhập cho túi quỹ còn trống). */
export function OpeningBalanceButton() {
  const { allowed, data } = useOpeningForAdjuster();
  const [open, setOpen] = useState(false);
  if (!allowed || !data || data.funds.length === 0) return null;
  const pending = data.funds.some((f) => f.canOpen);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-lg border border-purple-200 text-[11px] font-bold text-primary hover:bg-purple-50 transition"
      >
        {pending ? "Nhập số dư đầu kỳ" : "Xem số dư đầu kỳ"}
      </button>
      {open && <OpeningDialog data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

function OpeningDialog({ data, onClose }: { data: OpeningBalanceDto; onClose: () => void }) {
  const { showToast } = useApp();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState(data.today);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mỗi túi quỹ một mã yêu cầu: bấm lại sau lỗi mạng không ghi trùng
  const [requestIds] = useState<Record<string, string>>(() => Object.fromEntries(data.funds.map((f) => [f.id, newRequestId()])));

  const openable = data.funds.filter((f) => f.canOpen);
  const entries = openable.map((f) => ({ fund: f, amountVnd: toAmount(amounts[f.id] ?? "") })).filter((e) => e.amountVnd > 0);
  const total = entries.reduce((a, e) => a + e.amountVnd, 0);

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (entries.length === 0) return setError("Hãy nhập số tiền cho ít nhất một túi quỹ.");
    if (entryDate > data.today) return setError("Ngày chốt số dư không được ở tương lai.");
    if (entries.some((x) => x.amountVnd > 10_000_000_000)) return setError("Số tiền tối đa 10.000.000.000đ cho mỗi túi quỹ.");
    setStep("confirm");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    let done = 0;
    try {
      for (const x of entries) {
        await openingBalanceApi.post({ fundId: x.fund.id, amountVnd: x.amountVnd, entryDate, note: note.trim() || null, clientRequestId: requestIds[x.fund.id] });
        done++;
      }
      showToast("success", `Đã ghi số dư đầu kỳ cho ${done} túi quỹ.`);
      onClose();
    } catch (err) {
      setError(`${done > 0 ? `Đã ghi ${done}/${entries.length} túi quỹ. ` : ""}${errorMessage(err)}`);
      setStep("edit");
    } finally {
      setBusy(false);
    }
  };

  const body =
    step === "confirm" ? (
      <>
        <p className="text-sm text-gray-700">
          Ghi số dư đầu kỳ vào sổ quỹ, ngày chốt <b>{dmy(entryDate)}</b>. <b>Bút toán không sửa hay xóa được</b> — nếu nhập sai, phải ghi bút toán điều chỉnh kèm lý do.
        </p>
        <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {entries.map((x) => (
            <div key={x.fund.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold text-gray-800">{x.fund.name}</span>
              <span className="font-extrabold text-gray-900">{formatVND(x.amountVnd)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm bg-gray-50/70 rounded-b-2xl">
            <span className="font-bold text-gray-600">Tổng</span>
            <span className="font-extrabold text-primary">{formatVND(total)}</span>
          </div>
        </div>
        {note.trim() && <p className="text-xs text-gray-500">Ghi chú: {note.trim()}</p>}
        <ErrorBox error={error} />
      </>
    ) : (
      <form id="opening-form" onSubmit={review} className="space-y-4">
        <p className="text-xs text-gray-600">
          Nhập số tiền <b>đang có</b> trong từng túi quỹ tại thời điểm bắt đầu dùng hệ thống. Mỗi túi quỹ chỉ nhập được <b>một lần</b>; túi quỹ không dùng thì để trống.
        </p>
        <CustomDatePicker label="Ngày chốt số dư" format="YYYY-MM-DD" value={entryDate} onChange={(d) => d && setEntryDate(d)} required />
        <div className="space-y-3">
          {data.funds.map((f) => (
            <FundRow key={f.id} fund={f} value={amounts[f.id] ?? ""} onChange={(v) => setAmounts((a) => ({ ...a, [f.id]: v }))} />
          ))}
        </div>
        {openable.length > 0 && (
          <CustomTextarea label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="VD: Số dư theo sổ tay của Thủ quỹ cũ, chốt ngày 30/09" />
        )}
        <ErrorBox error={error} />
      </form>
    );

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
          {openable.length ? "Hủy" : "Đóng"}
        </button>
        {openable.length > 0 && (
          <button type="submit" form="opening-form" className={btnPrimary}>
            Xem lại
          </button>
        )}
      </>
    );

  return (
    <DialogShell open onClose={() => !busy && onClose()} icon={<Landmark className="w-5 h-5" />} title="Số dư quỹ khởi đầu" subtitle="Bút toán đầu tiên của sổ quỹ" footer={footer} z="z-[999]">
      {body}
    </DialogShell>
  );
}

function FundRow({ fund, value, onChange }: { fund: OpeningFundDto; value: string; onChange: (v: string) => void }) {
  if (fund.canOpen) {
    return (
      <CustomInput
        label={fund.name}
        inputMode="numeric"
        value={value ? toAmount(value).toLocaleString("vi-VN") : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        rightSuffix="đ"
        hint={TYPE_HINT[fund.type]}
      />
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-gray-700 inline-flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-gray-400" /> {fund.name}
        </span>
        <span className="text-xs font-extrabold text-gray-900">{formatVND(fund.balanceVnd)}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        {fund.opening
          ? `Đã nhập số dư đầu kỳ ${formatVND(fund.opening.amountVnd)} ngày ${dmy(fund.opening.entryDate)}${fund.opening.recordedByName ? ` (bởi ${fund.opening.recordedByName})` : ""}.`
          : "Túi quỹ này đã có giao dịch nên không nhập số dư đầu kỳ được nữa — nếu lệch, ghi bút toán điều chỉnh."}
      </p>
    </div>
  );
}
