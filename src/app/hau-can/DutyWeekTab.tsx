"use client";

// Trực vệ sinh sân nhà THEO TUẦN: mỗi tuần 1–2 người. Trưởng nhà/Admin xếp lịch (người được xếp nhận thông báo), hết tuần chấm điểm 0–10,
// nhận xét và có thể yêu cầu trực lại. Không còn khu vực/ca/check-in/nghiệm thu từng ca.
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage, fileUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/zaloShare";
import { addDays, weekRangeLabel } from "@/lib/duty-format";
import { dutyWeeksApi, refreshDuty, useDutyBoard } from "@/lib/data/duty";
import { useOrgSettings } from "@/lib/data/settings";
import { DUTY_WEEK_MAX_MEMBERS, type DutyWeekEntryDto, type DutyWeekMemberDto } from "@/lib/types/duty";
import { CustomInput, CustomTextarea } from "@/components/ui/FormControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";
import { cn } from "@/lib/utils";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Mức điểm: màu, nhãn và mã màu cho vòng tròn điểm (SVG). */
const scoreTone = (s: number) =>
  s >= 10
    ? { bar: "bg-emerald-600", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", label: "Xuất sắc", hex: "#059669" }
    : s >= 8
      ? { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", label: "Tốt", hex: "#10b981" }
      : s >= 5
        ? { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Đạt", hex: "#f59e0b" }
        : { bar: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50 border-rose-200", label: "Chưa đạt", hex: "#f43f5e" };

/** Vòng tròn hiển thị điểm 0–10. */
function ScoreRing({ score, size = 112 }: { score: number | null; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const tone = score === null ? null : scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
        {score !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone!.hex} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 10)} className="transition-all duration-500" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-black leading-none tabular-nums", score === null ? "text-gray-300 text-3xl" : `${tone!.text} text-4xl`)}>{score ?? "–"}</span>
        <span className="text-[10px] font-bold text-gray-400 mt-1">/ 10</span>
      </div>
    </div>
  );
}

const COMMENT_SUGGESTIONS = ["Sân sạch sẽ, gọn gàng", "Làm đúng giờ, nhiệt tình", "Cần quét kỹ hơn góc sân", "Còn lá khô / rác ở góc vườn", "Quên đổ rác"];

function Avatar({ m, size = "w-14 h-14 text-lg" }: { m: Pick<DutyWeekMemberDto, "name" | "avatarFileId">; size?: string }) {
  const url = fileUrl(m.avatarFileId, "thumb");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("rounded-full object-cover ring-2 ring-white shadow-xs shrink-0", size)} />
  ) : (
    <div className={cn("rounded-full bg-purple-600 text-white font-bold flex items-center justify-center ring-2 ring-white shadow-xs shrink-0", size)}>
      {m.name.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

export function DutyWeekSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Đang tải lịch trực">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="w-64 h-10 rounded-xl" />
        <Skeleton className="w-28 h-9 rounded-xl" />
      </div>
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-5">
        <Skeleton className="w-56 h-5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100">
              <Skeleton className="w-14 h-14 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-32 h-4" />
                <Skeleton className="w-20 h-3" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-36 h-9 rounded-xl" />
          <Skeleton className="w-32 h-9 rounded-xl" />
        </div>
      </div>
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-3">
        <Skeleton className="w-40 h-5" />
        <Skeleton className="w-full h-16 rounded-2xl" />
        <Skeleton className="w-full h-16 rounded-2xl" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hộp thoại xếp người trực
// ---------------------------------------------------------------------
function AssignModal({
  open,
  onClose,
  weekStart,
  current,
  candidates,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  current: DutyWeekEntryDto;
  candidates: { id: string; name: string; fullName: string; room: string | null; recentCount: number; lastWeek: string | null }[];
  preselect?: string[] | null;
}) {
  const { showToast } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [zalo, setZalo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(preselect ?? current.members.map((m) => m.id));
    setNote(current.note ?? "");
    setQ("");
    setError(null);
    setZalo(true);
  }, [open, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const known = new Set(candidates.map((c) => c.id));
    // Người đang được xếp nhưng không còn trong danh sách "đang ở" vẫn hiện để bỏ chọn được
    const extra = current.members.filter((m) => !known.has(m.id)).map((m) => ({ id: m.id, name: m.name, fullName: m.fullName, room: m.room, recentCount: 0, lastWeek: null as string | null }));
    const all = [...extra, ...candidates];
    const s = q.trim().toLowerCase();
    return s ? all.filter((c) => c.fullName.toLowerCase().includes(s) || c.name.toLowerCase().includes(s) || (c.room ?? "").toLowerCase().includes(s)) : all;
  }, [candidates, current.members, q]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= DUTY_WEEK_MAX_MEMBERS ? [...p.slice(1), id] : [...p, id]));
  const suggest = () => setPicked(candidates.slice(0, DUTY_WEEK_MAX_MEMBERS).map((c) => c.id));

  const save = async () => {
    setError(null);
    if (!picked.length) return setError("Chọn ít nhất 1 người trực.");
    setBusy(true);
    try {
      const r = await dutyWeeksApi.save({ weekStart, memberIds: picked, note: note.trim() || null, notifyZalo: zalo });
      await refreshDuty();
      showToast("success", `Đã xếp lịch trực tuần ${weekRangeLabel(weekStart)} — người trực đã nhận thông báo.`);
      if (zalo && r.zalo && !r.zalo.sent && r.zalo.reason) showToast("info", `Chưa gửi nhóm Zalo: ${r.zalo.reason}`);
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
      icon={<UserPlus className="w-5 h-5" />}
      title="Xếp người trực vệ sinh sân nhà"
      subtitle={`Tuần ${weekRangeLabel(weekStart)} · chọn ${DUTY_WEEK_MAX_MEMBERS} người`}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy || !picked.length} onClick={save} className={btnPrimary}>
            {busy ? "Đang lưu..." : `Lưu lịch trực (${picked.length}/${DUTY_WEEK_MAX_MEMBERS})`}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, số phòng..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none transition"
          />
        </div>
        <button type="button" onClick={suggest} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold" title="Chọn 2 người trực ít nhất / lâu nhất chưa trực">
          <Sparkles className="w-3.5 h-3.5" /> Gợi ý luân phiên
        </button>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {list.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => toggle(c.id)}
              className={cn("w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition", on ? "border-primary bg-purple-50/60" : "border-gray-100 hover:bg-gray-50")}
            >
              <span className={cn("w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-white text-[11px] font-black", on ? "bg-primary border-primary" : "border-gray-300")}>{on ? "✓" : ""}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-gray-900 truncate">{c.fullName}</div>
                <div className="text-[11px] text-gray-400">{c.room ?? "Chưa xếp phòng"}</div>
              </div>
              <div className="text-right shrink-0 text-[10px] text-gray-500 leading-tight">
                <div className="font-semibold">{c.recentCount} tuần gần đây</div>
                <div>{c.lastWeek ? `Gần nhất ${dm(c.lastWeek)}` : "Chưa từng trực"}</div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && <p className="py-6 text-center text-xs text-gray-400">Không có thành viên phù hợp.</p>}
      </div>
      <CustomTextarea label="Ghi chú cho người trực (tùy chọn)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Quét sân, nhổ cỏ góc vườn, đổ rác trước 7h sáng…" maxLength={500} />
      <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
        <input type="checkbox" checked={zalo} onChange={(e) => setZalo(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#5f3add]" />
        <span>
          Gửi lịch trực vào nhóm Zalo của nhà <span className="text-gray-400">(chỉ gửi khi đã bật tích hợp ở Cài đặt → Tích hợp Zalo)</span>
        </span>
      </label>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Thẻ đánh giá
// ---------------------------------------------------------------------
function ReviewCard({
  week,
  canReview,
  today,
  onRedo,
}: {
  week: DutyWeekEntryDto;
  canReview: boolean;
  today: string;
  onRedo: () => void;
}) {
  const { showToast } = useApp();
  const r = week.review;
  const started = week.weekStart <= today;
  const ended = week.weekEnd < today;
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [redo, setRedo] = useState(false);
  const [redoNote, setRedoNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setScore(r?.score ?? null);
    setComment(r?.comment ?? "");
    setRedo(r?.redoRequired ?? false);
    setRedoNote(r?.redoNote ?? "");
    setError(null);
  }, [week.id, r?.reviewedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!week.id || week.members.length === 0) return null;

  const save = async () => {
    if (score === null) return setError("Hãy chọn điểm từ 0 đến 10.");
    setBusy(true);
    setError(null);
    try {
      await dutyWeeksApi.review(week.id!, { score, comment: comment.trim() || null, redo, redoNote: redo ? redoNote.trim() || null : null });
      await refreshDuty();
      showToast("success", "Đã lưu đánh giá — người trực đã nhận thông báo.");
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const showForm = canReview && started && (!r || editing);
  const preview = score;

  return (
    <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-amber-50/60 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Star className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900 leading-tight">Đánh giá tuần trực</h3>
            <p className="text-[11px] text-gray-500">Thang điểm 0 – 10 · Trưởng nhà / Admin chấm</p>
          </div>
        </div>
        {r && canReview && !editing && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary bg-purple-50 hover:bg-purple-100">
            Sửa đánh giá
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6">
        {r && !editing ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex items-center gap-4">
                <ScoreRing score={r.score} />
                <div>
                  <span className={cn("inline-block px-3 py-1 rounded-full border text-xs font-extrabold", scoreTone(r.score).bg, scoreTone(r.score).text)}>{scoreTone(r.score).label}</span>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {r.reviewerName ? `${r.reviewerName} · ` : ""}
                    {new Date(r.reviewedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {r.comment ? (
                  <blockquote className="relative pl-4 border-l-4 border-purple-200 text-sm text-gray-700 leading-relaxed whitespace-pre-line">{r.comment}</blockquote>
                ) : (
                  <p className="text-xs text-gray-400 italic">Không có nhận xét.</p>
                )}
              </div>
            </div>
            {r.redoRequired && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0 text-xs text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <b>Yêu cầu trực lại.</b> {r.redoNote}
                  </div>
                </div>
                {canReview && (
                  <button onClick={onRedo} className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-100">
                    <RotateCcw className="w-3.5 h-3.5" /> Xếp trực lại tuần sau
                  </button>
                )}
              </div>
            )}
          </div>
        ) : showForm ? (
          <div className="flex flex-col gap-5">
            {!ended && <p className="text-[11px] text-gray-500 p-2.5 rounded-xl bg-surface-container-low/70">Tuần này chưa kết thúc — thường đánh giá sau Chúa Nhật, nhưng bạn có thể chấm sớm.</p>}

            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
              <div className="flex flex-col items-center gap-2 sm:w-36 shrink-0">
                <ScoreRing score={preview} />
                <span className={cn("text-xs font-extrabold", preview === null ? "text-gray-400" : scoreTone(preview).text)}>{preview === null ? "Chưa chọn điểm" : scoreTone(preview).label}</span>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-gray-700 mb-2">Chọn điểm</label>
                <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                  {Array.from({ length: 11 }).map((_, i) => {
                    const t = scoreTone(i);
                    const on = score === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setScore(i)}
                        aria-pressed={on}
                        className={cn(
                          "h-11 rounded-xl text-sm font-extrabold border transition tabular-nums",
                          on ? `${t.bar} text-white border-transparent shadow-md scale-105` : "bg-white text-gray-700 border-gray-200 hover:border-purple-300 hover:bg-purple-50/50",
                        )}
                      >
                        {i}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-gray-500">
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-rose-500" /> 0–4 Chưa đạt</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-amber-500" /> 5–7 Đạt</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-500" /> 8–9 Tốt</span>
                  <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-600" /> 10 Xuất sắc</span>
                </div>
              </div>
            </div>

            <div>
              <CustomTextarea label="Nhận xét" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nhận xét ngắn về kết quả dọn dẹp trong tuần…" maxLength={1000} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMENT_SUGGESTIONS.map((t) => (
                  <button key={t} type="button" onClick={() => setComment((c) => (c.trim() ? `${c.trim()}. ${t}` : t))} className="px-2.5 py-1 rounded-full bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-primary text-[11px] font-semibold transition">
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className={cn("rounded-2xl border p-3.5 transition", redo ? "bg-rose-50/70 border-rose-200" : "bg-gray-50/60 border-gray-100")}>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span>
                  <span className="block text-xs font-bold text-gray-900">Yêu cầu trực lại</span>
                  <span className="block text-[11px] text-gray-500">Bật nếu kết quả chưa đạt, hai bạn cần trực bù.</span>
                </span>
                <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} className="w-5 h-5 accent-[#e11d48] shrink-0" />
              </label>
              {redo && <div className="mt-3"><CustomInput placeholder="Việc cần làm lại (tùy chọn)" value={redoNote} onChange={(e) => setRedoNote(e.target.value)} maxLength={500} /></div>}
            </div>

            <ErrorBox error={error} />
            <div className="flex justify-end gap-2">
              {editing && (
                <button onClick={() => setEditing(false)} className={btnGhost}>
                  Hủy
                </button>
              )}
              <button disabled={busy || score === null} onClick={save} className={btnPrimary}>
                {busy ? "Đang lưu..." : r ? "Cập nhật đánh giá" : "Lưu đánh giá"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 py-2">
            <ScoreRing score={null} size={84} />
            <p className="text-xs text-gray-500">
              {!started ? "Chưa đến tuần trực — chưa có đánh giá." : ended ? "Đang chờ Trưởng nhà đánh giá kết quả tuần này." : "Trưởng nhà sẽ đánh giá sau khi hết tuần."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tab chính
// ---------------------------------------------------------------------
export default function DutyWeekTab({ week, onWeekChange }: { week: string; onWeekChange: (w: string) => void }) {
  const { showToast } = useApp();
  const { org } = useOrgSettings();
  const { board, isLoading, error } = useDutyBoard(week || null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [preselect, setPreselect] = useState<string[] | null>(null);
  const [assignWeek, setAssignWeek] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!board) {
    if (error) return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được lịch trực: {errorMessage(error)}</div>;
    return <DutyWeekSkeleton />;
  }

  const { week: w, canManage, canReview, today, thisWeekStart } = board;
  const rel = w.weekStart === thisWeekStart ? "Tuần này" : w.weekStart > thisWeekStart ? (w.weekStart === addDays(thisWeekStart, 7) ? "Tuần sau" : "Sắp tới") : "Đã qua";
  const hasMembers = w.members.length > 0;
  const reviewed = !!w.review;
  const go = (delta: number) => onWeekChange(addDays(w.weekStart, delta * 7));

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) showToast("success", msg);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const openAssign = (forWeek: string, pre?: string[] | null) => {
    setAssignWeek(forWeek);
    setPreselect(pre ?? null);
    setAssignOpen(true);
  };
  const assignEntry = assignWeek && assignWeek !== w.weekStart ? board.timeline.find((t) => t.weekStart === assignWeek) ?? { ...w, id: null, weekStart: assignWeek, weekEnd: addDays(assignWeek, 6), members: [], note: null, review: null, isMine: false } : w;

  return (
    <div className="flex flex-col gap-5">
      {/* Điều hướng tuần */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700" aria-label="Tuần trước">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 rounded-xl bg-white border border-purple-100 shadow-2xs min-w-[210px] text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-primary">{rel}</div>
            <div className="text-sm font-extrabold text-gray-900">{weekRangeLabel(w.weekStart)}</div>
          </div>
          <button onClick={() => go(1)} className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700" aria-label="Tuần sau">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {w.weekStart !== thisWeekStart && (
          <button onClick={() => onWeekChange(thisWeekStart)} className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold">
            <CalendarCheck2 className="w-3.5 h-3.5" /> Về tuần này
          </button>
        )}
      </div>

      {/* Người trực */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">🧹 Trực vệ sinh sân nhà</h2>
            <p className="text-xs text-gray-500">Mỗi tuần {board.peoplePerWeek} bạn cùng dọn dẹp sân nhà · Trưởng nhà đánh giá sau khi hết tuần</p>
          </div>
          {w.isMine && <span className="px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-bold">Bạn trực tuần này</span>}
        </div>

        {hasMembers ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {w.members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 p-4 rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/60 to-white">
                <Avatar m={m} />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-gray-900 truncate">{m.fullName}</div>
                  <div className="text-xs text-gray-500">{m.room ? `Phòng ${m.room}` : "Chưa xếp phòng"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl border border-dashed border-gray-200 text-center">
            <div className="text-3xl mb-1">🧹</div>
            <p className="text-sm font-bold text-gray-800">Tuần này chưa xếp người trực</p>
            <p className="text-xs text-gray-500 mt-0.5">{canManage ? "Bấm “Xếp người trực” để chọn 2 bạn." : "Trưởng nhà sẽ xếp lịch và báo cho bạn."}</p>
          </div>
        )}

        {w.note && <p className="text-xs text-gray-700 p-3 rounded-xl bg-amber-50/60 border border-amber-100">📝 {w.note}</p>}
        {w.review?.redoRequired && (
          <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Tuần này bị yêu cầu trực lại
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              onClick={() => openAssign(w.weekStart)}
              disabled={reviewed}
              title={reviewed ? "Tuần đã đánh giá — không đổi người trực" : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" /> {hasMembers ? "Sửa người trực" : "Xếp người trực"}
            </button>
          )}
          {canManage && hasMembers && w.weekEnd >= today && (
            <button
              onClick={() => run("remind", async () => `Đã nhắc ${(await dutyWeeksApi.remind(w.id!)).reminded} người trực.`)}
              disabled={busy === "remind"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition active:scale-95 disabled:opacity-60"
            >
              <BellRing className="w-4 h-4" /> Nhắc người trực
            </button>
          )}
          {canManage && hasMembers && (
            <button
              onClick={() =>
                run("zalo", async () => {
                  const r = await dutyWeeksApi.sendZalo(w.id!);
                  if (r.sent) return "Đã gửi lịch trực vào nhóm Zalo.";
                  const copied = r.text ? await copyTextToClipboard(r.text) : false;
                  showToast("info", `Chưa gửi được qua bot: ${r.reason ?? "không rõ lý do"}.${copied ? " Đã sao chép nội dung — hãy dán vào nhóm." : ""}`);
                })
              }
              disabled={busy === "zalo"}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition active:scale-95 disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> Gửi nhóm Zalo
            </button>
          )}
          {canManage && hasMembers && !reviewed && (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold ml-auto">
              <Trash2 className="w-4 h-4" /> Xóa lịch
            </button>
          )}
        </div>
      </div>

      <ReviewCard week={w} canReview={canReview} today={today} onRedo={() => openAssign(addDays(w.weekStart, 7), w.members.map((m) => m.id))} />

      {/* Các tuần gần đây */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-gray-900">Các tuần gần đây</h3>
        {board.timeline.length === 0 ? (
          <p className="text-xs text-gray-400 py-3">{isLoading ? "Đang tải…" : "Chưa có tuần nào được xếp lịch."}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {board.timeline.map((t) => {
              const active = t.weekStart === w.weekStart;
              return (
                <button
                  key={t.weekStart}
                  onClick={() => onWeekChange(t.weekStart)}
                  className={cn("w-full flex items-center gap-3 py-3 px-2 text-left rounded-xl transition", active ? "bg-purple-50/60" : "hover:bg-gray-50")}
                >
                  <div className="w-24 shrink-0">
                    <div className="text-xs font-bold text-gray-900">{dm(t.weekStart)} – {dm(t.weekEnd)}</div>
                    <div className="text-[10px] text-gray-400">{t.weekStart === thisWeekStart ? "Tuần này" : t.weekStart > thisWeekStart ? "Sắp tới" : t.weekStart.slice(0, 4)}</div>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex -space-x-2 shrink-0">
                      {t.members.map((m) => (
                        <Avatar key={m.id} m={m} size="w-7 h-7 text-[10px]" />
                      ))}
                    </div>
                    <span className="text-xs text-gray-700 truncate">{t.members.map((m) => m.name).join(" & ")}</span>
                    {t.isMine && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">Bạn</span>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {t.review?.redoRequired && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">Trực lại</span>}
                    {t.review ? (
                      <span className={cn("px-2 py-0.5 rounded-lg border text-[11px] font-extrabold", scoreTone(t.review.score).bg, scoreTone(t.review.score).text)}>{t.review.score}/10</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">{t.weekEnd < today ? "Chờ đánh giá" : ""}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {canManage && (
        <AssignModal
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          weekStart={assignWeek ?? w.weekStart}
          current={assignEntry}
          candidates={board.candidates}
          preselect={preselect}
        />
      )}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          run("delete", async () => {
            await dutyWeeksApi.remove(w.id!);
            await refreshDuty();
            return "Đã xóa lịch trực của tuần này.";
          })
        }
        title="Xóa lịch trực tuần này?"
        message={`Người trực tuần ${weekRangeLabel(w.weekStart)} sẽ nhận thông báo hủy lịch.`}
        confirmText="Xóa lịch"
        cancelText="Giữ lại"
        variant="danger"
      />
    </div>
  );
}
