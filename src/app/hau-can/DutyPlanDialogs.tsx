"use client";

// Hộp thoại của tab Trực vệ sinh sân nhà: XẾP LỊCH TỰ ĐỘNG nhiều tuần (xem trước → sửa tay → lưu một lần) và XUẤT EXCEL lịch trực.
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, FileSpreadsheet, Loader2, Lock, Sparkles, Wand2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { addDays, weekRangeLabel } from "@/lib/duty-format";
import { dutyWeeksApi, refreshDuty } from "@/lib/data/duty";
import {
  DUTY_PLAN_MAX_WEEKS,
  DUTY_PLAN_MIN_WEEKS,
  type DutyCandidateDto,
  type DutyPlanAction,
  type DutyPlanDto,
  type DutyWeekEntryDto,
} from "@/lib/types/duty";
import { CustomDateRangePicker, CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";
import { cn } from "@/lib/utils";

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ACTION: Record<DutyPlanAction, { label: string; cls: string }> = {
  fill: { label: "Xếp mới", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overwrite: { label: "Thay người", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  keep: { label: "Giữ nguyên", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  locked: { label: "Đã đánh giá", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

const editable = (a: DutyPlanAction) => a === "fill" || a === "overwrite";

// ---------------------------------------------------------------------
// Xếp lịch tự động
// ---------------------------------------------------------------------
export function AutoPlanModal({
  open,
  onClose,
  thisWeekStart,
  timeline,
}: {
  open: boolean;
  onClose: () => void;
  thisWeekStart: string;
  /** Các tuần đã có lịch (để chọn tuần bắt đầu mặc định = tuần trống đầu tiên) */
  timeline: DutyWeekEntryDto[];
}) {
  const { showToast } = useApp();
  const firstEmpty = useMemo(() => {
    const busy = new Set(timeline.filter((t) => t.members.length > 0).map((t) => t.weekStart));
    for (let i = 0; i < 12; i++) {
      const ws = addDays(thisWeekStart, 7 * i);
      if (!busy.has(ws)) return ws;
    }
    return addDays(thisWeekStart, 7);
  }, [timeline, thisWeekStart]);
  const [from, setFrom] = useState(firstEmpty);
  const [weeks, setWeeks] = useState(DUTY_PLAN_MIN_WEEKS);
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState<DutyPlanDto | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFrom(firstEmpty);
    setWeeks(DUTY_PLAN_MIN_WEEKS);
    setOverwrite(false);
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Xem trước mỗi khi đổi tuần bắt đầu / số tuần / ghi đè (không ghi gì)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    dutyWeeksApi
      .plan(from, weeks, overwrite)
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        setDraft(Object.fromEntries(p.weeks.filter((w) => editable(w.action)).map((w) => [w.weekStart, w.proposed.map((m) => m.id)])));
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, from, weeks, overwrite]);

  const starts = useMemo(() => Array.from({ length: 12 }, (_, i) => addDays(thisWeekStart, 7 * i)), [thisWeekStart]);
  const byId = useMemo(() => new Map((plan?.candidates ?? []).map((c) => [c.id, c])), [plan]);
  const options = useMemo(
    () =>
      (plan?.candidates ?? []).map((c: DutyCandidateDto) => ({
        value: c.id,
        label: c.fullName,
        subLabel: `${c.room ? `P.${c.room} · ` : ""}${c.recentCount} tuần gần đây · ${c.lastWeek ? `gần nhất ${dm(c.lastWeek)}` : "chưa từng trực"}`,
      })),
    [plan]
  );
  const toSave = (plan?.weeks ?? []).filter((w) => editable(w.action));
  const problems = toSave
    .map((w) => {
      const ids = (draft[w.weekStart] ?? []).filter(Boolean);
      if (!ids.length) return `Tuần ${dm(w.weekStart)}: chưa chọn người trực.`;
      if (new Set(ids).size !== ids.length) return `Tuần ${dm(w.weekStart)}: một người được chọn hai lần.`;
      return null;
    })
    .filter(Boolean) as string[];
  // Cảnh báo mềm: một người trực hai tuần liền nhau
  const backToBack = useMemo(() => {
    const list = (plan?.weeks ?? []).map((w) => ({ ws: w.weekStart, ids: editable(w.action) ? draft[w.weekStart] ?? [] : w.existing.map((m) => m.id) }));
    const out: string[] = [];
    for (let i = 1; i < list.length; i++)
      for (const id of list[i].ids) if (id && list[i - 1].ids.includes(id)) out.push(`${byId.get(id)?.fullName ?? "Một người"} trực liền hai tuần ${dm(list[i - 1].ws)} và ${dm(list[i].ws)}`);
    return out;
  }, [plan, draft, byId]);

  const setPerson = (ws: string, slot: number, id: string) =>
    setDraft((d) => {
      const cur = [...(d[ws] ?? [])];
      cur[slot] = id;
      return { ...d, [ws]: cur.filter((x, i) => x || i < slot) };
    });

  const save = async () => {
    if (!plan) return;
    if (problems.length) return setError(problems[0]);
    if (!toSave.length) return setError("Không có tuần nào cần xếp — các tuần đã có người (bật “Ghi đè” nếu muốn xếp lại).");
    setSaving(true);
    setError(null);
    try {
      const r = await dutyWeeksApi.saveMany({ weeks: toSave.map((w) => ({ weekStart: w.weekStart, memberIds: (draft[w.weekStart] ?? []).filter(Boolean) })), overwrite });
      await refreshDuty();
      showToast("success", `Đã lưu lịch trực ${r.saved.length} tuần — người được xếp đã nhận thông báo.${r.skipped.length ? ` Bỏ qua ${r.skipped.length} tuần.` : ""}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      icon={<Wand2 className="w-5 h-5" />}
      title="Xếp lịch trực tự động"
      subtitle="Theo thứ tự công bằng: ít lượt trực gần đây nhất → lâu nhất chưa trực. Xem trước, sửa tay từng tuần rồi lưu một lần."
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button onClick={save} disabled={saving || loading || !plan || toSave.length === 0} className={btnPrimary}>
            {saving ? "Đang lưu..." : `Lưu ${toSave.length} tuần`}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomSelect
          label="Bắt đầu từ tuần"
          value={from}
          onChange={setFrom}
          options={starts.map((ws) => ({ value: ws, label: weekRangeLabel(ws), subLabel: ws === thisWeekStart ? "Tuần này" : ws === addDays(thisWeekStart, 7) ? "Tuần sau" : undefined }))}
        />
        <div>
          <span className="block text-xs font-bold text-gray-700 mb-1.5">Số tuần</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Số tuần">
            {Array.from({ length: DUTY_PLAN_MAX_WEEKS - DUTY_PLAN_MIN_WEEKS + 1 }, (_, i) => DUTY_PLAN_MIN_WEEKS + i).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={weeks === n}
                onClick={() => setWeeks(n)}
                className={cn(
                  "w-10 h-10 rounded-xl text-sm font-extrabold border transition tabular-nums",
                  weeks === n ? "bg-primary text-white border-primary shadow-xs" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CustomToggle
        checked={overwrite}
        onChange={setOverwrite}
        label="Ghi đè tuần đã có người"
        description="Tắt: tuần đã xếp người được giữ nguyên. Bật: xếp lại cả các tuần đó (tuần đã đánh giá không bao giờ bị đổi)."
      />

      {loading && !plan ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : plan ? (
        <ul className={cn("flex flex-col gap-2 transition-opacity", loading && "opacity-60")}>
          {plan.weeks.map((w) => {
            const a = ACTION[w.action];
            const ids = draft[w.weekStart] ?? [];
            return (
              <li key={w.weekStart} className={cn("p-3 rounded-2xl border flex flex-col gap-2", editable(w.action) ? "border-purple-100 bg-purple-50/30" : "border-gray-100 bg-gray-50/50")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900 inline-flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-primary" /> Tuần {weekRangeLabel(w.weekStart)}
                    {w.weekStart === plan.thisWeekStart && <span className="text-[10px] font-bold text-primary">· tuần này</span>}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1", a.cls)}>
                    {w.action === "locked" && <Lock className="w-3 h-3" />}
                    {a.label}
                  </span>
                </div>
                {editable(w.action) ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Array.from({ length: plan.peoplePerWeek }, (_, slot) => (
                        <CustomSelect
                          key={slot}
                          aria-label={`Người trực ${slot + 1} tuần ${dm(w.weekStart)}`}
                          value={ids[slot] ?? ""}
                          onChange={(v) => setPerson(w.weekStart, slot, v)}
                          placeholder={slot === 0 ? "Chọn người trực…" : "Người thứ hai (tùy chọn)…"}
                          options={[...(slot > 0 ? [{ value: "", label: "— Không có người thứ hai —" }] : []), ...options]}
                        />
                      ))}
                    </div>
                    {w.action === "overwrite" && w.existing.length > 0 && (
                      <p className="text-[11px] text-amber-800">Thay cho: {w.existing.map((m) => m.fullName).join(" & ")} (sẽ nhận thông báo đổi lịch).</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-600">
                    {w.existing.map((m) => m.fullName).join(" & ") || "—"}
                    {w.action === "keep" ? <span className="text-gray-400"> · đã xếp từ trước</span> : null}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {backToBack.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{backToBack.slice(0, 3).join("; ")}.</span>
        </div>
      )}
      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1.5">
        <Sparkles className="w-3.5 h-3.5 mt-px shrink-0 text-primary" />
        Người được xếp nhận thông báo ngay khi lưu; sáng Thứ Hai đầu mỗi tuần hệ thống nhắc lại từng người.
      </p>
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Xuất Excel lịch trực
// ---------------------------------------------------------------------
export function DutyExportModal({ open, onClose, thisWeekStart }: { open: boolean; onClose: () => void; thisWeekStart: string }) {
  const { showToast } = useApp();
  const presets = useMemo(
    () => [
      { key: "half", label: "6 tháng qua + sắp tới", from: addDays(thisWeekStart, -26 * 7), to: addDays(thisWeekStart, 12 * 7 + 6) },
      { key: "year", label: `Năm ${thisWeekStart.slice(0, 4)}`, from: `${thisWeekStart.slice(0, 4)}-01-01`, to: `${thisWeekStart.slice(0, 4)}-12-31` },
      { key: "upcoming", label: "Các tuần sắp tới", from: thisWeekStart, to: addDays(thisWeekStart, 12 * 7 + 6) },
    ],
    [thisWeekStart]
  );
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setFrom(presets[0].from);
    setTo(presets[0].to);
    setError(null);
  }, [open, presets]);

  const download = async () => {
    if (!from || !to || to < from) return setError("Chọn khoảng ngày hợp lệ.");
    setBusy(true);
    setError(null);
    try {
      const h = await dutyWeeksApi.history(from, to);
      if (!h.weeks.some((w) => w.members.length)) return setError("Khoảng ngày này chưa có tuần nào được xếp lịch.");
      await (await import("@/lib/export/duty-weeks-xlsx")).downloadDutyWeeksXlsx(h);
      showToast("success", "Đã tải lịch trực ra Excel.");
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
      icon={<FileSpreadsheet className="w-5 h-5" />}
      title="Xuất Excel lịch trực"
      subtitle="Lịch các tuần (người trực, ghi chú) kèm kết quả đánh giá: điểm, xếp loại, nhận xét, yêu cầu trực lại"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Đóng
          </button>
          <button onClick={download} disabled={busy} className={btnPrimary}>
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tạo tệp…
              </span>
            ) : (
              "Tải Excel"
            )}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[11px] font-bold border transition",
              from === p.from && to === p.to ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <CustomDateRangePicker
        label="Các tuần có Thứ Hai trong khoảng"
        startDate={from}
        endDate={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      <ErrorBox error={error} />
    </DialogShell>
  );
}
