"use client";

// Tài khoản nhận tiền của MỘT thành viên (ngân hàng + STK + chủ tài khoản + ảnh QR tùy chọn): xem, sao chép STK, mã VietQR;
// chính chủ / người có quyền sửa hồ sơ thì khai báo, sửa, xóa. Gắn vào trang Thành viên: <PaymentAccountCard memberId canEdit />.
// Cũng xuất BankAccountForm — biểu mẫu tài khoản ngân hàng dùng chung với thẻ "Tài khoản nhận quỹ" của nhà.
import React, { useMemo, useState } from "react";
import { Landmark, Pencil, Trash2, QrCode, Info } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { paymentAccountApi, useMemberPaymentAccount } from "@/lib/data/finance";
import { VN_BANKS, bankByBin, stripDiacritics } from "@/lib/vietqr";
import type { BankAccountDto } from "@/lib/types/finance";
import { CustomInput, CustomSelect, ImageUploadDropzone } from "@/components/ui/FormControls";
import { CopyField, QrDialogShell, QrImage, vietQrOf } from "./PayQrDialog";

const OTHER = "__other__";
const btnGhost = "px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700";
const btnPrimary = "px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60";

export interface BankAccountDraft extends BankAccountDto {
  note?: string | null;
}

/** Biểu mẫu tài khoản ngân hàng (chọn ngân hàng NAPAS ⇒ tạo được VietQR; "Khác / ví điện tử" ⇒ cần ảnh QR tự tải lên). */
export function BankAccountForm({
  value,
  onChange,
  withNote = false,
  nameHint,
}: {
  value: BankAccountDraft;
  onChange: (v: BankAccountDraft) => void;
  withNote?: boolean;
  /** Gợi ý tên chủ tài khoản (họ tên thành viên) */
  nameHint?: string | null;
}) {
  // "Ngân hàng khác / ví" là một lựa chọn riêng (không suy ra được từ dữ liệu khi tên ngân hàng còn trống)
  const [other, setOther] = useState(() => !bankByBin(value.bankBin) && !!(value.bankName || value.bankBin));
  const bankKey = other ? OTHER : value.bankBin && bankByBin(value.bankBin) ? value.bankBin : "";
  const set = (p: Partial<BankAccountDraft>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <CustomSelect
        label="Ngân hàng *"
        value={bankKey}
        onChange={(k) => {
          setOther(k === OTHER);
          if (k === OTHER) set({ bankBin: null, bankName: bankByBin(value.bankBin) ? "" : value.bankName });
          else set({ bankBin: k, bankName: bankByBin(k)?.name ?? "" });
        }}
        placeholder="Chọn ngân hàng"
        options={[
          ...VN_BANKS.map((b) => ({ value: b.bin, label: b.name, subLabel: `Mã ${b.bin}` })),
          { value: OTHER, label: "Ngân hàng khác / ví điện tử", subLabel: "Không tạo được VietQR — cần ảnh QR tự tải lên" },
        ]}
      />
      {bankKey === OTHER && (
        <CustomInput label="Tên ngân hàng / ví *" value={value.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="Ví dụ: MoMo, ZaloPay" />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomInput
          label="Số tài khoản *"
          inputMode="numeric"
          value={value.accountNo}
          onChange={(e) => set({ accountNo: e.target.value.replace(/[^0-9A-Za-z ]/g, "") })}
          placeholder="Ví dụ: 1903688889999"
        />
        <CustomInput
          label="Tên chủ tài khoản *"
          value={value.accountName}
          onChange={(e) => set({ accountName: e.target.value })}
          onBlur={() => value.accountName && set({ accountName: stripDiacritics(value.accountName).toUpperCase().trim() })}
          placeholder={nameHint ? stripDiacritics(nameHint).toUpperCase() : "VIẾT HOA KHÔNG DẤU"}
        />
      </div>
      <ImageUploadDropzone
        bucket="attachments"
        label="Ảnh mã QR của tài khoản (tùy chọn)"
        placeholder="Kéo thả ảnh QR tải từ ứng dụng ngân hàng hoặc nhấn để chọn"
        helperText="Không bắt buộc khi đã chọn ngân hàng — hệ thống tự tạo mã VietQR (có sẵn số tiền + nội dung khi nộp quỹ)."
        value={value.qrFileId ?? ""}
        onChange={(id) => set({ qrFileId: id || null })}
      />
      {withNote && (
        <CustomInput label="Ghi chú" value={value.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="Ví dụ: Nhận hoàn ứng tiền chợ" />
      )}
    </div>
  );
}

/** Kiểm tra nhanh phía giao diện (máy chủ kiểm lại). */
export function bankAccountError(v: BankAccountDraft): string | null {
  if (!v.bankBin && !v.bankName.trim()) return "Chọn ngân hàng.";
  if (!/^[0-9A-Za-z]{4,19}$/.test(v.accountNo.replace(/\s/g, ""))) return "Số tài khoản chỉ gồm chữ số/chữ cái, từ 4 đến 19 ký tự.";
  if (v.accountName.trim().length < 2) return "Nhập tên chủ tài khoản.";
  if (!v.bankBin && !v.qrFileId) return "Ngân hàng ngoài danh sách cần tải ảnh mã QR.";
  return null;
}

export const emptyBankAccount = (): BankAccountDraft => ({ bankBin: null, bankName: "", accountNo: "", accountName: "", qrFileId: null, note: null });

/** Thẻ tài khoản nhận tiền của một thành viên. `canEdit` = trang gọi cho phép sửa (máy chủ vẫn kiểm quyền). */
export default function PaymentAccountCard({ memberId, canEdit }: { memberId: string; canEdit: boolean }) {
  const { showToast } = useApp();
  const { paymentAccount: pa, error, isLoading, mutate } = useMemberPaymentAccount(memberId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BankAccountDraft>(emptyBankAccount);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = canEdit && !!pa?.canEdit;
  const acc = pa?.account ?? null;
  const payload = useMemo(() => vietQrOf(acc), [acc]);

  // Nạp bản nháp TRƯỚC khi mở hộp thoại (biểu mẫu khởi tạo lựa chọn ngân hàng từ bản nháp lúc gắn vào)
  const startEdit = () => {
    setErr(null);
    setDraft(acc ? { ...acc } : { ...emptyBankAccount(), accountName: pa?.memberName ? stripDiacritics(pa.memberName).toUpperCase() : "" });
    setEditing(true);
  };

  const save = async () => {
    const e = bankAccountError(draft);
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      const saved = await paymentAccountApi.save(memberId, { ...draft, accountNo: draft.accountNo.replace(/\s/g, ""), note: draft.note?.trim() || null });
      await mutate(saved, { revalidate: false });
      showToast("success", "Đã lưu tài khoản nhận tiền.");
      setEditing(false);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await paymentAccountApi.remove(memberId);
      await mutate();
      showToast("success", "Đã xóa tài khoản nhận tiền.");
      setConfirmDelete(false);
    } catch (x) {
      showToast("error", errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900">Tài khoản nhận tiền</h3>
            <p className="text-[11px] text-gray-500">Để anh em chuyển khoản, Thủ quỹ hoàn ứng</p>
          </div>
        </div>
        {editable && acc && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={startEdit} className="p-2 rounded-xl hover:bg-purple-50 text-primary" title="Sửa tài khoản">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-2 rounded-xl hover:bg-rose-50 text-rose-600" title="Xóa tài khoản">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isLoading && !pa && <div className="py-4 text-center text-xs text-gray-400">Đang tải…</div>}
      {error && !pa && <div className="p-3 rounded-xl bg-gray-50 text-xs text-gray-500">{errorMessage(error)}</div>}
      {pa && !acc && (
        <div className="p-3 rounded-2xl bg-surface-container-low/60 text-xs text-gray-600 flex flex-wrap items-center justify-between gap-2">
          <span>{editable ? "Bạn chưa khai báo tài khoản nhận tiền." : `${pa.memberName} chưa khai báo tài khoản nhận tiền.`}</span>
          {editable && (
            <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white font-bold shadow-xs">
              <QrCode className="w-3.5 h-3.5" /> Khai báo tài khoản
            </button>
          )}
        </div>
      )}
      {acc && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
          <div className="flex justify-center sm:block">
            <QrImage payload={payload} fileId={acc.qrFileId} size={150} downloadName={`QR_${stripDiacritics(pa?.memberName ?? "").replace(/\s+/g, "_")}`} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <CopyField label="Số tài khoản" value={acc.accountNo} mono />
            <div className="text-[11px] text-gray-500 px-1 space-y-0.5">
              <div>
                Ngân hàng: <b className="text-gray-800">{acc.bankName || bankByBin(acc.bankBin)?.name}</b>
              </div>
              <div>
                Chủ tài khoản: <b className="text-gray-800">{acc.accountName}</b>
              </div>
              {acc.note && <div className="italic">{acc.note}</div>}
            </div>
          </div>
        </div>
      )}

      <QrDialogShell
        open={editing}
        onClose={() => setEditing(false)}
        icon={<Landmark className="w-5 h-5" />}
        title={acc ? "Sửa tài khoản nhận tiền" : "Khai báo tài khoản nhận tiền"}
        subtitle={pa?.memberName}
        maxWidth="max-w-lg"
        footer={
          <>
            <button onClick={() => setEditing(false)} className={btnGhost}>
              Hủy bỏ
            </button>
            <button disabled={busy} onClick={save} className={btnPrimary}>
              {busy ? "Đang lưu..." : "Lưu tài khoản"}
            </button>
          </>
        }
      >
        <BankAccountForm value={draft} onChange={setDraft} withNote nameHint={pa?.memberName} />
        <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Mọi thành viên trong nhà xem được tài khoản này để chuyển tiền cho bạn.
        </p>
        {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{err}</div>}
      </QrDialogShell>

      <QrDialogShell
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        icon={<Trash2 className="w-5 h-5" />}
        title="Xóa tài khoản nhận tiền?"
        footer={
          <>
            <button onClick={() => setConfirmDelete(false)} className={btnGhost}>
              Quay lại
            </button>
            <button disabled={busy} onClick={remove} className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white disabled:opacity-60">
              {busy ? "Đang xóa..." : "Xóa tài khoản"}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-600">Anh em sẽ không còn thấy số tài khoản và mã QR này. Bạn có thể khai báo lại bất cứ lúc nào.</p>
      </QrDialogShell>
    </div>
  );
}
