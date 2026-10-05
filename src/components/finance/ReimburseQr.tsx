"use client";

// Nút "Hoàn tiền qua QR" cho phiếu chi có người ứng tiền: mở mã VietQR vào TÀI KHOẢN NHẬN TIỀN của người đó, có sẵn số tiền
// và nội dung (vd. "HOAN UNG PC-2026-0012"). Gắn vào chi tiết phiếu chi:
//   <ReimburseQr memberId={e.paidBy.memberId} memberName={e.paidBy.name} amountVnd={e.amountVnd} content={`HOAN UNG ${e.voucherNo}`} />
import React, { useState } from "react";
import { QrCode, Info } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { useMemberPaymentAccount } from "@/lib/data/finance";
import { QrDialogShell, TransferDetails } from "./PayQrDialog";

export default function ReimburseQr({
  memberId,
  memberName,
  amountVnd,
  content,
  className = "",
}: {
  memberId: string;
  memberName?: string | null;
  amountVnd: number;
  /** Nội dung chuyển khoản (được chuẩn hóa không dấu, ≤ 25 ký tự) */
  content?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { paymentAccount, isLoading, error } = useMemberPaymentAccount(open ? memberId : null);
  const name = paymentAccount?.memberName ?? memberName ?? "người ứng tiền";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition ${className}`}
        title="Mã QR chuyển khoản hoàn tiền cho người đã ứng"
      >
        <QrCode className="w-3.5 h-3.5" /> Hoàn tiền qua QR
      </button>
      <QrDialogShell open={open} onClose={() => setOpen(false)} title="Hoàn tiền qua QR" subtitle={`${name} · ${formatVND(amountVnd)}`}>
        {isLoading && !paymentAccount && <div className="py-8 text-center text-xs text-gray-400">Đang tải tài khoản nhận tiền…</div>}
        {error && !paymentAccount && <div className="p-3 rounded-xl bg-rose-50 text-xs text-rose-700">Không tải được tài khoản nhận tiền.</div>}
        {paymentAccount && !paymentAccount.account && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-xs text-amber-900">
            {name} chưa khai báo tài khoản nhận tiền (trang Thành viên → hồ sơ → Tài khoản nhận tiền). Có thể hoàn tiền mặt hoặc hỏi số tài khoản.
          </div>
        )}
        {paymentAccount?.account && <TransferDetails account={paymentAccount.account} amountVnd={amountVnd} content={content} />}
        <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          Chuyển khoản xong, Thủ quỹ ghi “Đã chi” cho phiếu (phương thức Chuyển khoản, kèm mã giao dịch) để sổ quỹ khớp sao kê.
        </p>
      </QrDialogShell>
    </>
  );
}
