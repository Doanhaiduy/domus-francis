"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck, Plus, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CustomInput,
  CustomSelect,
  CustomDatePicker,
  CustomTimePicker,
  CustomTextarea,
  CustomToggle,
} from "@/components/ui/FormControls";
import { DEFAULT_DURATION_MIN, hmToVn, isoToDmy, isoToVnHm, resolveEventTimes, vnTodayIso } from "@/lib/events-format";
import { eventsApi, refreshEvents } from "@/lib/data/events";
import type { EventCategoryDto, EventDto } from "@/lib/types/events";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: EventCategoryDto[];
  /** Sửa sự kiện có sẵn; không có ⇒ tạo mới */
  event?: EventDto | null;
  /** Ngày gợi ý khi tạo (YYYY-MM-DD) */
  presetDate?: string | null;
  onSaved?: (e: EventDto) => void;
}

export default function EventFormModal({ open, onClose, categories, event, presetDate, onSaved }: Props) {
  const { members, showToast } = useApp();
  const { session, can } = useSession();
  const isEdit = !!event;
  const canManage = can("event.manage");
  const canPoll = can("poll.manage");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:30 tối");
  const [endTime, setEndTime] = useState("");
  const [categoryCode, setCategoryCode] = useState("EVT_MEET");
  const [location, setLocation] = useState("Phòng sinh hoạt chung T2");
  const [organizerText, setOrganizerText] = useState("");
  const [organizerIds, setOrganizerIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [hasCheckIn, setHasCheckIn] = useState(true);
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Nạp giá trị mỗi lần mở
  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDate(event.date);
      setTime(event.time);
      setEndTime(hmToVn(event.endHm));
      setCategoryCode(event.categoryCode);
      setLocation(event.location);
      setOrganizerText(event.organizerText ?? "");
      setOrganizerIds([...event.organizers].sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0)).map((o) => o.memberId));
      setDescription(event.description ?? "");
      setHasCheckIn(event.hasCheckIn);
    } else {
      setTitle("");
      setDate(isoToDmy(presetDate ?? vnTodayIso()));
      setTime("19:30 tối");
      setEndTime("");
      setCategoryCode("EVT_MEET");
      setLocation("Phòng sinh hoạt chung T2");
      setOrganizerText(session?.member ? `${session.member.fullName}${session.roleLabel ? ` (${session.roleLabel})` : ""}` : "");
      setOrganizerIds(session?.member ? [session.member.id] : []);
      setDescription("");
      setHasCheckIn(true);
    }
    setHasPoll(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    // Chỉ nạp lại khi mở modal / đổi sự kiện — không ghi đè khi dữ liệu nền được làm mới lúc đang nhập
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, presetDate]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.code, label: c.label === c.name ? c.name : `${c.label} — ${c.name}` })),
    [categories]
  );
  const preview = resolveEventTimes({ date, time, endTime, categoryCode });
  const activeMembers = members.filter((m) => m.status === "active");

  const toggleOrganizer = (id: string) =>
    setOrganizerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      showToast("error", "Vui lòng nhập tiêu đề sự kiện (tối thiểu 3 ký tự)!");
      return;
    }
    if (!preview.ok) {
      showToast("error", preview.error);
      return;
    }
    let poll = null;
    if (!isEdit && hasPoll) {
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (pollQuestion.trim().length < 5) {
        showToast("error", "Câu hỏi biểu quyết tối thiểu 5 ký tự!");
        return;
      }
      if (opts.length < 2) {
        showToast("error", "Cần ít nhất 2 phương án lựa chọn!");
        return;
      }
      poll = { question: pollQuestion.trim(), options: opts };
    }
    const body = {
      title: title.trim(),
      date,
      time,
      endTime: endTime.trim() || null,
      categoryCode,
      location: location.trim() || null,
      organizerText: organizerText.trim() || null,
      description: description.trim() || null,
      hasCheckIn,
      ...(canManage ? { organizerIds } : {}),
    };
    setSaving(true);
    try {
      const saved = isEdit ? await eventsApi.update(event!.id, body) : await eventsApi.create({ ...body, poll });
      await refreshEvents();
      showToast("success", isEdit ? `Đã cập nhật sự kiện "${saved.title}".` : `Đã tạo sự kiện "${saved.title}" ngày ${saved.date}.`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary" />
              <h3 className="text-base font-black text-gray-900">{isEdit ? "Sửa Sự Kiện" : "Tạo Sự Kiện Lưu Xá Mới"}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
            <CustomInput
              label="Tên sự kiện / Hoạt động"
              placeholder="VD: Họp Ban Đại diện Lưu Xá mở rộng"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Ngày diễn ra" placeholder="Chọn ngày..." value={date} onChange={setDate} required />
              <CustomTimePicker label="Giờ bắt đầu" placeholder="VD: 19:30 tối" value={time} onChange={setTime} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CustomTimePicker
                label="Giờ kết thúc (tuỳ chọn)"
                placeholder={`Mặc định ${DEFAULT_DURATION_MIN[categoryCode] ?? 90} phút`}
                value={endTime}
                onChange={setEndTime}
              />
              <div className="flex items-end">
                <p className={cn("text-[11px] leading-snug pb-2", preview.ok ? "text-gray-500" : "text-rose-500")}>
                  {preview.ok
                    ? `Diễn ra ${isoToVnHm(preview.startsAt)} → ${isoToVnHm(preview.endsAt)}${
                        vnTodayIso(new Date(preview.endsAt)) !== vnTodayIso(new Date(preview.startsAt)) ? " (hôm sau)" : ""
                      }`
                    : preview.error}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CustomSelect label="Chủ đề sự kiện" value={categoryCode} onChange={setCategoryCode} options={categoryOptions} />
              <CustomInput
                label="Địa điểm tổ chức"
                placeholder="VD: Phòng T2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            <CustomInput
              label="Người chủ trì / Ban tổ chức"
              placeholder="VD: Trần Văn Đức (Trưởng nhà), Ban Phụng vụ"
              value={organizerText}
              onChange={(e) => setOrganizerText(e.target.value)}
            />

            {canManage && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Thành viên phụ trách <span className="font-medium text-gray-400">(người đầu tiên là chủ trì — được quyền điểm danh sự kiện)</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scroll p-1">
                  {activeMembers.map((m) => {
                    const idx = organizerIds.indexOf(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => toggleOrganizer(m.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[11px] font-bold transition border",
                          idx >= 0 ? "bg-primary text-white border-primary shadow-2xs" : "bg-surface-container-low text-gray-700 border-transparent hover:bg-purple-100"
                        )}
                      >
                        {idx === 0 ? "★ " : ""}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <CustomTextarea
              label="Mô tả nội dung & chương trình"
              placeholder="Nêu rõ mục đích cuộc họp hoặc hoạt động..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />

            <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-100">
              <CustomToggle
                label="Kích hoạt Điểm danh (Check-in)"
                description="Ban tổ chức mở mã QR xoay vòng — anh em quét QR hoặc nhập mã 6 số để điểm danh"
                checked={hasCheckIn}
                onChange={setHasCheckIn}
              />
            </div>

            {!isEdit && canPoll && (
              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-3">
                <CustomToggle
                  label="Tạo cuộc biểu quyết (Vote)"
                  description="Lấy ý kiến tập thể cho sự kiện này"
                  checked={hasPoll}
                  onChange={setHasPoll}
                />
                {hasPoll && (
                  <div className="pt-2 space-y-2.5 border-t border-blue-100/80">
                    <CustomInput placeholder="Câu hỏi biểu quyết..." value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <CustomInput
                            placeholder={`Phương án ${idx + 1}...`}
                            value={opt}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPollOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
                            }}
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((prev) => [...prev, ""])}
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm phương án</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Lưu sự kiện"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
