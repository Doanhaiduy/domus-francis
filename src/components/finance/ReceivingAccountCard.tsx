"use client";

// Thẻ "Tài khoản nhận quỹ" của nhà (thường là tài khoản của Thủ quỹ): mã QR + số tài khoản để thành viên chuyển khoản nộp quỹ.
// Thủ quỹ / Trưởng nhà sửa (máy chủ kiểm quyền — Admin kỹ thuật không đổi được nơi nhận tiền).
import React, { useMemo, useState } from "react";
import { Landmark, Pencil, Info, QrCode } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { financeApi, useReceivingAccount } from "@/lib/data/finance";
import { bankByBin } from "@/lib/vietqr";
import { dateTimeVN } from "@/lib/finance-format";
import { BankAccountForm, bankAccountError, emptyBankAccount, type BankAccountDraft } from "./PaymentAccountCard";
import { CopyField, QrDialogShell, QrImage, vietQrOf } from "./PayQrDialog";

const btnGhost = "px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700";
const btnPrimary = "px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60";

export default function ReceivingAccountCard({ compact = false }: { compact?: boolean }) {
  const { showToast } = useApp();
  const { receiving, error, isLoading, mutate } = useReceivingAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BankAccountDraft>(emptyBankAccount);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const acc = receiving?.account ?? null;
  const payload = useMemo(() => vietQrOf(acc), [acc]);

  const startEdit = () => {
    setErr(null);
    setDraft(acc ? { ...acc } : emptyBankAccount());
    setEditing(true);
  };
  const save = async () => {
    const e = bankAccountError(draft);
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      const saved = await financeApi.saveReceivingAccount({
        bankBin: draft.bankBin,
        bankName: draft.bankName,
        accountNo: draft.accountNo.replace(/\s/g, ""),
        accountName: draft.accountName,
        qrFileId: draft.qrFileId,
      });
      await mutate(saved, { revalidate: false });
      showToast("success", "Đã cập nhật tài khoản nhận quỹ.");
      setEditing(false);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-gray-900">Tài khoản nhận quỹ</h2>
            <p className="text-[11px] text-gray-500">Chuyển khoản nộp quỹ, tiền điện nước vào tài khoản này</p>
          </div>
        </div>
        {receiving?.canEdit && acc && (
          <button onClick={startEdit} className="p-2 rounded-xl hover:bg-purple-50 text-primary shrink-0" title="Sửa tài khoản nhận quỹ">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {isLoading && !receiving && <div className="py-4 text-center text-xs text-gray-400">Đang tải…</div>}
      {error && !receiving && <div className="p-3 rounded-xl bg-gray-50 text-xs text-gray-500">Không tải được tài khoản nhận quỹ.</div>}

      {receiving && !acc && (
        <div className="p-3 rounded-2xl bg-surface-container-low/60 text-xs text-gray-600 flex flex-col gap-2">
          <span>
            {receiving.legacyText ? (
              <>
                Đang ghi trong Cài đặt: <b className="text-gray-900">{receiving.legacyText}</b>
              </>
            ) : (
              "Thủ quỹ chưa khai báo tài khoản nhận quỹ."
            )}
          </span>
          {receiving.canEdit && (
            <button onClick={startEdit} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white font-bold shadow-xs">
              <QrCode className="w-3.5 h-3.5" /> Khai báo tài khoản + mã QR
            </button>
          )}
        </div>
      )}

      {acc && (
        <div className={`flex ${compact ? "flex-col" : "flex-col sm:flex-row"} gap-3 sm:items-start`}>
          <div className="flex justify-center sm:block">
            <QrImage payload={payload} fileId={acc.qrFileId} size={compact ? 180 : 160} downloadName="QR_tai_khoan_nhan_quy" />
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
              {receiving?.updatedByName && receiving.updatedAt && (
                <div className="text-gray-400">
                  Cập nhật {dateTimeVN(receiving.updatedAt)} · {receiving.updatedByName}
                </div>
              )}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              Nộp một khoản cụ thể: bấm “Nộp qua QR” ở khoản của bạn để có mã kèm sẵn số tiền và nội dung.
            </p>
          </div>
        </div>
      )}

      <QrDialogShell
        open={editing}
        onClose={() => setEditing(false)}
        icon={<Landmark className="w-5 h-5" />}
        title={acc ? "Sửa tài khoản nhận quỹ" : "Khai báo tài khoản nhận quỹ"}
        subtitle="Tài khoản của Thủ quỹ / của nhà — mọi thành viên sẽ chuyển khoản vào đây"
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
        <BankAccountForm value={draft} onChange={setDraft} />
        <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Nên là tài khoản trùng với túi quỹ ngân hàng của nhà để đối soát sao kê. Mọi thay đổi được ghi nhật ký kiểm toán.
        </p>
        {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{err}</div>}
      </QrDialogShell>
    </div>
  );
}
