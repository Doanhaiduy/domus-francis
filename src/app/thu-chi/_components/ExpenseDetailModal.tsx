"use client";

import React, { useEffect, useState } from "react";
import { Receipt, FileText, Check, X, Pencil, Send, Undo2, Wallet, Ban, RotateCcw, ShieldCheck, Clock, ExternalLink, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy, dateTimeVN } from "@/lib/finance-format";
import { financeApi, refreshFinance, useExpenseDetail, useFinanceOptions } from "@/lib/data/finance";
import {
  APPROVER_ROLE_LABEL,
  EXPENSE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type ExpenseDetailDto,
  type ExpenseStatus,
  type PaymentMethod,
} from "@/lib/types/finance";
import { CustomDatePicker, CustomInput, CustomSelect, ImageUploadDropzone } from "@/components/ui/FormControls";
import { DialogShell, ErrorBox, ReasonDialog, btnGhost, btnPrimary } from "./dialogs";
import ReimburseQr from "@/components/finance/ReimburseQr";

export const STATUS_BADGE: Record<ExpenseStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  rejected: "bg-rose-100 text-rose-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-500",
  reversed: "bg-purple-100 text-purple-800",
};

export function StatusBadge({ status, className = "" }: { status: ExpenseStatus; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE[status]} ${className}`}>
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}

type Pending = null | "reject" | "cancel" | "reverse";

export default function ExpenseDetailModal({
  expenseId,
  onClose,
  onEdit,
}: {
  expenseId: string | null;
  onClose: () => void;
  onEdit: (e: ExpenseDetailDto) => void;
}) {
  const { showToast } = useApp();
  const { expense: e, error } = useExpenseDetail(expenseId);
  const options = useFinanceOptions(!!expenseId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<Pending>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState("");

  useEffect(() => {
    setErr(null);
    setPayOpen(false);
    setReference("");
    setProof("");
  }, [expenseId]);
  useEffect(() => {
    if (e && options) {
      setPaidOn(options.today);
      const fund = options.funds.find((f) => f.id === e.fundId);
      setMethod(fund?.type === "bank" ? "bank_transfer" : "cash");
    }
  }, [e?.id, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refreshFinance();
      showToast("success", ok);
      return true;
    } catch (x) {
      setErr(errorMessage(x));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const doPay = async () => {
    if (!e) return;
    if (method === "bank_transfer" && !reference.trim()) return setErr("Chuyển khoản cần mã giao dịch / số ủy nhiệm chi để đối soát sao kê.");
    const ok = await run(
      () => financeApi.pay(e.id, { method, paidOn, reference: reference.trim() || null, proofFileId: proof || null }),
      `Đã ghi nhận chi ${formatVND(e.amountVnd)} cho phiếu ${e.voucherNo}.`,
    );
    if (ok) setPayOpen(false);
  };

  const image = e?.receipts.find((r) => r.mime?.startsWith("image/"));
  const files = e?.receipts.filter((r) => r !== image) ?? [];
  const currentRound = e?.approvals.filter((a) => a.round === e.approvalRound) ?? [];
  const olderRounds = e?.approvals.filter((a) => a.round !== e.approvalRound) ?? [];

  const timeline = e
    ? (
        [
          ["Lập phiếu", e.createdAt, e.requestedBy.name],
          ["Gửi duyệt", e.submittedAt, null],
          ["Đủ chữ ký – đã duyệt", e.approvedAt, null],
          ["Từ chối", e.status === "rejected" ? e.rejectedAt : null, null],
          ["Thủ quỹ ghi chi", e.paidAt, e.paidRecordedBy],
          ["Đảo bút toán", e.reversal?.at ?? null, null],
          ["Hủy phiếu", e.cancelledAt, null],
        ] as [string, string | null, string | null][]
      ).filter(([, t]) => !!t)
    : [];

  return (
    <>
      <DialogShell
        open={!!expenseId}
        onClose={onClose}
        maxWidth="max-w-2xl"
        icon={<Receipt className="w-5 h-5" />}
        title={e ? `Phiếu chi ${e.voucherNo}` : "Phiếu chi"}
        subtitle={e ? <StatusBadge status={e.status} /> : error ? "Không tải được phiếu chi" : "Đang tải…"}
        footer={
          e && (
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              {e.can.cancel && (
                <button
                  disabled={busy}
                  onClick={() => setReasonFor("cancel")}
                  className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Hủy phiếu
                </button>
              )}
              {e.can.reverse && (
                <button
                  disabled={busy}
                  onClick={() => setReasonFor("reverse")}
                  className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Đảo phiếu đã chi
                </button>
              )}
              {e.can.withdraw && (
                <button disabled={busy} onClick={() => run(() => financeApi.withdraw(e.id), `Đã rút phiếu ${e.voucherNo} về nháp.`)} className={btnGhost}>
                  <span className="inline-flex items-center gap-1.5">
                    <Undo2 className="w-3.5 h-3.5" /> Rút về nháp
                  </span>
                </button>
              )}
              {e.can.edit && (
                <button disabled={busy} onClick={() => onEdit(e)} className={btnGhost}>
                  <span className="inline-flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> {e.status === "draft" ? "Sửa phiếu" : "Sửa & gửi lại"}
                  </span>
                </button>
              )}
              {e.can.submit && (
                <button disabled={busy} onClick={() => run(() => financeApi.submit(e.id), `Đã gửi phiếu ${e.voucherNo} chờ duyệt.`)} className={btnPrimary}>
                  <span className="inline-flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Gửi duyệt
                  </span>
                </button>
              )}
              {e.can.reject && (
                <button
                  disabled={busy}
                  onClick={() => setReasonFor("reject")}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> Từ chối
                  </span>
                </button>
              )}
              {e.can.approve && (
                <button
                  disabled={busy}
                  onClick={() => run(() => financeApi.decide(e.id, "approved"), `Đã ký duyệt phiếu ${e.voucherNo}.`)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-md shadow-emerald-200 disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Ký duyệt ({e.approvedCount + 1}/{e.requiredApprovals})
                  </span>
                </button>
              )}
              {e.can.pay && !payOpen && (
                <button disabled={busy} onClick={() => setPayOpen(true)} className={btnPrimary}>
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Ghi nhận đã chi
                  </span>
                </button>
              )}
            </div>
          )
        }
      >
        {error && <ErrorBox error={errorMessage(error)} />}
        {e && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-extrabold text-gray-900">{e.title}</h4>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: e.category.color }}>
                    {e.category.name}
                  </span>
                  <span className="text-[11px] text-gray-500">Ngày chi {dmy(e.expenseDate)}</span>
                  {e.fundName && <span className="text-[11px] text-gray-500">· {e.fundName}</span>}
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-600 shrink-0">-{formatVND(e.amountVnd)}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-surface-container-low/60 border border-purple-50">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Người ứng tiền / trực tiếp chi</span>
                <div className="font-bold text-gray-900 mt-0.5">{e.paidBy?.name ?? e.payeeName ?? "Quỹ chi trực tiếp"}</div>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low/60 border border-purple-50">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Người lập phiếu</span>
                <div className="font-bold text-gray-900 mt-0.5">{e.requestedBy.name}</div>
              </div>
              {e.paymentMethod && (
                <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Hình thức chi</span>
                  <div className="font-bold text-gray-900 mt-0.5">
                    {PAYMENT_METHOD_LABEL[e.paymentMethod]}
                    {e.paidRecordedBy ? ` · Thủ quỹ ghi: ${e.paidRecordedBy}` : ""}
                  </div>
                </div>
              )}
              {e.note && (
                <div className="p-3 rounded-xl bg-surface-container-low/60 border border-purple-50 sm:col-span-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Ghi chú</span>
                  <div className="text-gray-700 mt-0.5 whitespace-pre-line">{e.note}</div>
                </div>
              )}
            </div>

            {/* Hoàn ứng: QR tài khoản nhận tiền của người ứng (có sẵn số tiền + nội dung) */}
            {e.paidBy && (e.status === "approved" || e.status === "paid") && (
              <ReimburseQr memberId={e.paidBy.memberId} memberName={e.paidBy.name} amountVnd={e.amountVnd} content={`HOAN UNG ${e.voucherNo}`} />
            )}

            {/* CHỨNG TỪ */}
            <div>
              <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide mb-2">Chứng từ / hóa đơn</h5>
              {image && (
                <a
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl overflow-hidden border border-purple-100 bg-gray-50 hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${image.url}?v=medium`} alt={`Hóa đơn phiếu ${e.voucherNo}`} className="w-full max-h-80 object-contain" />
                </a>
              )}
              {files.map((f) => (
                <a
                  key={f.fileId}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-2 p-3 rounded-xl border border-purple-100 bg-purple-50/40 text-xs font-bold text-primary hover:bg-purple-50"
                >
                  <FileText className="w-4 h-4" /> {f.mime === "application/pdf" ? "Xem hóa đơn PDF" : "Xem tệp đính kèm"}
                  <ExternalLink className="w-3.5 h-3.5 ml-auto" />
                </a>
              ))}
              {!e.receipts.length && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-900">
                  {e.noReceiptReason ? (
                    <>
                      <b>Không có hóa đơn:</b> {e.noReceiptReason}
                    </>
                  ) : (
                    "Chưa đính kèm hóa đơn."
                  )}
                </div>
              )}
            </div>

            {/* CHỮ KÝ DUYỆT */}
            {e.status !== "draft" && (
              <div>
                <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Chữ ký duyệt ({e.approvedCount}/{e.requiredApprovals})
                </h5>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (e.approvedCount / Math.max(1, e.requiredApprovals)) * 100)}%` }} />
                </div>
                <div className="space-y-1.5">
                  {currentRound.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-start justify-between gap-2 p-2.5 rounded-xl text-xs ${a.decision === "approved" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
                    >
                      <div>
                        <b>{a.approverName}</b> <span className="text-[11px]">({APPROVER_ROLE_LABEL[a.role] ?? a.role})</span>
                        {a.comment && <div className="text-[11px] mt-0.5">“{a.comment}”</div>}
                      </div>
                      <div className="text-right shrink-0 text-[11px] font-semibold">
                        {a.decision === "approved" ? "✓ Đã ký duyệt" : "✗ Từ chối"}
                        <div className="text-[10px] opacity-70">{dateTimeVN(a.decidedAt)}</div>
                      </div>
                    </div>
                  ))}
                  {e.can.reject && !e.can.approve && (
                    <div className="p-2.5 rounded-xl bg-gray-50 text-gray-600 text-[11px]">
                      Bạn chỉ có thể từ chối phiếu này:{" "}
                      {e.requiredApprovals === 1
                        ? "phiếu một chữ ký vượt hạn mức Thủ quỹ tự duyệt cần Trưởng nhà ký."
                        : "vai trò của bạn đã có người ký trong vòng duyệt này."}
                    </div>
                  )}
                  {e.status === "pending_approval" && e.approvedCount < e.requiredApprovals && (
                    <div className="p-2.5 rounded-xl bg-amber-50 text-amber-900 text-xs flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Chờ thêm {e.requiredApprovals - e.approvedCount} chữ ký
                      {e.requiredApprovals === 2
                        ? " (Trưởng nhà + Thủ quỹ; người lập/người ứng tiền không tự ký)"
                        : " (Trưởng nhà; Thủ quỹ ký với khoản nhỏ hoặc khi Trưởng nhà là người lập/người ứng tiền)"}
                    </div>
                  )}
                  {olderRounds.length > 0 && (
                    <div className="text-[11px] text-gray-400">
                      Vòng duyệt trước: {olderRounds.map((a) => `${a.approverName} ${a.decision === "approved" ? "đã ký" : "từ chối"}`).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {e.status === "rejected" && e.rejectionReason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  <b>Lý do từ chối:</b> {e.rejectionReason}
                </span>
              </div>
            )}
            {e.status === "cancelled" && e.cancelReason && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700">
                <b>Lý do hủy:</b> {e.cancelReason}
              </div>
            )}
            {e.reversal && (
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900">
                <b>Đã đảo bút toán chi</b> (hoàn tiền vào quỹ ngày {dmy(e.reversal.at.slice(0, 10))}){e.reversal.reason ? `: ${e.reversal.reason}` : ""}
              </div>
            )}

            {/* DÒNG THỜI GIAN */}
            <div>
              <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide mb-2">Tiến trình</h5>
              <ol className="relative border-l border-purple-100 ml-1.5 space-y-2">
                {timeline.map(([label, t, who]) => (
                  <li key={label} className="ml-3 text-xs">
                    <span className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-primary" />
                    <b className="text-gray-900">{label}</b>
                    <span className="text-gray-500"> · {dateTimeVN(t)}</span>
                    {who && <span className="text-gray-500"> · {who}</span>}
                  </li>
                ))}
              </ol>
            </div>

            {/* GHI NHẬN CHI */}
            {payOpen && e.can.pay && (
              <div className="p-4 rounded-2xl border-2 border-primary/30 bg-purple-50/30 space-y-3">
                <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide">Ghi nhận đã chi {formatVND(e.amountVnd)}</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomSelect<PaymentMethod>
                    label="Hình thức"
                    value={method}
                    onChange={setMethod}
                    options={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => ({ value: k, label: PAYMENT_METHOD_LABEL[k] }))}
                  />
                  <CustomDatePicker label="Ngày chi (sổ quỹ)" value={paidOn} onChange={setPaidOn} format="YYYY-MM-DD" />
                </div>
                <CustomInput
                  label={method === "bank_transfer" ? "Mã giao dịch / số ủy nhiệm chi *" : "Mã tham chiếu (nếu có)"}
                  value={reference}
                  onChange={(x) => setReference(x.target.value)}
                  placeholder="Ví dụ: FT26277123456"
                />
                <ImageUploadDropzone
                  bucket="receipts"
                  allowPdf
                  label="Chứng từ chi (tùy chọn)"
                  value={proof}
                  onChange={setProof}
                  helperText="Ủy nhiệm chi, biên nhận ký nhận tiền…"
                />
                <p className="text-[11px] text-gray-500">Bút toán chi được ghi vào sổ cái bất biến của túi quỹ; muốn sửa sau này phải đảo phiếu.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setPayOpen(false)} className={btnGhost}>
                    Để sau
                  </button>
                  <button disabled={busy} onClick={doPay} className={btnPrimary}>
                    {busy ? "Đang ghi..." : "Xác nhận đã chi"}
                  </button>
                </div>
              </div>
            )}

            <ErrorBox error={err} />
          </>
        )}
      </DialogShell>

      <ReasonDialog
        open={reasonFor === "reject"}
        onClose={() => setReasonFor(null)}
        icon={<X className="w-5 h-5" />}
        title="Từ chối phiếu chi"
        message={e ? `Phiếu ${e.voucherNo} — ${e.title} (${formatVND(e.amountVnd)}). Người lập sẽ thấy lý do và có thể sửa rồi gửi lại.` : null}
        confirmText="Từ chối phiếu"
        placeholder="Ví dụ: Thiếu hóa đơn, số tiền chưa khớp biên lai…"
        onConfirm={async (reason) => {
          await financeApi.decide(e!.id, "rejected", reason);
          await refreshFinance();
          showToast("success", `Đã từ chối phiếu ${e!.voucherNo}.`);
        }}
      />
      <ReasonDialog
        open={reasonFor === "cancel"}
        onClose={() => setReasonFor(null)}
        icon={<Ban className="w-5 h-5" />}
        title="Hủy phiếu chi"
        message="Phiếu không bị xóa mà chuyển sang trạng thái Đã hủy (lưu vết kiểm toán)."
        confirmText="Hủy phiếu"
        placeholder="Ví dụ: Lập trùng phiếu, không còn nhu cầu chi…"
        onConfirm={async (reason) => {
          await financeApi.cancel(e!.id, reason);
          await refreshFinance();
          showToast("success", `Đã hủy phiếu ${e!.voucherNo}.`);
        }}
      />
      <ReasonDialog
        open={reasonFor === "reverse"}
        onClose={() => setReasonFor(null)}
        icon={<RotateCcw className="w-5 h-5" />}
        title="Đảo phiếu đã chi"
        message={e ? `Hệ thống ghi một bút toán THU ${formatVND(e.amountVnd)} vào kỳ đang mở để hoàn lại quỹ (sổ cái không bị sửa/xóa).` : null}
        confirmText="Đảo bút toán"
        placeholder="Ví dụ: Nhà cung cấp hoàn tiền, ghi nhầm phiếu…"
        onConfirm={async (reason) => {
          await financeApi.reverse(e!.id, reason);
          await refreshFinance();
          showToast("success", `Đã đảo phiếu ${e!.voucherNo}.`);
        }}
      />
    </>
  );
}
