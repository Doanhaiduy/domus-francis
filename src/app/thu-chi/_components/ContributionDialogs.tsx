"use client";

import React, { useEffect, useMemo, useState } from "react";
import { HandCoins, CalendarPlus, BadgePercent, RotateCcw, Info, Zap, QrCode, AlertTriangle } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy, shiftMonth, vnToday } from "@/lib/finance-format";
import { financeApi, newRequestId, refreshFinance, useContributionMatrix, useFinanceOptions, usePlanPreview } from "@/lib/data/finance";
import {
  CONTRIBUTION_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  monthRangeLabel,
  type ContributionCellDto,
  type ContributionRowDto,
  type PaymentMethod,
} from "@/lib/types/finance";
import { CustomDatePicker, CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { DialogShell, ErrorBox, ReasonDialog, btnGhost, btnPrimary } from "./dialogs";

export const CELL_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  unpaid: "bg-rose-100 text-rose-800",
  waived: "bg-sky-100 text-sky-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export function ContributionBadge({ cell }: { cell: ContributionCellDto }) {
  const overdue = cell.overdue && (cell.status === "unpaid" || cell.status === "partial");
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${overdue ? "bg-rose-600 text-white" : CELL_STYLE[cell.status]}`}>
      {overdue ? `Quá hạn${cell.status === "partial" ? " (một phần)" : ""}` : CONTRIBUTION_STATUS_LABEL[cell.status]}
    </span>
  );
}

const owingOf = (c: ContributionCellDto) => c.remainingVnd > 0 && (c.status === "unpaid" || c.status === "partial");
const monthTitleShort = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

// ---------------------------------------------------------------------
// Ghi thu: một phiếu thu cho 1..n khoản (đóng gộp quỹ kỳ + điện nước / đóng một phần)
// ---------------------------------------------------------------------
export function PayModal({ memberId, contributionId, onClose }: { memberId: string | null; contributionId: string | null; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions(!!memberId);
  const current = vnToday().slice(0, 7);
  // Mọi khoản của thành viên trong 24 tháng (gồm kỳ quỹ lập trước tới 6 tháng)
  const { matrix } = useContributionMatrix({ member: memberId ?? undefined, to: shiftMonth(current, 6), months: 24 }, !!memberId);
  const row = matrix?.rows.find((r) => r.memberId === memberId) ?? null;
  const open = useMemo(
    () => (row ? Object.values(row.cells).filter(owingOf).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.planName.localeCompare(b.planName)) : []),
    [row],
  );
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [fundId, setFundId] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);

  useEffect(() => {
    if (!memberId) return;
    setError(null);
    setRef("");
    setNote("");
    setRequestId(newRequestId());
  }, [memberId]);
  useEffect(() => {
    if (!row) return;
    const target = open.find((c) => c.contributionId === contributionId) ?? open[0];
    setAmounts(target ? { [target.contributionId]: target.remainingVnd } : {});
  }, [row?.memberId, contributionId, open.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!options) return;
    if (!paidOn) setPaidOn(options.today);
    const want = method === "cash" ? "cash" : "bank";
    const f = options.funds.find((x) => x.type === want) ?? options.funds[0];
    if (f) setFundId(f.id);
  }, [options, method]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = Object.values(amounts).reduce((a, b) => a + b, 0);
  const toggle = (c: ContributionCellDto) =>
    setAmounts((p) => {
      const n = { ...p };
      if (n[c.contributionId] !== undefined) delete n[c.contributionId];
      else n[c.contributionId] = c.remainingVnd;
      return n;
    });

  const save = async () => {
    setError(null);
    const allocations = Object.entries(amounts).map(([cid, amountVnd]) => ({ contributionId: cid, amountVnd }));
    if (!allocations.length) return setError("Chọn ít nhất một khoản cần thu.");
    if (allocations.some((a) => !a.amountVnd || a.amountVnd <= 0)) return setError("Số tiền mỗi khoản phải lớn hơn 0.");
    if (method === "bank_transfer" && !ref.trim()) return setError("Chuyển khoản phải có mã giao dịch ngân hàng.");
    setBusy(true);
    try {
      await financeApi.recordPayment({
        memberId: memberId!,
        fundId,
        method,
        paidOn,
        referenceCode: ref.trim() || null,
        note: note.trim() || null,
        allocations,
        clientRequestId: requestId,
      });
      await refreshFinance();
      showToast("success", `Đã ghi thu ${formatVND(total)} của ${row?.fullName ?? "thành viên"}.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={!!memberId}
      onClose={onClose}
      icon={<HandCoins className="w-5 h-5" />}
      title="Ghi thu"
      subtitle={row ? `${row.fullName}${row.room ? ` · ${row.room}` : ""}` : "Đang tải…"}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !row} onClick={save} className={btnPrimary}>
            {busy ? "Đang ghi..." : `Xác nhận thu ${formatVND(total)}`}
          </button>
        </>
      }
    >
      {row && open.length === 0 && <div className="p-3 rounded-xl bg-emerald-50 text-xs text-emerald-800">Thành viên này không còn khoản nào phải thu.</div>}
      {open.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Các khoản còn phải thu (chọn nhiều khoản = đóng gộp trong một phiếu thu)</label>
          <div className="space-y-1.5">
            {open.map((c) => {
              const on = amounts[c.contributionId] !== undefined;
              return (
                <div
                  key={c.contributionId}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs ${on ? "border-primary bg-purple-50/50" : "border-gray-100"}`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(c)} className="w-4 h-4 accent-[#5f3add] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">{c.planName}</div>
                    <div className="text-[11px] text-gray-500">
                      Còn {formatVND(c.remainingVnd)} / {formatVND(c.netDueVnd)} · hạn {dmy(c.dueDate)}
                      {c.overdue && <span className="text-rose-600 font-bold"> · quá hạn</span>}
                    </div>
                  </div>
                  {on && (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amounts[c.contributionId].toLocaleString("vi-VN")}
                      onChange={(e) =>
                        setAmounts((p) => ({ ...p, [c.contributionId]: Math.min(c.remainingVnd, Number(e.target.value.replace(/\D/g, "")) || 0) }))
                      }
                      className="w-24 sm:w-28 px-2 py-1.5 rounded-lg border border-gray-200 text-right font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
                      title="Số tiền thu cho khoản này (đóng một phần nếu nhỏ hơn số còn lại)"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect<PaymentMethod>
          label="Hình thức"
          value={method}
          onChange={setMethod}
          options={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => ({ value: k, label: PAYMENT_METHOD_LABEL[k] }))}
        />
        <CustomDatePicker label="Ngày nhận tiền" value={paidOn} onChange={setPaidOn} format="YYYY-MM-DD" />
      </div>
      <CustomSelect
        label="Nhận vào túi quỹ"
        value={fundId}
        onChange={setFundId}
        options={(options?.funds ?? []).map((f) => ({ value: f.id, label: f.name }))}
      />
      <CustomInput
        label={method === "bank_transfer" ? "Mã giao dịch ngân hàng *" : "Mã tham chiếu (nếu có)"}
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Ví dụ: FT26277123456"
      />
      <CustomInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Đóng gộp quỹ kỳ + điện nước" />
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Chi tiết một khoản phải thu: phiếu thu (hủy được), miễn/giảm (Trưởng nhà), nộp qua QR (chính chủ)
// ---------------------------------------------------------------------
export function CellDialog({
  row,
  cell,
  onClose,
  onPay,
  onPayQr,
}: {
  row: ContributionRowDto | null;
  cell: ContributionCellDto | null;
  onClose: () => void;
  onPay: (memberId: string, contributionId: string) => void;
  /** Mở mã QR nộp tiền (chỉ hiện với khoản của chính người xem) */
  onPayQr?: (row: ContributionRowDto, cell: ContributionCellDto) => void;
}) {
  const { showToast } = useApp();
  const { can, session } = useSession();
  const canRecord = can("finance.contribution.record");
  const canWaive = can("finance.contribution.waive");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!cell) return;
    setDiscount(cell.discountVnd > 0 ? cell.discountVnd : cell.amountDueVnd - cell.paidVnd);
    setReason(cell.discountReason ?? "");
    setError(null);
  }, [cell?.contributionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const waive = async (value: number) => {
    if (!cell) return;
    setBusy(true);
    setError(null);
    try {
      await financeApi.waive(cell.contributionId, value, value > 0 ? reason.trim() : null);
      await refreshFinance();
      showToast("success", value > 0 ? `Đã miễn/giảm ${formatVND(value)} cho ${row?.fullName}.` : `Đã bỏ miễn giảm cho ${row?.fullName}.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const voidTarget = cell?.payments.find((p) => p.paymentId === voidId);
  const mine = !!row && row.memberId === session?.member?.id;
  const owing = !!cell && owingOf(cell);

  return (
    <>
      <DialogShell
        open={!!cell && !!row}
        onClose={onClose}
        icon={<HandCoins className="w-5 h-5" />}
        title={cell ? cell.planName : "Khoản phải thu"}
        subtitle={row ? `${row.fullName}${row.room ? ` · ${row.room}` : ""}` : undefined}
        footer={
          cell &&
          row &&
          owing &&
          (canRecord || (mine && onPayQr)) && (
            <>
              {mine && onPayQr && (
                <button
                  onClick={() => {
                    onPayQr(row, cell);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700"
                >
                  <QrCode className="w-3.5 h-3.5" /> Nộp qua QR
                </button>
              )}
              {canRecord && (
                <button
                  onClick={() => {
                    onPay(row.memberId, cell.contributionId);
                    onClose();
                  }}
                  className={btnPrimary}
                >
                  Ghi thu {formatVND(cell.remainingVnd)}
                </button>
              )}
            </>
          )
        }
      >
        {cell && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                ["Phải thu", formatVND(cell.amountDueVnd)],
                ["Miễn/giảm", formatVND(cell.discountVnd)],
                ["Đã đóng", formatVND(cell.paidVnd)],
                ["Còn lại", formatVND(cell.remainingVnd)],
              ].map(([k, v]) => (
                <div key={k} className="p-2.5 rounded-xl bg-surface-container-low/60 border border-purple-50">
                  <div className="text-[10px] text-gray-400 font-bold uppercase">{k}</div>
                  <div className="font-extrabold text-gray-900 mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <ContributionBadge cell={cell} />
              <span className="text-gray-500">Hạn nộp {dmy(cell.dueDate)}</span>
              <span className="text-gray-400">· Mã {cell.planCode}</span>
            </div>
            {cell.discountReason && (
              <div className="p-2.5 rounded-xl bg-sky-50 text-xs text-sky-900">
                <b>Lý do miễn/giảm:</b> {cell.discountReason}
              </div>
            )}
            <div>
              <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide mb-2">Phiếu thu</h5>
              {cell.payments.length === 0 && <div className="text-xs text-gray-400">Chưa có phiếu thu nào.</div>}
              <div className="space-y-1.5">
                {cell.payments.map((p) => (
                  <div key={p.paymentId} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50/60 text-xs">
                    <div>
                      <b>{formatVND(p.allocatedVnd)}</b> · {PAYMENT_METHOD_LABEL[p.method]} · {dmy(p.paidOn)}
                      {p.monthsCovered > 1 && (
                        <span className="text-[11px] text-gray-500">
                          {" "}
                          (phiếu gộp {p.monthsCovered} khoản, tổng {formatVND(p.totalVnd)})
                        </span>
                      )}
                    </div>
                    {canRecord && (
                      <button
                        onClick={() => setVoidId(p.paymentId)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" /> Hủy phiếu thu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {mine && owing && (
              <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                Chuyển khoản qua mã QR rồi chờ Thủ quỹ xác nhận — khoản chuyển sang “Đã đóng” khi Thủ quỹ ghi phiếu thu.
              </p>
            )}
            {canWaive && (cell.status !== "paid" || cell.discountVnd > 0) && (
              <div className="p-3 rounded-2xl border border-sky-100 bg-sky-50/40 space-y-2">
                <h5 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                  <BadgePercent className="w-4 h-4 text-sky-700" /> Miễn / giảm (Trưởng nhà)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <CustomInput
                    label="Số tiền miễn/giảm"
                    value={discount ? discount.toLocaleString("vi-VN") : ""}
                    onChange={(e) => setDiscount(Math.min(cell.amountDueVnd - cell.paidVnd, Number(e.target.value.replace(/\D/g, "")) || 0))}
                  />
                  <div className="sm:col-span-2">
                    <CustomInput
                      label="Lý do *"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ví dụ: Hoàn cảnh khó khăn, đi thực tập xa…"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  {cell.discountVnd > 0 && (
                    <button disabled={busy} onClick={() => waive(0)} className={btnGhost}>
                      Bỏ miễn giảm
                    </button>
                  )}
                  <button
                    disabled={busy || discount <= 0}
                    onClick={() => (reason.trim().length < 5 ? setError("Lý do miễn/giảm tối thiểu 5 ký tự.") : waive(discount))}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {discount >= cell.amountDueVnd ? "Miễn toàn bộ" : "Giảm khoản thu"}
                  </button>
                </div>
              </div>
            )}
            <ErrorBox error={error} />
          </>
        )}
      </DialogShell>
      <ReasonDialog
        open={!!voidId}
        onClose={() => setVoidId(null)}
        icon={<RotateCcw className="w-5 h-5" />}
        title="Hủy phiếu thu"
        message={
          voidTarget
            ? `Ghi bút toán đảo ${formatVND(voidTarget.totalVnd)} (không xóa sổ cái).${
                voidTarget.monthsCovered > 1 ? ` Phiếu này đóng gộp ${voidTarget.monthsCovered} khoản — mọi khoản trong phiếu sẽ trở về chưa đóng.` : ""
              }`
            : null
        }
        confirmText="Hủy phiếu thu"
        placeholder="Ví dụ: Ghi nhầm người nộp, tiền giả…"
        onConfirm={async (r) => {
          await financeApi.voidPayment(voidId!, r);
          await refreshFinance();
          showToast("success", "Đã hủy phiếu thu.");
          onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------
// Lập kỳ QUỸ ĐỊNH KỲ (mức + số tháng mỗi kỳ theo Cài đặt) — có xem trước số người × mức
// ---------------------------------------------------------------------
export function DuesCycleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions(open);
  const [startMonth, setStartMonth] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fundId, setFundId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !options) return;
    setStartMonth(options.currentCycle.startMonth);
    setDueDate("");
    setFundId(options.funds.find((f) => f.type === "cash")?.id ?? options.funds[0]?.id ?? "");
    setError(null);
  }, [open, options]);
  const { preview, error: previewError } = usePlanPreview(open && startMonth ? { kind: "periodic_dues", startMonth, dueDate: dueDate || undefined } : null);
  const cycles = options ? [options.currentCycle, options.nextCycle] : [];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.createPlan({ kind: "periodic_dues", startMonth, dueDate: dueDate || undefined, fundId: fundId || undefined });
      await refreshFinance();
      showToast("success", `Đã lập ${r.name}: ${r.generated} khoản phải thu × ${formatVND(r.amountVnd)}.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<CalendarPlus className="w-5 h-5" />}
      title="Lập kỳ quỹ"
      subtitle="Sinh khoản phải thu cho mọi thành viên đang ở lưu xá"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !preview || !!preview.existing || preview.amountVnd <= 0} onClick={save} className={btnPrimary}>
            {busy ? "Đang lập..." : "Lập kỳ quỹ"}
          </button>
        </>
      }
    >
      {options && (
        <>
          <CustomSelect
            label="Kỳ quỹ"
            value={startMonth}
            onChange={(v) => {
              setStartMonth(v);
              setDueDate("");
            }}
            options={cycles.map((c, i) => ({
              value: c.startMonth,
              label: `${monthRangeLabel(c.startMonth, c.endMonth)}${i === 0 ? " (kỳ hiện tại)" : " (kỳ kế tiếp)"}`,
            }))}
          />
          <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50 text-xs text-gray-700 space-y-0.5">
            <div>
              Mức quỹ mỗi kỳ: <b className="text-gray-900">{formatVND(options.dues.amountVnd)}</b> / người / {options.dues.cycleMonths} tháng
              {options.dues.cycleMonths > 0 && (
                <span className="text-gray-500"> (≈ {formatVND(Math.round((options.dues.amountVnd * 12) / options.dues.cycleMonths))} / năm)</span>
              )}
            </div>
            <div className="text-[11px] text-gray-500">Mức quỹ, số tháng mỗi kỳ và tháng bắt đầu kỳ do Trưởng nhà đặt ở Cài đặt → Quản lý quỹ.</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomDatePicker label="Hạn nộp" value={dueDate || preview?.dueDate || ""} onChange={setDueDate} format="YYYY-MM-DD" />
            <CustomSelect label="Túi quỹ nhận" value={fundId} onChange={setFundId} options={options.funds.map((f) => ({ value: f.id, label: f.name }))} />
          </div>
        </>
      )}
      {preview && (
        <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs text-purple-900">
          <div className="font-bold">{preview.name}</div>
          <div>
            {preview.splitCount} người × {formatVND(preview.amountVnd)} = <b>{formatVND(preview.totalVnd)}</b> · hạn {dmy(preview.dueDate)}
          </div>
        </div>
      )}
      {preview?.existing && (
        <p className="flex items-start gap-1.5 p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Đã có kế hoạch “{preview.existing.name}” trong kỳ này — mỗi kỳ chỉ một kế hoạch thu quỹ.
        </p>
      )}
      <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Miễn/giảm cho từng người do Trưởng nhà duyệt sau khi lập. Thành viên vào ở sau hạn nộp không bị tính khoản kỳ này.
      </p>
      <ErrorBox error={error ?? (previewError ? errorMessage(previewError) : null)} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Nhập TIỀN ĐIỆN NƯỚC tháng: tổng hóa đơn của cả nhà ⇒ chia đều, mỗi người làm tròn lên 1.000 đ
// ---------------------------------------------------------------------
export function UtilityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions(open);
  const current = vnToday().slice(0, 7);
  const [month, setMonth] = useState(shiftMonth(current, -1));
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fundId, setFundId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState(0);
  useEffect(() => {
    if (!open) return;
    setMonth(shiftMonth(current, -1));
    setTotal(0);
    setNote("");
    setDueDate("");
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !options) return;
    setFundId(options.funds.find((f) => f.type === "cash")?.id ?? options.funds[0]?.id ?? "");
  }, [open, options]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(total), 350);
    return () => clearTimeout(t);
  }, [total]);
  const { preview, error: previewError } = usePlanPreview(
    open ? { kind: "utility", month, billTotalVnd: debounced, dueDate: dueDate || undefined } : null
  );
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(current, -i));

  const save = async () => {
    if (total <= 0) return setError("Nhập tổng tiền hóa đơn điện + nước của cả nhà.");
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.createPlan({
        kind: "utility",
        month,
        billTotalVnd: total,
        dueDate: dueDate || undefined,
        fundId: fundId || undefined,
        note: note.trim() || null,
      });
      await refreshFinance();
      showToast("success", `Đã lập ${r.name}: ${r.generated} người × ${formatVND(r.amountVnd)}.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<Zap className="w-5 h-5" />}
      title="Nhập tiền điện nước"
      subtitle="Tổng hóa đơn điện + nước của cả nhà, chia đều cho người đang ở"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || total <= 0 || !!preview?.existing || preview?.splitCount === 0} onClick={save} className={btnPrimary}>
            {busy ? "Đang lập..." : "Lập khoản thu điện nước"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect
          label="Tháng hóa đơn"
          value={month}
          onChange={(v) => {
            setMonth(v);
            setDueDate("");
          }}
          options={months.map((m) => ({ value: m, label: `Tháng ${monthTitleShort(m)}${m === current ? " (tháng này)" : ""}` }))}
        />
        <CustomInput
          label="Tổng hóa đơn điện + nước (VNĐ) *"
          inputMode="numeric"
          value={total ? total.toLocaleString("vi-VN") : ""}
          onChange={(e) => setTotal(Math.min(1_000_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))}
          placeholder="Ví dụ: 1.850.000"
        />
      </div>
      <CustomInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Điện 1.180.000 + nước 670.000" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomDatePicker label="Hạn nộp" value={dueDate || preview?.dueDate || ""} onChange={setDueDate} format="YYYY-MM-DD" />
        <CustomSelect label="Túi quỹ nhận" value={fundId} onChange={setFundId} options={(options?.funds ?? []).map((f) => ({ value: f.id, label: f.name }))} />
      </div>
      {preview && (
        <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 text-xs text-purple-900">
          <div className="font-bold">{preview.name}</div>
          {preview.splitCount === 0 ? (
            <div>Không có thành viên đang ở để chia.</div>
          ) : total > 0 && preview.billTotalVnd === total ? (
            <div>
              {preview.splitCount} người × {formatVND(preview.amountVnd)} = <b>{formatVND(preview.totalVnd)}</b>
              {preview.remainderVnd > 0 && <span>, dư {formatVND(preview.remainderVnd)} (làm tròn lên 1.000 đ)</span>}
              <span className="text-purple-700"> · hạn {dmy(preview.dueDate)}</span>
            </div>
          ) : (
            <div>
              Chia đều cho {preview.splitCount} người đang ở · hạn {dmy(preview.dueDate)}
            </div>
          )}
        </div>
      )}
      {preview?.existing && (
        <p className="flex items-start gap-1.5 p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Tháng này đã có “{preview.existing.name}”. Nhập sai thì hủy kế hoạch cũ (khi chưa ai nộp) rồi nhập lại.
        </p>
      )}
      <ErrorBox error={error ?? (previewError ? errorMessage(previewError) : null)} />
    </DialogShell>
  );
}
