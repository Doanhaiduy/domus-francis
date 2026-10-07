"use client";

import React, { useState } from "react";
import { X, Calendar, Lock } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import {
  CustomInput,
  CustomSelect,
  CustomDatePicker,
  CustomTimePicker,
  CustomTextarea,
  CustomToggle,
} from "@/components/ui/FormControls";
import { DEFAULT_DURATION_MIN, isoToDmy, resolveEventTimes, vnTodayIso } from "@/lib/events-format";
import { eventsApi, refreshEvents, useEventCategories } from "@/lib/data/events";

const ICONS: Record<string, string> = { EVT_MEET: "👥", EVT_MASS: "✝", EVT_PATRON: "🎉", EVT_TRIP: "🏖️", EVT_SOCIAL: "🤝", EVT_CLEAN: "🧹" };

/** Modal toàn cục "Thêm sự kiện" (mở từ thanh lệnh nhanh) — ghi thẳng vào DB như form trên trang Lịch & Sự kiện. */
export default function AddEventModal() {
  const { closeModal, showToast } = useApp();
  const { can, session } = useSession();
  const categories = useEventCategories();
  const allowed = can("event.manage");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(() => isoToDmy(vnTodayIso()));
  const [eventTime, setEventTime] = useState("19:30 tối");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("Sảnh chung T1");
  const [eventCategory, setEventCategory] = useState<string>("EVT_MEET");
  const [eventOrganizer, setEventOrganizer] = useState(() =>
    session?.member ? `${session.member.fullName}${session.roleLabel ? ` (${session.roleLabel})` : ""}` : ""
  );
  const [eventDesc, setEventDesc] = useState("");
  const [hasCheckIn, setHasCheckIn] = useState(true);
  const [notifyAll, setNotifyAll] = useState(true);
  const [notifyZalo, setNotifyZalo] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowed) return;
    if (eventTitle.trim().length < 3) {
      showToast("error", "Vui lòng nhập tên sự kiện (tối thiểu 3 ký tự)!");
      return;
    }
    const t = resolveEventTimes({ date: eventDate, time: eventTime, endTime: eventEndTime, categoryCode: eventCategory });
    if (!t.ok) {
      showToast("error", t.error);
      return;
    }
    setSaving(true);
    try {
      const ev = await eventsApi.create({
        title: eventTitle.trim(),
        date: eventDate,
        time: eventTime,
        endTime: eventEndTime.trim() || null,
        categoryCode: eventCategory,
        location: eventLocation.trim() || null,
        organizerText: eventOrganizer.trim() || null,
        organizerIds: session?.member ? [session.member.id] : [],
        description: eventDesc.trim() || null,
        hasCheckIn,
        notifyApp: notifyAll,
        notifyZalo,
      });
      await refreshEvents();
      showToast("success", `Đã thêm sự kiện "${ev.title}" ngày ${ev.date}.`);
      closeModal();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Thêm Sự Kiện Sinh Hoạt</h3>
            <p className="text-xs text-gray-500">Lên lịch hoạt động, thánh lễ hoặc họp nhà cho cộng đoàn</p>
          </div>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!allowed ? (
        <div className="p-6 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-gray-800">Bạn chưa có quyền tạo sự kiện</p>
          <p className="text-xs text-gray-500">Chỉ người có quyền quản lý sự kiện (Trưởng nhà, Admin hoặc vai trò được cấp quyền) mới lên lịch sự kiện chung.</p>
          <button onClick={closeModal} className="mt-2 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Đóng
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <CustomInput
              label="Tên sự kiện / Hoạt động *"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Ví dụ: Họp nhà tháng 10, Thánh lễ quan thầy, Dã ngoại..."
            />

            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Ngày diễn ra" required value={eventDate} onChange={setEventDate} placeholder="Chọn ngày..." />
              <CustomTimePicker label="Giờ bắt đầu" required value={eventTime} onChange={setEventTime} placeholder="Chọn giờ..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CustomSelect
                label="Phân loại sự kiện"
                value={eventCategory}
                onChange={setEventCategory}
                options={(categories.length ? categories : [{ code: "EVT_MEET", label: "Họp nhà", name: "Họp nhà" }]).map((c) => ({
                  value: c.code,
                  label: c.label,
                  icon: ICONS[c.code],
                }))}
              />
              <CustomTimePicker
                label="Giờ kết thúc"
                value={eventEndTime}
                onChange={setEventEndTime}
                placeholder={`Mặc định ${DEFAULT_DURATION_MIN[eventCategory] ?? 90} phút`}
              />
            </div>

            <CustomInput
              label="Địa điểm *"
              required
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              placeholder="Nguyện đường T3..."
            />

            <CustomInput
              label="Người / Ban tổ chức"
              value={eventOrganizer}
              onChange={(e) => setEventOrganizer(e.target.value)}
              placeholder="Ban Phụng vụ, Trưởng nhà..."
            />

            <CustomTextarea
              label="Mô tả chi tiết"
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              rows={2}
              placeholder="Kế hoạch, chuẩn bị cần thiết..."
            />

            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-100">
              <CustomToggle
                label="Kích hoạt Điểm danh (Check-in)"
                description="Anh em chụp ảnh tại sự kiện gửi lại để điểm danh"
                checked={hasCheckIn}
                onChange={setHasCheckIn}
              />
            </div>

            <div className="p-3 bg-sky-50/60 rounded-2xl border border-sky-100 space-y-1">
              <CustomToggle label="Báo cả nhà trong ứng dụng" description="Mỗi thành viên nhận một thông báo về sự kiện này" checked={notifyAll} onChange={setNotifyAll} />
              <CustomToggle label="Đăng vào nhóm Zalo" description="Cần bật ở Cài đặt → Tích hợp Zalo" checked={notifyZalo} onChange={setNotifyZalo} />
            </div>
          </div>

          <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
            <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Thêm sự kiện"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
