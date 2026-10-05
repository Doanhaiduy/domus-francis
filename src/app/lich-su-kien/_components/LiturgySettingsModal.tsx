"use client";

import React, { useMemo, useState } from "react";
import { BellRing, BookOpen, CalendarHeart, Loader2, Pencil, Plus, Settings2, Star, Trash2, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomSelect, CustomTextarea, CustomTimePicker, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { refreshSettings, settingsApi, useSettings } from "@/lib/data/settings";
import { liturgyCalendarApi, refreshLiturgy, useLectionaryStatus, useSpecialDays } from "@/lib/data/liturgy-calendar";
import { feastToLabel, labelToFeast, validateSettingValue } from "@/lib/types/settings";
import { SPECIAL_DAY_COLORS, type SpecialDayColor, type SpecialDayDto, type SpecialDayInput } from "@/lib/types/liturgy";
import { SPECIAL_COLOR } from "./liturgy-style";

type Tab = "special" | "patron" | "lectionary";

interface Props {
  onClose: () => void;
}

/** Cấu hình lịch phụng vụ của nhà: ngày đặc biệt, ngày Bổn mạng + nhắc lễ + check-in đi lễ, nạp Lời Chúa. */
export default function LiturgySettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("special");
  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-purple-50 my-auto flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">Cấu hình lịch phụng vụ</h3>
                  <p className="text-[11px] text-gray-500">Ngày đặc biệt của nhà, lễ Bổn mạng, nhắc lễ, check-in đi lễ và dữ liệu Lời Chúa</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500" title="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pt-3 flex gap-1.5 overflow-x-auto custom-scroll">
              {(
                [
                  ["special", CalendarHeart, "Ngày đặc biệt"],
                  ["patron", BellRing, "Bổn mạng, nhắc lễ & check-in"],
                  ["lectionary", BookOpen, "Lời Chúa"],
                ] as const
              ).map(([k, Icon, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition",
                    tab === k ? "bg-primary text-white" : "bg-surface-container-low text-gray-600 hover:bg-purple-100"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="p-5 overflow-y-auto custom-scroll">
              {tab === "special" && <SpecialDaysTab />}
              {tab === "patron" && <PatronTab />}
              {tab === "lectionary" && <LectionaryTab />}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------
const EMPTY: SpecialDayInput = { title: "", description: "", month: 1, day: 1, year: null, color: "gold", requiresCheckin: false, evidenceRequired: true, notify: true, isActive: true };
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));
const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function SpecialDaysTab() {
  const { showToast } = useApp();
  const { items, patron, canManage, isLoading } = useSpecialDays();
  const [form, setForm] = useState<(SpecialDayInput & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<SpecialDayDto | null>(null);
  const thisYear = new Date().getFullYear();

  const save = async () => {
    if (!form) return;
    if (form.title.trim().length < 3) {
      showToast("error", "Nhập tên ngày (tối thiểu 3 ký tự).");
      return;
    }
    setBusy(true);
    try {
      const body: SpecialDayInput = { ...form, title: form.title.trim(), description: form.description?.trim() || null };
      if (form.id) await liturgyCalendarApi.updateSpecial(form.id, body);
      else await liturgyCalendarApi.createSpecial(body);
      await refreshLiturgy();
      setForm(null);
      showToast("success", "Đã lưu ngày đặc biệt.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {patron && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-100 to-yellow-50 border border-amber-300 flex items-center gap-2 text-amber-900">
          <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0" />
          <p className="text-xs">
            <b>Lễ Bổn mạng của nhà: {patron.label}</b>
            {patron.name ? ` — ${patron.name}` : ""}. Đổi ở thẻ “Bổn mạng, nhắc lễ & check-in”.
          </p>
        </div>
      )}
      {isLoading && <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />}
      {!isLoading && items.length === 0 && !form && (
        <p className="text-xs text-gray-500 text-center py-4">Chưa có ngày đặc biệt nào (vd. kỷ niệm thành lập nhà, lễ tạ ơn cuối năm học, ngày tĩnh tâm).</p>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.id} className={cn("p-3 rounded-2xl border flex items-start gap-3", SPECIAL_COLOR[s.color].cell, !s.isActive && "opacity-50")}>
            <div className="shrink-0 w-12 text-center">
              <p className="text-lg font-black text-gray-900 leading-none">{String(s.day).padStart(2, "0")}</p>
              <p className="text-[10px] font-bold text-gray-500">Th {s.month}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-gray-900">{s.title}</p>
              <p className="text-[10px] text-gray-600">
                {s.year ? `Chỉ năm ${s.year}` : "Hằng năm"} · {s.requiresCheckin ? (s.evidenceRequired ? "bắt buộc check-in đi lễ (kèm ảnh)" : "bắt buộc check-in đi lễ") : "không bắt check-in"}
                {s.notify ? " · nhắc trước" : ""}
                {!s.isActive ? " · đang tắt" : ""}
              </p>
              {s.description && <p className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-line">{s.description}</p>}
            </div>
            {canManage && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setForm({ ...s, description: s.description ?? "", id: s.id })}
                  className="p-1.5 rounded-lg hover:bg-white text-gray-600"
                  title="Sửa"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDel(s)} className="p-1.5 rounded-lg hover:bg-white text-rose-600" title="Xóa">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage && !form && (
        <button
          onClick={() => setForm({ ...EMPTY })}
          className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200"
        >
          <Plus className="w-4 h-4" /> Thêm ngày đặc biệt
        </button>
      )}

      {form && (
        <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50/40 flex flex-col gap-3">
          <CustomInput label="Tên ngày" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Kỷ niệm thành lập lưu xá" maxLength={160} />
          <div className="grid grid-cols-3 gap-2">
            <CustomSelect
              label="Ngày"
              value={form.day}
              onChange={(v) => setForm({ ...form, day: v })}
              options={Array.from({ length: DIM[form.month - 1] }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
            />
            <CustomSelect label="Tháng" value={form.month} onChange={(v) => setForm({ ...form, month: v, day: Math.min(form.day, DIM[v - 1]) })} options={MONTHS} />
            <CustomSelect
              label="Lặp lại"
              value={form.year ?? 0}
              onChange={(v) => setForm({ ...form, year: v || null })}
              options={[{ value: 0, label: "Hằng năm" }, ...[thisYear, thisYear + 1, thisYear + 2].map((y) => ({ value: y, label: `Chỉ năm ${y}` }))]}
            />
          </div>
          <CustomTextarea label="Mô tả (tùy chọn)" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} />
          <div>
            <span className="block text-xs font-bold text-gray-700 mb-1.5">Màu nổi bật trên lịch</span>
            <div className="flex flex-wrap gap-1.5">
              {SPECIAL_DAY_COLORS.map((c: SpecialDayColor) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn("px-2.5 py-1 rounded-lg border text-[11px] font-bold", SPECIAL_COLOR[c].chip, form.color === c && "ring-2 ring-primary")}
                >
                  {SPECIAL_COLOR[c].label}
                </button>
              ))}
            </div>
          </div>
          <CustomToggle
            checked={!!form.requiresCheckin}
            onChange={(v) => setForm({ ...form, requiresCheckin: v })}
            label="Anh em phải check-in đi lễ ngày này"
            description="Hiện nút check-in trên lịch; người chưa check-in được nhắc vào buổi tối"
          />
          {form.requiresCheckin && (
            <CustomToggle
              checked={form.evidenceRequired !== false}
              onChange={(v) => setForm({ ...form, evidenceRequired: v })}
              label="Cần ảnh minh chứng"
              description="Nếu ngày rơi vào Chúa Nhật thì không cần ảnh"
            />
          )}
          <CustomToggle checked={form.notify !== false} onChange={(v) => setForm({ ...form, notify: v })} label="Báo trước cho anh em" description="Theo số ngày báo trước ở thẻ “Bổn mạng, nhắc lễ & check-in”" />
          <CustomToggle checked={form.isActive !== false} onChange={(v) => setForm({ ...form, isActive: v })} label="Đang dùng" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-white">
              Hủy
            </button>
            <button onClick={save} disabled={busy} className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
              {busy ? "Đang lưu…" : form.id ? "Lưu thay đổi" : "Thêm"}
            </button>
          </div>
        </div>
      )}
      {!canManage && <p className="text-[11px] text-gray-500">Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được thêm/sửa ngày đặc biệt.</p>}

      <ConfirmDialog
        isOpen={!!del}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          try {
            await liturgyCalendarApi.deleteSpecial(del.id);
            await refreshLiturgy();
            showToast("success", "Đã xóa ngày đặc biệt.");
          } catch (e) {
            showToast("error", errorMessage(e));
          }
        }}
        title={`Xóa ngày "${del?.title ?? ""}"?`}
        message="Ngày này không còn hiển thị trên lịch; các check-in đi lễ đã ghi vẫn được giữ."
        confirmText="Xóa"
        variant="danger"
      />
    </div>
  );
}

// ---------------------------------------------------------------------
const PATRON_KEYS = [
  "org.patron_feast",
  "org.patron_name",
  "liturgy.notify_days_before",
  "liturgy.notify_day_before",
  "liturgy.checkin_sunday",
  "liturgy.checkin_solemnity",
  "liturgy.checkin_grace_days",
  "liturgy.checkin_reminder_time",
] as const;

function PatronTab() {
  const { showToast } = useApp();
  const { settings, isLoading } = useSettings();
  const meta = useMemo(() => new Map(settings.filter((s) => (PATRON_KEYS as readonly string[]).includes(s.key)).map((s) => [s.key, s])), [settings]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const val = <T,>(k: string): T | undefined => (k in draft ? draft[k] : meta.get(k)?.value) as T | undefined;
  const can = (k: string) => !!meta.get(k)?.canWrite;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const feastText = (k: string) => (k in draft ? String(draft[k]) : feastToLabel(String(meta.get(k)?.value ?? "")));
  const dirty = Object.keys(draft).length > 0;

  if (isLoading && !settings.length) return <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />;

  const save = async () => {
    const changes = Object.entries(draft).map(([key, value]) => {
      const m = meta.get(key)!;
      const v = key === "org.patron_feast" ? labelToFeast(String(value)) : value;
      return { key, value: v, version: m.version, m };
    });
    for (const c of changes) {
      const err = validateSettingValue({ key: c.key, valueType: c.m.valueType, min: c.m.min, max: c.m.max }, c.value);
      if (err) {
        showToast("error", `${c.key === "org.patron_feast" ? "Ngày Bổn mạng" : "Giá trị"}: ${err}`);
        return;
      }
    }
    setBusy(true);
    try {
      await settingsApi.save(changes.map(({ key, value, version }) => ({ key, value, version })));
      await Promise.all([refreshSettings(), refreshLiturgy()]);
      setDraft({});
      showToast("success", "Đã lưu cấu hình lịch phụng vụ.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const lockNote = (k: string) => (meta.has(k) && !can(k) ? <p className="text-[10px] text-amber-700 mt-0.5">🔒 Bạn không có quyền sửa mục này.</p> : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col gap-3">
        <span className="text-xs font-black text-amber-900 inline-flex items-center gap-1.5">
          <Star className="w-4 h-4 fill-amber-400 text-amber-500" /> Lễ Bổn mạng của nhà
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CustomInput label="Ngày Bổn mạng (DD/MM)" value={feastText("org.patron_feast")} onChange={(e) => set("org.patron_feast", e.target.value)} disabled={!can("org.patron_feast")} placeholder="04/10" />
            {lockNote("org.patron_feast")}
          </div>
          <div>
            <CustomInput label="Vị thánh / mầu nhiệm Bổn mạng" value={String(val<string>("org.patron_name") ?? "")} onChange={(e) => set("org.patron_name", e.target.value)} disabled={!can("org.patron_name")} placeholder="VD: Thánh Phanxicô Assisi" />
            {lockNote("org.patron_name")}
          </div>
        </div>
        <p className="text-[11px] text-amber-800/90">Ngày Bổn mạng được tô nổi bật trên lịch, báo trước cho anh em và (nếu bật bên dưới) bắt buộc check-in đi lễ kèm ảnh.</p>
      </div>

      <div className="p-4 rounded-2xl border border-gray-100 flex flex-col gap-3">
        <span className="text-xs font-black text-gray-900 inline-flex items-center gap-1.5">
          <BellRing className="w-4 h-4 text-primary" /> Nhắc lễ trọng & ngày đặc biệt
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CustomInput
              type="number"
              label="Báo trước (ngày)"
              min={0}
              max={30}
              value={String(val<number>("liturgy.notify_days_before") ?? "")}
              onChange={(e) => set("liturgy.notify_days_before", e.target.value === "" ? "" : Number(e.target.value))}
              disabled={!can("liturgy.notify_days_before")}
              rightSuffix="ngày"
            />
            {lockNote("liturgy.notify_days_before")}
          </div>
          <div className={cn(!can("liturgy.checkin_reminder_time") && "pointer-events-none opacity-60")}>
            <span className="block text-xs font-bold text-gray-700 mb-1.5">Giờ nhắc người chưa check-in</span>
            <CustomTimePicker value={String(val<string>("liturgy.checkin_reminder_time") ?? "19:00")} onChange={(t) => set("liturgy.checkin_reminder_time", t.slice(0, 5))} />
          </div>
        </div>
        <CustomToggle
          checked={val<boolean>("liturgy.notify_day_before") !== false}
          onChange={(v) => set("liturgy.notify_day_before", v)}
          disabled={!can("liturgy.notify_day_before")}
          label="Nhắc thêm vào hôm trước ngày lễ"
        />
      </div>

      <div className="p-4 rounded-2xl border border-gray-100 flex flex-col gap-3">
        <span className="text-xs font-black text-gray-900">Check-in đi lễ</span>
        <CustomToggle
          checked={val<boolean>("liturgy.checkin_sunday") !== false}
          onChange={(v) => set("liturgy.checkin_sunday", v)}
          disabled={!can("liturgy.checkin_sunday")}
          label="Chúa Nhật: anh em check-in đã đi lễ"
          description="Không cần ảnh minh chứng"
        />
        <CustomToggle
          checked={val<boolean>("liturgy.checkin_solemnity") !== false}
          onChange={(v) => set("liturgy.checkin_solemnity", v)}
          disabled={!can("liturgy.checkin_solemnity")}
          label="Lễ trọng và lễ Bổn mạng: bắt buộc check-in kèm ảnh minh chứng"
          description="Lễ trọng rơi vào Chúa Nhật thì không cần ảnh"
        />
        <div className="sm:w-1/2">
          <CustomInput
            type="number"
            label="Được check-in muộn tối đa"
            min={0}
            max={7}
            value={String(val<number>("liturgy.checkin_grace_days") ?? "")}
            onChange={(e) => set("liturgy.checkin_grace_days", e.target.value === "" ? "" : Number(e.target.value))}
            disabled={!can("liturgy.checkin_grace_days")}
            rightSuffix="ngày"
          />
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end gap-2 sticky bottom-0 bg-white pt-2">
          <button onClick={() => setDraft({})} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
            Hủy thay đổi
          </button>
          <button onClick={save} disabled={busy} className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
            {busy ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function LectionaryTab() {
  const { showToast } = useApp();
  const { status, mutate } = useLectionaryStatus();
  const [busy, setBusy] = useState(false);
  const last = status?.lastImport;
  const run = async () => {
    setBusy(true);
    try {
      const r = await liturgyCalendarApi.importLectionary();
      await Promise.all([mutate(), refreshLiturgy()]);
      showToast("success", `Đã nạp ${r.entries} bộ bài đọc Lời Chúa.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 text-xs text-gray-700">
      <p>
        Lịch phụng vụ (tên lễ, bậc lễ, màu áo lễ, mùa, âm lịch, Tết) được ứng dụng <b>tự tính</b> theo luật phụng vụ và lịch riêng của Hội đồng
        Giám mục Việt Nam cho mọi năm. Lời Chúa (trích dẫn + bản văn các bài đọc) được nạp một lần từ dữ liệu mở trên GitHub ({status?.source ?? "…"}) vào
        cơ sở dữ liệu của nhà — chỉ tải dữ liệu về, không gửi thông tin nào của nhà ra ngoài.
      </p>
      <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-purple-50">
        <p>
          Hiện có: <b>{status ? status.entries : "…"}</b> bộ bài đọc.
        </p>
        {last && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            Lần nạp gần nhất: {new Date(last.startedAt).toLocaleString("vi-VN")} —{" "}
            {last.status === "succeeded" ? "thành công" : last.status === "running" ? "đang chạy" : `lỗi: ${last.error ?? "không rõ"}`}
          </p>
        )}
      </div>
      {status?.canImport ? (
        <button
          onClick={run}
          disabled={busy}
          className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white font-bold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />} {status.entries ? "Nạp lại Lời Chúa" : "Nạp Lời Chúa"}
        </button>
      ) : (
        <p className="text-[11px] text-gray-500">Chỉ Trưởng nhà, Ban Phụng vụ hoặc Admin được nạp dữ liệu.</p>
      )}
    </div>
  );
}
