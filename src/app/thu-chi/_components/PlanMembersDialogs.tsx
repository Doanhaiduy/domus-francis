"use client";

// Hộp thoại gói F:
//   • OneTimePlanModal — "Khoản thu một lần" cho NHỮNG NGƯỜI được chọn (phí sự kiện / hành hương, tiền cọc, khoản khác): mức chung + mức riêng
//     từng người (tùy chọn), hạn nộp. Sau khi lập: ghi thu hàng loạt, "Tôi đã đóng", nhắc quỹ chạy như khoản thường.
//   • SyncMembersDialog — "Cập nhật người phải đóng": kỳ quỹ định kỳ ⇒ thêm khoản cho người đang ở còn thiếu (người mới vào giữa kỳ);
//     khoản thu một lần ⇒ chọn thêm người. Xem trước danh sách trước khi ghi; bấm lại không sinh trùng.
import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Search, Sparkles, UserPlus, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy, vnToday } from "@/lib/finance-format";
import { useMembers } from "@/lib/data/members";
import { financeApi, refreshFinance, useFinanceOptions, usePlanMembersPreview } from "@/lib/data/finance";
import { FEE_TYPE_LABEL, type ContributionPlanDto, type OneTimeFeeType } from "@/lib/types/finance";
import { CustomDatePicker, CustomInput, CustomToggle } from "@/components/ui/FormControls";
import { FundSelect } from "@/components/finance/FundSelect";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "./dialogs";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const parseVnd = (s: string) => Number(s.replace(/\D/g, "")) || 0;
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const TYPES: { value: OneTimeFeeType; label: string; placeholder: string; hint: string }[] = [
  { value: "event_fee", label: "Phí sự kiện", placeholder: "Ví dụ: Phí hành hương Đức Mẹ Tà Pao", hint: "Hành hương, dã ngoại, tĩnh tâm… — chỉ người tham gia đóng." },
  { value: "deposit", label: "Tiền cọc", placeholder: "Ví dụ: Tiền cọc chìa khóa phòng", hint: "Khi hoàn cọc, lập phiếu chi “hoàn cọc” cho người đó." },
  { value: "other", label: "Khoản khác", placeholder: "Ví dụ: Góp mua quà mừng bổn mạng cha xứ", hint: "Khoản thu một lần khác cho những người được chọn." },
];

export interface PickMember {
  id: string;
  name: string;
  fullName: string;
  room: string | null;
  onLeave: boolean;
}

/** Thành viên đang ở / tạm vắng (để chọn người phải đóng). */
function usePickableMembers(enabled: boolean): { list: PickMember[]; isLoading: boolean } {
  const { members, isLoading } = useMembers({ enabled });
  const list = useMemo(
    () =>
      members
        .filter((m) => m.status === "active" || m.status === "on_leave")
        .map((m) => ({ id: m.id, name: m.name, fullName: m.fullName, room: m.room && m.room !== "Chưa xếp phòng" ? m.room : null, onLeave: m.status === "on_leave" }))
        .sort((a, b) => (a.room ?? "zzz").localeCompare(b.room ?? "zzz") || a.fullName.localeCompare(b.fullName)),
    [members]
  );
  return { list, isLoading };
}

/** Danh sách chọn người (tìm không dấu, chọn tất cả / bỏ chọn, mức riêng từng người). */
function MemberPicker({
  members,
  selected,
  onChange,
  exclude,
  amounts,
  onAmount,
  defaultAmount,
}: {
  members: PickMember[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Người đã có khoản (không chọn được) */
  exclude?: Set<string>;
  /** Có ⇒ hiện ô mức riêng cho người được chọn */
  amounts?: Record<string, string>;
  onAmount?: (id: string, v: string) => void;
  defaultAmount?: number;
}) {
  const [q, setQ] = useState("");
  const pool = members.filter((m) => !exclude?.has(m.id));
  const shown = q.trim() ? pool.filter((m) => fold(`${m.fullName} ${m.name} ${m.room ?? ""}`).includes(fold(q.trim()))) : pool;
  const allShownOn = shown.length > 0 && shown.every((m) => selected.has(m.id));
  const toggleAll = () => {
    const n = new Set(selected);
    if (allShownOn) shown.forEach((m) => n.delete(m.id));
    else shown.forEach((m) => n.add(m.id));
    onChange(n);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1">
          <CustomInput
            label={`Người phải đóng (${selected.size} người)`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, số phòng…"
            leftIcon={<Search className="w-3.5 h-3.5" />}
            data-no-dirty
          />
        </div>
        <button type="button" onClick={toggleAll} disabled={!shown.length} className="px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold disabled:opacity-50 whitespace-nowrap">
          {allShownOn ? "Bỏ chọn" : q.trim() ? "Chọn người đang lọc" : "Chọn tất cả"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 divide-y divide-gray-50">
        {shown.length === 0 && <p className="p-4 text-center text-xs text-gray-400">{pool.length ? "Không có ai phù hợp." : "Không còn ai để chọn."}</p>}
        {shown.map((m) => {
          const on = selected.has(m.id);
          return (
            <div key={m.id} className={`flex items-center gap-3 px-3 py-2 text-xs ${on ? "bg-purple-50/50" : ""}`}>
              <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const n = new Set(selected);
                    if (on) n.delete(m.id);
                    else n.add(m.id);
                    onChange(n);
                  }}
                  className="w-4 h-4 accent-[#5f3add] shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{m.fullName}</span>
                  <span className="text-[11px] text-gray-400">
                    {m.room ?? "Chưa xếp phòng"}
                    {m.onLeave ? " · tạm vắng" : ""}
                  </span>
                </span>
              </label>
              {amounts && on && onAmount && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={amounts[m.id] ?? ""}
                  onChange={(e) => onAmount(m.id, e.target.value.replace(/\D/g, "") ? parseVnd(e.target.value).toLocaleString("vi-VN") : "")}
                  placeholder={defaultAmount ? defaultAmount.toLocaleString("vi-VN") : "Mức chung"}
                  aria-label={`Mức riêng của ${m.fullName}`}
                  className="w-24 sm:w-28 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-right font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Khoản thu một lần
// ---------------------------------------------------------------------
export function OneTimePlanModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (planId: string) => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions(open);
  const { list, isLoading } = usePickableMembers(open);
  const [type, setType] = useState<OneTimeFeeType>("event_fee");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fundId, setFundId] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("event_fee");
    setName("");
    setAmount("");
    setDueDate(addDays(vnToday(), 7));
    setNote("");
    setSelected(new Set());
    setCustom(false);
    setAmounts({});
    setError(null);
  }, [open]);
  useEffect(() => {
    if (!open || !options) return;
    setFundId((f) => f || (options.funds.find((x) => x.type === "cash")?.id ?? options.funds[0]?.id ?? ""));
  }, [open, options]);

  const base = parseVnd(amount);
  const per = (id: string) => (custom && amounts[id] ? parseVnd(amounts[id]) : base);
  const total = [...selected].reduce((s, id) => s + per(id), 0);
  const meta = TYPES.find((t) => t.value === type)!;

  const save = async () => {
    if (name.trim().length < 3) return setError("Nhập tên khoản thu (tối thiểu 3 ký tự).");
    if (base <= 0) return setError("Nhập số tiền mỗi người.");
    if (!dueDate) return setError("Chọn hạn nộp.");
    if (!selected.size) return setError("Chọn ít nhất một người phải đóng.");
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.createPlan({
        kind: "onetime",
        feeType: type,
        name: name.trim(),
        amountVnd: base,
        dueDate,
        members: [...selected].map((id) => ({ memberId: id, amountVnd: custom && amounts[id] && parseVnd(amounts[id]) !== base ? parseVnd(amounts[id]) : null })),
        fundId: fundId || undefined,
        note: note.trim() || null,
      });
      await refreshFinance();
      showToast("success", `Đã lập “${r.name}”: ${r.generated} người, tổng ${formatVND(r.totalVnd ?? total)} — hạn ${dmy(r.dueDate)}.`);
      onCreated?.(r.id);
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
      maxWidth="max-w-xl"
      icon={<Sparkles className="w-5 h-5" />}
      title="Khoản thu một lần"
      subtitle="Thu cho những người được chọn — phí sự kiện, tiền cọc, khoản khác"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !selected.size || base <= 0} onClick={save} className={btnPrimary}>
            {busy ? "Đang lập..." : selected.size ? `Lập khoản thu · ${selected.size} người` : "Lập khoản thu"}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="inline-flex flex-wrap p-1 rounded-xl bg-gray-100 gap-1 self-start">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${type === t.value ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CustomInput label="Tên khoản thu *" value={name} onChange={(e) => setName(e.target.value)} placeholder={meta.placeholder} maxLength={120} hint={meta.hint} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput
            label="Số tiền mỗi người (VNĐ) *"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "") ? Math.min(100_000_000, parseVnd(e.target.value)).toLocaleString("vi-VN") : "")}
            placeholder="Ví dụ: 150.000"
            rightSuffix="đ"
          />
          <CustomDatePicker label="Hạn nộp *" value={dueDate} onChange={setDueDate} format="YYYY-MM-DD" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FundSelect label="Túi quỹ nhận" value={fundId} onChange={setFundId} funds={options?.funds ?? []} />
          <CustomInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Xe 16 chỗ, khởi hành 5h sáng" maxLength={500} />
        </div>
        {isLoading && !list.length ? (
          <p className="text-xs text-gray-400">Đang tải danh sách thành viên…</p>
        ) : (
          <MemberPicker members={list} selected={selected} onChange={setSelected} amounts={custom ? amounts : undefined} onAmount={(id, v) => setAmounts((a) => ({ ...a, [id]: v }))} defaultAmount={base} />
        )}
        <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
          <CustomToggle checked={custom} onChange={setCustom} label="Mức riêng cho từng người" description="Bật để nhập số tiền khác mức chung cho người được chọn (bỏ trống = mức chung)." />
        </div>
        {selected.size > 0 && base > 0 && (
          <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 text-xs text-purple-950 flex flex-wrap items-center justify-between gap-2">
            <span>
              {FEE_TYPE_LABEL[type]} · <b>{selected.size} người</b> · hạn {dmy(dueDate)}
            </span>
            <span className="font-extrabold text-primary text-sm tabular-nums">Tổng {formatVND(total)}</span>
          </div>
        )}
        <ErrorBox error={error} />
      </form>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Cập nhật người phải đóng / thêm người
// ---------------------------------------------------------------------
export function SyncMembersDialog({ plan, existingIds, onClose }: { plan: ContributionPlanDto | null; existingIds: string[]; onClose: () => void }) {
  const { showToast } = useApp();
  const isDues = !!plan && (plan.feeType === "periodic_dues" || plan.feeType === "monthly_dues");
  const open = !!plan;
  const { list } = usePickableMembers(open && !isDues);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [debounced, setDebounced] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSelected(new Set());
    setDebounced([]);
    setError(null);
  }, [plan?.id]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced([...selected].sort()), 300);
    return () => clearTimeout(t);
  }, [selected]);
  const exclude = useMemo(() => new Set(existingIds), [existingIds]);
  // Quỹ định kỳ: xem trước mọi người còn thiếu; khoản một lần: xem trước những người đang chọn
  const { preview, error: previewError, isLoading } = usePlanMembersPreview(open && (isDues || debounced.length > 0) ? plan!.id : null, isDues ? null : debounced);

  if (!plan) return null;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await financeApi.syncPlanMembers(plan.id, isDues ? null : [...selected]);
      await refreshFinance();
      showToast(r.added ? "success" : "info", r.added ? `Đã thêm ${r.added} người vào “${plan.name}” (tổng ${formatVND(r.totalVnd)}).` : "Không có ai cần thêm — danh sách đã đủ.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const count = preview?.members.length ?? 0;
  return (
    <DialogShell
      open
      onClose={onClose}
      icon={isDues ? <Users className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
      title={isDues ? "Cập nhật người phải đóng" : "Thêm người phải đóng"}
      subtitle={plan.name}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !count} onClick={go} className={btnPrimary}>
            {busy ? "Đang thêm..." : count ? `Thêm ${count} người` : "Không có ai cần thêm"}
          </button>
        </>
      }
    >
      {isDues ? (
        <p className="text-xs text-gray-600 leading-relaxed">
          Thêm khoản phải thu của kỳ này cho thành viên <b>đang ở</b> mà chưa có khoản — thường là người mới vào giữa kỳ. Mức theo định mức của từng người; khoản đã có không bị
          thay đổi. Người mới vào ở muộn: điều chỉnh mức hoặc miễn giảm ở “Chi tiết” của từng người nếu nhà thống nhất thu theo số tháng.
        </p>
      ) : (
        <MemberPicker members={list} selected={selected} onChange={setSelected} exclude={exclude} />
      )}
      {isLoading && <p className="text-xs text-gray-400">Đang kiểm tra…</p>}
      {preview && (isDues || debounced.length > 0) && (
        <div className="flex flex-col gap-2">
          {count === 0 ? (
            <p className="p-3 rounded-xl bg-emerald-50 text-xs text-emerald-800">{isDues ? "Mọi thành viên đang ở đã có khoản này. 🎉" : "Những người đã chọn đều đã có khoản này."}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <b className="text-gray-900">Sẽ thêm {count} người</b>
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <CalendarClock className="w-3.5 h-3.5" /> hạn nộp {dmy(preview.dueDate)}
                  {preview.dueDate !== plan.dueDate && " (hạn chung đã qua — cho thêm 14 ngày)"}
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {preview.members.map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block font-bold text-gray-900 truncate">{m.fullName}</span>
                      <span className="text-[11px] text-gray-400">{m.room ?? "Chưa xếp phòng"}</span>
                    </span>
                    <b className="tabular-nums text-gray-900 shrink-0">{formatVND(m.amountVnd)}</b>
                  </div>
                ))}
              </div>
              <div className="text-right text-xs text-gray-600">
                Tổng thêm <b className="text-primary tabular-nums">{formatVND(preview.totalVnd)}</b>
              </div>
            </>
          )}
        </div>
      )}
      <ErrorBox error={error ?? (previewError ? errorMessage(previewError) : null)} />
    </DialogShell>
  );
}
