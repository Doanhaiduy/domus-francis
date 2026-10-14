"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck, Info, Plus, Repeat, X } from "lucide-react";
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
import {
  DEFAULT_DURATION_MIN,
  SERIES_HORIZON_DAYS,
  SERIES_MAX_COUNT,
  WEEKDAY_SHORT,
  addMinutesHm,
  durationFromTimes,
  hmToVn,
  isoToDmy,
  isoToVnHm,
  isoWeekday,
  resolveEventTimes,
  seriesPatternLabel,
  toIsoDate,
  untilForCount,
  vnTodayIso,
  weekdayDm,
  weeklyDates,
  type WeeklyPattern,
} from "@/lib/events-format";
import { eventsApi, refreshEvents, seriesApi, type SeriesPatchPayload } from "@/lib/data/events";
import type { EventCategoryDto, EventDto, EventSeriesDto } from "@/lib/types/events";

type EndMode = "never" | "until" | "count";
type Scope = "single" | "following";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: EventCategoryDto[];
  /** Sửa sự kiện có sẵn; không có ⇒ tạo mới */
  event?: EventDto | null;
  /** Ngày gợi ý khi tạo (YYYY-MM-DD) */
  presetDate?: string | null;
  /** Mở thẳng chế độ sửa CHUỖI định kỳ (từ hộp thoại "Sự kiện định kỳ") */
  seriesEdit?: { series: EventSeriesDto; fromDate?: string | null } | null;
  /** Tạo mới với "Lặp lại hằng tuần" bật sẵn */
  presetRepeat?: boolean;
  /** Sau khi lưu: ngày nên mở trên lịch */
  onSaved?: (e: { dateIso: string }) => void;
}

const INTERVAL_OPTIONS = [
  { value: "1", label: "Mỗi tuần" },
  { value: "2", label: "2 tuần một lần" },
  { value: "3", label: "3 tuần một lần" },
  { value: "4", label: "4 tuần một lần" },
];

const sameList = (a: number[] | string[], b: number[] | string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function EventFormModal({ open, onClose, categories, event, presetDate, seriesEdit, presetRepeat, onSaved }: Props) {
  const { members, showToast } = useApp();
  const { session, can } = useSession();
  const canManage = can("event.manage");
  const canPoll = can("poll.manage");
  const today = vnTodayIso();

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
  const [notifyAll, setNotifyAll] = useState(true);
  const [notifyZalo, setNotifyZalo] = useState(false);
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  // Lặp lại hằng tuần
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endMode, setEndMode] = useState<EndMode>("never");
  const [untilDate, setUntilDate] = useState("");
  const [count, setCount] = useState("10");
  // Sửa buổi của chuỗi: chỉ buổi này / buổi này và các buổi sau
  const [scope, setScope] = useState<Scope>("single");
  const [series, setSeries] = useState<EventSeriesDto | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isEdit = !!event || !!seriesEdit;
  const occurrence = !!event?.series;
  const seriesMode = !!seriesEdit || (occurrence && scope === "following");
  const createRepeat = !isEdit && repeat;
  const recurrence = createRepeat || seriesMode;

  const fillFromSeries = (s: EventSeriesDto) => {
    setTitle(s.title);
    setTime(hmToVn(s.startHm));
    setEndTime(hmToVn(s.endHm));
    setCategoryCode(s.categoryCode);
    setLocation(s.location ?? "");
    setOrganizerText(s.organizerText ?? "");
    setOrganizerIds(s.organizers.map((o) => o.memberId));
    setDescription(s.description ?? "");
    setHasCheckIn(s.hasCheckIn);
    setWeekdays(s.weekdays);
    setIntervalWeeks(s.intervalWeeks);
    setEndMode(s.untilDate ? "until" : "never");
    setUntilDate(s.untilDate ? isoToDmy(s.untilDate) : "");
    setCount("10");
  };

  const fillFromEvent = (e: EventDto) => {
    setTitle(e.title);
    setDate(e.date);
    setTime(e.time);
    setEndTime(hmToVn(e.endHm));
    setCategoryCode(e.categoryCode);
    setLocation(e.location);
    setOrganizerText(e.organizerText ?? "");
    setOrganizerIds([...e.organizers].sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0)).map((o) => o.memberId));
    setDescription(e.description ?? "");
    setHasCheckIn(e.hasCheckIn);
  };

  // Nạp giá trị mỗi lần mở
  useEffect(() => {
    if (!open) return;
    setScope("single");
    setSeries(null);
    setHasPoll(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setNotifyAll(true);
    setNotifyZalo(false);
    if (seriesEdit) {
      setSeries(seriesEdit.series);
      fillFromSeries(seriesEdit.series);
      const f = seriesEdit.fromDate && seriesEdit.fromDate > today ? seriesEdit.fromDate : today;
      setFromDate(isoToDmy(f));
      setRepeat(true);
    } else if (event) {
      fillFromEvent(event);
      setRepeat(false);
    } else {
      const d = presetDate ?? today;
      setTitle("");
      setDate(isoToDmy(d < today && presetRepeat ? today : d));
      setTime("19:30 tối");
      setEndTime("");
      setCategoryCode("EVT_MEET");
      setLocation("Phòng sinh hoạt chung T2");
      setOrganizerText(session?.member ? `${session.member.fullName}${session.roleLabel ? ` (${session.roleLabel})` : ""}` : "");
      setOrganizerIds(session?.member ? [session.member.id] : []);
      setDescription("");
      setHasCheckIn(true);
      setRepeat(!!presetRepeat);
      setWeekdays([isoWeekday(d < today && presetRepeat ? today : d)]);
      setIntervalWeeks(1);
      setEndMode("never");
      setUntilDate("");
      setCount("10");
    }
    // Chỉ nạp lại khi mở modal / đổi sự kiện — không ghi đè khi dữ liệu nền được làm mới lúc đang nhập
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, presetDate, seriesEdit?.series.id, presetRepeat]);

  // Chuyển sang "buổi này và các buổi sau": tải chuỗi, điền giá trị của CHUỖI (không phải của riêng buổi này)
  const switchScope = async (s: Scope) => {
    if (s === scope || !event) return;
    if (s === "single") {
      setScope("single");
      fillFromEvent(event);
      return;
    }
    try {
      setLoadingSeries(true);
      const data = series ?? (await seriesApi.get(event.series!.id));
      setSeries(data);
      fillFromSeries(data);
      const occ = event.series!.occurrenceDate;
      setFromDate(isoToDmy(occ > today ? occ : today));
      setScope("following");
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setLoadingSeries(false);
    }
  };

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.code, label: c.label === c.name ? c.name : `${c.label} — ${c.name}` })),
    [categories]
  );
  const preview = resolveEventTimes({ date: seriesMode ? isoToDmy(today) : date, time, endTime, categoryCode });
  const activeMembers = members.filter((m) => m.status === "active");

  // ---- Xem trước các buổi của chuỗi ----
  const startIso = seriesMode ? series?.startsOn ?? null : toIsoDate(date);
  const countN = Math.min(SERIES_MAX_COUNT, Math.max(0, Math.trunc(Number(count) || 0)));
  const basePattern: WeeklyPattern | null = startIso && weekdays.length ? { startsOn: startIso, weekdays, intervalWeeks } : null;
  const resolvedUntil: string | null =
    !basePattern || endMode === "never" ? null : endMode === "until" ? toIsoDate(untilDate) : countN > 0 ? untilForCount(basePattern, countN) : null;
  const pattern: WeeklyPattern | null = basePattern ? { ...basePattern, untilDate: resolvedUntil } : null;
  const fromIso = seriesMode ? toIsoDate(fromDate) : startIso;
  const previewFrom = fromIso && fromIso > today ? fromIso : today;
  const previewDates = recurrence && pattern ? weeklyDates(pattern, previewFrom, { limit: 8 }) : [];
  const totalCount = recurrence && pattern && resolvedUntil ? weeklyDates(pattern, pattern.startsOn, { limit: 500 }).length : null;
  const timeInfo = durationFromTimes(time, endTime, categoryCode);

  const toggleOrganizer = (id: string) => setOrganizerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleWeekday = (d: number) => setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const toggleRepeat = (on: boolean) => {
    setRepeat(on);
    if (on) {
      const d = toIsoDate(date) ?? today;
      if (!weekdays.length) setWeekdays([isoWeekday(d)]);
      setHasPoll(false);
    }
  };

  const validateRecurrence = (): string | null => {
    if (!weekdays.length) return "Chọn ít nhất một thứ trong tuần để lặp lại.";
    if (endMode === "until" && !toIsoDate(untilDate)) return "Chọn ngày kết thúc của chuỗi (hoặc chọn Không kết thúc).";
    if (endMode === "count" && (countN < 1 || countN > SERIES_MAX_COUNT)) return `Số buổi từ 1 đến ${SERIES_MAX_COUNT}.`;
    if (resolvedUntil && startIso && resolvedUntil < startIso) return "Ngày kết thúc phải sau ngày bắt đầu.";
    if (!timeInfo) return `Không hiểu giờ "${time}${endTime ? ` → ${endTime}` : ""}". Ví dụ hợp lệ: 21:00, 8h tối.`;
    return null;
  };

  const finish = async (msg: string, dateIso: string) => {
    await refreshEvents();
    showToast("success", msg);
    onSaved?.({ dateIso });
    onClose();
  };

  const submitSeriesCreate = async () => {
    const err = validateRecurrence();
    if (err) return showToast("error", err);
    if (!startIso) return showToast("error", "Ngày bắt đầu không hợp lệ.");
    if (startIso < today) return showToast("error", "Sự kiện định kỳ phải bắt đầu từ hôm nay trở đi.");
    const r = await seriesApi.create({
      title: title.trim(),
      time,
      endTime: endTime.trim() || null,
      categoryCode,
      location: location.trim() || null,
      organizerText: organizerText.trim() || null,
      description: description.trim() || null,
      hasCheckIn,
      weekdays,
      intervalWeeks,
      startsOn: startIso,
      untilDate: endMode === "until" ? toIsoDate(untilDate) : null,
      count: endMode === "count" ? countN : null,
      ...(canManage ? { organizerIds } : {}),
      notifyApp: notifyAll,
      notifyZalo,
    });
    await finish(
      `Đã tạo sự kiện định kỳ "${r.series.title}" (${r.series.patternLabel}) — ${r.generated} buổi trong ${SERIES_HORIZON_DAYS} ngày tới đã lên lịch.`,
      r.firstDate ?? startIso
    );
  };

  const submitSeriesEdit = async () => {
    const s = series;
    if (!s) return;
    const err = validateRecurrence();
    if (err) return showToast("error", err);
    const f = toIsoDate(fromDate);
    if (!f) return showToast("error", "Chọn ngày bắt đầu áp dụng thay đổi.");
    if (f < today) return showToast("error", "Chỉ sửa được các buổi từ hôm nay trở đi.");
    const patch: SeriesPatchPayload = {};
    if (title.trim() !== s.title) patch.title = title.trim();
    if (timeInfo && (timeInfo.startHm !== s.startHm || timeInfo.minutes !== s.durationMinutes)) {
      patch.time = time;
      patch.endTime = endTime.trim() || null;
    }
    if (categoryCode !== s.categoryCode) patch.categoryCode = categoryCode;
    if (location.trim() !== (s.location ?? "")) patch.location = location.trim() || null;
    if (organizerText.trim() !== (s.organizerText ?? "")) patch.organizerText = organizerText.trim() || null;
    if (description.trim() !== (s.description ?? "")) patch.description = description.trim() || null;
    if (hasCheckIn !== s.hasCheckIn) patch.hasCheckIn = hasCheckIn;
    if (canManage && !sameList(organizerIds, s.organizers.map((o) => o.memberId))) patch.organizerIds = organizerIds;
    if (!sameList([...weekdays].sort(), [...s.weekdays].sort())) patch.weekdays = weekdays;
    if (intervalWeeks !== s.intervalWeeks) patch.intervalWeeks = intervalWeeks;
    if (endMode === "never" && s.untilDate) patch.noEnd = true;
    if (endMode === "until" && toIsoDate(untilDate) !== s.untilDate) patch.untilDate = toIsoDate(untilDate);
    if (endMode === "count" && resolvedUntil !== s.untilDate) patch.count = countN;
    if (!Object.keys(patch).length) return showToast("info", "Chưa có thay đổi nào để lưu.");
    patch.fromDate = f;
    const r = await seriesApi.update(s.id, patch);
    const parts = [`${r.updated} buổi được cập nhật`];
    if (r.generated + r.restored) parts.push(`thêm ${r.generated + r.restored} buổi`);
    if (r.removed) parts.push(`gỡ ${r.removed} buổi không còn trong lịch lặp`);
    await finish(`Đã sửa chuỗi "${r.series.title}" từ ${isoToDmy(f)}: ${parts.join(", ")}.`, r.firstDate ?? f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      showToast("error", "Vui lòng nhập tiêu đề sự kiện (tối thiểu 3 ký tự)!");
      return;
    }
    if (!recurrence && !preview.ok) {
      showToast("error", preview.error);
      return;
    }
    setSaving(true);
    try {
      if (createRepeat) return await submitSeriesCreate();
      if (seriesMode) return await submitSeriesEdit();
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
      const saved = isEdit ? await eventsApi.update(event!.id, body) : await eventsApi.create({ ...body, poll, notifyApp: notifyAll, notifyZalo });
      await finish(isEdit ? `Đã cập nhật sự kiện "${saved.title}".` : `Đã tạo sự kiện "${saved.title}" ngày ${saved.date}.`, saved.dateIso);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  const heading = seriesEdit
    ? "Sửa Sự Kiện Định Kỳ"
    : seriesMode
    ? "Sửa Buổi Này & Các Buổi Sau"
    : isEdit
    ? "Sửa Sự Kiện"
    : createRepeat
    ? "Tạo Sự Kiện Định Kỳ"
    : "Tạo Sự Kiện Lưu Xá Mới";

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
        >
          <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {recurrence ? <Repeat className="w-5 h-5 text-indigo-600 shrink-0" /> : <CalendarCheck className="w-5 h-5 text-primary shrink-0" />}
              <h3 className="text-base font-black text-gray-900 truncate">{heading}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scroll flex-1">
            {occurrence && !seriesEdit && canManage && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-container-low" role="radiogroup" aria-label="Phạm vi sửa">
                  {(
                    [
                      ["single", "Chỉ buổi này"],
                      ["following", "Buổi này & các buổi sau"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={scope === k}
                      disabled={loadingSeries}
                      onClick={() => switchScope(k)}
                      className={cn(
                        "py-2 px-2 rounded-xl text-[11px] font-bold transition",
                        scope === k ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      {loadingSeries && k === "following" ? "Đang tải chuỗi…" : label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                  <Repeat className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-500" />
                  <span>
                    Buổi thuộc chuỗi định kỳ <b>{event!.series!.label}</b>.{" "}
                    {scope === "following" ? "Thay đổi áp dụng cho các buổi từ ngày bên dưới; buổi đã sửa riêng giữ nguyên phần đã sửa." : "Chỉ đổi riêng buổi này."}
                  </span>
                </p>
              </div>
            )}

            <CustomInput
              label="Tên sự kiện / Hoạt động"
              placeholder="VD: Giờ Kinh Tối cộng đoàn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              {seriesMode ? (
                <CustomDatePicker label="Áp dụng từ ngày" placeholder="Chọn ngày..." value={fromDate} onChange={setFromDate} required />
              ) : (
                <CustomDatePicker label={createRepeat ? "Bắt đầu từ ngày" : "Ngày diễn ra"} placeholder="Chọn ngày..." value={date} onChange={setDate} required />
              )}
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
                {recurrence ? (
                  <p className={cn("text-[11px] leading-snug pb-2", timeInfo ? "text-gray-500" : "text-rose-500")}>
                    {timeInfo
                      ? `Mỗi buổi ${timeInfo.startHm} → ${addMinutesHm(timeInfo.startHm, timeInfo.minutes)} (${timeInfo.minutes} phút)`
                      : "Không hiểu giờ — ví dụ: 21:00, 8h tối"}
                  </p>
                ) : (
                  <p className={cn("text-[11px] leading-snug pb-2", preview.ok ? "text-gray-500" : "text-rose-500")}>
                    {preview.ok
                      ? `Diễn ra ${isoToVnHm(preview.startsAt)} → ${isoToVnHm(preview.endsAt)}${
                          vnTodayIso(new Date(preview.endsAt)) !== vnTodayIso(new Date(preview.startsAt)) ? " (hôm sau)" : ""
                        }`
                      : preview.error}
                  </p>
                )}
              </div>
            </div>

            {/* LẶP LẠI HẰNG TUẦN */}
            {!event && (canManage || seriesEdit) && (
              <div className={cn("p-3 rounded-2xl border space-y-3", recurrence ? "bg-indigo-50/60 border-indigo-100" : "bg-surface-container-low/60 border-transparent")}>
                {!seriesEdit && (
                  <CustomToggle
                    label="Lặp lại hằng tuần"
                    description={`Tự lên lịch các buổi theo thứ trong tuần (tạo trước ${SERIES_HORIZON_DAYS} ngày)`}
                    checked={repeat}
                    onChange={toggleRepeat}
                  />
                )}
                {recurrence && (
                  <RecurrenceFields
                    weekdays={weekdays}
                    onToggleWeekday={toggleWeekday}
                    setWeekdays={setWeekdays}
                    intervalWeeks={intervalWeeks}
                    setIntervalWeeks={setIntervalWeeks}
                    endMode={endMode}
                    setEndMode={setEndMode}
                    untilDate={untilDate}
                    setUntilDate={setUntilDate}
                    count={count}
                    setCount={setCount}
                  />
                )}
              </div>
            )}
            {occurrence && seriesMode && (
              <div className="p-3 rounded-2xl border bg-indigo-50/60 border-indigo-100 space-y-3">
                <RecurrenceFields
                  weekdays={weekdays}
                  onToggleWeekday={toggleWeekday}
                  setWeekdays={setWeekdays}
                  intervalWeeks={intervalWeeks}
                  setIntervalWeeks={setIntervalWeeks}
                  endMode={endMode}
                  setEndMode={setEndMode}
                  untilDate={untilDate}
                  setUntilDate={setUntilDate}
                  count={count}
                  setCount={setCount}
                />
              </div>
            )}
            {recurrence && (
              <div className="rounded-2xl border border-indigo-100 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-indigo-900">
                    {weekdays.length ? seriesPatternLabel({ weekdays, intervalWeeks }) : "Chưa chọn thứ"}
                    {timeInfo ? ` · ${timeInfo.startHm}` : ""}
                  </span>
                  <span className="text-[10px] font-bold text-gray-500">
                    {totalCount !== null ? `${totalCount} buổi · đến ${resolvedUntil ? isoToDmy(resolvedUntil) : "—"}` : "Không kết thúc"}
                  </span>
                </div>
                {previewDates.length ? (
                  <div className="flex flex-wrap gap-1">
                    {previewDates.map((d) => (
                      <span key={d} className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 text-[10px] font-bold tabular-nums">
                        {weekdayDm(d)}
                      </span>
                    ))}
                    {(totalCount === null || totalCount > previewDates.length) && <span className="px-1 text-[10px] text-gray-400 font-bold">…</span>}
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-500">Không có buổi nào {seriesMode ? "từ ngày áp dụng" : "trong khoảng đã chọn"} — kiểm tra thứ và ngày kết thúc.</p>
                )}
                <p className="text-[10px] text-gray-500 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {seriesMode
                      ? "Buổi đã diễn ra không đổi. Buổi chưa diễn ra từ ngày áp dụng được cập nhật theo chuỗi; buổi không còn khớp lịch lặp sẽ được gỡ."
                      : `Các buổi trong ${SERIES_HORIZON_DAYS} ngày tới được tạo ngay; buổi xa hơn được hệ thống tự tạo mỗi sáng. Bỏ một ngày (nghỉ lễ…) hoặc dừng chuỗi ở mục "Sự kiện định kỳ".`}
                  </span>
                </p>
              </div>
            )}

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
                description={
                  recurrence
                    ? "Mỗi buổi đều điểm danh bằng ảnh; buổi kết thúc quá 12 giờ được tự chốt điểm danh"
                    : "Anh em chụp ảnh tại sự kiện gửi lại để điểm danh; ban tổ chức xem được ảnh"
                }
                checked={hasCheckIn}
                onChange={setHasCheckIn}
              />
            </div>

            {!isEdit && (
              <div className="p-3 bg-sky-50/60 rounded-2xl border border-sky-100 space-y-1">
                <CustomToggle
                  label="Báo cả nhà trong ứng dụng"
                  description={createRepeat ? "Một thông báo cho cả chuỗi (không báo từng buổi)" : "Mỗi thành viên nhận một thông báo về sự kiện này"}
                  checked={notifyAll}
                  onChange={setNotifyAll}
                />
                <CustomToggle label="Đăng vào nhóm Zalo" description="Cần bật ở Quản trị → Tích hợp Zalo" checked={notifyZalo} onChange={setNotifyZalo} />
              </div>
            )}

            {!isEdit && !createRepeat && canPoll && (
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
                              aria-label="Bỏ phương án"
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

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-gray-100 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving || loadingSeries}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Đang lưu..." : seriesMode ? "Lưu cho các buổi" : createRepeat ? "Tạo chuỗi định kỳ" : isEdit ? "Lưu thay đổi" : "Lưu sự kiện"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------
// Khối chọn lặp: thứ trong tuần, chu kỳ, kết thúc
// ---------------------------------------------------------------------
interface RecurrenceProps {
  weekdays: number[];
  onToggleWeekday: (d: number) => void;
  setWeekdays: (v: number[]) => void;
  intervalWeeks: number;
  setIntervalWeeks: (v: number) => void;
  endMode: EndMode;
  setEndMode: (v: EndMode) => void;
  untilDate: string;
  setUntilDate: (v: string) => void;
  count: string;
  setCount: (v: string) => void;
}

function RecurrenceFields(p: RecurrenceProps) {
  const presets: [string, number[]][] = [
    ["Mỗi ngày", [1, 2, 3, 4, 5, 6, 7]],
    ["T2 – T6", [1, 2, 3, 4, 5]],
    ["Cuối tuần", [6, 7]],
  ];
  return (
    <>
      <div>
        <span className="block text-xs font-bold text-gray-700 mb-1.5">Lặp vào các thứ</span>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Thứ trong tuần">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = p.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => p.onToggleWeekday(d)}
                className={cn(
                  "h-9 rounded-xl text-[11px] font-black transition border",
                  on
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : cn("bg-white border-gray-200 hover:border-indigo-300", d === 7 ? "text-rose-600" : "text-gray-700")
                )}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {presets.map(([label, days]) => (
            <button
              key={label}
              type="button"
              onClick={() => p.setWeekdays(days)}
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-indigo-700 bg-indigo-100/70 hover:bg-indigo-100 transition"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <CustomSelect label="Chu kỳ" value={String(p.intervalWeeks)} onChange={(v) => p.setIntervalWeeks(Number(v))} options={INTERVAL_OPTIONS} />
      <div>
        <span className="block text-xs font-bold text-gray-700 mb-1.5">Kết thúc</span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white border border-gray-200" role="radiogroup" aria-label="Kết thúc chuỗi">
          {(
            [
              ["never", "Không kết thúc"],
              ["until", "Đến ngày"],
              ["count", "Sau số buổi"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={p.endMode === k}
              onClick={() => p.setEndMode(k)}
              className={cn(
                "py-1.5 rounded-lg text-[11px] font-bold transition",
                p.endMode === k ? "bg-indigo-600 text-white shadow-2xs" : "text-gray-600 hover:bg-indigo-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {p.endMode === "until" && (
          <div className="mt-2">
            <CustomDatePicker placeholder="Ngày kết thúc..." value={p.untilDate} onChange={p.setUntilDate} />
          </div>
        )}
        {p.endMode === "count" && (
          <div className="mt-2">
            <CustomInput
              inputMode="numeric"
              aria-label="Số buổi"
              placeholder="VD: 10"
              value={p.count}
              onChange={(e) => p.setCount(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              rightSuffix="buổi"
            />
          </div>
        )}
      </div>
    </>
  );
}
