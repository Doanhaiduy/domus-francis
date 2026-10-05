"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Check, Ban, UserPlus } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { LiturgyAssignmentDto, LiturgyDayDto, LiturgySessionDto, LiturgyWeekDto } from "@/lib/types/community";
import { liturgyApi, refreshLiturgy } from "@/lib/data/community";
import { addDays } from "@/lib/community-format";
import { CustomDatePicker, CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ReasonDialog } from "@/app/dien-dan/_parts/ReasonDialog";

interface MemberOption {
  id: string;
  name: string;
  room: string;
}

interface Props {
  week: LiturgyWeekDto;
  canManage: boolean;
  members: MemberOption[];
  onNavigate: (from: string | null) => void;
  showToast: (type: "success" | "error" | "info", msg: string) => void;
}

const STATUS_STYLE: Record<LiturgyAssignmentDto["status"], string> = {
  assigned: "bg-amber-50 text-amber-800 border-amber-100",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-100",
  declined: "bg-rose-50 text-rose-700 border-rose-100 line-through",
  served: "bg-gray-50 text-gray-600 border-gray-100",
};
const STATUS_TEXT: Record<LiturgyAssignmentDto["status"], string> = {
  assigned: "chờ nhận",
  confirmed: "đã nhận",
  declined: "từ chối",
  served: "đã phục vụ",
};

export default function LiturgySchedule({ week, canManage, members, onNavigate, showToast }: Props) {
  const [busy, setBusy] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState("presider");
  const [memberId, setMemberId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("Kinh Tối & Lần hạt Mân Côi chung cả nhà");
  const [newDate, setNewDate] = useState(week.today);
  const [newTime, setNewTime] = useState(week.defaultNightPrayerTime);
  const [newLocation, setNewLocation] = useState("Nhà nguyện Lưu xá");
  const [cancelTarget, setCancelTarget] = useState<LiturgySessionDto | null>(null);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await refreshLiturgy();
      if (ok) showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const nowMs = Date.now();

  const renderAssignments = (s: LiturgySessionDto) => {
    const upcoming = new Date(s.startsAt).getTime() > nowMs;
    const others = s.assignments;
    if (!others.length && !canManage) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {others.map((a) => (
          <span key={a.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${STATUS_STYLE[a.status]}`}>
            <span className="text-gray-500 font-medium">{a.roleName}:</span>
            <span className={a.isMine ? "text-primary font-bold" : ""}>{a.member.name}</span>
            <span className="opacity-70">· {STATUS_TEXT[a.status]}</span>
            {a.isMine && upcoming && a.status !== "confirmed" && (
              <button
                disabled={busy}
                title="Nhận phục vụ"
                onClick={() => run(() => liturgyApi.setAssignmentStatus(a.id, "confirmed"), "Đã xác nhận nhận phục vụ. Cảm ơn bạn!")}
                className="ml-0.5 p-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Check className="w-2.5 h-2.5" />
              </button>
            )}
            {a.isMine && upcoming && a.status !== "declined" && (
              <button
                disabled={busy}
                title="Từ chối (Ban Phụng vụ sẽ phân công người khác)"
                onClick={() => run(() => liturgyApi.setAssignmentStatus(a.id, "declined"), "Đã báo không thể phục vụ.")}
                className="p-0.5 rounded bg-rose-500 text-white hover:bg-rose-600"
              >
                <Ban className="w-2.5 h-2.5" />
              </button>
            )}
            {canManage && (
              <button
                disabled={busy}
                title="Gỡ phân công"
                onClick={() => run(() => liturgyApi.unassign(a.id), "Đã gỡ phân công.")}
                className="p-0.5 rounded hover:bg-black/5 text-gray-400 hover:text-rose-600"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ))}
        {canManage && (
          <button
            onClick={() => {
              setAssignFor(assignFor === s.id ? null : s.id);
              setRoleCode(s.isMass ? "lector" : "presider");
              setMemberId("");
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-dashed border-purple-200 text-[10px] font-bold text-primary hover:bg-purple-50"
          >
            <UserPlus className="w-3 h-3" /> Phân công
          </button>
        )}
        {canManage && upcoming && (
          <button
            onClick={() => setCancelTarget(s)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-gray-400 hover:text-rose-600"
          >
            Hủy buổi
          </button>
        )}
      </div>
    );
  };

  const renderAssignForm = (s: LiturgySessionDto) =>
    assignFor === s.id && (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!memberId) return showToast("error", "Chọn thành viên được phân công.");
          const ok = await run(() => liturgyApi.assign({ eventId: s.id, roleCode, memberId }), "Đã phân công và gửi thông báo cho thành viên.");
          if (ok) setAssignFor(null);
        }}
        className="mt-2 p-2.5 rounded-xl bg-white border border-purple-100 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
      >
        <CustomSelect label="Vai trò" value={roleCode} onChange={setRoleCode} options={week.roleTypes.map((r) => ({ value: r.code, label: r.name }))} />
        <CustomSelect
          label="Thành viên"
          value={memberId}
          onChange={setMemberId}
          placeholder="Chọn thành viên..."
          options={members.map((m) => ({ value: m.id, label: m.name, subLabel: m.room }))}
        />
        <button type="submit" disabled={busy} className="px-3.5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
          Lưu
        </button>
      </form>
    );

  const presiderOf = (s: LiturgySessionDto) => s.assignments.find((a) => a.roleCode === "presider" && a.status !== "declined");

  const sessionRow = (s: LiturgySessionDto, tone: "today" | "normal" | "patron") => {
    const p = presiderOf(s);
    const timeColor = tone === "patron" ? "text-purple-700" : tone === "today" ? "text-primary" : s.isMass ? "text-secondary" : "text-gray-600";
    return (
      <div key={s.id} className="p-2.5 rounded-xl bg-white text-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={`font-mono font-bold ${timeColor}`}>{s.timeLabel}</span>
          <span className="font-semibold text-gray-900 flex-1 min-w-[10rem]">{s.title}</span>
          <span className="text-gray-400">
            {p ? `Chủ sự: ${p.member.name}${p.member.room ? ` (${p.member.room})` : ""}` : s.location ?? "Ban Phụng vụ"}
          </span>
        </div>
        {renderAssignments(s)}
        {renderAssignForm(s)}
      </div>
    );
  };

  const dayHeader = (d: LiturgyDayDto) => `${d.weekday}, ${d.dateLabel}`;

  const renderDay = (d: LiturgyDayDto) => {
    const patron = d.sessions.find((s) => s.isPatron);
    if (patron) {
      return (
        <div key={d.date} className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-purple-900 mb-2">
            <span className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white px-2 py-0.5 rounded-md uppercase">
              ✪ {d.liturgical?.note ?? patron.title}
            </span>
            <span>
              {d.isToday ? "HÔM NAY · " : ""}
              {dayHeader(d)}
            </span>
          </div>
          <div className="space-y-2">{d.sessions.map((s) => sessionRow(s, "patron"))}</div>
        </div>
      );
    }
    if (d.isToday) {
      return (
        <div key={d.date} className="p-4 rounded-2xl bg-purple-50/70 border-l-4 border-primary">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-purple-900 mb-2">
            <span className="bg-primary text-white px-2 py-0.5 rounded-md">HÔM NAY</span>
            <span>
              {dayHeader(d)}
              {d.liturgical ? ` · ${d.liturgical.title}` : ""}
            </span>
          </div>
          <div className="space-y-2">
            {d.sessions.map((s) => sessionRow(s, "today"))}
            {d.sessions.length === 0 && <div className="p-2.5 rounded-xl bg-white text-xs text-gray-400">Không có giờ kinh chung hôm nay.</div>}
          </div>
        </div>
      );
    }
    return (
      <div key={d.date} className="p-4 rounded-2xl bg-surface-container-low/50">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-gray-700 mb-2">
          <span>{dayHeader(d)}</span>
          {d.liturgical?.isAbstinence ? (
            <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">Ngày kiêng thịt / Đền tội</span>
          ) : d.liturgical ? (
            <span className={`px-2 py-0.5 rounded-md ${d.liturgical.rankLabel ? "text-purple-800 bg-purple-100" : "text-gray-500 font-medium"}`}>
              {d.liturgical.title}
              {d.liturgical.rankLabel && d.liturgical.rankLabel !== "Chúa Nhật" ? ` · ${d.liturgical.rankLabel}` : ""}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          {d.sessions.map((s) => sessionRow(s, "normal"))}
          {d.sessions.length === 0 && <div className="text-[11px] text-gray-400">Chưa có lịch phụng vụ.</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">
            {week.from === week.today ? "Lịch phụng vụ tuần này" : "Lịch phụng vụ"}
          </h2>
          <p className="text-xs text-gray-500">
            {week.monthLabel}
            {week.weekLabel ? ` · ${week.weekLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onNavigate(addDays(week.from, -7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Tuần trước">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate(null)}
            className="text-xs text-gray-400 font-mono hover:text-primary"
            title="Về hôm nay"
          >
            {week.rangeLabel}
          </button>
          <button onClick={() => onNavigate(addDays(week.from, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Tuần sau">
            <ChevronRight className="w-4 h-4" />
          </button>
          {canManage && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 text-primary text-[11px] font-bold hover:bg-purple-100"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm buổi
            </button>
          )}
        </div>
      </div>

      {adding && canManage && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              () => liturgyApi.createSession({ title: newTitle, date: newDate, time: newTime, location: newLocation }),
              "Đã thêm buổi phụng vụ vào lịch."
            );
            if (ok) setAdding(false);
          }}
          className="p-3 rounded-2xl border border-purple-100 bg-purple-50/40 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div className="sm:col-span-2">
            <CustomInput label="Tên buổi phụng vụ" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required minLength={3} maxLength={200} />
          </div>
          <CustomDatePicker label="Ngày" value={newDate} onChange={setNewDate} format="YYYY-MM-DD" />
          <CustomInput label="Giờ bắt đầu" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
          <div className="sm:col-span-2">
            <CustomInput label="Địa điểm" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} maxLength={200} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700">
              Hủy
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
              Thêm vào lịch
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">{week.days.map(renderDay)}</div>

      <ReasonDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Hủy buổi phụng vụ"
        description={<b>{cancelTarget?.title}</b>}
        placeholder="Lý do hủy (ví dụ: dời sang tham dự Thánh lễ giáo xứ)…"
        confirmText="Hủy buổi"
        minLength={3}
        onConfirm={async (reason) => {
          const ok = await run(() => liturgyApi.cancelSession(cancelTarget!.id, reason), "Đã hủy buổi phụng vụ.");
          if (!ok) throw new Error("cancel failed");
        }}
      />
    </div>
  );
}
