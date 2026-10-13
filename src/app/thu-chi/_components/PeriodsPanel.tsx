"use client";

// Tab "Sổ quỹ & chốt sổ" (/thu-chi?tab=so-quy[&month=YYYY-MM]) — gói F:
//   • Chốt sổ tháng HAI NGƯỜI: Thủ quỹ đối soát số dư thực tế ↔ sổ quỹ (sao kê / kiểm đếm), chốt (bước 1) → người thứ hai xác nhận (bước 2);
//     mở lại bắt buộc lý do. Chốt rồi thì KHÔNG ghi thêm / ghi lùi ngày vào tháng đó (và các tháng trước) — sửa sai bằng điều chỉnh ở tháng đang mở.
//   • Kiểm chứng chuỗi băm sổ quỹ (phát hiện sửa sổ ngoài hệ thống).
//   • Sổ quỹ chi tiết có số dư theo tháng / khoảng ngày + xuất Excel.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  Info,
  Lock,
  LockOpen,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Unlock,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dateTimeVN, dmy, monthEndOf, vnToday } from "@/lib/finance-format";
import { financeApi, refreshFinance, useLedgerBook, usePeriods } from "@/lib/data/finance";
import { LEDGER_SOURCE_LABEL, PERIOD_STATUS_LABEL, type LedgerBookFundDto, type PeriodDto, type PeriodFundDto, type PeriodsDto } from "@/lib/types/finance";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { DialogShell, ErrorBox, ReasonDialog, btnGhost, btnPrimary } from "./dialogs";

const monthLabel = (ym: string) => `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const short = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatVND(Math.abs(v))}`;
const parseVnd = (s: string) => Number(s.replace(/\D/g, "")) || 0;

const STATUS_STYLE: Record<PeriodDto["status"], string> = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-100",
  pending_confirmation: "bg-amber-50 text-amber-800 border-amber-200",
  closed: "bg-gray-900 text-white border-gray-900",
};

function StatusPill({ status }: { status: PeriodDto["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${STATUS_STYLE[status]}`}>
      {status === "open" ? <LockOpen className="w-3 h-3" /> : status === "pending_confirmation" ? <Clock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
      {PERIOD_STATUS_LABEL[status]}
    </span>
  );
}

/** Trạng thái đối soát của một túi quỹ trong kỳ */
function ReconChip({ f }: { f: PeriodFundDto }) {
  const r = f.reconciliation;
  if (!r)
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${f.requiresReconciliation ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
        {f.requiresReconciliation ? "Chưa đối soát (bắt buộc)" : "Chưa đối soát"}
      </span>
    );
  if (r.stale) return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 whitespace-nowrap">Đối soát đã cũ — làm lại</span>;
  if (r.differenceVnd === 0) return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 whitespace-nowrap">Đã đối soát · khớp</span>;
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 whitespace-nowrap" title={r.explanation ?? undefined}>
      Lệch {signed(r.differenceVnd)} · đã giải trình
    </span>
  );
}

function fundHint(f: PeriodFundDto, singleFund: boolean) {
  if (f.type === "bank") return "Số dư cuối ngày cuối tháng trên sao kê ngân hàng.";
  if (singleFund) return "Tiền mặt Thủ quỹ đang giữ + số dư tài khoản ngân hàng của nhà (quỹ chung).";
  return "Tiền mặt Thủ quỹ đếm được cuối ngày cuối tháng.";
}

// ---------------------------------------------------------------------
// Đối soát
// ---------------------------------------------------------------------
function ReconcileDialog({ target, singleFund, onClose }: { target: { period: PeriodDto; fund: PeriodFundDto } | null; singleFund: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const [stmt, setStmt] = useState("");
  const [expl, setExpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const r = target.fund.reconciliation;
    setStmt(r && !r.stale ? r.statementVnd.toLocaleString("vi-VN") : "");
    setExpl(r && !r.stale ? r.explanation ?? "" : "");
    setError(null);
  }, [target?.period.id, target?.fund.fundId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null;
  const { period, fund } = target;
  const ledger = fund.closingVnd;
  const entered = stmt.trim() !== "";
  const diff = entered ? parseVnd(stmt) - ledger : 0;
  const save = async () => {
    if (!entered) return setError("Nhập số dư thực tế cuối tháng.");
    if (diff !== 0 && expl.trim().length < 10) return setError("Số dư thực tế lệch sổ quỹ — hãy giải trình chênh lệch (tối thiểu 10 ký tự).");
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.reconcilePeriod(period.month, { fundId: fund.fundId, statementVnd: parseVnd(stmt), explanation: expl.trim() || null });
      await refreshFinance();
      showToast("success", r.differenceVnd === 0 ? `Đã đối soát ${fund.name} tháng ${short(period.month)}: khớp sổ quỹ.` : `Đã lưu đối soát ${fund.name}: lệch ${signed(r.differenceVnd)} (có giải trình).`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogShell
      open
      onClose={onClose}
      icon={<Scale className="w-5 h-5" />}
      title={`Đối soát ${fund.name}`}
      subtitle={`Số dư cuối ${monthLabel(period.month).toLowerCase()} — thực tế so với sổ quỹ`}
      z="z-[60]"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy} onClick={save} className={btnPrimary}>
            {busy ? "Đang lưu..." : "Lưu biên bản đối soát"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-3 rounded-2xl bg-surface-container-low/70 border border-purple-50">
          <div className="text-[10px] font-bold uppercase text-gray-400">Theo sổ quỹ</div>
          <div className="text-base font-extrabold text-gray-900 tabular-nums mt-0.5">{formatVND(ledger)}</div>
          <div className="text-[10px] text-gray-500">cuối ngày {dmy(monthEndOf(period.month))}</div>
        </div>
        <div className={`p-3 rounded-2xl border ${!entered ? "bg-gray-50 border-gray-100" : diff === 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-200"}`}>
          <div className="text-[10px] font-bold uppercase text-gray-400">Chênh lệch</div>
          <div className={`text-base font-extrabold tabular-nums mt-0.5 ${!entered ? "text-gray-400" : diff === 0 ? "text-emerald-700" : "text-amber-800"}`}>
            {entered ? (diff === 0 ? "Khớp" : signed(diff)) : "—"}
          </div>
          <div className="text-[10px] text-gray-500">= thực tế − sổ quỹ</div>
        </div>
      </div>
      <CustomInput
        label="Số dư thực tế cuối tháng (VNĐ) *"
        inputMode="numeric"
        value={stmt}
        onChange={(e) => setStmt(e.target.value.replace(/\D/g, "") ? parseVnd(e.target.value).toLocaleString("vi-VN") : "")}
        placeholder={ledger.toLocaleString("vi-VN")}
        rightSuffix="đ"
        hint={fundHint(fund, singleFund)}
      />
      <button type="button" onClick={() => setStmt(ledger.toLocaleString("vi-VN"))} className="self-start text-[11px] font-bold text-primary hover:underline">
        Khớp đúng sổ quỹ ({formatVND(ledger)})
      </button>
      {entered && diff !== 0 && (
        <CustomTextarea
          label="Giải trình chênh lệch *"
          rows={3}
          value={expl}
          onChange={(e) => setExpl(e.target.value)}
          maxLength={1000}
          placeholder="Ví dụ: Phí quản lý tài khoản 11.000đ ngân hàng tự trừ, chưa ghi vào sổ — sẽ ghi bút toán điều chỉnh ở tháng sau"
        />
      )}
      <p className="flex items-start gap-1.5 text-[11px] text-gray-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        Số dư sổ quỹ do hệ thống tính từ các bút toán đến hết ngày cuối tháng. Nếu sổ quỹ của tháng thay đổi sau khi đối soát, biên bản trở thành “đã cũ” và phải đối
        soát lại trước khi chốt. Chênh lệch thật thì ghi bút toán điều chỉnh (Tổng quan → Điều chỉnh) ở tháng đang mở.
      </p>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Chốt sổ (bước 1) / xác nhận (bước 2)
// ---------------------------------------------------------------------
function FundTable({ p }: { p: PeriodDto }) {
  if (!p.funds) return null;
  return (
    <div className="rounded-2xl border border-purple-50 overflow-hidden">
      <div className="hidden sm:grid grid-cols-5 gap-2 px-3 py-2 bg-surface-container-low/70 text-[10px] font-bold uppercase text-gray-400">
        <span>Túi quỹ</span>
        <span className="text-right">Đầu kỳ</span>
        <span className="text-right">Thu</span>
        <span className="text-right">Chi</span>
        <span className="text-right">Cuối kỳ</span>
      </div>
      {p.funds.map((f) => (
        <div key={f.fundId} className="grid grid-cols-2 sm:grid-cols-5 gap-x-2 gap-y-0.5 px-3 py-2 text-xs border-t border-purple-50 first:border-t-0">
          <span className="col-span-2 sm:col-span-1 font-bold text-gray-900 truncate">{f.name}</span>
          <span className="sm:text-right tabular-nums text-gray-600">
            <span className="sm:hidden text-[10px] text-gray-400">Đầu kỳ </span>
            {formatVND(f.openingVnd)}
          </span>
          <span className="text-right tabular-nums text-emerald-700">
            <span className="sm:hidden text-[10px] text-gray-400">Thu </span>+{formatVND(f.inVnd)}
          </span>
          <span className="sm:text-right tabular-nums text-rose-600">
            <span className="sm:hidden text-[10px] text-gray-400">Chi </span>−{formatVND(f.outVnd)}
          </span>
          <span className="text-right tabular-nums font-extrabold text-gray-900">
            <span className="sm:hidden text-[10px] font-normal text-gray-400">Cuối kỳ </span>
            {formatVND(f.closingVnd)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CloseDialog({ period, mode, onClose }: { period: PeriodDto | null; mode: "close" | "confirm"; onClose: () => void }) {
  const { showToast } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote("");
    setError(null);
  }, [period?.id, mode]);
  if (!period) return null;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "close") {
        const r = await financeApi.closePeriod(period.month, note.trim() || null);
        showToast("success", `Đã chốt sổ ${monthLabel(period.month).toLowerCase()} — chờ người thứ hai xác nhận.${r.unsettledVouchers ? ` Lưu ý: còn ${r.unsettledVouchers} phiếu chi chưa xong trong tháng.` : ""}`);
      } else {
        await financeApi.confirmPeriod(period.month);
        showToast("success", `Đã xác nhận chốt sổ ${monthLabel(period.month).toLowerCase()}.`);
      }
      await refreshFinance();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogShell
      open
      onClose={onClose}
      icon={mode === "close" ? <Lock className="w-5 h-5" /> : <Stamp className="w-5 h-5" />}
      title={mode === "close" ? `Chốt sổ ${monthLabel(period.month).toLowerCase()}` : `Xác nhận chốt sổ ${monthLabel(period.month).toLowerCase()}`}
      subtitle={mode === "close" ? "Bước 1 — Thủ quỹ chốt, người thứ hai xác nhận" : `Bước 2 — ${period.closed?.name ?? "Thủ quỹ"} đã chốt, bạn xác nhận`}
      z="z-[60]"
      maxWidth="max-w-xl"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Quay lại
          </button>
          <button disabled={busy} onClick={go} className={btnPrimary}>
            {busy ? "Đang xử lý..." : mode === "close" ? "Chốt sổ" : "Xác nhận chốt sổ"}
          </button>
        </>
      }
    >
      <FundTable p={period} />
      {period.totals && (period.funds?.length ?? 0) > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <span className="text-gray-500">Cộng tất cả túi quỹ</span>
          <b className="tabular-nums text-gray-900">{formatVND(period.totals.closingVnd)}</b>
        </div>
      )}
      {!!period.unsettledVouchers && (
        <p className="flex items-start gap-1.5 p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Còn {period.unsettledVouchers} phiếu chi chờ duyệt / chờ chi có ngày chi trong tháng này. Chốt vẫn được — khi chi, bút toán ghi vào ngày chi thực tế (tháng đang mở).
        </p>
      )}
      {mode === "confirm" && period.closed?.note && (
        <div className="p-2.5 rounded-xl bg-surface-container-low/70 text-xs text-gray-700">
          <b>Ghi chú của người chốt:</b> {period.closed.note}
        </div>
      )}
      {mode === "close" && (
        <CustomTextarea label="Ghi chú chốt sổ (tùy chọn)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: Đã đối chiếu sao kê, tiền mặt đủ." />
      )}
      <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 text-[11px] text-purple-950 leading-relaxed space-y-1">
        <p className="font-bold flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Sau khi {mode === "close" ? "chốt" : "xác nhận"}:
        </p>
        <p>• Không ghi thêm hay ghi lùi ngày vào tháng {short(period.month)} và các tháng trước (thu, chi, điều chỉnh). Sai sót được sửa bằng bút toán điều chỉnh ở tháng đang mở.</p>
        {mode === "close" ? (
          <p>• Số dư từng túi quỹ được chụp lại; cần một người KHÁC (Trưởng nhà) xác nhận. Trong lúc chờ, tháng này đã khóa ghi sổ.</p>
        ) : (
          <p>• Muốn sửa phải “Mở lại” kèm lý do — được ghi kiểm toán.</p>
        )}
      </div>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Một tháng
// ---------------------------------------------------------------------
function PeriodCard({
  p,
  open,
  onToggle,
  singleFund,
  onReconcile,
  onClose,
  onConfirm,
  onReopen,
  onViewLedger,
}: {
  p: PeriodDto;
  open: boolean;
  onToggle: () => void;
  singleFund: boolean;
  onReconcile: (f: PeriodFundDto) => void;
  onClose: () => void;
  onConfirm: () => void;
  onReopen: () => void;
  onViewLedger: () => void;
}) {
  const t = p.totals;
  const needRecon = p.funds?.some((f) => f.requiresReconciliation && (!f.reconciliation || f.reconciliation.stale)) ?? false;
  return (
    <div id={`ky-${p.month}`} className={`bg-white rounded-2xl border shadow-xs transition ${open ? "border-purple-200" : "border-purple-50"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" aria-expanded={open}>
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="text-sm font-extrabold text-gray-900">{monthLabel(p.month)}</span>
          <StatusPill status={p.status} />
          {p.status === "open" && p.can.close && <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">Sẵn sàng chốt</span>}
          {p.status === "open" && needRecon && p.monthEnded && <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">Cần đối soát</span>}
          {p.status === "pending_confirmation" && p.can.confirm && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">Chờ bạn xác nhận</span>}
          {p.reopenCount > 0 && <span className="text-[10px] font-semibold text-gray-400">mở lại {p.reopenCount} lần</span>}
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
          {t && (
            <span className="tabular-nums text-gray-500">
              Tồn cuối <b className="text-gray-900">{formatVND(t.closingVnd)}</b>
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-purple-50 pt-3">
          {t && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ["Đầu kỳ", formatVND(t.openingVnd), "text-gray-900"],
                  ["Thu", `+${formatVND(t.inVnd)}`, "text-emerald-700"],
                  ["Chi", `−${formatVND(t.outVnd)}`, "text-rose-600"],
                  ["Cuối kỳ", formatVND(t.closingVnd), "text-primary"],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="p-2.5 rounded-xl bg-surface-container-low/60 border border-purple-50">
                  <div className="text-[10px] font-bold uppercase text-gray-400">{k}</div>
                  <div className={`text-sm font-extrabold tabular-nums ${c}`}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {t && <div className="text-[11px] text-gray-400 -mt-1">{t.entryCount} bút toán trong tháng{p.funds?.some((f) => f.snapshot) ? " · số liệu chụp lúc chốt" : " · tính trực tiếp từ sổ quỹ"}</div>}

          {p.funds && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-extrabold text-gray-800">Đối soát số dư cuối tháng</h4>
              {p.funds.map((f) => (
                <div key={f.fundId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">{f.name}</div>
                    <div className="text-[11px] text-gray-500">
                      Sổ quỹ cuối tháng <b className="tabular-nums text-gray-800">{formatVND(f.closingVnd)}</b>
                      {f.reconciliation && (
                        <>
                          {" "}
                          · thực tế <b className="tabular-nums text-gray-800">{formatVND(f.reconciliation.statementVnd)}</b>
                          {f.reconciliation.byName ? ` · ${f.reconciliation.byName}` : ""} {dateTimeVN(f.reconciliation.at)}
                        </>
                      )}
                    </div>
                    {f.reconciliation?.explanation && <div className="text-[11px] text-amber-800 italic mt-0.5">Giải trình: {f.reconciliation.explanation}</div>}
                    {f.headHash && <div className="text-[10px] text-gray-400 font-mono truncate mt-0.5" title={f.headHash}>Băm cuối kỳ {f.headHash.slice(0, 16)}…</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <ReconChip f={f} />
                    {p.can.reconcile && (
                      <button onClick={() => onReconcile(f)} className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-bold">
                        {f.reconciliation ? "Đối soát lại" : "Đối soát"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {singleFund && p.funds.some((f) => f.requiresReconciliation) && (
                <p className="text-[11px] text-gray-500">Nhà dùng một quỹ chung (tiền mặt + tài khoản ngân hàng) nên số dư thực tế = tiền mặt đang giữ + số dư tài khoản.</p>
              )}
            </div>
          )}

          {p.blockers.length > 0 && (
            <ul className="flex flex-col gap-1 p-2.5 rounded-xl bg-amber-50/70 border border-amber-100 text-[11px] text-amber-900">
              {p.blockers.map((b) => (
                <li key={b} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {b}
                </li>
              ))}
            </ul>
          )}
          {!!p.unsettledVouchers && p.status === "open" && (
            <p className="flex items-start gap-1.5 text-[11px] text-gray-600">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              Còn {p.unsettledVouchers} phiếu chi chờ duyệt / chờ chi có ngày chi trong tháng (không chặn việc chốt).
            </p>
          )}

          <div className="flex flex-col gap-0.5 text-[11px] text-gray-500">
            {p.closed && (
              <span>
                <Lock className="w-3 h-3 inline mr-1" />
                Chốt bởi <b className="text-gray-700">{p.closed.byMe ? "bạn" : p.closed.name ?? "—"}</b> lúc {dateTimeVN(p.closed.at)}
                {p.closed.note ? ` — “${p.closed.note}”` : ""}
              </span>
            )}
            {p.confirmed && p.status === "closed" && (
              <span>
                <Stamp className="w-3 h-3 inline mr-1" />
                Xác nhận bởi <b className="text-gray-700">{p.confirmed.name ?? "—"}</b> lúc {dateTimeVN(p.confirmed.at)}
              </span>
            )}
            {p.reopened && (
              <span>
                <Unlock className="w-3 h-3 inline mr-1" />
                Mở lại gần nhất: {p.reopened.name ?? "—"} lúc {dateTimeVN(p.reopened.at)}
                {p.reopened.reason ? ` — lý do: ${p.reopened.reason}` : ""}
              </span>
            )}
            {p.status === "pending_confirmation" && p.closed?.byMe && (
              <span className="text-amber-700 font-semibold">Bạn đã chốt — cần một người khác xác nhận (nguyên tắc hai người).</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {p.can.close && (
              <button onClick={onClose} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs active:scale-95 transition">
                <Lock className="w-3.5 h-3.5" /> Chốt sổ tháng {short(p.month)}
              </button>
            )}
            {p.can.confirm && (
              <button onClick={onConfirm} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition">
                <Stamp className="w-3.5 h-3.5" /> Xác nhận chốt
              </button>
            )}
            {p.can.reopen && (
              <button onClick={onReopen} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold active:scale-95 transition">
                <Unlock className="w-3.5 h-3.5" /> Mở lại
              </button>
            )}
            {p.funds && (
              <button onClick={onViewLedger} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold active:scale-95 transition">
                <BookOpen className="w-3.5 h-3.5" /> Xem sổ quỹ tháng này
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Sổ quỹ chi tiết có số dư + xuất Excel
// ---------------------------------------------------------------------
function LedgerFundView({ f }: { f: LedgerBookFundDto }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <b className="text-gray-900">{f.name}</b>
        <span className="text-gray-500 tabular-nums">
          Đầu kỳ <b className="text-gray-800">{formatVND(f.openingVnd)}</b> · thu <b className="text-emerald-700">+{formatVND(f.inVnd)}</b> · chi{" "}
          <b className="text-rose-600">−{formatVND(f.outVnd)}</b> · cuối kỳ <b className="text-primary">{formatVND(f.closingVnd)}</b>
        </span>
      </div>
      {f.entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">Không có bút toán nào trong khoảng này.</p>
      ) : (
        <>
          {/* Điện thoại: mỗi bút toán một thẻ */}
          <div className="sm:hidden flex flex-col gap-1.5">
            {f.entries.map((e) => (
              <div key={e.id} className="p-2.5 rounded-xl border border-gray-100 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-gray-500">
                    {dmy(e.date)} · #{e.seq} · {LEDGER_SOURCE_LABEL[e.sourceType] ?? e.sourceType}
                  </span>
                  <span className={`text-xs font-extrabold tabular-nums shrink-0 ${e.direction === "in" ? "text-emerald-700" : "text-rose-600"}`}>
                    {e.direction === "in" ? "+" : "−"}
                    {formatVND(e.amountVnd)}
                  </span>
                </div>
                <div className="text-xs text-gray-900">{e.description}</div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span className="truncate">{[e.document, e.counterparty].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="shrink-0 tabular-nums">
                    Tồn <b className="text-gray-800">{formatVND(e.balanceAfterVnd)}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[10px] uppercase text-gray-400 font-bold border-b border-gray-100">
                  <th className="pb-2 pr-2">Ngày</th>
                  <th className="pb-2 pr-2">Số TT</th>
                  <th className="pb-2 pr-2">Diễn giải</th>
                  <th className="pb-2 pr-2">Chứng từ</th>
                  <th className="pb-2 pr-2">Đối ứng</th>
                  <th className="pb-2 px-2 text-right">Thu</th>
                  <th className="pb-2 px-2 text-right">Chi</th>
                  <th className="pb-2 pl-2 text-right">Tồn quỹ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="text-gray-500">
                  <td className="py-2 pr-2" colSpan={7}>
                    Số dư đầu kỳ
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums font-bold text-gray-800">{formatVND(f.openingVnd)}</td>
                </tr>
                {f.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-purple-50/40">
                    <td className="py-2 pr-2 whitespace-nowrap text-gray-600">{dmy(e.date)}</td>
                    <td className="py-2 pr-2 text-gray-400 tabular-nums">#{e.seq}</td>
                    <td className="py-2 pr-2 text-gray-900 max-w-[280px]">
                      <span className="block truncate" title={e.description}>
                        {e.description}
                      </span>
                      <span className="text-[10px] text-gray-400">{LEDGER_SOURCE_LABEL[e.sourceType] ?? e.sourceType}</span>
                    </td>
                    <td className="py-2 pr-2 text-gray-600 font-mono text-[11px] whitespace-nowrap">{e.document ?? "—"}</td>
                    <td className="py-2 pr-2 text-gray-600 truncate max-w-[140px]">{e.counterparty ?? "—"}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700 font-semibold">{e.direction === "in" ? formatVND(e.amountVnd) : ""}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-rose-600 font-semibold">{e.direction === "out" ? formatVND(e.amountVnd) : ""}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-gray-900">{formatVND(e.balanceAfterVnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LedgerViewer({ periods, month, onMonth, anchorRef }: { periods: PeriodsDto; month: string; onMonth: (m: string) => void; anchorRef: React.RefObject<HTMLDivElement> }) {
  const { showToast } = useApp();
  const today = periods.today;
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fund, setFund] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => {
    if (custom) {
      if (!from || !to || from > to) return null;
      return { from, to };
    }
    const end = monthEndOf(month);
    return { from: `${month}-01`, to: end > today ? today : end };
  }, [custom, from, to, month, today]);
  const { book, error, isLoading } = useLedgerBook(range?.from ?? null, range?.to ?? null, fund === "all" ? null : fund, periods.access.ledger);
  const fundOptions = periods.periods[0]?.funds ?? [];
  const tooLong = custom && from && to && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 366;

  const exportExcel = async () => {
    if (!range || busy) return;
    setBusy(true);
    try {
      const data = book ?? (await financeApi.ledgerBook(range.from, range.to, fund === "all" ? null : fund));
      const { downloadLedgerXlsx } = await import("@/lib/export/finance-ledger-xlsx");
      await downloadLedgerXlsx(data);
      showToast("success", `Đã tải sổ quỹ ${dmy(range.from)} – ${dmy(range.to)} (Excel).`);
    } catch (e) {
      showToast("error", `Không xuất được sổ quỹ: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!periods.access.ledger) return null;
  return (
    <div ref={anchorRef} className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-4 scroll-mt-24">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" /> Sổ quỹ chi tiết
          </h3>
          <p className="text-xs text-gray-500">Từng bút toán theo ngày hạch toán, kèm tồn quỹ sau mỗi bút toán — đọc thẳng từ sổ cái bất biến.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
            <button onClick={() => setCustom(false)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${!custom ? "bg-white text-primary shadow-xs" : "text-gray-500"}`}>
              Theo tháng
            </button>
            <button
              onClick={() => {
                setCustom(true);
                if (!from) setFrom(`${today.slice(0, 4)}-01-01`);
                if (!to) setTo(today);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${custom ? "bg-white text-primary shadow-xs" : "text-gray-500"}`}
            >
              Khoảng ngày
            </button>
          </div>
          {!custom ? (
            <div className="w-44">
              <CustomSelect
                value={month}
                onChange={onMonth}
                aria-label="Tháng của sổ quỹ"
                options={periods.periods.map((p) => ({ value: p.month, label: monthLabel(p.month) }))}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <CustomDatePicker value={from} onChange={setFrom} format="YYYY-MM-DD" placeholder="Từ ngày" />
              </div>
              <span className="text-gray-400 text-xs font-bold">→</span>
              <div className="w-36">
                <CustomDatePicker value={to} onChange={setTo} format="YYYY-MM-DD" placeholder="Đến ngày" />
              </div>
            </div>
          )}
          {fundOptions.length > 1 && (
            <div className="w-48">
              <CustomSelect
                value={fund}
                onChange={setFund}
                aria-label="Túi quỹ"
                options={[{ value: "all", label: "Mọi túi quỹ" }, ...fundOptions.map((f) => ({ value: f.fundId, label: f.name }))]}
              />
            </div>
          )}
          <button
            onClick={exportExcel}
            disabled={!range || !!tooLong || busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition active:scale-95 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> {busy ? "Đang xuất..." : "Xuất Excel sổ quỹ"}
          </button>
        </div>
      </div>
      {custom && (!range || tooLong) && <p className="text-xs font-semibold text-rose-600">{tooLong ? "Khoảng ngày tối đa 366 ngày." : "Chọn ngày bắt đầu trước ngày kết thúc."}</p>}
      {error && <div className="p-3 rounded-xl bg-rose-50 text-xs text-rose-700">Không tải được sổ quỹ: {errorMessage(error)}</div>}
      {isLoading && <Skeleton className="w-full h-40 rounded-2xl" />}
      {book && (
        <div className="flex flex-col gap-5">
          {book.truncated && (
            <p className="p-2.5 rounded-xl bg-amber-50 text-[11px] text-amber-900">Quá nhiều bút toán — danh sách đã cắt bớt. Tổng và số dư cuối kỳ vẫn đúng; thu hẹp khoảng ngày để xem đủ.</p>
          )}
          {book.funds.map((f) => (
            <LedgerFundView key={f.fundId} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------
export default function PeriodsPanel({ initialMonth }: { initialMonth?: string | null }) {
  const { showToast } = useApp();
  const { periods, error, isLoading } = usePeriods(true);
  const [openMonth, setOpenMonth] = useState<string | null>(initialMonth ?? null);
  const [ledgerMonth, setLedgerMonth] = useState<string>(initialMonth ?? vnToday().slice(0, 7));
  const [recon, setRecon] = useState<{ period: PeriodDto; fund: PeriodFundDto } | null>(null);
  const [closing, setClosing] = useState<{ period: PeriodDto; mode: "close" | "confirm" } | null>(null);
  const [reopen, setReopen] = useState<PeriodDto | null>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);

  // Mặc định mở (một lần) tháng cần xử lý: chờ mình xác nhận ⇒ sẵn sàng chốt ⇒ tháng cũ nhất chưa chốt — người dùng thu gọn hết thì giữ nguyên
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!periods || autoPicked.current) return;
    autoPicked.current = true;
    if (openMonth) return;
    const list = periods.periods;
    const pick =
      list.find((p) => p.can.confirm) ?? list.find((p) => p.can.close) ?? [...list].reverse().find((p) => p.status !== "closed" && p.monthEnded) ?? list[0];
    if (pick) setOpenMonth(pick.month);
  }, [periods, openMonth]);
  useEffect(() => {
    if (!initialMonth) return;
    setOpenMonth(initialMonth);
    setLedgerMonth(initialMonth);
    const t = setTimeout(() => document.getElementById(`ky-${initialMonth}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => clearTimeout(t);
  }, [initialMonth]);
  // Tháng của sổ quỹ chi tiết phải là một kỳ có trong danh sách
  useEffect(() => {
    if (periods && periods.periods.length && !periods.periods.some((p) => p.month === ledgerMonth)) setLedgerMonth(periods.periods[0].month);
  }, [periods, ledgerMonth]);

  const singleFund = useMemo(() => (periods?.periods[0]?.funds ?? []).filter((f) => f.type !== "event").length === 1, [periods]);
  const brokenChain = periods?.chain?.filter((c) => !c.ok) ?? [];
  const totalEntries = periods?.chain?.reduce((s, c) => s + c.entries, 0) ?? 0;

  if (error && !periods) return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800">Không tải được sổ quỹ: {errorMessage(error)}</div>;
  if (isLoading || !periods)
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải sổ quỹ">
        <Skeleton className="w-full h-32 rounded-3xl" />
        <Skeleton className="w-full h-20 rounded-2xl" />
        <Skeleton className="w-full h-20 rounded-2xl" />
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Sổ quỹ &amp; chốt sổ tháng</h2>
            <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
              Chốt sổ cần <b>hai người</b>: Thủ quỹ đối soát và chốt, người thứ hai (Trưởng nhà) xác nhận. <b>Chốt rồi thì không ghi thêm hay ghi lùi ngày vào tháng đó</b> (và
              các tháng trước) — sai sót được sửa bằng bút toán điều chỉnh ở tháng đang mở.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {periods.chain &&
              (brokenChain.length ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold" title={brokenChain.map((c) => c.code).join(", ")}>
                  <ShieldAlert className="w-3.5 h-3.5" /> Chuỗi băm sổ quỹ HỎNG ({brokenChain.map((c) => c.name ?? c.code).join(", ")})
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-bold"
                  title="Hệ thống tính lại mã băm của từng bút toán và đối chiếu chuỗi — phát hiện sửa sổ ngoài ứng dụng"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Sổ quỹ toàn vẹn · {totalEntries} bút toán
                </span>
              ))}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold ${periods.requireReconciliation ? "bg-purple-50 text-purple-900" : "bg-gray-100 text-gray-600"}`}>
              <Scale className="w-3.5 h-3.5" /> Bắt buộc đối soát: {periods.requireReconciliation ? "bật" : "tắt"}
            </span>
          </div>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          {[
            ["1", "Đối soát", "Thủ quỹ nhập số dư thực tế (sao kê / tiền mặt) — lệch phải giải trình", Scale],
            ["2", "Chốt sổ", "Thủ quỹ chốt sau ngày cuối tháng; số dư được chụp lại, tháng bị khóa", Lock],
            ["3", "Xác nhận", "Người thứ hai (khác người chốt) kiểm tra và xác nhận", Stamp],
          ].map(([n, t, d, Icon]) => {
            const I = Icon as typeof Lock;
            return (
              <li key={n as string} className="flex items-start gap-2 p-2.5 rounded-2xl bg-surface-container-low/60 border border-purple-50">
                <span className="w-6 h-6 rounded-lg bg-white text-primary font-extrabold flex items-center justify-center shrink-0 shadow-2xs">{n as string}</span>
                <span className="min-w-0">
                  <b className="text-gray-900 flex items-center gap-1">
                    <I className="w-3 h-3 text-primary" /> {t as string}
                  </b>
                  <span className="text-gray-500">{d as string}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {periods.requireReconciliation && singleFund && (
          <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
            Cấu hình “Bắt buộc đối soát” đang bật: quỹ chung (gộp tiền mặt + tài khoản ngân hàng) phải đối soát số dư cuối tháng trước khi chốt.
          </p>
        )}
      </div>

      {periods.periods.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white border border-purple-50 text-center text-xs text-gray-400">Sổ quỹ chưa có bút toán nào — chưa có tháng nào để chốt.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {periods.periods.map((p) => (
            <PeriodCard
              key={p.id}
              p={p}
              open={openMonth === p.month}
              onToggle={() => setOpenMonth(openMonth === p.month ? null : p.month)}
              singleFund={singleFund}
              onReconcile={(f) => setRecon({ period: p, fund: f })}
              onClose={() => setClosing({ period: p, mode: "close" })}
              onConfirm={() => setClosing({ period: p, mode: "confirm" })}
              onReopen={() => setReopen(p)}
              onViewLedger={() => {
                setLedgerMonth(p.month);
                setTimeout(() => ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
              }}
            />
          ))}
        </div>
      )}

      <LedgerViewer periods={periods} month={ledgerMonth} onMonth={setLedgerMonth} anchorRef={ledgerRef} />

      <ReconcileDialog target={recon} singleFund={singleFund} onClose={() => setRecon(null)} />
      <CloseDialog period={closing?.period ?? null} mode={closing?.mode ?? "close"} onClose={() => setClosing(null)} />
      <ReasonDialog
        open={!!reopen}
        onClose={() => setReopen(null)}
        icon={<Unlock className="w-5 h-5" />}
        title={reopen ? `Mở lại sổ ${monthLabel(reopen.month).toLowerCase()}` : "Mở lại sổ"}
        message={
          reopen ? (
            <>
              Mở lại để sửa sai sót của tháng {short(reopen.month)}: ảnh chụp số dư bị bỏ, phải đối soát (nếu bắt buộc), chốt và xác nhận lại. Thao tác được ghi kiểm toán và báo
              Thủ quỹ. Chỉ mở lại được tháng mới nhất đã chốt.
            </>
          ) : null
        }
        confirmText="Mở lại sổ"
        minLength={10}
        placeholder="Ví dụ: Phát hiện thiếu khoản thu quỹ ngày 30 chưa ghi vào sổ"
        onConfirm={async (reason) => {
          await financeApi.reopenPeriod(reopen!.month, reason);
          await refreshFinance();
          showToast("success", `Đã mở lại sổ ${monthLabel(reopen!.month).toLowerCase()}.`);
        }}
      />
    </div>
  );
}
