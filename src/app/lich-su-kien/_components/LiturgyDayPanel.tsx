"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Church,
  ExternalLink,
  HandHeart,
  Image as ImageIcon,
  Moon,
  Pencil,
  Sparkles,
  Star,
  Utensils,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage, fileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { liturgyCalendarApi, refreshLiturgy, useLiturgyDay } from "@/lib/data/liturgy-calendar";
import type { CalendarDayDetailDto, MassCheckinRowDto, ReadingSetDto, ReadingSlotDto } from "@/lib/types/liturgy";
import { CHECKIN_STATUS_CLASS, CHECKIN_STATUS_LABEL, LIT_COLOR, SPECIAL_COLOR, dm, dmy } from "./liturgy-style";
import MassCheckinModal from "./MassCheckinModal";

const WEEKDAY = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

interface Props {
  date: string;
  /** Mở hộp cấu hình (nạp Lời Chúa) — chỉ người quản lý */
  onOpenSettings?: () => void;
}

/** Khung "Phụng vụ trong ngày" trên trang Lịch: tên lễ, màu áo lễ, âm lịch, Lời Chúa, ý lễ của nhà, check-in đi lễ. */
export default function LiturgyDayPanel({ date, onOpenSettings }: Props) {
  const { day, stale, isLoading, error } = useLiturgyDay(date);
  const d = day ?? stale;
  const [checkinOpen, setCheckinOpen] = useState(false);

  if (error && !d) return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được lịch phụng vụ: {errorMessage(error)}</div>;
  if (!d) return <div className="h-40 rounded-3xl bg-white border border-purple-50 animate-pulse" />;

  const color = LIT_COLOR[d.color];
  const loadingOther = isLoading && d.date !== date;

  return (
    <div className={cn("bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden transition-opacity", loadingOther && "opacity-60")}>
      <div className={cn("h-1.5 w-full", color.bar)} />
      <div className="p-5 flex flex-col gap-4">
        {/* Tiêu đề ngày */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Phụng vụ · {WEEKDAY[d.weekday]} {dmy(d.date)}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500">
              <Moon className="w-3 h-3" /> Âm lịch {d.lunarLabel}
            </span>
          </div>
          {d.isPatron && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-gradient-to-r from-amber-100 to-yellow-50 border border-amber-300 text-amber-900">
              <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0" />
              <span className="text-xs font-black">Lễ Bổn mạng của nhà</span>
            </div>
          )}
          {d.specialDetails.map((s) => (
            <div key={s.id} className={cn("flex items-start gap-2 px-3 py-2 rounded-2xl border", SPECIAL_COLOR[s.color].chip)}>
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-black">{s.title}</p>
                {s.description && <p className="text-[11px] opacity-90 whitespace-pre-line">{s.description}</p>}
              </div>
            </div>
          ))}
          <h3 className={cn("text-base font-black leading-snug", d.isSolemnity || d.tet ? "text-amber-900" : "text-gray-900")}>{d.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className={cn("px-2 py-0.5 rounded-lg border", d.isSolemnity ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-gray-50 text-gray-600 border-gray-200")}>
              {d.rankLabel}
            </span>
            {d.isObligation && !d.isSunday && <span className="px-2 py-0.5 rounded-lg border bg-rose-50 text-rose-700 border-rose-200">Lễ buộc</span>}
            <span className={cn("px-2 py-0.5 rounded-lg border inline-flex items-center gap-1", color.chip)}>
              <span className={cn("w-2 h-2 rounded-full", color.dot)} /> Áo lễ {color.label.toLowerCase()}
            </span>
            {d.fasting && (
              <span className="px-2 py-0.5 rounded-lg border bg-orange-50 text-orange-700 border-orange-200 inline-flex items-center gap-1">
                <Utensils className="w-3 h-3" /> {d.fasting === "fast_abstinence" ? "Ăn chay & kiêng thịt" : "Kiêng thịt"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500">
            {d.seasonLabel}
            {d.weekLabel ? ` · ${d.weekLabel}` : ""} · Chúa Nhật năm {d.sundayCycle}, ngày thường năm {d.weekdayCycle}
            {d.psalterWeek ? ` · Thánh vịnh tuần ${["", "I", "II", "III", "IV"][d.psalterWeek]}` : ""}
          </p>
          {d.optional.length > 0 && (
            <p className="text-[11px] text-gray-600">
              <b>Lễ nhớ tùy ý:</b> {d.optional.map((o) => o.title).join("; ")}
            </p>
          )}
          {d.notes.map((n) => (
            <p key={n} className="text-[11px] text-gray-600 leading-snug">
              • {n}
            </p>
          ))}
        </div>

        <IntentionBox d={d} />
        <CheckinBox d={d} onOpen={() => setCheckinOpen(true)} />
        <Readings d={d} onOpenSettings={onOpenSettings} />
      </div>
      {checkinOpen && d.requirement && <MassCheckinModal day={d} onClose={() => setCheckinOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Ý lễ: ý chỉ của nhà (Ban Phụng vụ nhập) + ý cầu nguyện của Giáo hội ngày đó + tháng kính
// ---------------------------------------------------------------------
function IntentionBox({ d }: { d: CalendarDayDetailDto }) {
  const { showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [intention, setIntention] = useState(d.houseIntention ?? "");
  const [note, setNote] = useState(d.houseNote ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setIntention(d.houseIntention ?? "");
    setNote(d.houseNote ?? "");
    setEditing(false);
  }, [d.date, d.houseIntention, d.houseNote]);

  const church = [...d.intentions, ...(d.monthDevotion && !d.intentions.includes(d.monthDevotion) ? [d.monthDevotion] : [])];
  if (!d.houseIntention && !d.houseNote && !church.length && !d.canManage) return null;

  const save = async () => {
    setBusy(true);
    try {
      await liturgyCalendarApi.saveNote(d.date, { intention: intention.trim() || null, note: note.trim() || null, version: d.noteVersion });
      await refreshLiturgy();
      setEditing(false);
      showToast("success", "Đã lưu ý lễ.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-purple-900 inline-flex items-center gap-1.5">
          <HandHeart className="w-4 h-4" /> Ý lễ hôm nay
        </span>
        {d.canManage && !editing && (
          <button onClick={() => setEditing(true)} className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1">
            <Pencil className="w-3 h-3" /> {d.houseIntention || d.houseNote ? "Sửa" : "Thêm ý lễ"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Ý lễ của cộng đoàn, vd: Cầu cho anh em sắp thi học kỳ; cầu cho linh hồn ông cố của anh Tuấn…"
            className="w-full p-2.5 rounded-xl border border-purple-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Ghi chú phụng vụ (giờ lễ, nơi dự lễ, hướng dẫn của giáo xứ…) — không bắt buộc"
            className="w-full p-2.5 rounded-xl border border-purple-200 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-white">
              Hủy
            </button>
            <button onClick={save} disabled={busy} className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {d.houseIntention ? (
            <p className="text-sm font-semibold text-gray-900 whitespace-pre-line">{d.houseIntention}</p>
          ) : (
            <p className="text-[11px] text-gray-500">{d.canManage ? "Chưa có ý lễ riêng của nhà cho ngày này." : ""}</p>
          )}
          {d.houseNote && <p className="text-[11px] text-gray-700 whitespace-pre-line">📌 {d.houseNote}</p>}
          {d.noteUpdatedBy && (d.houseIntention || d.houseNote) && <p className="text-[10px] text-gray-400">Cập nhật bởi {d.noteUpdatedBy}</p>}
        </>
      )}
      {church.length > 0 && (
        <ul className="text-[11px] text-purple-900/90 flex flex-col gap-0.5 border-t border-purple-100 pt-2">
          {church.map((c) => (
            <li key={c}>✦ {c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Check-in đi lễ
// ---------------------------------------------------------------------
function CheckinBox({ d, onOpen }: { d: CalendarDayDetailDto; onOpen: () => void }) {
  const { showToast } = useApp();
  const req = d.requirement;
  const mine = d.myCheckin;
  const [busy, setBusy] = useState(false);
  if (!req) return null;

  const cancel = async () => {
    if (!mine) return;
    setBusy(true);
    try {
      await liturgyCalendarApi.cancelCheckin(mine.id);
      await refreshLiturgy();
      showToast("info", "Đã hủy check-in.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/60 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-black text-amber-900 inline-flex items-center gap-1.5">
            <Church className="w-4 h-4" /> Check-in đi lễ · {req.label}
          </span>
          <p className="text-[11px] text-amber-800/90 mt-0.5">
            {req.evidenceRequired ? "Cần kèm ảnh minh chứng" : "Không cần ảnh minh chứng"} · hạn hết ngày {dm(req.deadline)}
          </p>
        </div>
        {mine && (
          <span className={cn("shrink-0 px-2 py-0.5 rounded-lg border text-[10px] font-bold", CHECKIN_STATUS_CLASS[mine.status])}>
            {CHECKIN_STATUS_LABEL[mine.status]}
          </span>
        )}
      </div>
      {mine && (
        <div className="flex items-center gap-3 text-[11px] text-gray-700">
          {mine.evidenceFileId && (
            <a href={fileUrl(mine.evidenceFileId) ?? "#"} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(mine.evidenceFileId, "thumb") ?? ""} alt="Ảnh minh chứng" className="w-14 h-14 rounded-xl object-cover border border-amber-200" />
            </a>
          )}
          <div className="min-w-0">
            <p>
              Lúc {new Date(mine.checkedInAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              {mine.church ? ` · ${mine.church}` : ""}
            </p>
            {mine.note && <p className="text-gray-500">{mine.note}</p>}
            {mine.status === "rejected" && mine.reviewNote && <p className="text-rose-700 font-semibold">Lý do: {mine.reviewNote}</p>}
            {mine.reviewedByName && mine.status !== "submitted" && <p className="text-gray-400">Duyệt bởi {mine.reviewedByName}</p>}
          </div>
        </div>
      )}
      {d.checkinBlockedReason && !mine && <p className="text-[11px] text-gray-600">{d.checkinBlockedReason}</p>}
      {d.canCheckin && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs active:scale-95 transition"
          >
            <Check className="w-4 h-4" /> {mine ? (mine.status === "rejected" ? "Gửi lại minh chứng" : "Sửa check-in") : "Tôi đã đi lễ"}
          </button>
          {mine && mine.status === "submitted" && (
            <button onClick={cancel} disabled={busy} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-white">
              Hủy check-in
            </button>
          )}
        </div>
      )}
      {d.attendance && <AttendanceReview d={d} />}
    </div>
  );
}

function AttendanceReview({ d }: { d: CalendarDayDetailDto }) {
  const { showToast } = useApp();
  const a = d.attendance!;
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const missing = a.rows.filter((r) => !r.checkin);

  const review = async (row: MassCheckinRowDto, status: "approved" | "rejected" | "submitted") => {
    if (!row.checkin) return;
    if (status === "rejected" && reason.trim().length < 3) {
      showToast("error", "Nêu lý do (tối thiểu 3 ký tự).");
      return;
    }
    setBusy(row.checkin.id);
    try {
      await liturgyCalendarApi.review(row.checkin.id, status, status === "rejected" ? reason.trim() : null);
      await refreshLiturgy();
      setRejecting(null);
      setReason("");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-amber-200 pt-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-[11px] font-bold text-amber-900">
        <span>
          Cả nhà: {a.checkedIn}/{a.expected} đã check-in{a.rejected ? ` · ${a.rejected} chưa hợp lệ` : ""}
          {missing.length ? ` · ${missing.length} chưa check-in` : ""}
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5 max-h-96 overflow-y-auto custom-scroll pr-1">
          {a.rows.map((r) => (
            <li key={r.memberId} className="p-2 rounded-xl bg-white border border-gray-100 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {r.checkin?.evidenceFileId ? (
                  <a href={fileUrl(r.checkin.evidenceFileId) ?? "#"} target="_blank" rel="noreferrer" className="shrink-0" title="Xem ảnh minh chứng">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(r.checkin.evidenceFileId, "thumb") ?? ""} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200" />
                  </a>
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300 shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {r.name}
                    {r.room ? <span className="font-medium text-gray-400"> · {r.room}</span> : null}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {r.checkin
                      ? `${new Date(r.checkin.checkedInAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}${r.checkin.church ? ` · ${r.checkin.church}` : ""}`
                      : "Chưa check-in"}
                  </p>
                </div>
                {r.checkin && (
                  <span className={cn("shrink-0 px-1.5 py-0.5 rounded-md border text-[9px] font-bold", CHECKIN_STATUS_CLASS[r.checkin.status])}>
                    {r.checkin.status === "submitted" ? "Chờ duyệt" : CHECKIN_STATUS_LABEL[r.checkin.status]}
                  </span>
                )}
              </div>
              {(r.duplicateOf || r.warning) && (
                <p className="text-[10px] text-orange-700 inline-flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                  {r.duplicateOf ? `Ảnh giống ảnh của ${r.duplicateOf}. ` : ""}
                  {r.warning ?? ""}
                </p>
              )}
              {r.checkin && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.checkin.status !== "approved" && (
                    <button
                      onClick={() => review(r, "approved")}
                      disabled={busy === r.checkin.id}
                      className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100"
                    >
                      Hợp lệ
                    </button>
                  )}
                  {r.checkin.status !== "rejected" && rejecting !== r.checkin.id && (
                    <button
                      onClick={() => {
                        setRejecting(r.checkin!.id);
                        setReason("");
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold hover:bg-rose-100"
                    >
                      Không hợp lệ
                    </button>
                  )}
                  {r.checkin.status !== "submitted" && (
                    <button onClick={() => review(r, "submitted")} disabled={busy === r.checkin.id} className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-gray-50">
                      Đặt lại chờ duyệt
                    </button>
                  )}
                  {rejecting === r.checkin.id && (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Lý do (vd: ảnh không phải trong nhà thờ)"
                        className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-rose-200 text-[11px] outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <button onClick={() => review(r, "rejected")} disabled={busy === r.checkin.id} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold">
                        Gửi
                      </button>
                      <button onClick={() => setRejecting(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-50" title="Hủy">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Lời Chúa
// ---------------------------------------------------------------------
function Readings({ d, onOpenSettings }: { d: CalendarDayDetailDto; onOpenSettings?: () => void }) {
  const [alt, setAlt] = useState(false);
  const sets = d.readings;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-gray-900 inline-flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-primary" /> Lời Chúa trong Thánh lễ
        </span>
        <a href={d.officialReadingsUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-1">
          Bản chính thức (CGKPV) <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      {sets.length === 0 ? (
        <div className="p-3 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-[11px] text-gray-600">
          Chưa có dữ liệu Lời Chúa cho ngày này. Xem bản chính thức ở liên kết bên trên.
          {d.canManage && onOpenSettings && (
            <button onClick={onOpenSettings} className="ml-1 font-bold text-primary hover:underline">
              Nạp dữ liệu Lời Chúa
            </button>
          )}
        </div>
      ) : (
        sets.map((s, i) => <ReadingSet key={`${s.key}-${i}`} set={s} defaultOpen={i === 0} />)
      )}
      {d.altReadings.length > 0 && (
        <div>
          <button onClick={() => setAlt((v) => !v)} className="text-[11px] font-bold text-gray-500 hover:text-primary inline-flex items-center gap-1">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", alt && "rotate-180")} /> Bài đọc khác có thể chọn ({d.altReadings.length})
          </button>
          {alt && d.altReadings.map((s, i) => <ReadingSet key={`alt-${s.key}-${i}`} set={{ ...s, label: s.label ?? "Bài đọc riêng của lễ nhớ" }} defaultOpen={false} />)}
        </div>
      )}
      <p className="text-[10px] text-gray-400">
        Trích dẫn và bản văn lấy từ dữ liệu mở trên GitHub; nếu có khác biệt, theo bản chính thức của Nhóm Phiên Dịch CGKPV.
      </p>
    </div>
  );
}

function ReadingSet({ set, defaultOpen }: { set: ReadingSetDto; defaultOpen: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden">
      {set.label && <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-black text-gray-600 uppercase tracking-wider">{set.label}</div>}
      <div className="divide-y divide-gray-100">
        {set.slots.map((s, i) => (
          <Slot key={`${s.kind}-${i}`} s={s} defaultOpen={defaultOpen && s.kind === "gospel"} />
        ))}
      </div>
    </div>
  );
}

function Slot({ s, defaultOpen }: { s: ReadingSlotDto; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = !!(s.text || s.verses?.length);
  return (
    <div className="px-3 py-2">
      <button onClick={() => hasBody && setOpen((o) => !o)} className={cn("w-full text-left flex items-start gap-2", hasBody ? "cursor-pointer" : "cursor-default")}>
        <span className={cn("shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase", s.kind === "gospel" ? "bg-primary text-white" : "bg-purple-50 text-purple-700")}>
          {s.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-gray-900">{s.ref ?? ""}</span>
          {s.headline && <span className="block text-[11px] italic text-gray-600">{s.headline}</span>}
          {s.kind === "psalm" && s.response && <span className="block text-[11px] font-semibold text-purple-800">Đ. {s.response}</span>}
        </span>
        {hasBody && <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && hasBody && (
        <div className="mt-2 pl-1 text-[13px] leading-relaxed text-gray-800">
          {s.intro && <p className="text-[11px] font-bold text-gray-500 mb-1">{s.intro}</p>}
          {s.text && <p className="whitespace-pre-line">{s.text}</p>}
          {s.verses?.map((v, i) => (
            <p key={i} className="mb-1">
              {v}
              {s.response && <span className="block text-[11px] font-semibold text-purple-800">Đ. {s.response}</span>}
            </p>
          ))}
          {s.end && <p className="text-[11px] font-bold text-gray-500 mt-1">{s.end}</p>}
        </div>
      )}
    </div>
  );
}
