"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Pencil, Info, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { financeApi, newRequestId, refreshFinance, useFinanceOptions } from "@/lib/data/finance";
import type { ExpenseDetailDto, ExpenseDto } from "@/lib/types/finance";
import { CustomInput, CustomSelect, CustomDatePicker, CustomTextarea, ImageUploadDropzone } from "@/components/ui/FormControls";
import { FundSelect } from "@/components/finance/FundSelect";

const CATEGORY_EMOJI: Record<string, string> = {
  FOOD: "🛒",
  UTILITY: "⚡",
  CLEAN: "🧴",
  REPAIR: "🔧",
  LITURGY: "✝",
  GUEST: "🤝",
  OTHER: "📦",
};
const NONE = "__none__";

interface FormCardProps {
  /** Phiếu cần sửa (nháp / bị từ chối / đang chờ duyệt — sẽ tự rút về nháp khi lưu). Không có ⇒ lập phiếu mới. */
  expense?: ExpenseDto | ExpenseDetailDto | null;
  onClose: () => void;
  onSaved?: (e: ExpenseDetailDto) => void;
}

/** Thẻ form lập/sửa phiếu chi (dùng cho modal toàn cục "addExpense" và modal sửa phiếu ở trang Thu Chi). */
export function ExpenseFormCard({ expense, onClose, onSaved }: FormCardProps) {
  const { members, showToast } = useApp();
  const { session } = useSession();
  const options = useFinanceOptions();
  const editing = !!expense;

  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amountVnd) : "");
  const [categoryId, setCategoryId] = useState(expense?.category.id ?? "");
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? "");
  const [fundId, setFundId] = useState(expense?.fundId ?? "");
  const [paidBy, setPaidBy] = useState<string>(expense ? expense.paidBy?.memberId ?? NONE : session?.member?.id ?? NONE);
  const [note, setNote] = useState(expense?.note ?? "");
  const [receipt, setReceipt] = useState(expense?.receipts[0]?.fileId ?? "");
  const [noReceiptReason, setNoReceiptReason] = useState(expense?.noReceiptReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(newRequestId);

  // Giá trị mặc định khi dữ liệu form về
  useEffect(() => {
    if (!options) return;
    if (!expenseDate) setExpenseDate(options.today);
    if (!fundId && options.funds.length) setFundId(options.funds.find((f) => f.type === "cash")?.id ?? options.funds[0].id);
    if (!categoryId && options.categories.length) setCategoryId(options.categories[0].id);
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing && paidBy === NONE && session?.member?.id) setPaidBy(session.member.id);
  }, [session?.member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountVnd = Number(amount.replace(/\D/g, "")) || 0;
  const receiptMin = options?.receiptRequiredMinVnd ?? null;
  const dualMin = options?.dualApprovalMinVnd ?? null;
  const needReason = !receipt && receiptMin !== null && amountVnd >= receiptMin;

  const payerOptions = useMemo(
    () => [
      ...members
        .filter((m) => m.status === "active" || m.status === "on_leave" || m.id === paidBy)
        .map((m) => ({ value: m.id, label: m.fullName, subLabel: m.room })),
      { value: NONE, label: "Quỹ chi trực tiếp (không ai ứng tiền)" },
    ],
    [members, paidBy]
  );

  const save = async (submit: boolean) => {
    setError(null);
    if (title.trim().length < 3) return setError("Tên khoản chi tối thiểu 3 ký tự.");
    if (amountVnd <= 0) return setError("Nhập số tiền lớn hơn 0.");
    if (!categoryId || !fundId || !expenseDate) return setError("Chọn danh mục, túi quỹ và ngày chi.");
    if (submit && needReason && noReceiptReason.trim().length < 5)
      return setError(`Khoản từ ${formatVND(receiptMin!)} phải đính kèm hóa đơn hoặc ghi rõ lý do không có hóa đơn (≥ 5 ký tự).`);
    setBusy(true);
    const body = {
      title: title.trim(),
      amountVnd,
      categoryId,
      expenseDate,
      fundId,
      paidByMemberId: paidBy === NONE ? null : paidBy,
      note: note.trim() || null,
      receiptFileId: receipt || null,
      noReceiptReason: receipt ? null : noReceiptReason.trim() || null,
      submit,
    };
    try {
      const saved = editing ? await financeApi.updateExpense(expense!.id, body) : await financeApi.createExpense({ ...body, clientRequestId: requestId });
      await refreshFinance();
      showToast(
        "success",
        submit
          ? `Đã gửi phiếu ${saved.voucherNo} chờ duyệt (${saved.requiredApprovals} chữ ký).`
          : `Đã lưu nháp phiếu ${saved.voucherNo}.`
      );
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            {editing ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{editing ? `Sửa phiếu chi ${expense!.voucherNo}` : "Lập Phiếu Chi Mới"}</h3>
            <p className="text-xs text-gray-500">
              {editing && expense!.status !== "draft"
                ? "Phiếu sẽ được rút về nháp để sửa; chữ ký của vòng duyệt cũ không còn hiệu lực"
                : "Phiếu được gửi người quản lý duyệt rồi Thủ quỹ mới xuất quỹ chi"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <CustomInput
            label="Tên khoản chi *"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Thịt cá chợ sáng, Bóng đèn, Nước lau sàn..."
          />

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Số tiền thanh toán <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                required
                value={amountVnd ? amountVnd.toLocaleString("vi-VN") : amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border-2 border-primary text-base font-extrabold text-gray-900 bg-purple-50/20 focus:outline-none"
              />
              <span className="absolute right-3.5 top-3 text-xs font-bold text-gray-500">VNĐ</span>
            </div>
            {dualMin !== null && amountVnd > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                {amountVnd >= dualMin
                  ? `Từ ${formatVND(dualMin)}: cần 2 chữ ký (Trưởng nhà + Thủ quỹ; nếu một trong hai là người lập/người ứng tiền thì người còn lại ký).`
                  : "Cần 1 chữ ký duyệt của người quản lý."}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Phân loại danh mục</label>
            <div className="grid grid-cols-2 gap-2">
              {(options?.categories ?? []).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition text-left truncate ${
                    categoryId === cat.id ? "bg-primary text-white shadow-xs" : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-100"
                  }`}
                  title={cat.name}
                >
                  {CATEGORY_EMOJI[cat.code] ?? "📦"} {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomDatePicker label="Ngày chi *" value={expenseDate} onChange={setExpenseDate} format="YYYY-MM-DD" />
            <FundSelect label="Chi từ túi quỹ *" value={fundId} onChange={setFundId} funds={options?.funds ?? []} placeholder="Chọn túi quỹ" />
          </div>

          <CustomSelect label="Người ứng tiền / trực tiếp chi" value={paidBy} onChange={setPaidBy} options={payerOptions} placeholder="Chọn người ứng tiền" />

          <ImageUploadDropzone
            bucket="receipts"
            allowPdf
            label="Ảnh hóa đơn / Biên lai thanh toán"
            placeholder="Kéo thả ảnh biên lai hoặc nhấp để chọn tệp từ máy..."
            helperText="Ảnh hóa đơn đỏ, biên nhận hoặc sao kê giao dịch (JPG, PNG, WEBP, PDF)"
            value={receipt}
            onChange={setReceipt}
          />

          {!receipt && (
            <CustomInput
              label={needReason ? "Lý do không có hóa đơn *" : "Lý do không có hóa đơn (nếu có)"}
              value={noReceiptReason}
              onChange={(e) => setNoReceiptReason(e.target.value)}
              placeholder="Ví dụ: Mua ở chợ, người bán không xuất biên lai"
            />
          )}
          {receiptMin !== null && (
            <p className="-mt-2 flex items-center gap-1 text-[11px] text-gray-500">
              <Info className="w-3.5 h-3.5" /> Khoản từ {formatVND(receiptMin)} bắt buộc có hóa đơn hoặc lý do không có hóa đơn.
            </p>
          )}

          <CustomTextarea label="Ghi chú thêm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mua tại đâu, chi tiết hóa đơn..." rows={2} />

          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{error}</div>}
        </div>

        <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
            className="px-4 py-2.5 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-xs font-bold text-primary disabled:opacity-60"
          >
            Lưu nháp
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60"
          >
            {busy ? "Đang lưu..." : "Lập phiếu & gửi duyệt"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Modal toàn cục openModal("addExpense") — Header, bảng lệnh, trang Thu Chi. */
export default function AddExpenseModal() {
  const { closeModal } = useApp();
  const { can } = useSession();
  if (!can("finance.expense.create")) {
    return (
      <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 p-6 text-sm text-gray-700">
        <div className="flex items-start justify-between gap-3">
          <p>Tài khoản của bạn chưa được cấp quyền lập phiếu chi.</p>
          <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }
  return <ExpenseFormCard onClose={closeModal} />;
}
