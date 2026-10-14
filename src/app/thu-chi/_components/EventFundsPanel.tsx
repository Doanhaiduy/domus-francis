"use client";

// Tab "Quỹ riêng" của Thu chi: quỹ tách hẳn khỏi quỹ nhà cho chuyến đi / sự kiện (kể cả người ngoài lưu xá).
// Người quản lý quỹ nhà lập quỹ + đóng quỹ; người phụ trách quỹ ghi thu, lập phiếu chi, ghi chi; thành viên có tên chỉ thấy phần của mình.
import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Banknote, CalendarDays, Check, ChevronRight, CircleDollarSign, Download, HandCoins, Landmark, Lock, Plus, ReceiptText, Undo2, UserCog, Users, Wallet } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { ExpenseFormCard } from "@/components/modals/AddExpenseModal";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn, formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { eventFundsApi, useEventFund, useEventFunds } from "@/lib/data/event-funds";
import { PAYMENT_METHOD_LABEL, type ExpenseDetailDto, type ExpenseDto } from "@/lib/types/finance";
import { SETTLEMENT_MODE_LABEL, type EventFundDetailDto, type EventFundListItem, type EventFundParticipant } from "@/lib/types/event-funds";
import ExpenseDetailModal, { StatusBadge } from "./ExpenseDetailModal";
import { ReasonDialog } from "./dialogs";
import { CloseFundDialog, CreateFundDialog, ManagersDialog, ParticipantsDialog, ReceiptDialog, SubsidyDialog } from "./EventFundDialogs";

const RELATION_LABEL = { house: "Quản lý quỹ nhà", manager: "Bạn phụ trách", participant: "Bạn tham gia" } as const;

function setFundInUrl(id: string | null) {
  try {
    const q = new URLSearchParams(window.location.search);
    q.set("tab", "quy-rieng");
    if (id) q.set("fund", id);
    else q.delete("fund");
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  } catch {
    /* trình duyệt chặn history — bỏ qua */
  }
}

export default function EventFundsPanel({ initialFundId }: { initialFundId?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialFundId ?? null);
  useEffect(() => {
    if (initialFundId) setSelected(initialFundId);
  }, [initialFundId]);
  const open = useCallback((id: string | null) => {
    setSelected(id);
    setFundInUrl(id);
  }, []);
  return selected ? <FundDetail id={selected} onBack={() => open(null)} /> : <FundList onOpen={open} />;
}

// ---------------------------------------------------------------------
// Danh sách quỹ
// ---------------------------------------------------------------------
function FundList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading, error } = useEventFunds();
  const [creating, setCreating] = useState(false);
  const items = data?.items ?? [];
  const open = items.filter((f) => f.isActive);
  const closed = items.filter((f) => !f.isActive);

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Quỹ riêng</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">Quỹ tách hẳn khỏi quỹ nhà cho một chuyến đi hoặc sự kiện (kể cả có người ngoài lưu xá): thu tiền người tham gia, chi cho chuyến đi, rồi quyết toán — quỹ nhà không bị động tới.</p>
        </div>
        {data?.canCreate && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
              <Plus className="w-4 h-4" /> Lập quỹ riêng
            </button>
          </div>
        )}
      </div>

      {error && !data && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="shimmer-box h-28 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">Chưa có quỹ riêng nào</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{data?.canCreate ? "Bấm “Lập quỹ riêng” khi có chuyến đi hoặc sự kiện cần thu chi riêng (hành hương, liên hoan với giáo xứ…)." : "Khi bạn là người phụ trách hoặc tham gia một quỹ riêng, quỹ đó sẽ hiện ở đây."}</p>
        </div>
      ) : (
        <>
          <FundCards title="Đang mở" items={open} onOpen={onOpen} />
          <FundCards title="Đã đóng" items={closed} onOpen={onOpen} />
        </>
      )}
      <CreateFundDialog open={creating} onClose={() => setCreating(false)} usedEventIds={items.map((f) => f.eventId).filter((x): x is string => !!x)} onCreated={onOpen} />
    </div>
  );
}

function FundCards({ title, items, onOpen }: { title: string; items: EventFundListItem[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">{title} ({items.length})</h3>
      <ul className="grid gap-3 xl:grid-cols-2 items-start">
        {items.map((f) => {
          const full = f.dueTotalVnd != null;
          const pct = full && f.dueTotalVnd! > 0 ? Math.min(100, Math.round(((f.paidTotalVnd ?? 0) * 100) / f.dueTotalVnd!)) : null;
          const myPct = f.myDueVnd && f.myDueVnd > 0 ? Math.min(100, Math.round(((f.myPaidVnd ?? 0) * 100) / f.myDueVnd)) : null;
          return (
            <li key={f.id}>
              <button type="button" onClick={() => onOpen(f.id)} className={cn("w-full text-left bg-white border rounded-2xl p-4 space-y-2.5 hover:border-primary/50 hover:shadow-sm transition", f.isActive ? "border-purple-100" : "border-gray-200 opacity-80")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-gray-900 truncate">{f.name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 min-w-0">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{f.eventTitle ?? "—"}{f.eventStartsAt ? ` · ${dmy(f.eventStartsAt.slice(0, 10))}` : ""}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", f.relation === "participant" ? "bg-sky-100 text-sky-800" : "bg-purple-100 text-primary")}>{RELATION_LABEL[f.relation]}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
                {full ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Mini label="Số dư" value={formatVND(f.balanceVnd ?? 0)} tone="text-primary" />
                      <Mini label="Đã thu" value={formatVND(f.paidTotalVnd ?? 0)} tone="text-emerald-700" />
                      <Mini label="Người tham gia" value={String(f.participantCount ?? 0)} tone="text-gray-800" />
                    </div>
                    {pct !== null && <Progress pct={pct} label={`Đã đóng ${formatVND(f.paidTotalVnd ?? 0)} / ${formatVND(f.dueTotalVnd ?? 0)}`} />}
                  </>
                ) : (
                  <>
                    {f.myDueVnd != null && <p className="text-xs text-gray-600">Phần của bạn: <b>{formatVND(f.myPaidVnd ?? 0)}</b> / {formatVND(f.myDueVnd)}</p>}
                    {myPct !== null && <Progress pct={myPct} label={myPct >= 100 ? "Bạn đã đóng đủ" : `Còn thiếu ${formatVND((f.myDueVnd ?? 0) - (f.myPaidVnd ?? 0))}`} />}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-gray-50/80 px-2 py-1.5 min-w-0">
      <p className="text-[10px] font-bold uppercase text-gray-400">{label}</p>
      <p className={cn("text-sm font-extrabold truncate", tone)}>{value}</p>
    </div>
  );
}

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      <p className="text-[11px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Chi tiết một quỹ
// ---------------------------------------------------------------------
type Dlg = null | "receipt" | "participants" | "close" | "subsidy" | "managers";

function FundDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { showToast } = useApp();
  const { data, error, isLoading } = useEventFund(id);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; label: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ expense: ExpenseDetailDto | null } | null>(null);
  const [exporting, setExporting] = useState(false);

  const roster = data?.roster ?? [];
  const activeRoster = roster.filter((p) => !p.removed);
  const s = data?.summary ?? null;
  const can = data?.can;
  const fundRef = data ? { id: data.fund.id, name: data.fund.name } : null;

  const exportXlsx = async () => {
    if (!data?.summary) return;
    setExporting(true);
    try {
      const { downloadEventFundXlsx } = await import("@/lib/export/event-fund-xlsx");
      await downloadEventFundXlsx({ summary: data.summary, roster: data.roster, receipts: data.receipts, expenses: data.expenses });
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  if (error && !data) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><ArrowLeft className="w-4 h-4" /> Quay lại danh sách</button>
        <p className="text-sm text-rose-600">{errorMessage(error)}</p>
      </div>
    );
  }
  if (isLoading || !data) return <div className="space-y-3"><div className="shimmer-box h-20 rounded-2xl" /><div className="shimmer-box h-40 rounded-2xl" /></div>;

  const openReceipt = (pid: string | null) => {
    setPresetId(pid);
    setDlg("receipt");
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><ArrowLeft className="w-4 h-4" /> Tất cả quỹ riêng</button>

      <div className="page-head">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 flex flex-wrap items-center gap-2">
            <Wallet className="w-5 h-5 text-primary shrink-0" /> {data.fund.name}
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", data.fund.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600")}>{data.fund.isActive ? "Đang mở" : "Đã đóng"}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {data.fund.eventTitle ? `Sự kiện: ${data.fund.eventTitle}` : ""}
            {s?.fund.eventStartsAt ? ` · ${dmy(s.fund.eventStartsAt.slice(0, 10))}` : ""}
            {s && s.managers.length ? ` · Người phụ trách: ${s.managers.map((m) => m.name).join(", ")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can?.operate && (
            <>
              <button type="button" onClick={() => openReceipt(null)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95"><HandCoins className="w-4 h-4" /> Ghi thu</button>
              <button type="button" onClick={() => setForm({ expense: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 bg-white text-primary hover:bg-purple-50 text-xs font-bold transition"><ReceiptText className="w-4 h-4" /> Lập phiếu chi</button>
            </>
          )}
          {s && (
            <button type="button" onClick={exportXlsx} disabled={exporting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-bold transition disabled:opacity-60"><Download className="w-4 h-4" /> {exporting ? "Đang xuất…" : "Xuất Excel"}</button>
          )}
        </div>
      </div>

      {s ? <SummaryBlock s={s} /> : <MineBlock roster={roster} />}

      {s && (can?.closeFund || can?.subsidy) && data.fund.isActive && (
        <div className="flex flex-wrap gap-2">
          {can.closeFund && <button type="button" onClick={() => setDlg("close")} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-bold transition"><Lock className="w-4 h-4" /> Đóng quỹ (quyết toán)</button>}
          {can.subsidy && <button type="button" onClick={() => setDlg("subsidy")} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-bold transition"><Landmark className="w-4 h-4" /> Bù từ quỹ nhà</button>}
          {can.closeFund && <button type="button" onClick={() => setDlg("managers")} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-bold transition"><UserCog className="w-4 h-4" /> Đổi người phụ trách</button>}
        </div>
      )}

      {s?.settlement && <SettlementBlock s={s} />}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Người tham gia ({activeRoster.length})</h3>
          {can?.operate && <button type="button" onClick={() => setDlg("participants")} className="text-xs font-bold text-primary hover:underline">Sửa danh sách</button>}
        </div>
        <ul className="grid gap-2 xl:grid-cols-2 items-start">
          {activeRoster.map((p) => (
            <ParticipantRow key={p.id} p={p} canReceive={!!can?.operate} onReceive={() => openReceipt(p.id)} />
          ))}
          {activeRoster.length === 0 && <li className="text-xs text-gray-500 py-2">Chưa có ai trong danh sách.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-600" /> Phiếu thu ({data.receipts.length})</h3>
        <ul className="space-y-1.5">
          {data.receipts.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-white border rounded-xl px-3.5 py-2.5", r.voidedAt ? "border-gray-200 opacity-60" : "border-purple-100")}>
              <div className="min-w-0">
                <p className={cn("text-sm font-bold text-gray-900 truncate", r.voidedAt && "line-through")}>{r.payerName}</p>
                <p className="text-[11px] text-gray-500">{dmy(r.paidOn)} · {PAYMENT_METHOD_LABEL[r.method]}{r.referenceCode ? ` · mã ${r.referenceCode}` : ""}{r.receivedByName ? ` · ghi bởi ${r.receivedByName}` : ""}{r.note ? ` · ${r.note}` : ""}</p>
                {r.voidedAt && <p className="text-[11px] text-rose-600">Đã hủy: {r.voidReason}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-sm font-extrabold text-emerald-700">+{formatVND(r.amountVnd)}</p>
                {can?.operate && !r.voidedAt && (
                  <button type="button" onClick={() => setVoiding({ id: r.id, label: `${r.payerName} — ${formatVND(r.amountVnd)}` })} title="Hủy phiếu thu" aria-label="Hủy phiếu thu" className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50"><Undo2 className="w-4 h-4" /></button>
                )}
              </div>
            </li>
          ))}
          {data.receipts.length === 0 && <li className="text-xs text-gray-500 py-2">Chưa có khoản thu nào.</li>}
        </ul>
      </section>

      {s && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2"><ReceiptText className="w-4 h-4 text-rose-600" /> Phiếu chi ({data.expenses.length})</h3>
          {s.pendingVouchers > 0 && <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{s.pendingVouchers} phiếu đang chờ duyệt hoặc chờ ghi chi — Trưởng nhà / Thủ quỹ duyệt ở mục “Việc cần xử lý”, rồi người phụ trách ghi chi khi giao tiền.</p>}
          <ul className="space-y-1.5">
            {data.expenses.map((e) => <ExpenseRow key={e.id} e={e} onOpen={() => setDetailId(e.id)} />)}
            {data.expenses.length === 0 && <li className="text-xs text-gray-500 py-2">Chưa có phiếu chi nào.</li>}
          </ul>
        </section>
      )}

      <ReceiptDialog open={dlg === "receipt"} onClose={() => setDlg(null)} fundId={id} fundName={data.fund.name} roster={roster} presetId={presetId} />
      <ParticipantsDialog open={dlg === "participants"} onClose={() => setDlg(null)} fundId={id} roster={roster} />
      {s && <CloseFundDialog open={dlg === "close"} onClose={() => setDlg(null)} fundId={id} summary={s} />}
      <SubsidyDialog open={dlg === "subsidy"} onClose={() => setDlg(null)} fundId={id} fundName={data.fund.name} />
      <ManagersDialog open={dlg === "managers"} onClose={() => setDlg(null)} fundId={id} current={(s?.managers ?? []).map((m) => m.memberId)} />
      <ReasonDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        icon={<Undo2 className="w-5 h-5" />}
        title="Hủy phiếu thu"
        message={voiding ? `Phiếu thu ${voiding.label}. Tiền được trừ lại khỏi quỹ bằng bút toán đảo (cần đủ số dư).` : null}
        confirmText="Hủy phiếu thu"
        placeholder="Ví dụ: Nhập nhầm số tiền, người đóng rút lại…"
        onConfirm={async (reason) => {
          await eventFundsApi.voidReceipt(id, voiding!.id, reason);
          showToast("success", "Đã hủy phiếu thu.");
        }}
      />
      <ExpenseDetailModal
        expenseId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(e) => {
          setDetailId(null);
          setForm({ expense: e });
        }}
      />
      {form && fundRef && (
        <Portal>
          <div onClick={() => setForm(null)} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5">
            <div className="flex min-h-full items-center justify-center">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
                <ExpenseFormCard expense={form.expense} fixedFund={fundRef} onClose={() => setForm(null)} onSaved={(saved) => setDetailId(saved.id)} />
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function SummaryBlock({ s }: { s: NonNullable<EventFundDetailDto["summary"]> }) {
  const due = s.participants.dueVnd;
  const pct = due > 0 ? Math.min(100, Math.round((s.receiptsVnd * 100) / due)) : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat icon={<CircleDollarSign className="w-4 h-4" />} tone="text-primary bg-purple-50" label="Số dư quỹ" value={formatVND(s.balanceVnd)} note={s.fund.isActive ? "Còn trong quỹ" : "Sau khi quyết toán"} />
        <Stat icon={<Banknote className="w-4 h-4" />} tone="text-emerald-700 bg-emerald-50" label="Đã thu" value={formatVND(s.receiptsVnd)} note={due > 0 ? `Phải thu ${formatVND(due)}` : "Chưa định mức"} />
        <Stat icon={<ReceiptText className="w-4 h-4" />} tone="text-rose-700 bg-rose-50" label="Đã chi" value={formatVND(s.spentVnd)} note={s.subsidyVnd ? `Quỹ nhà bù ${formatVND(s.subsidyVnd)}` : "Phiếu chi đã ghi chi"} />
        <Stat icon={<Users className="w-4 h-4" />} tone="text-sky-700 bg-sky-50" label="Đã đóng đủ" value={`${s.participants.paidFull}/${s.participants.count}`} note={s.participants.paidPartial ? `${s.participants.paidPartial} người đóng một phần` : "người tham gia"} />
      </div>
      {pct !== null && <Progress pct={pct} label={`Tiến độ thu ${pct}% (${formatVND(s.receiptsVnd)} / ${formatVND(due)})`} />}
    </div>
  );
}

function MineBlock({ roster }: { roster: EventFundParticipant[] }) {
  const me = roster[0];
  if (!me) return null;
  const pct = me.dueVnd > 0 ? Math.min(100, Math.round((me.paidVnd * 100) / me.dueVnd)) : null;
  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-4 space-y-2">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Phần của bạn</p>
      <p className="text-lg font-extrabold text-gray-900">{formatVND(me.paidVnd)} <span className="text-sm font-semibold text-gray-500">/ {me.dueVnd > 0 ? formatVND(me.dueVnd) : "chưa định mức"}</span></p>
      {pct !== null && <Progress pct={pct} label={pct >= 100 ? "Bạn đã đóng đủ — cảm ơn bạn!" : `Còn thiếu ${formatVND(me.dueVnd - me.paidVnd)} — đưa cho người phụ trách quỹ.`} />}
    </div>
  );
}

function SettlementBlock({ s }: { s: NonNullable<EventFundDetailDto["summary"]> }) {
  const st = s.settlement!;
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 space-y-2">
      <p className="text-sm font-extrabold text-gray-900 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /> Đã quyết toán ngày {dmy(st.settledAt.slice(0, 10))}</p>
      <p className="text-xs text-gray-600">{SETTLEMENT_MODE_LABEL[st.mode]}{st.mode !== "none" ? ` — ${formatVND(st.balanceVnd)}` : ""}{st.note ? ` · ${st.note}` : ""}</p>
      {st.lines.length > 0 && st.mode === "refund" && (
        <ul className="grid gap-1 sm:grid-cols-2 text-xs">
          {st.lines.map((l, i) => <li key={i} className="flex justify-between gap-2 bg-white rounded-lg border border-gray-100 px-2.5 py-1.5"><span className="truncate">{l.name}</span><b className="shrink-0">{formatVND(l.amountVnd)}</b></li>)}
        </ul>
      )}
    </div>
  );
}

function Stat({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <div className="bg-white border border-purple-100 rounded-2xl p-3.5 min-w-0">
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold", tone)}>{icon}{label}</span>
      <p className="text-lg font-extrabold text-gray-900 mt-1.5 truncate">{value}</p>
      <p className="text-[11px] text-gray-500 truncate">{note}</p>
    </div>
  );
}

function ParticipantRow({ p, canReceive, onReceive }: { p: EventFundParticipant; canReceive: boolean; onReceive: () => void }) {
  const done = p.dueVnd > 0 && p.paidVnd >= p.dueVnd;
  const pct = p.dueVnd > 0 ? Math.min(100, Math.round((p.paidVnd * 100) / p.dueVnd)) : null;
  return (
    <li className="bg-white border border-purple-100 rounded-xl px-3.5 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 min-w-0 text-sm font-bold text-gray-900">
            <span className="truncate">{p.name}</span>
            {p.isGuest && <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Người ngoài</span>}
          </p>
          {p.phone && <p className="text-[11px] text-gray-500">{p.phone}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-xs text-right"><b className={done ? "text-emerald-700" : "text-gray-900"}>{formatVND(p.paidVnd)}</b>{p.dueVnd > 0 ? <span className="text-gray-400"> / {formatVND(p.dueVnd)}</span> : null}</p>
          {canReceive && !done && (
            <button type="button" onClick={onReceive} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition active:scale-95"><HandCoins className="w-3.5 h-3.5" /> Thu</button>
          )}
          {done && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check className="w-3.5 h-3.5" /> Đủ</span>}
        </div>
      </div>
      {pct !== null && <div className="h-1 rounded-full bg-gray-100 overflow-hidden"><div className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>}
    </li>
  );
}

function ExpenseRow({ e, onOpen }: { e: ExpenseDto; onOpen: () => void }) {
  const dim = e.status === "cancelled" || e.status === "rejected" || e.status === "reversed";
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("w-full text-left flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-white border border-purple-100 rounded-xl px-3.5 py-2.5 hover:border-primary/50 transition", dim && "opacity-60")}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{e.title}</p>
          <p className="text-[11px] text-gray-500">{e.voucherNo} · {dmy(e.expenseDate)} · {e.category.name}{e.items.length ? ` · ${e.items.length} món` : ""}{e.paidBy ? ` · ${e.paidBy.name} ứng` : ""}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={e.status} />
          <p className="text-sm font-extrabold text-rose-600">-{formatVND(e.amountVnd)}</p>
        </div>
      </button>
    </li>
  );
}
