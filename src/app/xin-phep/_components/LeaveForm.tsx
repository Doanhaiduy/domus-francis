"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Save, Send, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { leaveApi } from "@/lib/data/leave";
import { useMembers } from "@/lib/data/members";
import { fromVnParts, halfHourOptions, toVnParts, vnToday } from "@/lib/vn-time";
import {
  LEAVE_KIND_GROUPS,
  LEAVE_KIND_HINT,
  LEAVE_KIND_LABEL,
  isDoorKind,
  isLongKind,
  leaveNeedsPlace,
  type LeaveEventOption,
  type LeaveKind,
  type LeaveRequestDto,
} from "@/lib/types/leave";

const TIMES = halfHourOptions(0, 23);

// Mốc gợi ý theo loại đơn (giờ VN): [bắt đầu ngày+, giờ, kết thúc ngày+, giờ]
const DEFAULTS: Record<Exclude<LeaveKind, "event_absence">, [number, string, number, string]> = {
  late_return: [0, "18:00", 0, "23:30"],
  overnight_out: [0, "18:00", 1, "07:00"],
  long_leave: [1, "07:00", 3, "18:00"],
  home_visit: [1, "07:00", 3, "18:00"],
  tet_break: [3, "07:00", 12, "18:00"],
  summer_break: [7, "07:00", 60, "18:00"],
  holiday_break: [1, "07:00", 4, "18:00"],
  other: [0, "07:00", 1, "18:00"],
};

const PLACE_LABEL: Partial<Record<LeaveKind, { label: string; hint: string }>> = {
  home_visit: { label: "Quê ở đâu / nơi đến *", hint: "VD: Về quê Phú Yên" },
  tet_break: { label: "Nơi ở trong dịp Tết *", hint: "VD: Về quê ở Quảng Ngãi" },
  summer_break: { label: "Nơi ở trong kỳ nghỉ hè *", hint: "VD: Về quê Bình Định" },
  holiday_break: { label: "Nơi ở trong dịp nghỉ lễ *", hint: "VD: Nhà bà con ở Nha Trang" },
  overnight_out: { label: "Nơi đến *", hint: "VD: Nhà bà con ở Nha Trang" },
  long_leave: { label: "Nơi đến *", hint: "VD: Thực tập tại Đà Nẵng" },
};

const fmtEvent = (e: LeaveEventOption) =>
  `${e.title} — ${new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(e.startsAt))}`;

/** Hộp thoại gửi đơn xin phép — hoặc sửa một đơn có sẵn (`item`: chính chủ khi còn chờ duyệt, Admin bất kỳ lúc nào). */
export function LeaveForm({ events, item, onClose }: { events: LeaveEventOption[]; item?: LeaveRequestDto | null; onClose: () => void }) {
  const { showToast } = useApp();
  const { session } = useSession();
  const { members } = useMembers();
  const editing = !!item;

  // Sửa đơn vắng sự kiện: sự kiện cũ có thể đã qua nên không còn trong danh sách ⇒ thêm lại để chọn được
  const eventOptions = useMemo(() => {
    if (item?.eventId && !events.some((e) => e.id === item.eventId)) {
      return [{ id: item.eventId, title: item.eventTitle ?? "Sự kiện", startsAt: item.startsAt, endsAt: item.endsAt }, ...events];
    }
    return events;
  }, [events, item]);

  const [kind, setKind] = useState<LeaveKind>(item?.kind ?? (events.length ? "event_absence" : "late_return"));
  const [eventId, setEventId] = useState(item?.eventId ?? events[0]?.id ?? "");
  const [from, setFrom] = useState(item ? toVnParts(item.startsAt) : { date: vnToday(), time: "18:00" });
  const [to, setTo] = useState(item ? toVnParts(item.endsAt) : { date: vnToday(), time: "23:30" });
  const [reason, setReason] = useState(item?.reason ?? "");
  const [destination, setDestination] = useState(item?.destination ?? "");
  const [phone, setPhone] = useState(item?.contactPhone ?? "");
  const [doorId, setDoorId] = useState(item?.doorMemberId ?? "");
  // Báo cả nhà (nhóm Zalo + thông báo trong ứng dụng): mặc định bật với đơn về muộn / ngủ ngoài
  const [notify, setNotify] = useState(isDoorKind(item?.kind ?? (events.length ? "event_absence" : "late_return")));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Đổi loại đơn ⇒ đặt lại mốc gợi ý (chỉ khi gửi đơn mới) và giá trị mặc định của ô "gửi thông báo"
  const pickKind = (k: LeaveKind) => {
    setKind(k);
    if (!editing) {
      if (k !== "event_absence") {
        const [d1, t1, d2, t2] = DEFAULTS[k];
        setFrom({ date: vnToday(d1), time: t1 });
        setTo({ date: vnToday(d2), time: t2 });
      }
      setNotify(isDoorKind(k));
    }
  };

  const kindOptions = useMemo(
    () =>
      LEAVE_KIND_GROUPS.flatMap((g) =>
        g.kinds
          .filter((k) => k !== "event_absence" || eventOptions.length > 0)
          .map((k) => ({ value: k, label: LEAVE_KIND_LABEL[k], subLabel: g.label }))
      ),
    [eventOptions.length]
  );

  const needsPlace = leaveNeedsPlace(kind);
  const needsDoor = isDoorKind(kind);
  const longKind = isLongKind(kind);
  const placeText = PLACE_LABEL[kind];
  // Người có thể được nhờ để cửa: anh em đang ở nhà, trừ người xin (chính mình, hoặc chủ đơn khi Admin sửa hộ)
  const ownerId = item && !item.isMine ? item.memberId : session?.member?.id;
  const doorOptions = useMemo(
    () => [
      { value: "", label: "— Không nhờ ai —" },
      ...members
        .filter((m) => (m.status === "active" || m.status === "on_leave") && m.id !== ownerId)
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((m) => ({ value: m.id, label: m.name, subLabel: m.room && m.room !== "Chưa xếp phòng" ? `P.${m.room}` : undefined })),
    ],
    [members, ownerId]
  );
  const ev = useMemo(() => eventOptions.find((e) => e.id === eventId), [eventOptions, eventId]);
  const startIso = kind === "event_absence" ? ev?.startsAt : fromVnParts(from.date, from.time);
  const endIso = kind === "event_absence" ? ev?.endsAt : fromVnParts(to.date, to.time);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "event_absence" && !ev) return showToast("error", "Hãy chọn sự kiện bạn xin vắng.");
    if (!startIso || !endIso || !(new Date(endIso) > new Date(startIso))) return showToast("error", "Thời điểm kết thúc phải sau thời điểm bắt đầu.");
    if (reason.trim().length < 5) return showToast("error", "Hãy ghi lý do (tối thiểu 5 ký tự).");
    if (needsPlace && !destination.trim()) return showToast("error", "Hãy cho biết nơi bạn đến.");
    setBusy(true);
    try {
      const body = {
        kind,
        eventId: kind === "event_absence" ? eventId : null,
        startsAt: startIso,
        endsAt: endIso,
        reason,
        destination: destination.trim() || null,
        contactPhone: phone.trim() || null,
        doorMemberId: needsDoor && doorId ? doorId : null,
      };
      if (item) {
        await leaveApi.update(item.id, body);
        showToast("success", "Đã lưu thay đổi của đơn.");
      } else {
        await leaveApi.create({ ...body, notify });
        showToast("success", notify ? "Đã gửi đơn và báo cả nhà — người quản lý sẽ xem và trả lời bạn." : "Đã gửi đơn — người quản lý sẽ xem và trả lời bạn.");
      }
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-0 sm:p-6 flex items-end sm:items-center justify-center animate-fadeIn">
        <form
          onSubmit={submit}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Sửa đơn xin phép" : "Gửi đơn xin phép"}
          className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92dvh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn"
        >
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-gray-900">{editing ? `Sửa đơn xin phép${item && !item.isMine ? ` của ${item.memberName}` : ""}` : "Gửi đơn xin phép"}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{LEAVE_KIND_HINT[kind]}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4 min-h-0">
            <CustomSelect<LeaveKind> label="Loại đơn" value={kind} onChange={pickKind} options={kindOptions} />

            {kind === "event_absence" ? (
              <CustomSelect label="Sự kiện xin vắng" value={eventId} onChange={setEventId} options={eventOptions.map((e) => ({ value: e.id, label: fmtEvent(e) }))} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <CustomDatePicker label={longKind ? "Ngày đi" : "Từ ngày"} format="YYYY-MM-DD" value={from.date} onChange={(d) => d && setFrom({ ...from, date: d })} required />
                  <CustomSelect aria-label="Từ giờ" value={from.time} onChange={(t) => setFrom({ ...from, time: t })} options={TIMES} />
                </div>
                <div className="space-y-2">
                  <CustomDatePicker label={longKind ? "Ngày dự kiến quay lại" : "Đến ngày"} format="YYYY-MM-DD" value={to.date} onChange={(d) => d && setTo({ ...to, date: d })} required />
                  <CustomSelect aria-label="Đến giờ" value={to.time} onChange={(t) => setTo({ ...to, time: t })} options={TIMES} />
                </div>
              </div>
            )}

            {kind !== "event_absence" && <p className="text-[11px] text-gray-500 -mt-2">{kind === "late_return" ? "“Đến giờ” là giờ dự kiến bạn về tới lưu xá." : "Giờ theo múi giờ Việt Nam."}</p>}

            <CustomTextarea label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="VD: Em có buổi thi cuối kỳ ở trường, thi xong lúc 21h." />
            {(needsPlace || kind === "late_return") && (
              <CustomInput
                label={needsPlace ? placeText?.label ?? "Nơi đến *" : "Bạn đang ở đâu? (tùy chọn)"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                maxLength={200}
                placeholder={needsPlace ? placeText?.hint ?? "VD: Nhà bà con ở Nha Trang" : "VD: Thư viện trường"}
              />
            )}
            {(needsPlace || longKind) && <CustomInput label="Số điện thoại liên lạc (tùy chọn)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="09xx xxx xxx" />}
            {needsDoor && <CustomSelect label="Nhờ ai để cửa giúp bạn? (tùy chọn)" value={doorId} onChange={setDoorId} options={doorOptions} placeholder="Chọn một anh em" />}

            {!editing && (
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3.5 space-y-2">
                <CustomToggle
                  label="Gửi thông báo cho cả nhà"
                  description="Đăng vào nhóm Zalo của nhà và báo trong ứng dụng cho mọi anh em"
                  checked={notify}
                  onChange={setNotify}
                />
                <div className="flex items-start gap-2 text-[11px] text-sky-900 leading-relaxed">
                  <MessageCircle className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" aria-hidden />
                  <span>
                    {notify ? (
                      <>
                        Khi gửi đơn, tin <b>{LEAVE_KIND_LABEL[kind].toLowerCase()}</b> sẽ được đăng vào <b>nhóm Zalo</b> và hiện trong <b>thông báo ứng dụng</b>
                        {needsDoor && doorId ? ", kèm tên người để cửa" : ""}.
                      </>
                    ) : (
                      <>Chỉ người quản lý nhận được đơn của bạn. Bật công tắc nếu muốn cả nhà biết (vd. để mọi người yên tâm khi bạn nghỉ dài ngày).</>
                    )}
                    {needsDoor && <> Nếu về trễ hơn dự kiến, bạn có thể bấm <b>“Xin thêm giờ”</b> ở đơn của mình.</>}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editing ? <Save className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} {editing ? "Lưu thay đổi" : "Gửi đơn"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
