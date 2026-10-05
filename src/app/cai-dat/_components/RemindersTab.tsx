"use client";

// Lịch nhắc lặp hằng tuần (vd. "Họp nhà tối thứ 4 21:00"): hệ thống nhắc trong ứng dụng và/hoặc nhóm Zalo vào đúng ngày.
// Vercel gói miễn phí chỉ chạy tác vụ hằng ngày nên nhắc vào 7:00 sáng hoặc 19:00 tối CÙNG NGÀY (giờ họp ghi trong nội dung).
import React, { useState } from "react";
import { BellRing, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { refreshReminders, remindersApi, useReminders } from "@/lib/data/reminders";
import { SLOT_LABEL, WEEKDAY_SHORT, type ReminderDto, type ReminderSlot } from "@/lib/types/reminders";
import { CustomInput, CustomSelect, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";
import { ListSkeleton } from "./TabSkeletons";
import { cn } from "@/lib/utils";

function Editor({ open, onClose, item }: { open: boolean; onClose: () => void; item: ReminderDto | null }) {
  const { showToast } = useApp();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [slot, setSlot] = useState<ReminderSlot>("morning");
  const [timeLabel, setTimeLabel] = useState("");
  const [sendApp, setSendApp] = useState(true);
  const [sendZalo, setSendZalo] = useState(true);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setMessage(item?.message ?? "");
    setDays(item?.weekdays ?? []);
    setSlot(item?.slot ?? "morning");
    setTimeLabel(item?.timeLabel ?? "");
    setSendApp(item?.sendApp ?? true);
    setSendZalo(item?.sendZalo ?? true);
    setActive(item?.isActive ?? true);
    setError(null);
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = () => {
    setTitle("Họp nhà");
    setDays([3]);
    setSlot("morning");
    setTimeLabel("21:00 tối");
    setMessage("Anh em có mặt đầy đủ tại phòng sinh hoạt chung nhé.");
  };

  const save = async () => {
    setError(null);
    if (title.trim().length < 2) return setError("Nhập tên lịch nhắc.");
    if (!days.length) return setError("Chọn ít nhất một ngày trong tuần.");
    if (!sendApp && !sendZalo) return setError("Chọn ít nhất một kênh nhắc.");
    setBusy(true);
    try {
      const body = { title: title.trim(), message: message.trim() || null, weekdays: days, slot, timeLabel: timeLabel.trim() || null, sendApp, sendZalo, isActive: active };
      if (item) await remindersApi.update(item.id, body);
      else await remindersApi.create(body);
      await refreshReminders();
      showToast("success", item ? "Đã cập nhật lịch nhắc." : "Đã tạo lịch nhắc.");
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
      icon={<CalendarClock className="w-5 h-5" />}
      title={item ? "Sửa lịch nhắc" : "Thêm lịch nhắc lặp"}
      subtitle="Nhắc đúng những ngày trong tuần bạn chọn"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy} onClick={save} className={btnPrimary}>
            {busy ? "Đang lưu..." : "Lưu lịch nhắc"}
          </button>
        </>
      }
    >
      {!item && (
        <button type="button" onClick={preset} className="text-[11px] font-bold text-primary hover:underline self-start">
          ✨ Điền mẫu “Họp nhà tối thứ 4”
        </button>
      )}
      <CustomInput label="Tên lịch nhắc *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Họp nhà" maxLength={150} />
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Lặp vào các ngày *</label>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()))}
              className={cn("w-10 h-10 rounded-xl text-xs font-extrabold border transition", days.includes(d) ? "bg-primary text-white border-transparent shadow-xs" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300")}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect<ReminderSlot> label="Gửi nhắc lúc" value={slot} onChange={setSlot} options={(Object.keys(SLOT_LABEL) as ReminderSlot[]).map((k) => ({ value: k, label: SLOT_LABEL[k] }))} />
        <CustomInput label="Giờ diễn ra (ghi trong tin)" value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="Ví dụ: 21:00 tối" maxLength={30} />
      </div>
      <CustomTextarea label="Nội dung thêm (tùy chọn)" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Địa điểm, nội dung cần chuẩn bị…" />
      <div className="p-3 rounded-2xl bg-surface-container-low/70 border border-purple-50 space-y-1">
        <CustomToggle checked={sendApp} onChange={setSendApp} label="Thông báo trong ứng dụng" description="Mỗi thành viên nhận một thông báo" />
        <CustomToggle checked={sendZalo} onChange={setSendZalo} label="Đăng vào nhóm Zalo" description="Cần bật loại tin “Lịch nhắc lặp” ở tab Tích hợp Zalo" />
        <CustomToggle checked={active} onChange={setActive} label="Đang hoạt động" description="Tắt để tạm dừng mà không xóa" />
      </div>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

export default function RemindersTab() {
  const { showToast } = useApp();
  const { reminders, canManage, loaded, error } = useReminders();
  const [editing, setEditing] = useState<ReminderDto | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReminderDto | null>(null);

  if (!loaded && !error) return <ListSkeleton rows={3} />;
  if (error && !loaded) return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được lịch nhắc: {errorMessage(error)}</div>;
  if (!canManage) return <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">Chỉ Trưởng nhà hoặc Admin mới quản lý được lịch nhắc.</div>;

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Lịch nhắc lặp hằng tuần</h2>
              <p className="text-xs text-gray-500">Ví dụ: họp nhà tối thứ 4, sinh hoạt chung cuối tuần. Hệ thống nhắc trong ứng dụng và/hoặc nhóm Zalo.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition self-start"
          >
            <Plus className="w-4 h-4" /> Thêm lịch nhắc
          </button>
        </div>
        <p className="text-[11px] text-gray-500 p-3 rounded-xl bg-surface-container-low/70">
          Hệ thống gửi nhắc vào <b>7:00 sáng</b> hoặc <b>19:00 tối</b> của ngày bạn chọn (tác vụ chạy một lần mỗi buổi). Giờ họp thực tế bạn ghi trong ô “Giờ diễn ra” để hiện trong tin.
        </p>

        {reminders.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-400">Chưa có lịch nhắc nào.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {reminders.map((r) => (
              <div key={r.id} className={cn("p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3", r.isActive ? "border-purple-100 bg-white" : "border-dashed border-gray-300 bg-gray-50/60 opacity-75")}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold text-gray-900 truncate">
                    {r.title}
                    {!r.isActive && <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">Tạm dừng</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <span key={d} className={cn("w-7 h-7 rounded-lg text-[10px] font-extrabold flex items-center justify-center", r.weekdays.includes(d) ? "bg-primary text-white" : "bg-gray-100 text-gray-400")}>
                        {WEEKDAY_SHORT[d]}
                      </span>
                    ))}
                    <span className="text-[11px] text-gray-500 ml-1">
                      {r.timeLabel ? `${r.timeLabel} · ` : ""}nhắc {r.slot === "morning" ? "7:00 sáng" : "19:00 tối"}
                    </span>
                  </div>
                  {r.message && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{r.message}</p>}
                  <div className="flex gap-1.5 mt-1.5">
                    {r.sendApp && <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold">Trong ứng dụng</span>}
                    {r.sendZalo && <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-bold">Nhóm Zalo</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                    className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50"
                    aria-label="Sửa"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleting(r)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Xóa">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Editor open={open} onClose={() => setOpen(false)} item={editing} />
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const r = deleting;
          if (!r) return;
          try {
            await remindersApi.remove(r.id);
            await refreshReminders();
            showToast("success", "Đã xóa lịch nhắc.");
          } catch (e) {
            showToast("error", errorMessage(e));
          }
        }}
        title="Xóa lịch nhắc?"
        message={<>Lịch <b>{deleting?.title}</b> sẽ bị xóa. Muốn tạm dừng thì sửa và tắt “Đang hoạt động”.</>}
        confirmText="Xóa"
      />
    </div>
  );
}
