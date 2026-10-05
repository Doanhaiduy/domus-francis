"use client";

// Hộp thoại thu quỹ nhanh: "Đã đóng" (Thủ quỹ/Trưởng nhà/Admin ghi thay), "Tôi đã đóng" (thành viên tự báo, chờ xác nhận),
// nhắc người chưa đóng (trong ứng dụng + nhóm Zalo).
import React, { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Copy, HandCoins, Send } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy, vnToday } from "@/lib/finance-format";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { financeApi, newRequestId, refreshFinance, useFinanceOptions } from "@/lib/data/finance";
import { type ContributionCellDto, type ContributionPlanDto, type ContributionRowDto, type PaymentMethod, type RemindResultDto } from "@/lib/types/finance";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "./dialogs";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
];

// ---------------------------------------------------------------------
// "Đã đóng": người có quyền ghi thu xác nhận THAY một thành viên đã đóng đủ số còn lại
// ---------------------------------------------------------------------
export function QuickPayDialog({ target, onClose }: { target: { row: ContributionRowDto; cell: ContributionCellDto } | null; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions(!!target);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);

  useEffect(() => {
    if (!target) return;
    setMethod("cash");
    setPaidOn(vnToday());
    setRef("");
    setNote("");
    setError(null);
    setRequestId(newRequestId());
  }, [target?.cell.contributionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cell = target?.cell;
  const row = target?.row;
  const fund = options?.funds.find((f) => f.type === (method === "cash" ? "cash" : "bank")) ?? options?.funds[0];

  const save = async () => {
    if (!cell || !row) return;
    if (!fund) return setError("Chưa có túi quỹ để ghi thu.");
    setError(null);
    setBusy(true);
    try {
      await financeApi.recordPayment({
        memberId: row.memberId,
        fundId: fund.id,
        method,
        paidOn: paidOn || vnToday(),
        // Chuyển khoản bắt buộc có mã đối soát: nếu người ghi chưa có thì đánh dấu là xác nhận thủ công
        referenceCode: ref.trim() || (method === "bank_transfer" ? "XAC-NHAN-THU-CONG" : null),
        note: note.trim() || null,
        allocations: [{ contributionId: cell.contributionId, amountVnd: cell.remainingVnd }],
        clientRequestId: requestId,
      });
      await refreshFinance();
      showToast("success", `Đã ghi nhận ${row.name} đóng ${formatVND(cell.remainingVnd)} (${method === "cash" ? "tiền mặt" : "chuyển khoản"}).`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={!!target}
      onClose={onClose}
      icon={<CheckCircle2 className="w-5 h-5" />}
      title="Xác nhận đã đóng"
      subtitle={row && cell ? `${row.fullName} · ${cell.planName}` : undefined}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !cell} onClick={save} className={btnPrimary}>
            {busy ? "Đang ghi..." : `Đã nhận ${cell ? formatVND(cell.remainingVnd) : ""}`}
          </button>
        </>
      }
    >
      {cell && (
        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-xs text-emerald-900">
          Ghi nhận <b>{row?.name}</b> đã đóng đủ số còn lại <b>{formatVND(cell.remainingVnd)}</b> (hạn {dmy(cell.dueDate)}). Nhầm thì bấm <b>“Hoàn tác”</b> ở dòng này để hủy phiếu thu.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect<PaymentMethod> label="Hình thức" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
        <CustomDatePicker label="Ngày nhận tiền" value={paidOn} onChange={setPaidOn} format="YYYY-MM-DD" />
      </div>
      {method === "bank_transfer" && <CustomInput label="Mã giao dịch ngân hàng (nếu có)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Để trống nếu chưa có — hệ thống ghi “xác nhận thủ công”" />}
      <CustomInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Nhận tại phòng 201" />
      <p className="text-[11px] text-gray-500">Túi quỹ nhận: {fund ? fund.name : "—"}</p>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// "Tôi đã đóng": thành viên tự báo, chờ Thủ quỹ/Trưởng nhà/Admin xác nhận
// ---------------------------------------------------------------------
export function ClaimDialog({ target, onClose }: { target: { row: ContributionRowDto; cell: ContributionCellDto } | null; onClose: () => void }) {
  const { showToast } = useApp();
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setMethod("bank_transfer");
    setRef("");
    setNote("");
    setError(null);
  }, [target?.cell.contributionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await financeApi.claimPaid({ contributionId: target.cell.contributionId, method, referenceCode: ref.trim() || null, note: note.trim() || null });
      await refreshFinance();
      showToast("success", "Đã báo đã đóng — chờ Thủ quỹ xác nhận. Bạn sẽ nhận thông báo khi được xác nhận.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={!!target}
      onClose={onClose}
      icon={<HandCoins className="w-5 h-5" />}
      title="Tôi đã đóng"
      subtitle={target ? `${target.cell.planName} · còn ${formatVND(target.cell.remainingVnd)}` : undefined}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !target} onClick={save} className={btnPrimary}>
            {busy ? "Đang gửi..." : "Gửi báo đã đóng"}
          </button>
        </>
      }
    >
      <p className="text-xs text-gray-600 leading-relaxed">
        Bạn đã đưa tiền mặt cho Thủ quỹ hoặc đã chuyển khoản? Báo ở đây để Thủ quỹ đối chiếu và xác nhận. Khoản chỉ chuyển sang “Đã đóng” khi được xác nhận.
      </p>
      <CustomSelect<PaymentMethod> label="Bạn đã đóng bằng" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
      {method === "bank_transfer" && <CustomInput label="Mã giao dịch / nội dung chuyển khoản (nếu có)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ví dụ: FT26277123456" />}
      <CustomInput label="Ghi chú cho Thủ quỹ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đưa tiền mặt cho Bảo hôm qua" />
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Nhắc người chưa đóng (cả kế hoạch hoặc một người)
// ---------------------------------------------------------------------
export function RemindDialog({
  open,
  onClose,
  plan,
  owingCount,
  only,
}: {
  open: boolean;
  onClose: () => void;
  plan: ContributionPlanDto | null;
  owingCount: number;
  /** Chỉ nhắc một khoản (nhắc từng người): { contributionId, name } */
  only?: { contributionId: string; name: string } | null;
}) {
  const { showToast } = useApp();
  const [inApp, setInApp] = useState(true);
  const [zalo, setZalo] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RemindResultDto | null>(null);

  useEffect(() => {
    if (!open) return;
    setInApp(true);
    setZalo(false);
    setMessage("");
    setError(null);
    setResult(null);
  }, [open, only?.contributionId]);

  const send = async () => {
    if (!plan) return;
    if (!inApp && !zalo) return setError("Chọn ít nhất một kênh nhắc.");
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.remind(plan.id, { contributionIds: only ? [only.contributionId] : null, app: inApp, zalo, message: message.trim() || null });
      await refreshFinance();
      setResult(r);
      const parts: string[] = [];
      if (inApp) parts.push(r.sent > 0 ? `đã nhắc ${r.sent} người trong ứng dụng` : "không có ai cần nhắc thêm");
      if (r.skipped > 0) parts.push(`${r.skipped} người vừa được nhắc trong 1 giờ qua nên bỏ qua`);
      if (zalo) parts.push(r.zalo?.sent ? "đã gửi vào nhóm Zalo" : "chưa gửi được vào nhóm Zalo");
      showToast(r.sent > 0 || r.zalo?.sent ? "success" : "info", parts.join("; ") + ".");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    if (!result?.groupText) return;
    const ok = await copyTextToClipboard(result.groupText);
    showToast(ok ? "success" : "error", ok ? "Đã sao chép nội dung nhắc — dán (Ctrl+V) vào nhóm Zalo." : "Không thể tự động sao chép.");
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<BellRing className="w-5 h-5" />}
      title={only ? `Nhắc ${only.name} đóng quỹ` : "Nhắc người chưa đóng"}
      subtitle={plan ? `${plan.name}${only ? "" : ` · ${owingCount} người chưa đóng`}` : undefined}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            {result ? "Đóng" : "Hủy bỏ"}
          </button>
          {!result && (
            <button disabled={busy || !plan || (!only && owingCount === 0)} onClick={send} className={btnPrimary}>
              {busy ? "Đang gửi..." : "Gửi nhắc"}
            </button>
          )}
        </>
      }
    >
      {!result && (
        <>
          <div className="p-3 rounded-2xl bg-surface-container-low/70 border border-purple-50 space-y-1">
            <CustomToggle checked={inApp} onChange={setInApp} label="Thông báo trong ứng dụng" description="Người chưa đóng nhận thông báo kèm số tiền còn thiếu và hạn nộp (không nhắc lại trong 1 giờ)" />
            {!only && <CustomToggle checked={zalo} onChange={setZalo} label="Gửi vào nhóm Zalo của nhà" description="Danh sách người chưa đóng + tài khoản nhận quỹ (cần bật ở Cài đặt → Tích hợp Zalo; nếu chưa được, hệ thống đưa sẵn nội dung để bạn sao chép)" />}
          </div>
          <CustomTextarea label="Lời nhắn thêm (tùy chọn)" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="Ví dụ: Anh em sớm hoàn tất trước Chúa Nhật để Thủ quỹ chốt sổ nhé" />
        </>
      )}
      {result && (
        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-900 space-y-1">
            {inApp && (
              <div>
                <Send className="w-3.5 h-3.5 inline mr-1" />
                Trong ứng dụng: đã nhắc <b>{result.sent}</b> người{result.skipped ? ` · bỏ qua ${result.skipped} người vừa được nhắc` : ""}.
              </div>
            )}
            {zalo && (
              <div>
                <Send className="w-3.5 h-3.5 inline mr-1" />
                Nhóm Zalo: {result.zalo?.sent ? <b>đã gửi</b> : <>chưa gửi — {result.zalo?.reason ?? "không rõ lý do"}</>}.
              </div>
            )}
          </div>
          {zalo && !result.zalo?.sent && result.groupText && (
            <div className="space-y-2">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap bg-white rounded-xl border border-gray-100 p-3 text-gray-800 font-sans max-h-56 overflow-y-auto">{result.groupText}</pre>
              <button onClick={copyText} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold border border-purple-200">
                <Copy className="w-3.5 h-3.5 text-primary" /> Sao chép để dán vào nhóm Zalo
              </button>
            </div>
          )}
        </div>
      )}
      <ErrorBox error={error} />
    </DialogShell>
  );
}
