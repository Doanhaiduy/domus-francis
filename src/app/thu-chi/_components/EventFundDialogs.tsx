"use client";

// Các hộp thoại của tab "Quỹ riêng": lập quỹ, danh sách tham gia, ghi thu, đóng quỹ, bù từ quỹ nhà, đổi người phụ trách.
import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, HandCoins, Landmark, Plus, Trash2, UserPlus, Users, Wallet, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage, swrFetcher } from "@/lib/api";
import { cn, formatVND } from "@/lib/utils";
import { vnToday } from "@/lib/vn-time";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea, CustomTimeInput } from "@/components/ui/FormControls";
import { eventsApi } from "@/lib/data/events";
import { newRequestId } from "@/lib/data/finance";
import { eventFundsApi, type ParticipantPayload } from "@/lib/data/event-funds";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/types/finance";
import type { EventFundParticipant, EventFundSummary } from "@/lib/types/event-funds";
import type { EventsMonthDto } from "@/lib/types/events";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "./dialogs";

const toAmount = (s: string) => Number(s.replace(/[^\d]/g, ""));
const fmtInput = (s: string) => (s ? toAmount(s).toLocaleString("vi-VN") : "");
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const METHODS = (["cash", "bank_transfer", "e_wallet", "other"] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));

/** Chọn nhiều thành viên đang ở (có ô tìm không dấu). `exclude` = id đã có trong danh sách (ẩn đi). */
export function MemberPicker({ selected, onChange, exclude = [], max, label, hint }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; max?: number; label: string; hint?: string }) {
  const { members } = useApp();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = fold(q.trim());
    return members
      .filter((m) => (m.status === "active" || m.status === "on_leave") && !exclude.includes(m.id))
      .filter((m) => !k || fold(m.fullName).includes(k) || fold(m.room ?? "").includes(k));
  }, [members, q, exclude]);
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (!max || selected.length < max) onChange([...selected, id]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-700">{label}</span>
        <span className="text-[11px] font-semibold text-primary">Đã chọn {selected.length}{max ? `/${max}` : ""}</span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm theo tên hoặc phòng…"
        aria-label="Tìm thành viên"
        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium focus:outline-none focus:border-primary"
      />
      <ul className="max-h-48 overflow-y-auto custom-scroll rounded-xl border border-gray-100 divide-y-0 space-y-0.5 p-1 bg-gray-50/50">
        {list.map((m) => {
          const on = selected.includes(m.id);
          return (
            <li key={m.id}>
              <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} className={cn("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition", on ? "bg-purple-100 text-primary" : "hover:bg-white text-gray-700")}>
                <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-white" : "border-gray-300 bg-white")}>{on && <Check className="w-3 h-3" />}</span>
                <span className="font-semibold truncate">{m.fullName}</span>
                {m.room && <span className="ml-auto text-[10px] text-gray-400 shrink-0">P.{m.room}</span>}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-3 text-center text-[11px] text-gray-400">Không có thành viên phù hợp.</li>}
      </ul>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

interface GuestDraft {
  key: number;
  name: string;
  phone: string;
}
let guestKey = 0;
const newGuest = (): GuestDraft => ({ key: ++guestKey, name: "", phone: "" });

/** Danh sách người ngoài lưu xá (tên + SĐT tùy chọn). */
export function GuestEditor({ guests, onChange }: { guests: GuestDraft[]; onChange: (g: GuestDraft[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-700">Người ngoài lưu xá</span>
        <button type="button" onClick={() => onChange([...guests, newGuest()])} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
          <UserPlus className="w-3.5 h-3.5" /> Thêm người
        </button>
      </div>
      {guests.length === 0 && <p className="text-[11px] text-gray-500">Giáo dân, khách mời, bạn bè… tham gia cùng. Chỉ cần tên; số điện thoại để người phụ trách liên lạc (không bắt buộc, chỉ người phụ trách và người quản lý thấy).</p>}
      {guests.map((g, i) => (
        <div key={g.key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_9.5rem_auto] gap-2 items-start">
          <CustomInput label={i === 0 ? "Họ tên" : undefined} value={g.name} onChange={(e) => onChange(guests.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)))} maxLength={120} placeholder="VD: Chị Lan" />
          <div className="col-span-2 sm:col-span-1 order-3 sm:order-none">
            <CustomInput label={i === 0 ? "Số điện thoại" : undefined} inputMode="tel" value={g.phone} onChange={(e) => onChange(guests.map((x) => (x.key === g.key ? { ...x, phone: e.target.value } : x)))} maxLength={20} placeholder="09…" />
          </div>
          <button type="button" aria-label="Bỏ người này" onClick={() => onChange(guests.filter((x) => x.key !== g.key))} className={cn("p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50", i === 0 && "sm:mt-[1.4rem]")}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Lập quỹ riêng
// ---------------------------------------------------------------------
export function CreateFundDialog({ open, onClose, usedEventIds, onCreated }: { open: boolean; onClose: () => void; usedEventIds: string[]; onCreated: (fundId: string) => void }) {
  const { showToast } = useApp();
  const { can } = useSession();
  const today = vnToday();
  const from = vnToday(-30);
  const to = vnToday(89);
  const { data: evData, mutate: refetchEvents } = useSWR<EventsMonthDto>(open ? `/api/v1/events?from=${from}&to=${to}` : null, swrFetcher, { revalidateOnFocus: false });
  const events = useMemo(() => (evData?.events ?? []).filter((e) => !usedEventIds.includes(e.id) && e.status !== "cancelled"), [evData, usedEventIds]);
  const categories = evData?.categories ?? [];

  const [eventId, setEventId] = useState("");
  const [makeEvent, setMakeEvent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState(today);
  const [evTime, setEvTime] = useState("07:00");
  const [evCat, setEvCat] = useState("");
  const [name, setName] = useState("");
  const [managers, setManagers] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [guests, setGuests] = useState<GuestDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEventId("");
    setMakeEvent(false);
    setEvTitle("");
    setName("");
    setManagers([]);
    setDue("");
    setMembers([]);
    setGuests([]);
    setError(null);
  }, [open]);
  useEffect(() => {
    if (!evCat && categories.length) setEvCat((categories.find((c) => c.code === "EVT_PILGRIM") ?? categories[0]).code);
  }, [categories, evCat]);

  const chosen = events.find((e) => e.id === eventId);
  const pickEvent = (id: string) => {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    if (ev && !name.trim()) setName(`Quỹ ${ev.title}`);
  };
  const eventOptions = events.map((e) => ({ value: e.id, label: e.title, subLabel: `${e.date} · ${e.time}` }));
  const canMakeEvent = can("event.manage");

  const submit = async () => {
    setError(null);
    const dueVnd = toAmount(due);
    if (!makeEvent && !eventId) return setError("Chọn sự kiện của quỹ này (hoặc tạo sự kiện mới).");
    if (makeEvent && evTitle.trim().length < 3) return setError("Tên sự kiện tối thiểu 3 ký tự.");
    if (name.trim().length < 3) return setError("Tên quỹ tối thiểu 3 ký tự.");
    if (managers.length < 1) return setError("Chọn ít nhất một người phụ trách quỹ.");
    const badGuest = guests.find((g) => (g.name.trim() || g.phone.trim()) && g.name.trim().length < 2);
    if (badGuest) return setError("Mỗi người ngoài cần có họ tên (tối thiểu 2 ký tự).");
    setBusy(true);
    try {
      let evId = eventId;
      if (makeEvent) {
        const ev = await eventsApi.create({ title: evTitle.trim(), date: evDate, time: evTime, categoryCode: evCat || "EVT_OTHER" });
        evId = ev.id;
        void refetchEvents();
      }
      const participants: ParticipantPayload[] = [
        ...members.map((memberId) => ({ memberId })),
        ...guests.filter((g) => g.name.trim().length >= 2).map((g) => ({ guestName: g.name.trim(), guestPhone: g.phone.trim() || null })),
      ];
      const r = await eventFundsApi.create({ eventId: evId, name: name.trim(), managerIds: managers, defaultDueVnd: dueVnd, participants });
      showToast("success", `Đã lập quỹ “${r.name}”.`);
      onClose();
      onCreated(r.fundId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={() => !busy && onClose()}
      icon={<Wallet className="w-5 h-5" />}
      title="Lập quỹ riêng"
      subtitle="Quỹ tách hẳn khỏi quỹ nhà — dùng cho chuyến đi, sự kiện chung với người ngoài."
      maxWidth="max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Đang lập…" : "Lập quỹ"}</button>
        </>
      }
    >
      <div className="space-y-3">
        {!makeEvent ? (
          <>
            <CustomSelect label="Sự kiện *" value={eventId} onChange={pickEvent} options={eventOptions} placeholder={events.length ? "Chọn sự kiện trong Lịch…" : "Chưa có sự kiện nào chưa gắn quỹ"} />
            {chosen && <p className="text-[11px] text-gray-500">{chosen.date} · {chosen.time}{chosen.location ? ` · ${chosen.location}` : ""}</p>}
            {canMakeEvent && (
              <button type="button" onClick={() => setMakeEvent(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Chưa có trong Lịch? Tạo sự kiện mới</button>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3.5 space-y-3">
            <div className="flex items-center justify-between"><p className="text-xs font-extrabold text-gray-800">Sự kiện mới (sẽ vào Lịch sự kiện)</p><button type="button" onClick={() => setMakeEvent(false)} className="text-[11px] font-bold text-gray-500 hover:underline">Chọn sự kiện có sẵn</button></div>
            <CustomInput label="Tên sự kiện *" value={evTitle} onChange={(e) => { setEvTitle(e.target.value); if (!name.trim() || name === `Quỹ ${evTitle}`) setName(`Quỹ ${e.target.value}`); }} maxLength={200} placeholder="VD: Hành hương Núi Cúi" />
            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Ngày *" format="YYYY-MM-DD" value={evDate} onChange={(d) => d && setEvDate(d)} required />
              <CustomTimeInput label="Giờ bắt đầu" value={evTime} onChange={setEvTime} />
            </div>
            <CustomSelect label="Loại sự kiện" value={evCat} onChange={setEvCat} options={categories.map((c) => ({ value: c.code, label: c.label || c.name }))} />
          </div>
        )}

        <CustomInput label="Tên quỹ *" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="VD: Quỹ hành hương Núi Cúi" />
        <MemberPicker label="Người phụ trách quỹ *" selected={managers} onChange={setManagers} max={5} hint="Người phụ trách ghi thu, lập phiếu chi và ghi chi trong quỹ này. Phiếu chi vẫn cần Thủ quỹ hoặc Trưởng nhà duyệt." />
        <CustomInput label="Mức đóng chung mỗi người (đồng)" inputMode="numeric" value={fmtInput(due)} onChange={(e) => setDue(e.target.value)} placeholder="Để trống nếu chưa định" rightSuffix="đ" />
        <MemberPicker label="Thành viên tham gia" selected={members} onChange={setMembers} hint="Có thể thêm bớt và đặt mức riêng cho từng người sau khi lập quỹ." />
        <GuestEditor guests={guests} onChange={setGuests} />
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Danh sách tham gia: sửa mức đóng, gỡ, thêm thành viên / người ngoài
// ---------------------------------------------------------------------
export function ParticipantsDialog({ open, onClose, fundId, roster }: { open: boolean; onClose: () => void; fundId: string; roster: EventFundParticipant[] }) {
  const { showToast } = useApp();
  const active = roster.filter((p) => !p.removed);
  const [dues, setDues] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [guests, setGuests] = useState<GuestDraft[]>([]);
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDues(Object.fromEntries(active.map((p) => [p.id, String(p.dueVnd)])));
    setRemoved([]);
    setMembers([]);
    setGuests([]);
    setNewDue("");
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setError(null);
    const items: ParticipantPayload[] = [];
    for (const p of active) {
      if (removed.includes(p.id)) items.push({ id: p.id, remove: true });
      else if (toAmount(dues[p.id] ?? "") !== p.dueVnd) items.push({ id: p.id, dueVnd: toAmount(dues[p.id] ?? "") });
    }
    const due = newDue ? toAmount(newDue) : undefined;
    for (const memberId of members) items.push({ memberId, dueVnd: due });
    for (const g of guests) if (g.name.trim().length >= 2) items.push({ guestName: g.name.trim(), guestPhone: g.phone.trim() || null, dueVnd: due });
    if (guests.some((g) => (g.name.trim() || g.phone.trim()) && g.name.trim().length < 2)) return setError("Mỗi người ngoài cần có họ tên (tối thiểu 2 ký tự).");
    if (!items.length) return setError("Chưa có thay đổi nào để lưu.");
    setBusy(true);
    try {
      await eventFundsApi.setParticipants(fundId, items, due ?? 0);
      showToast("success", "Đã cập nhật danh sách tham gia.");
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
      onClose={() => !busy && onClose()}
      icon={<Users className="w-5 h-5" />}
      title="Danh sách tham gia"
      subtitle="Đặt mức phải đóng của từng người; thêm hoặc gỡ người tham gia."
      maxWidth="max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </>
      }
    >
      <div className="space-y-3">
        {active.length === 0 && <p className="text-xs text-gray-500">Chưa có ai trong danh sách.</p>}
        <ul className="space-y-2">
          {active.map((p) => {
            const gone = removed.includes(p.id);
            return (
              <li key={p.id} className={cn("flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border p-2.5", gone ? "border-rose-200 bg-rose-50/50 opacity-70" : "border-gray-100 bg-white")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{p.name} {p.isGuest && <span className="ml-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Người ngoài</span>}</p>
                  <p className="text-[11px] text-gray-500">{p.paidVnd > 0 ? `Đã đóng ${formatVND(p.paidVnd)}` : "Chưa đóng"}{p.phone ? ` · ${p.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36"><CustomInput aria-label={`Mức phải đóng của ${p.name}`} inputMode="numeric" value={fmtInput(dues[p.id] ?? "")} onChange={(e) => setDues((d) => ({ ...d, [p.id]: e.target.value }))} rightSuffix="đ" disabled={gone} /></div>
                  <button type="button" disabled={p.paidVnd > 0} title={p.paidVnd > 0 ? "Đã đóng tiền — hủy phiếu thu trước khi gỡ" : gone ? "Giữ lại" : "Gỡ khỏi danh sách"} aria-label={gone ? "Giữ lại" : "Gỡ khỏi danh sách"} onClick={() => setRemoved((r) => (gone ? r.filter((x) => x !== p.id) : [...r, p.id]))} className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent">
                    {gone ? <X className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="pt-1 border-t border-gray-100 space-y-3">
          <CustomInput label="Mức phải đóng cho người mới thêm (đồng)" inputMode="numeric" value={fmtInput(newDue)} onChange={(e) => setNewDue(e.target.value)} placeholder="Để trống = chưa định mức" rightSuffix="đ" />
          <MemberPicker label="Thêm thành viên" selected={members} onChange={setMembers} exclude={active.filter((p) => p.memberId).map((p) => p.memberId!)} />
          <GuestEditor guests={guests} onChange={setGuests} />
        </div>
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Ghi thu
// ---------------------------------------------------------------------
const OTHER = "__other__";
export function ReceiptDialog({ open, onClose, fundId, fundName, roster, presetId }: { open: boolean; onClose: () => void; fundId: string; fundName: string; roster: EventFundParticipant[]; presetId?: string | null }) {
  const { showToast } = useApp();
  const active = roster.filter((p) => !p.removed);
  const [who, setWho] = useState(OTHER);
  const [payerName, setPayerName] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(vnToday());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);

  const pick = (id: string) => {
    setWho(id);
    const p = active.find((x) => x.id === id);
    if (p) setAmount(String(Math.max(0, p.dueVnd - p.paidVnd) || ""));
  };
  useEffect(() => {
    if (!open) return;
    setPayerName("");
    setAmount("");
    setPaidOn(vnToday());
    setMethod("cash");
    setReference("");
    setNote("");
    setError(null);
    setRequestId(newRequestId());
    const p = presetId ? active.find((x) => x.id === presetId) : null;
    setWho(p ? p.id : OTHER);
    if (p) setAmount(String(Math.max(0, p.dueVnd - p.paidVnd) || ""));
  }, [open, presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = [
    ...active.map((p) => ({ value: p.id, label: p.name, subLabel: p.dueVnd > 0 ? `${formatVND(p.paidVnd)} / ${formatVND(p.dueVnd)}` : p.paidVnd > 0 ? `Đã đóng ${formatVND(p.paidVnd)}` : "Chưa định mức" })),
    { value: OTHER, label: "Người khác (ngoài danh sách)…" },
  ];

  const submit = async () => {
    setError(null);
    const amountVnd = toAmount(amount);
    if (!(amountVnd >= 1)) return setError("Hãy nhập số tiền thu.");
    if (who === OTHER && payerName.trim().length < 2) return setError("Hãy nhập tên người đóng tiền.");
    setBusy(true);
    try {
      await eventFundsApi.receive(fundId, {
        participantId: who === OTHER ? null : who,
        payerName: who === OTHER ? payerName.trim() : null,
        amountVnd,
        method,
        paidOn,
        referenceCode: reference.trim() || null,
        note: note.trim() || null,
        clientRequestId: requestId,
      });
      showToast("success", `Đã ghi thu ${formatVND(amountVnd)} vào quỹ.`);
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
      onClose={() => !busy && onClose()}
      icon={<HandCoins className="w-5 h-5" />}
      title="Ghi thu vào quỹ"
      subtitle={fundName}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Đang ghi…" : "Ghi thu"}</button>
        </>
      }
    >
      <div className="space-y-3">
        <CustomSelect label="Người đóng *" value={who} onChange={pick} options={options} />
        {who === OTHER && <CustomInput label="Tên người đóng *" value={payerName} onChange={(e) => setPayerName(e.target.value)} maxLength={120} placeholder="VD: Cô Hoa (ủng hộ)" />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput label="Số tiền (đồng) *" inputMode="numeric" value={fmtInput(amount)} onChange={(e) => setAmount(e.target.value)} placeholder="500.000" rightSuffix="đ" />
          <CustomDatePicker label="Ngày thu" format="YYYY-MM-DD" value={paidOn} onChange={(d) => d && setPaidOn(d)} required />
        </div>
        <CustomSelect<PaymentMethod> label="Hình thức" value={method} onChange={setMethod} options={METHODS} />
        {method !== "cash" && <CustomInput label="Mã giao dịch (tùy chọn)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />}
        <CustomTextarea label="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
        <p className="text-[11px] text-gray-500">Khoản thu vào sổ quỹ ngay và không sửa được — nhập nhầm thì hủy phiếu thu (bút toán đảo) rồi ghi lại.</p>
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Đóng quỹ
// ---------------------------------------------------------------------
export function CloseFundDialog({ open, onClose, fundId, summary }: { open: boolean; onClose: () => void; fundId: string; summary: EventFundSummary }) {
  const { showToast } = useApp();
  const [mode, setMode] = useState<"refund" | "to_house">("refund");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setMode("refund");
    setNote("");
    setError(null);
  }, [open]);
  const bal = summary.balanceVnd;
  const blocked = summary.pendingVouchers > 0;
  const refundable = summary.receiptsVnd >= bal;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await eventFundsApi.close(fundId, { mode, note: note.trim() || null });
      showToast("success", r.mode === "none" ? "Đã đóng quỹ (không còn tiền dư)." : mode === "refund" ? `Đã đóng quỹ và hoàn lại ${formatVND(r.balanceVnd)}.` : `Đã đóng quỹ và chuyển ${formatVND(r.balanceVnd)} về quỹ nhà.`);
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
      onClose={() => !busy && onClose()}
      icon={<Landmark className="w-5 h-5" />}
      title="Đóng quỹ (quyết toán)"
      subtitle={summary.fund.name}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy || blocked} className={btnPrimary}>{busy ? "Đang xử lý…" : "Đóng quỹ"}</button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-purple-50/60 border border-purple-100 p-3.5 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[10px] font-bold text-gray-500 uppercase">Đã thu</p><p className="text-sm font-extrabold text-emerald-700">{formatVND(summary.receiptsVnd)}</p></div>
          <div><p className="text-[10px] font-bold text-gray-500 uppercase">Đã chi</p><p className="text-sm font-extrabold text-rose-600">{formatVND(summary.spentVnd)}</p></div>
          <div><p className="text-[10px] font-bold text-gray-500 uppercase">Còn lại</p><p className="text-sm font-extrabold text-primary">{formatVND(bal)}</p></div>
        </div>
        {blocked && <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">Còn {summary.pendingVouchers} phiếu chi đang chờ duyệt hoặc chưa ghi chi — hãy xử lý (duyệt, ghi chi hoặc hủy) trước khi đóng quỹ.</p>}
        {bal > 0 ? (
          <div className="grid gap-2">
            {([
              ["refund", "Hoàn lại cho người đã đóng", "Chia số dư theo tỷ lệ số tiền mỗi người đã đóng (phần lẻ dồn cho người đóng nhiều nhất). Mỗi người được báo trong ứng dụng.", refundable],
              ["to_house", "Chuyển phần dư về quỹ nhà", "Số dư được ghi vào quỹ nhà như một khoản thu (ghi rõ nguồn là phần dư của quỹ này).", true],
            ] as const).map(([k, t, d, enabled]) => (
              <button key={k} type="button" disabled={!enabled} onClick={() => setMode(k)} className={cn("text-left rounded-xl border px-3.5 py-3 transition disabled:opacity-50", mode === k ? "border-primary bg-purple-50" : "border-gray-200 bg-white hover:bg-gray-50")}>
                <p className="text-xs font-bold text-gray-900">{t}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{d}{!enabled ? " (không dùng được: quỹ có tiền bù từ quỹ nhà)" : ""}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Quỹ không còn tiền dư — đóng quỹ để chốt biên bản quyết toán.</p>
        )}
        <CustomTextarea label="Ghi chú quyết toán (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        <p className="text-[11px] text-gray-500">Sau khi đóng, quỹ không ghi thu/chi thêm được. Các bút toán đã ghi vẫn xem được trong sổ quỹ.</p>
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Bù từ quỹ nhà (Trưởng nhà)
// ---------------------------------------------------------------------
export function SubsidyDialog({ open, onClose, fundId, fundName }: { open: boolean; onClose: () => void; fundId: string; fundName: string }) {
  const { showToast } = useApp();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
    setError(null);
  }, [open]);
  const submit = async () => {
    setError(null);
    const amountVnd = toAmount(amount);
    if (!(amountVnd >= 1)) return setError("Hãy nhập số tiền bù.");
    if (reason.trim().length < 10) return setError("Hãy ghi rõ lý do bù (tối thiểu 10 ký tự).");
    setBusy(true);
    try {
      await eventFundsApi.subsidy(fundId, { amountVnd, reason: reason.trim() });
      showToast("success", `Đã bù ${formatVND(amountVnd)} từ quỹ nhà sang quỹ riêng.`);
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
      onClose={() => !busy && onClose()}
      icon={<Wallet className="w-5 h-5" />}
      title="Bù từ quỹ nhà"
      subtitle={fundName}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Đang ghi…" : "Bù vào quỹ riêng"}</button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-600 leading-relaxed">Dùng khi quỹ riêng thiếu tiền (chi vượt thu). Số tiền được trừ khỏi quỹ nhà và cộng vào quỹ riêng; cả hai đều ghi sổ kèm lý do. Nếu quỹ riêng còn dư lúc đóng quỹ, chỉ chuyển về quỹ nhà được (không hoàn lại cho người đóng).</p>
        <CustomInput label="Số tiền bù (đồng) *" inputMode="numeric" value={fmtInput(amount)} onChange={(e) => setAmount(e.target.value)} placeholder="500.000" rightSuffix="đ" />
        <CustomTextarea label="Lý do *" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="VD: Bù tiền thuê xe còn thiếu vì ba người báo hủy sát ngày" />
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Đổi người phụ trách
// ---------------------------------------------------------------------
export function ManagersDialog({ open, onClose, fundId, current }: { open: boolean; onClose: () => void; fundId: string; current: string[] }) {
  const { showToast } = useApp();
  const [ids, setIds] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setIds(current);
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setError(null);
    if (ids.length < 1) return setError("Chọn ít nhất một người phụ trách.");
    setBusy(true);
    try {
      await eventFundsApi.setManagers(fundId, ids);
      showToast("success", "Đã cập nhật người phụ trách quỹ.");
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
      onClose={() => !busy && onClose()}
      icon={<Users className="w-5 h-5" />}
      title="Người phụ trách quỹ"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>Hủy</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{busy ? "Đang lưu…" : "Lưu"}</button>
        </>
      }
    >
      <div className="space-y-3">
        <MemberPicker label="Chọn 1–5 người phụ trách" selected={ids} onChange={setIds} max={5} />
        <ErrorBox error={error} />
      </div>
    </DialogShell>
  );
}

