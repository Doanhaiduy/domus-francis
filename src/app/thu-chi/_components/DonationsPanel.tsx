"use client";

// Tab "Ủng hộ" của Thu chi: khoản ủng hộ / quyên góp tự nguyện vào quỹ nhà (khác khoản phải thu định kỳ).
// Thủ quỹ/Trưởng nhà/Admin ghi nhận (đã nhận ⇒ vào sổ quỹ ngay · ghi nhận trước ⇒ chờ nhận tiền) và xác nhận khoản thành viên tự báo.
import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock, HandHeart, Heart, Loader2, Plus, Save, Search, Undo2, Users, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { FundSelect } from "@/components/finance/FundSelect";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { formatVND, cn } from "@/lib/utils";
import { vnToday } from "@/lib/vn-time";
import { newRequestId, useFinanceOptions } from "@/lib/data/finance";
import { donationsApi, useDonations } from "@/lib/data/donations";
import { DONATION_METHOD_LABEL, DONATION_STATUS_LABEL, type DonationDto, type DonationMethod, type DonationStatus } from "@/lib/types/donations";

const STATUS_STYLE: Record<DonationStatus, string> = {
  pledged: "bg-sky-100 text-sky-800",
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-gray-200 text-gray-600",
};
const METHODS = (Object.keys(DONATION_METHOD_LABEL) as DonationMethod[]).map((m) => ({ value: m, label: DONATION_METHOD_LABEL[m] }));
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Range = "all" | "month" | "quarter" | "year";
const RANGES: { value: Range; label: string }[] = [
  { value: "all", label: "Mọi thời gian" },
  { value: "month", label: "Tháng này" },
  { value: "quarter", label: "Quý này" },
  { value: "year", label: "Năm nay" },
];
type StatusFilter = DonationStatus | "open" | "";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "Mọi trạng thái" },
  { value: "open", label: "Chờ xử lý (chờ nhận tiền / chờ xác nhận)" },
  { value: "confirmed", label: "Đã nhận" },
  { value: "pending", label: "Chờ xác nhận" },
  { value: "pledged", label: "Đã ghi nhận (chờ nhận tiền)" },
  { value: "rejected", label: "Từ chối" },
  { value: "cancelled", label: "Đã hủy" },
];

function rangeDates(r: Range): { from?: string; to?: string } {
  const today = vnToday();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const p2 = (n: number) => String(n).padStart(2, "0");
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (r === "month") return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${last(y, m)}` };
  if (r === "quarter") {
    const q1 = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${p2(q1)}-01`, to: `${y}-${p2(q1 + 2)}-${last(y, q1 + 2)}` };
  }
  if (r === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return {};
}

export default function DonationsPanel() {
  const { showToast } = useApp();
  const { session } = useSession();
  const hasMember = !!session?.member;
  const [range, setRange] = useState<Range>("year");
  const [status, setStatus] = useState<StatusFilter>("");
  const [q, setQ] = useState("");
  const dates = useMemo(() => rangeDates(range), [range]);
  const { data, isLoading, error } = useDonations({ from: dates.from, to: dates.to, status, q });
  const canRecord = !!data?.canRecord;
  const items = data?.items ?? [];
  const s = data?.summary;

  const [recordOpen, setRecordOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirming, setConfirming] = useState<DonationDto | null>(null);
  const [rejecting, setRejecting] = useState<DonationDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2"><HandHeart className="w-5 h-5 text-primary" /> Ủng hộ quỹ</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            {canRecord ? "Ghi lại ai ủng hộ bao nhiêu và đã nhận tiền chưa. Khoản “đã nhận” vào sổ quỹ ngay; thành viên cũng tự báo được, bạn xác nhận khi thấy tiền về." : "Bạn đã ủng hộ quỹ nhà? Bấm “Tôi đã ủng hộ” để báo — Thủ quỹ sẽ xác nhận khi nhận được. Dưới đây là các khoản bạn đã báo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasMember && (
            <button type="button" onClick={() => setReportOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 bg-white text-primary hover:bg-purple-50 text-xs font-bold transition">
              <Heart className="w-4 h-4" /> Tôi đã ủng hộ
            </button>
          )}
          {canRecord && (
            <button type="button" onClick={() => setRecordOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
              <Plus className="w-4 h-4" /> Ghi nhận ủng hộ
            </button>
          )}
        </div>
      </div>

      {s && canRecord && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Check className="w-4 h-4" />} tone="text-emerald-700 bg-emerald-50" label="Đã nhận" value={formatVND(s.confirmedVnd)} note={`${s.confirmedCount} khoản`} />
          <Stat icon={<Users className="w-4 h-4" />} tone="text-purple-700 bg-purple-50" label="Người ủng hộ" value={String(s.donorCount)} note={`${s.memberDonorCount} trong nhà · ${s.donorCount - s.memberDonorCount} người ngoài`} />
          <Stat icon={<Clock className="w-4 h-4" />} tone="text-amber-700 bg-amber-50" label="Chờ xác nhận" value={String(s.pendingCount)} note={formatVND(s.pendingVnd)} />
          <Stat icon={<Heart className="w-4 h-4" />} tone="text-sky-700 bg-sky-50" label="Chờ nhận tiền" value={String(s.pledgedCount)} note={formatVND(s.pledgedVnd)} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><CustomSelect<Range> label="Thời gian" value={range} onChange={setRange} options={RANGES} /></div>
        <div className="w-56"><CustomSelect<StatusFilter> label="Trạng thái" value={status} onChange={setStatus} options={STATUS_OPTIONS} /></div>
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Tìm kiếm</span>
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên người ủng hộ, mã giao dịch, ghi chú…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-medium focus:outline-none focus:border-primary" />
        </label>
      </div>

      {error && !data && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-20 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <HandHeart className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">Chưa có khoản ủng hộ nào ở mục này</p>
          {canRecord && <p className="text-sm text-gray-500 mt-1">Bấm “Ghi nhận ủng hộ” để ghi một khoản đã nhận tiền hoặc ghi nhận trước (chờ nhận tiền).</p>}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 items-start">
          {items.map((d) => (
            <li key={d.id} className={cn("bg-white border rounded-2xl p-4 space-y-2", d.status === "pending" ? "border-amber-200" : "border-purple-100", busy === d.id && "opacity-60 pointer-events-none")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-900">{d.donorName}{d.isMember ? <span className="ml-2 text-[10px] font-bold text-primary bg-purple-50 px-1.5 py-0.5 rounded">Thành viên</span> : <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Người ngoài</span>}</p>
                  <p className="text-xs text-gray-500">{dmy(d.donatedOn)} · {DONATION_METHOD_LABEL[d.method]}{d.referenceCode ? ` · mã ${d.referenceCode}` : ""}{d.fundName ? ` · vào ${d.fundName}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-extrabold text-primary">{formatVND(d.amountVnd)}</p>
                  <span className={cn("inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", STATUS_STYLE[d.status])}>{DONATION_STATUS_LABEL[d.status]}</span>
                </div>
              </div>
              {d.note && <p className="text-sm text-gray-700">{d.note}</p>}
              {d.decisionNote && d.status !== "confirmed" && <p className="text-xs text-gray-500">Ghi chú xử lý: {d.decisionNote}</p>}
              {d.selfReported && d.status === "pending" && <p className="text-[11px] text-amber-700">Thành viên tự báo — cần đối chiếu tiền về trước khi xác nhận.</p>}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {canRecord && (d.status === "pending" || d.status === "pledged") && (
                  <button type="button" onClick={() => setConfirming(d)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition active:scale-95"><Check className="w-3.5 h-3.5" /> Đã nhận tiền</button>
                )}
                {canRecord && d.status === "pending" && (
                  <button type="button" onClick={() => setRejecting(d)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 transition"><X className="w-3.5 h-3.5" /> Chưa nhận được</button>
                )}
                {canRecord && d.status === "pledged" && (
                  <button type="button" onClick={() => run(d.id, () => donationsApi.act(d.id, "cancel"), "Đã hủy khoản này.")} className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition">Hủy</button>
                )}
                {d.isMine && d.status === "pending" && (
                  <button type="button" onClick={() => run(d.id, () => donationsApi.act(d.id, "withdraw"), "Đã rút lại khoản báo.")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition"><Undo2 className="w-3.5 h-3.5" /> Rút lại</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {recordOpen && <RecordDialog onClose={() => setRecordOpen(false)} />}
      {reportOpen && <ReportDialog onClose={() => setReportOpen(false)} />}
      {confirming && <ConfirmDialog item={confirming} onClose={() => setConfirming(null)} />}
      {rejecting && <RejectDialog item={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function Stat({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <div className="bg-white border border-purple-100 rounded-2xl p-3.5">
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold", tone)}>{icon}{label}</span>
      <p className="text-lg font-extrabold text-gray-900 mt-1.5">{value}</p>
      <p className="text-[11px] text-gray-500">{note}</p>
    </div>
  );
}

function Shell({ title, subtitle, onClose, busy, onSubmit, submitLabel, children, wide }: { title: string; subtitle?: string; onClose: () => void; busy: boolean; onSubmit: (e: React.FormEvent) => void; submitLabel: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} className={cn("bg-white rounded-3xl w-full max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn", wide ? "max-w-xl" : "max-w-md")}>
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-gray-900">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4">{children}</div>
          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

const toAmount = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** Thủ quỹ/Trưởng nhà/Admin ghi nhận một khoản ủng hộ. */
function RecordDialog({ onClose }: { onClose: () => void }) {
  const { members, showToast } = useApp();
  const options = useFinanceOptions();
  const [donorType, setDonorType] = useState<"member" | "outside">("member");
  const [memberId, setMemberId] = useState("");
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [donatedOn, setDonatedOn] = useState(vnToday());
  const [method, setMethod] = useState<DonationMethod>("bank_transfer");
  const [received, setReceived] = useState(true);
  const [fundId, setFundId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => newRequestId());

  const funds = options?.funds ?? [];
  useEffect(() => {
    if (!fundId && funds.length) setFundId((funds.find((f) => f.type === (method === "cash" ? "cash" : "bank")) ?? funds[0]).id);
  }, [funds, fundId, method]);
  const memberOptions = useMemo(() => members.filter((m) => m.status === "active" || m.status === "on_leave").map((m) => ({ value: m.id, label: m.fullName, subLabel: m.room ?? undefined })), [members]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVnd = toAmount(amount);
    if (donorType === "member" && !memberId) return showToast("error", "Hãy chọn thành viên ủng hộ.");
    if (donorType === "outside" && donorName.trim().length < 2) return showToast("error", "Hãy nhập tên người ủng hộ (hoặc ghi “Ẩn danh”).");
    if (!(amountVnd >= 1)) return showToast("error", "Hãy nhập số tiền ủng hộ.");
    if (received && !fundId) return showToast("error", "Chọn túi quỹ nhận tiền.");
    setBusy(true);
    try {
      await donationsApi.record({
        donorMemberId: donorType === "member" ? memberId : null,
        donorName: donorType === "outside" ? donorName.trim() : null,
        amountVnd,
        donatedOn,
        method,
        fundId: received ? fundId : null,
        referenceCode: reference.trim() || null,
        note: note.trim() || null,
        received,
        clientRequestId: requestId,
      });
      showToast("success", received ? "Đã ghi nhận và vào sổ quỹ." : "Đã ghi nhận khoản ủng hộ — chờ nhận tiền.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Ghi nhận ủng hộ" subtitle="Ghi lại một khoản ủng hộ vào quỹ nhà." onClose={onClose} busy={busy} onSubmit={submit} submitLabel={received ? "Ghi vào quỹ" : "Ghi nhận"} wide>
      <div className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
        {([["member", "Thành viên trong nhà"], ["outside", "Người ngoài"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setDonorType(k)} className={cn("px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", donorType === k ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>{label}</button>
        ))}
      </div>
      {donorType === "member" ? (
        <CustomSelect label="Thành viên ủng hộ" value={memberId} onChange={setMemberId} options={memberOptions} placeholder="Chọn thành viên…" />
      ) : (
        <CustomInput label="Tên người ủng hộ *" value={donorName} onChange={(e) => setDonorName(e.target.value)} maxLength={120} placeholder="VD: Ông Nguyễn Văn Ân (hoặc “Ẩn danh”)" />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomInput label="Số tiền (đồng) *" inputMode="numeric" value={amount ? toAmount(amount).toLocaleString("vi-VN") : ""} onChange={(e) => setAmount(e.target.value)} placeholder="500.000" rightSuffix="đ" />
        <CustomDatePicker label="Ngày ủng hộ" format="YYYY-MM-DD" value={donatedOn} onChange={(d) => d && setDonatedOn(d)} required />
      </div>
      <CustomSelect<DonationMethod> label="Hình thức" value={method} onChange={setMethod} options={METHODS} />

      <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 space-y-3">
        <p className="text-xs font-extrabold text-gray-700">Đã nhận tiền chưa?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([[true, "Đã nhận tiền", "Vào sổ quỹ ngay"], [false, "Ghi nhận trước, chưa nhận tiền", "Ghi lại trước, bấm “Đã nhận tiền” khi tiền về"]] as const).map(([v, t, d]) => (
            <button key={String(v)} type="button" onClick={() => setReceived(v)} className={cn("text-left rounded-xl border px-3 py-2.5 transition", received === v ? "border-primary bg-purple-50" : "border-gray-200 bg-white hover:bg-gray-50")}>
              <p className="text-xs font-bold text-gray-900">{t}</p>
              <p className="text-[11px] text-gray-500">{d}</p>
            </button>
          ))}
        </div>
        {received && (
          <>
            <FundSelect label="Túi quỹ nhận tiền" value={fundId} onChange={setFundId} funds={funds} placeholder="Chọn túi quỹ…" />
            <CustomInput label={method === "bank_transfer" ? "Mã giao dịch ngân hàng *" : "Mã giao dịch (tùy chọn)"} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Mã tham chiếu trong sao kê" />
          </>
        )}
      </div>
      <CustomTextarea label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Mục đích, lời nhắn của người ủng hộ…" />
    </Shell>
  );
}

/** Thành viên tự báo khoản mình đã ủng hộ. */
function ReportDialog({ onClose }: { onClose: () => void }) {
  const { showToast } = useApp();
  const [amount, setAmount] = useState("");
  const [donatedOn, setDonatedOn] = useState(vnToday());
  const [method, setMethod] = useState<DonationMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVnd = toAmount(amount);
    if (!(amountVnd >= 1)) return showToast("error", "Hãy nhập số tiền bạn đã ủng hộ.");
    setBusy(true);
    try {
      await donationsApi.report({ amountVnd, donatedOn, method, referenceCode: reference.trim() || null, note: note.trim() || null });
      showToast("success", "Đã gửi — Thủ quỹ sẽ xác nhận khi nhận được. Cảm ơn bạn!");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Tôi đã ủng hộ quỹ" subtitle="Báo cho Thủ quỹ biết để đối chiếu và ghi nhận." onClose={onClose} busy={busy} onSubmit={submit} submitLabel="Gửi báo cáo">
      <CustomInput label="Số tiền (đồng) *" inputMode="numeric" value={amount ? toAmount(amount).toLocaleString("vi-VN") : ""} onChange={(e) => setAmount(e.target.value)} placeholder="200.000" rightSuffix="đ" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomDatePicker label="Ngày ủng hộ" format="YYYY-MM-DD" value={donatedOn} onChange={(d) => d && setDonatedOn(d)} required />
        <CustomSelect<DonationMethod> label="Hình thức" value={method} onChange={setMethod} options={METHODS} />
      </div>
      <CustomInput label="Mã giao dịch / nội dung chuyển khoản (tùy chọn)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
      <CustomTextarea label="Lời nhắn (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
    </Shell>
  );
}

/** Xác nhận đã nhận tiền ⇒ chọn túi quỹ, ghi sổ. */
function ConfirmDialog({ item, onClose }: { item: DonationDto; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions();
  const funds = options?.funds ?? [];
  const [fundId, setFundId] = useState(item.fundId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!fundId && funds.length) setFundId((funds.find((f) => f.type === (item.method === "cash" ? "cash" : "bank")) ?? funds[0]).id);
  }, [funds, fundId, item.method]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundId) return showToast("error", "Chọn túi quỹ nhận tiền.");
    setBusy(true);
    try {
      await donationsApi.act(item.id, "confirm", { fundId, note: note.trim() || null });
      showToast("success", "Đã nhận và ghi vào sổ quỹ.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Xác nhận đã nhận tiền" subtitle={`${item.donorName} — ${formatVND(item.amountVnd)} (${dmy(item.donatedOn)})`} onClose={onClose} busy={busy} onSubmit={submit} submitLabel="Ghi vào quỹ">
      <FundSelect label="Túi quỹ nhận tiền" value={fundId} onChange={setFundId} funds={funds} placeholder="Chọn túi quỹ…" />
      <CustomTextarea label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
      <p className="text-[11px] text-gray-500">Khoản này sẽ được ghi vào sổ quỹ với ngày ủng hộ {dmy(item.donatedOn)} và không sửa/xóa được — nếu sai phải dùng bút toán đảo.</p>
    </Shell>
  );
}

function RejectDialog({ item, onClose }: { item: DonationDto; onClose: () => void }) {
  const { showToast } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 5) return showToast("error", "Hãy ghi lý do (tối thiểu 5 ký tự).");
    setBusy(true);
    try {
      await donationsApi.act(item.id, "reject", { note: note.trim() });
      showToast("success", "Đã báo lại cho thành viên.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Chưa nhận được tiền" subtitle={`${item.donorName} — ${formatVND(item.amountVnd)}`} onClose={onClose} busy={busy} onSubmit={submit} submitLabel="Gửi lại thành viên">
      <CustomTextarea label="Lý do (thành viên sẽ thấy)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="VD: Chưa thấy khoản này trong sao kê, bạn kiểm tra lại giúp nhé." />
    </Shell>
  );
}
