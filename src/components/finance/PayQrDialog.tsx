"use client";

// Mã QR chuyển khoản (VietQR tạo ngoài mạng ngay trên trình duyệt) + các mảnh giao diện dùng chung của phân hệ Thu chi:
//   QrImage   — ảnh QR từ chuỗi VietQR (ưu tiên khi cần số tiền + nội dung) hoặc ảnh QR người dùng tự tải lên
//   CopyField — một dòng thông tin có nút sao chép (STK, số tiền, nội dung chuyển khoản)
//   QrDialogShell — khung hộp thoại độc lập (dùng được ở mọi trang)
//   PayQrDialog (mặc định) — "Nộp quỹ / chuyển khoản": QR có sẵn số tiền + nội dung vào tài khoản nhận quỹ của nhà.
import React, { useEffect, useMemo, useState } from "react";
import { X, Copy, Check, QrCode, Info, Download } from "lucide-react";
import { useApp } from "@/lib/store";
import { formatVND } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { Portal } from "@/components/ui/Portal";
import { useReceivingAccount } from "@/lib/data/finance";
import { bankByBin, buildVietQrPayload, canBuildVietQr, qrDataUrl, transferContent } from "@/lib/vietqr";
import type { BankAccountDto } from "@/lib/types/finance";

/** Ảnh QR (data URL) của một chuỗi — null khi chưa vẽ xong / không có chuỗi. */
export function useQrDataUrl(payload: string | null, size = 320): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!payload) return;
    qrDataUrl(payload, size)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [payload, size]);
  return url;
}

/** Chuỗi VietQR của một tài khoản (null nếu thiếu BIN/STK). */
export function vietQrOf(account: Pick<BankAccountDto, "bankBin" | "accountNo"> | null | undefined, amountVnd?: number | null, content?: string | null) {
  if (!account || !canBuildVietQr(account.bankBin, account.accountNo)) return null;
  try {
    return buildVietQrPayload({ bankBin: account.bankBin!, accountNo: account.accountNo, amountVnd, content });
  } catch {
    return null;
  }
}

/**
 * Ảnh mã QR: `payload` (VietQR tạo động) ưu tiên khi `preferPayload` (cần số tiền/nội dung); nếu không thì ảnh tự tải lên
 * (`fileId`) được ưu tiên, thiếu ảnh mới dùng `payload`.
 */
export function QrImage({
  payload,
  fileId,
  preferPayload = false,
  size = 220,
  alt = "Mã QR chuyển khoản",
  downloadName,
}: {
  payload: string | null;
  fileId?: string | null;
  preferPayload?: boolean;
  size?: number;
  alt?: string;
  downloadName?: string;
}) {
  const usePayload = !!payload && (preferPayload || !fileId);
  const dataUrl = useQrDataUrl(usePayload ? payload : null, Math.max(320, size * 2));
  const src = usePayload ? dataUrl : fileId ? `/api/v1/files/${fileId}?v=medium` : null;
  if (!payload && !fileId)
    return (
      <div style={{ width: size, height: size }} className="rounded-2xl bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center text-center p-3 text-[11px] text-gray-400">
        <QrCode className="w-8 h-8 mb-1.5 text-gray-300" />
        Chưa có mã QR
      </div>
    );
  return (
    // Chiều rộng cột bằng khung QR (+ viền): chú thích bên dưới tự xuống dòng, không làm phình cột chứa QR
    <div className="flex flex-col items-center gap-1.5 max-w-full" style={{ width: size + 16 }}>
      <div style={{ width: size, height: size }} className="rounded-2xl bg-white border border-purple-100 p-2 shadow-2xs flex items-center justify-center overflow-hidden">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="w-full h-full object-contain" />
        ) : (
          <span className="w-6 h-6 border-2 border-purple-200 border-t-primary rounded-full animate-spin" />
        )}
      </div>
      {downloadName && src && (
        <a href={src} download={`${downloadName}.png`} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
          <Download className="w-3 h-3" /> Lưu ảnh QR
        </a>
      )}
      <span className="text-[10px] text-gray-400 text-center leading-snug">{usePayload ? "Mã VietQR — quét bằng ứng dụng ngân hàng bất kỳ" : "Ảnh mã QR do chủ tài khoản tải lên"}</span>
    </div>
  );
}

/** Một dòng thông tin + nút sao chép. */
export function CopyField({ label, value, display, mono = false }: { label: string; value: string; display?: React.ReactNode; mono?: boolean }) {
  const { showToast } = useApp();
  const [done, setDone] = useState(false);
  const copy = async () => {
    const ok = await copyTextToClipboard(value);
    showToast(ok ? "success" : "error", ok ? `Đã sao chép ${label.toLowerCase()}.` : "Không sao chép được — hãy bôi đen và sao chép thủ công.");
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-low/60 border border-purple-50">
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase">{label}</div>
        <div className={`text-xs font-bold text-gray-900 break-all ${mono ? "font-mono" : ""}`}>{display ?? value}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-purple-100 text-[11px] font-bold text-primary hover:bg-purple-50 active:scale-95 transition"
        title={`Sao chép ${label.toLowerCase()}`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{done ? "Đã chép" : "Sao chép"}</span>
      </button>
    </div>
  );
}

/** Khung hộp thoại độc lập (giữ phong cách DialogShell của trang Thu chi). */
export function QrDialogShell({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] overflow-y-auto p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidth} my-auto bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150`}
          >
            <div className="flex items-start justify-between p-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0">{icon ?? <QrCode className="w-5 h-5" />}</div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{title}</h3>
                  {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 shrink-0" title="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">{children}</div>
            {footer && <div className="p-4 px-5 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">{footer}</div>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Thông tin chuyển khoản: QR + các dòng sao chép. Dùng chung cho nộp quỹ (tài khoản của nhà) và hoàn ứng (tài khoản thành viên). */
export function TransferDetails({
  account,
  amountVnd,
  content,
  qrName,
}: {
  account: BankAccountDto;
  amountVnd?: number | null;
  content?: string | null;
  qrName?: string;
}) {
  const safeContent = content ? transferContent(content) : "";
  const payload = useMemo(() => vietQrOf(account, amountVnd, safeContent), [account, amountVnd, safeContent]);
  const bankName = account.bankName || bankByBin(account.bankBin)?.name || "Ngân hàng";
  const needsAmount = !!amountVnd || !!safeContent;
  return (
    <>
      <div className="flex justify-center">
        <QrImage payload={payload} fileId={account.qrFileId} preferPayload={needsAmount} size={220} downloadName={qrName} />
      </div>
      {needsAmount && !payload && account.qrFileId && (
        <p className="flex items-start gap-1.5 p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-800">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Ảnh QR này không có sẵn số tiền — sau khi quét, hãy nhập đúng số tiền và nội dung bên dưới.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2">
        <CopyField label="Số tài khoản" value={account.accountNo} mono display={<>{account.accountNo} <span className="font-semibold text-gray-500">· {bankName}</span></>} />
        <div className="px-1 text-[11px] text-gray-500">
          Chủ tài khoản: <b className="text-gray-800">{account.accountName}</b>
        </div>
        {!!amountVnd && <CopyField label="Số tiền" value={String(amountVnd)} display={formatVND(amountVnd)} />}
        {safeContent && <CopyField label="Nội dung chuyển khoản" value={safeContent} mono />}
      </div>
    </>
  );
}

/** "Nộp quỹ / chuyển khoản": QR có sẵn số tiền + nội dung vào tài khoản nhận quỹ của nhà. Phiếu thu vẫn do Thủ quỹ ghi khi nhận tiền. */
export default function PayQrDialog({
  open,
  onClose,
  amountVnd,
  content,
  title = "Nộp quỹ / chuyển khoản",
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  amountVnd: number;
  /** Nội dung chuyển khoản, vd. "QUY-2026-07 LE MINH TUAN" (được chuẩn hóa không dấu, ≤ 25 ký tự) */
  content: string;
  title?: string;
  subtitle?: React.ReactNode;
}) {
  const { receiving, isLoading } = useReceivingAccount(open);
  const account = receiving?.account ?? null;
  return (
    <QrDialogShell open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {isLoading && !receiving && <div className="py-8 text-center text-xs text-gray-400">Đang tải tài khoản nhận quỹ…</div>}
      {receiving && !account && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-xs text-amber-900 space-y-1.5">
          <p className="font-bold">Thủ quỹ chưa khai báo tài khoản nhận quỹ.</p>
          {receiving.legacyText ? (
            <p>
              Tài khoản đang ghi trong Cài đặt: <b>{receiving.legacyText}</b> — số tiền <b>{formatVND(amountVnd)}</b>, nội dung{" "}
              <b className="font-mono">{transferContent(content)}</b>.
            </p>
          ) : (
            <p>Vui lòng nộp tiền mặt trực tiếp cho Thủ quỹ hoặc hỏi Thủ quỹ số tài khoản.</p>
          )}
        </div>
      )}
      {account && <TransferDetails account={account} amountVnd={amountVnd} content={content} qrName={`QR_${transferContent(content).replace(/\s+/g, "_")}`} />}
      <p className="flex items-start gap-1.5 text-[11px] text-gray-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        Thủ quỹ xác nhận khi nhận được tiền — trạng thái khoản này chuyển sang “Đã đóng” sau khi Thủ quỹ ghi phiếu thu. Giữ lại biên lai chuyển khoản để
        đối chiếu nếu cần.
      </p>
    </QrDialogShell>
  );
}
