"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Edit2,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  Lock,
  Plus,
  RotateCcw,
  School,
  Search,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { FormCardsSkeleton } from "./TabSkeletons";
import { useSession } from "@/lib/session";
import { ApiClientError, errorMessage } from "@/lib/api";
import { CustomDatePicker, CustomInput, CustomSelect, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ProvincePicker } from "@/components/ui/GeoPicker";
import { DialogShell, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";
import { academicConfigApi, refreshAcademicConfig, useAcademicConfig } from "@/lib/data/academic-config";
import {
  ACADEMIC_YEAR_CODE_RE,
  SEMESTER_CODES,
  SEMESTER_LABEL,
  TERM_STATUS_LABEL,
  UNIVERSITY_CODE_RE,
  fmtRange,
  suggestNextAcademicYear,
  suggestYearFor,
  type AcademicYearDto,
  type BoardTermDto,
  type ConfigSemesterDto,
  type SemesterCode,
  type TermStatus,
  type UniversityDto,
} from "@/lib/types/academic-config";
import { cn } from "@/lib/utils";

type Toast = (type: "success" | "error" | "warning" | "info", msg: string) => void;
type Errors = Record<string, string>;

const card = "bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4";
const btnAdd =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition shrink-0";
const iconBtn = "p-1.5 rounded-lg text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** Gợi ý mã trường từ tên viết tắt / tên: "ĐH Công nghệ" → "DH_CONG_NGHE" */
const suggestUniCode = (s: string) =>
  fold(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

const apiErrors = (err: unknown): Errors =>
  err instanceof ApiClientError && err.errors?.length ? Object.fromEntries(err.errors.map((x) => [x.field, x.message])) : {};

function UsageText({ n, what }: { n: number | null; what: string }) {
  if (n == null) return null;
  return (
    <span className="text-[10.5px] text-gray-400 font-medium" title={`Số ${what} đang tham chiếu mục này`}>
      {n > 0 ? `Đang dùng: ${n}` : "Chưa dùng"}
    </span>
  );
}

function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
      <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" />
      <span>{children}</span>
    </div>
  );
}

// =====================================================================
// Hộp thoại: Trường đại học
// =====================================================================
function UniversityDialog({
  open,
  onClose,
  initial,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  initial: UniversityDto | null;
  showToast: Toast;
}) {
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(initial?.code ?? "");
    setCodeTouched(!!initial);
    setName(initial?.name ?? "");
    setShortName(initial?.shortName ?? "");
    setCity(initial?.city ?? "");
    setIsActive(initial?.isActive ?? true);
    setErrors({});
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const errs: Errors = {};
    if (name.trim().length < 2) errs.name = "Nhập tên trường (tối thiểu 2 ký tự).";
    if (c.length < 2 || c.length > 20) errs.code = "Mã dài 2–20 ký tự.";
    else if (!UNIVERSITY_CODE_RE.test(c)) errs.code = "Chỉ chữ in hoa không dấu, số, gạch dưới (VD: HUST, VNU_UET).";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = { code: c, name: name.trim(), shortName: shortName.trim() || null, city: city.trim() || null, isActive };
    try {
      if (initial) await academicConfigApi.updateUniversity(initial.id, body);
      else await academicConfigApi.createUniversity(body);
      showToast("success", initial ? `Đã cập nhật "${body.name}".` : `Đã thêm "${body.name}" — trường đã có trong các danh sách chọn.`);
      await refreshAcademicConfig();
      onClose();
    } catch (err) {
      setErrors(apiErrors(err));
      if (err instanceof ApiClientError && err.code === "DUPLICATE_CODE") setErrors({ code: err.message });
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<School className="w-5 h-5" />}
      title={initial ? "Sửa trường đại học" : "Thêm trường đại học"}
      subtitle="Hiện trong danh sách chọn trường của hồ sơ sinh viên và bảng điểm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Hủy
          </button>
          <button type="submit" form="uni-form" disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm trường"}
          </button>
        </>
      }
    >
      <form id="uni-form" onSubmit={submit} className="space-y-4">
        <CustomInput
          label="Tên trường"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Trường Đại học Công nghệ – ĐHQGHN"
          maxLength={200}
          error={errors.name}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput
            label="Tên viết tắt"
            value={shortName}
            onChange={(e) => {
              setShortName(e.target.value);
              if (!codeTouched) setCode(suggestUniCode(e.target.value));
            }}
            placeholder="VD: ĐH Công nghệ"
            maxLength={100}
            error={errors.shortName}
          />
          <CustomInput
            label="Mã trường (viết hoa)"
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase().replace(/\s+/g, "_"));
            }}
            placeholder="VD: VNU_UET"
            maxLength={20}
            className="font-mono"
            error={errors.code}
            required
          />
        </div>
        <ProvincePicker label="Tỉnh / thành phố" value={city} onChange={setCity} error={errors.city} />
        <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
          <CustomToggle
            checked={isActive}
            onChange={setIsActive}
            label="Đang sử dụng"
            description="Tắt để tạm ẩn trường khỏi các danh sách chọn — dữ liệu cũ vẫn giữ nguyên tên trường"
          />
        </div>
      </form>
    </DialogShell>
  );
}

// =====================================================================
// Hộp thoại: Năm học (thêm mới kèm học kỳ gợi ý / sửa)
// =====================================================================
interface SemRow {
  code: SemesterCode;
  enabled: boolean;
  name: string;
  startsOn: string;
  endsOn: string;
}

function YearDialog({
  open,
  onClose,
  initial,
  years,
  today,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  initial: AcademicYearDto | null;
  years: AcademicYearDto[];
  today: string;
  showToast: Toast;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);
  const [sems, setSems] = useState<SemRow[]>([]);
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const applySuggestion = (s: ReturnType<typeof suggestYearFor>, withCode: boolean) => {
    if (withCode) setCode(s.code);
    setName(s.name);
    setStartsOn(s.startsOn);
    setEndsOn(s.endsOn);
    setSems(s.semesters.map((x) => ({ code: x.code, enabled: true, name: x.name, startsOn: x.startsOn, endsOn: x.endsOn })));
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTouched(false);
    if (initial) {
      setCode(initial.code);
      setName(initial.name);
      setStartsOn(initial.startsOn);
      setEndsOn(initial.endsOn);
      setIsCurrent(initial.isCurrent);
      setSems([]);
    } else {
      applySuggestion(suggestNextAcademicYear(years, today), true);
      setIsCurrent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const onCode = (v: string) => {
    setCode(v);
    const m = ACADEMIC_YEAR_CODE_RE.exec(v.trim());
    // Chưa sửa tay tên/ngày ⇒ điền lại theo mã mới (01/09 → 31/08 + 3 học kỳ mặc định)
    if (!initial && m && Number(m[2]) === Number(m[1]) + 1 && !touched) applySuggestion(suggestYearFor(Number(m[1])), false);
  };

  const setSem = (i: number, patch: Partial<SemRow>) => {
    setTouched(true);
    setSems((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const m = ACADEMIC_YEAR_CODE_RE.exec(code.trim());
    if (!m) errs.code = "Mã có dạng YYYY-YYYY (VD: 2027-2028).";
    else if (Number(m[2]) !== Number(m[1]) + 1) errs.code = "Năm sau phải lớn hơn năm trước đúng 1.";
    if (name.trim().length < 2) errs.name = "Nhập tên năm học.";
    if (!startsOn) errs.startsOn = "Chọn ngày bắt đầu.";
    if (!endsOn) errs.endsOn = "Chọn ngày kết thúc.";
    else if (startsOn && endsOn <= startsOn) errs.endsOn = "Ngày kết thúc phải sau ngày bắt đầu.";
    sems.forEach((s, i) => {
      if (!s.enabled) return;
      if (!s.startsOn || !s.endsOn || s.endsOn <= s.startsOn) errs[`semesters.${i}`] = "Khoảng ngày học kỳ không hợp lệ.";
      else if (s.startsOn < startsOn || s.endsOn > endsOn) errs[`semesters.${i}`] = "Học kỳ phải nằm trong năm học.";
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      showToast("error", "Vui lòng kiểm tra lại các trường đang báo lỗi.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await academicConfigApi.updateYear(initial.id, {
          code: code.trim(),
          name: name.trim(),
          startsOn,
          endsOn,
          ...(isCurrent && !initial.isCurrent ? { isCurrent: true as const } : {}),
        });
        showToast("success", `Đã cập nhật "${name.trim()}".`);
      } else {
        const chosen = sems.filter((s) => s.enabled);
        await academicConfigApi.createYear({
          code: code.trim(),
          name: name.trim(),
          startsOn,
          endsOn,
          isCurrent,
          semesters: chosen.map((s) => ({ code: s.code, name: s.name.trim() || SEMESTER_LABEL[s.code], startsOn: s.startsOn, endsOn: s.endsOn })),
        });
        showToast("success", `Đã thêm "${name.trim()}"${chosen.length ? ` cùng ${chosen.length} học kỳ` : ""}.`);
      }
      await refreshAcademicConfig();
      onClose();
    } catch (err) {
      setErrors(apiErrors(err));
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<CalendarRange className="w-5 h-5" />}
      title={initial ? "Sửa năm học" : "Thêm năm học"}
      subtitle={initial ? "Học kỳ sửa riêng ở từng dòng học kỳ" : "Đã gợi ý sẵn mã, ngày và 3 học kỳ — chỉnh lại nếu cần"}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Hủy
          </button>
          <button type="submit" form="year-form" disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm năm học"}
          </button>
        </>
      }
    >
      <form id="year-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomInput
            label="Mã năm học"
            value={code}
            onChange={(e) => onCode(e.target.value)}
            placeholder="2027-2028"
            className="font-mono"
            maxLength={9}
            error={errors.code}
            required
          />
          <CustomInput
            label="Tên hiển thị"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
            placeholder="Năm học 2027 – 2028"
            maxLength={100}
            error={errors.name}
            required
          />
          <CustomDatePicker
            label="Bắt đầu"
            value={startsOn}
            onChange={(v) => {
              setTouched(true);
              setStartsOn(v);
            }}
            format="YYYY-MM-DD"
            error={errors.startsOn}
          />
          <CustomDatePicker
            label="Kết thúc"
            value={endsOn}
            onChange={(v) => {
              setTouched(true);
              setEndsOn(v);
            }}
            format="YYYY-MM-DD"
            error={errors.endsOn}
          />
        </div>

        {!initial && (
          <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-gray-800">Học kỳ tạo kèm</p>
              <span className="text-[10.5px] text-gray-500">Bỏ chọn học kỳ không cần</span>
            </div>
            {sems.map((s, i) => (
              <div key={s.code} className={cn("rounded-xl bg-white border p-2.5", s.enabled ? "border-purple-100" : "border-gray-100 opacity-60")}>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => setSem(i, { enabled: e.target.checked })}
                    className="w-4 h-4 accent-[#5b3cdd] rounded"
                  />
                  {SEMESTER_LABEL[s.code]} <span className="font-mono text-[10px] text-gray-400">({s.code})</span>
                </label>
                {s.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <CustomInput value={s.name} onChange={(e) => setSem(i, { name: e.target.value })} placeholder={SEMESTER_LABEL[s.code]} maxLength={60} aria-label="Tên học kỳ" />
                    <CustomDatePicker value={s.startsOn} onChange={(v) => setSem(i, { startsOn: v })} format="YYYY-MM-DD" placeholder="Bắt đầu" />
                    <CustomDatePicker value={s.endsOn} onChange={(v) => setSem(i, { endsOn: v })} format="YYYY-MM-DD" placeholder="Kết thúc" />
                  </div>
                )}
                {errors[`semesters.${i}`] && <p className="mt-1 text-[11px] text-rose-500">{errors[`semesters.${i}`]}</p>}
              </div>
            ))}
          </div>
        )}

        {!(initial?.isCurrent) && (
          <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
            <CustomToggle
              checked={isCurrent}
              onChange={setIsCurrent}
              label="Đặt làm năm học hiện hành"
              description="Phân phòng, lịch trực nhật… mới tạo sẽ gắn vào năm học này; năm hiện hành cũ tự bỏ cờ"
            />
          </div>
        )}
      </form>
    </DialogShell>
  );
}

// =====================================================================
// Hộp thoại: Học kỳ
// =====================================================================
function SemesterDialog({
  open,
  onClose,
  year,
  initial,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  year: AcademicYearDto | null;
  initial: ConfigSemesterDto | null;
  showToast: Toast;
}) {
  const [code, setCode] = useState<SemesterCode>("HK1");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const taken = useMemo(() => new Set((year?.semesters ?? []).filter((s) => s.id !== initial?.id).map((s) => s.code)), [year, initial]);
  const suggestFor = (c: SemesterCode) => {
    const y = Number((year?.code ?? year?.startsOn ?? "2026").slice(0, 4));
    return suggestYearFor(y).semesters.find((s) => s.code === c)!;
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setCode(initial.code);
      setName(initial.name);
      setStartsOn(initial.startsOn);
      setEndsOn(initial.endsOn);
    } else {
      const c = SEMESTER_CODES.find((x) => !taken.has(x)) ?? "HK1";
      const s = suggestFor(c);
      setCode(c);
      setName(s.name);
      setStartsOn(s.startsOn);
      setEndsOn(s.endsOn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!year) return;
    const errs: Errors = {};
    if (taken.has(code)) errs.code = `${year.name} đã có ${SEMESTER_LABEL[code]}.`;
    if (!startsOn || !endsOn || endsOn <= startsOn) errs.endsOn = "Ngày kết thúc phải sau ngày bắt đầu.";
    else if (startsOn < year.startsOn || endsOn > year.endsOn) errs.startsOn = `Học kỳ phải nằm trong năm học (${fmtRange(year.startsOn, year.endsOn)}).`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { code, name: name.trim() || SEMESTER_LABEL[code], startsOn, endsOn };
      if (initial) await academicConfigApi.updateSemester(initial.id, body);
      else await academicConfigApi.createSemester({ ...body, academicYearId: year.id });
      showToast("success", initial ? `Đã cập nhật ${body.name}.` : `Đã thêm ${body.name} vào ${year.name}.`);
      await refreshAcademicConfig();
      onClose();
    } catch (err) {
      setErrors(apiErrors(err));
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<CalendarDays className="w-5 h-5" />}
      title={initial ? "Sửa học kỳ" : "Thêm học kỳ"}
      subtitle={year ? `${year.name} · ${fmtRange(year.startsOn, year.endsOn)}` : undefined}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Hủy
          </button>
          <button type="submit" form="sem-form" disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm học kỳ"}
          </button>
        </>
      }
    >
      <form id="sem-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CustomSelect<SemesterCode>
              label="Loại học kỳ"
              value={code}
              onChange={(c) => {
                setCode(c);
                if (!initial) {
                  const s = suggestFor(c);
                  setName(s.name);
                  setStartsOn(s.startsOn);
                  setEndsOn(s.endsOn);
                }
              }}
              options={SEMESTER_CODES.map((c) => ({ value: c, label: SEMESTER_LABEL[c], subLabel: taken.has(c) ? "đã có" : c }))}
            />
            {errors.code && <p className="mt-1 text-[11px] text-rose-500">{errors.code}</p>}
          </div>
          <CustomInput label="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} placeholder={SEMESTER_LABEL[code]} maxLength={60} error={errors.name} />
          <CustomDatePicker label="Bắt đầu" value={startsOn} onChange={setStartsOn} format="YYYY-MM-DD" error={errors.startsOn} />
          <CustomDatePicker label="Kết thúc" value={endsOn} onChange={setEndsOn} format="YYYY-MM-DD" error={errors.endsOn} />
        </div>
        <p className="text-[11px] text-gray-500 flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Học kỳ dùng để nhóm bảng điểm; biểu mẫu nhập điểm chỉ hiện học kỳ đã bắt đầu.
        </p>
      </form>
    </DialogShell>
  );
}

// =====================================================================
// Hộp thoại: Nhiệm kỳ người quản lý
// =====================================================================
function TermDialog({
  open,
  onClose,
  initial,
  years,
  canHandover,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  initial: BoardTermDto | null;
  years: AcademicYearDto[];
  canHandover: boolean;
  showToast: Toast;
}) {
  const [name, setName] = useState("");
  const [yearId, setYearId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [status, setStatus] = useState<TermStatus>("planned");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const fillFromYear = (id: string) => {
    const y = years.find((x) => x.id === id);
    if (!y) return;
    setName(y.name.replace(/^Năm học/i, "Nhiệm kỳ"));
    setStartsOn(y.startsOn);
    setEndsOn(y.endsOn);
  };

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setName(initial.name);
      setYearId(initial.academicYearId ?? "");
      setStartsOn(initial.startsOn);
      setEndsOn(initial.endsOn);
      setStatus(initial.status);
      setNotes(initial.handoverNotes ?? "");
    } else {
      // Gợi ý: năm học mới nhất chưa có nhiệm kỳ
      const y = years[0];
      setYearId(y?.id ?? "");
      setStatus("planned");
      setNotes("");
      if (y) fillFromYear(y.id);
      else {
        setName("");
        setStartsOn("");
        setEndsOn("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const statusOptions = (["planned", "active", "closed"] as TermStatus[])
    .filter((s) => s !== "closed" || (initial && (canHandover || initial.status === "closed")))
    .map((s) => ({ value: s, label: TERM_STATUS_LABEL[s] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (name.trim().length < 3) errs.name = "Nhập tên nhiệm kỳ (tối thiểu 3 ký tự).";
    if (!startsOn || !endsOn || endsOn <= startsOn) errs.endsOn = "Ngày kết thúc phải sau ngày bắt đầu.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), academicYearId: yearId || null, startsOn, endsOn, handoverNotes: notes.trim() || null };
      if (initial) await academicConfigApi.updateBoardTerm(initial.id, { ...body, status });
      else await academicConfigApi.createBoardTerm({ ...body, status: status === "active" ? "active" : "planned" });
      showToast("success", initial ? `Đã cập nhật "${body.name}".` : `Đã thêm "${body.name}".`);
      await refreshAcademicConfig();
      onClose();
    } catch (err) {
      setErrors(apiErrors(err));
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<Users className="w-5 h-5" />}
      title={initial ? "Sửa nhiệm kỳ" : "Thêm nhiệm kỳ người quản lý"}
      subtitle="Vai trò và chức vụ của người quản lý gắn theo nhiệm kỳ"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Hủy
          </button>
          <button type="submit" form="term-form" disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm nhiệm kỳ"}
          </button>
        </>
      }
    >
      <form id="term-form" onSubmit={submit} className="space-y-4">
        <CustomSelect
          label="Thuộc năm học"
          value={yearId}
          onChange={(v) => {
            setYearId(v);
            if (!initial && v) fillFromYear(v);
          }}
          options={[{ value: "", label: "Không gắn năm học" }, ...years.map((y) => ({ value: y.id, label: y.name, subLabel: fmtRange(y.startsOn, y.endsOn) }))]}
        />
        <CustomInput label="Tên nhiệm kỳ" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhiệm kỳ 2027 – 2028" maxLength={100} error={errors.name} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomDatePicker label="Bắt đầu" value={startsOn} onChange={setStartsOn} format="YYYY-MM-DD" error={errors.startsOn} />
          <CustomDatePicker label="Kết thúc" value={endsOn} onChange={setEndsOn} format="YYYY-MM-DD" error={errors.endsOn} />
        </div>
        <CustomSelect<TermStatus> label="Trạng thái" value={status} onChange={setStatus} options={statusOptions} />
        {status === "closed" && !initial?.closedAt && (
          <p className="-mt-2 text-[11px] text-amber-700">Đóng nhiệm kỳ = đã bàn giao; vai trò gắn nhiệm kỳ hết hiệu lực theo ngày kết thúc.</p>
        )}
        {(initial || status === "closed") && (
          <CustomTextarea label="Biên bản / ghi chú bàn giao" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} error={errors.handoverNotes} />
        )}
        <p className="text-[11px] text-gray-500 flex gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Chỉ một nhiệm kỳ ở trạng thái “Đang hiệu lực”; các nhiệm kỳ không được chồng thời gian.
        </p>
      </form>
    </DialogShell>
  );
}

// =====================================================================
// Tab chính
// =====================================================================
type UniFilter = "active" | "hidden" | "deleted";
type DeleteTarget =
  | { kind: "university"; item: UniversityDto }
  | { kind: "year"; item: AcademicYearDto }
  | { kind: "semester"; item: ConfigSemesterDto; year: AcademicYearDto }
  | { kind: "term"; item: BoardTermDto };

export default function AcademicConfigTab() {
  const { showToast } = useApp();
  const { can } = useSession();
  const { config, error, isLoading } = useAcademicConfig();
  const canUni = !!config?.permissions.universities || can(["academic.university.manage", "academic.scale.manage"]);
  const canTerms = !!config?.permissions.terms || can("term.manage");
  const canHandover = !!config?.permissions.handover || can("term.handover");

  const [uniFilter, setUniFilter] = useState<UniFilter>("active");
  const [uniSearch, setUniSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uniDialog, setUniDialog] = useState<{ item: UniversityDto | null } | null>(null);
  const [yearDialog, setYearDialog] = useState<{ item: AcademicYearDto | null } | null>(null);
  const [semDialog, setSemDialog] = useState<{ year: AcademicYearDto; item: ConfigSemesterDto | null } | null>(null);
  const [termDialog, setTermDialog] = useState<{ item: BoardTermDto | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const universities = useMemo(() => config?.universities ?? [], [config]);
  const years = useMemo(() => config?.years ?? [], [config]);
  const terms = useMemo(() => config?.boardTerms ?? [], [config]);
  const today = config?.today ?? new Date().toISOString().slice(0, 10);

  const uniCounts = useMemo(
    () => ({
      active: universities.filter((u) => !u.deletedAt && u.isActive).length,
      hidden: universities.filter((u) => !u.deletedAt && !u.isActive).length,
      deleted: universities.filter((u) => !!u.deletedAt).length,
    }),
    [universities],
  );
  const shownUnis = useMemo(() => {
    const q = fold(uniSearch.trim());
    return universities.filter((u) => {
      const inTab = uniFilter === "deleted" ? !!u.deletedAt : uniFilter === "hidden" ? !u.deletedAt && !u.isActive : !u.deletedAt && u.isActive;
      return inTab && (!q || fold(`${u.code} ${u.name} ${u.shortName ?? ""} ${u.city ?? ""}`).includes(q));
    });
  }, [universities, uniFilter, uniSearch]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await refreshAcademicConfig();
      showToast("success", ok);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    const t = deleteTarget;
    setDeleteTarget(null);
    if (!t) return;
    if (t.kind === "university") void run(t.item.id, () => academicConfigApi.deleteUniversity(t.item.id), `Đã xóa "${t.item.name}".`);
    else if (t.kind === "year") void run(t.item.id, () => academicConfigApi.deleteYear(t.item.id), `Đã xóa "${t.item.name}".`);
    else if (t.kind === "semester") void run(t.item.id, () => academicConfigApi.deleteSemester(t.item.id), `Đã xóa ${t.item.name} (${t.year.name}).`);
    else void run(t.item.id, () => academicConfigApi.deleteBoardTerm(t.item.id), `Đã xóa "${t.item.name}".`);
  };

  if (isLoading && !config) {
    return <FormCardsSkeleton cards={3} />;
  }
  if (error && !config) {
    return <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được danh mục học tập: {errorMessage(error)}</div>;
  }

  const current = years.find((y) => y.isCurrent);
  const activeTerm = terms.find((t) => t.status === "active");

  const deleteMessage = (() => {
    const t = deleteTarget;
    if (!t) return "";
    if (t.kind === "university")
      return (
        <span>
          Xóa trường <b className="text-gray-900">&quot;{t.item.name}&quot;</b>? Trường biến mất khỏi danh sách chọn (khôi phục được trong mục “Đã xóa”).
        </span>
      );
    if (t.kind === "year")
      return (
        <span>
          Xóa <b className="text-gray-900">{t.item.name}</b>
          {t.item.semesters.length ? ` cùng ${t.item.semesters.length} học kỳ` : ""}? Chỉ xóa được khi chưa có bảng điểm, kỳ thu, phân phòng… gắn năm học.
        </span>
      );
    if (t.kind === "semester")
      return (
        <span>
          Xóa <b className="text-gray-900">{t.item.name}</b> của {t.year.name}? Chỉ xóa được khi chưa có bảng điểm nào.
        </span>
      );
    return (
      <span>
        Xóa <b className="text-gray-900">{t.item.name}</b>? Chỉ xóa được khi chưa gắn chức vụ/vai trò nào.
      </span>
    );
  })();

  const tabBtn = (active: boolean) =>
    cn(
      "shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
      active ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100",
    );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Tóm tắt */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white text-primary flex items-center justify-center shrink-0 shadow-2xs">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1 text-xs text-gray-700 leading-relaxed">
          <p className="font-bold text-gray-900">Danh mục dùng chung cho Học tập, Hồ sơ thành viên, Phân phòng, Trực nhật, Thu quỹ</p>
          <p>
            Năm học hiện hành: <b className="text-primary">{current?.name ?? "chưa đặt"}</b>
            {activeTerm ? (
              <>
                {" "}
                · Nhiệm kỳ hiệu lực: <b className="text-primary">{activeTerm.name}</b>
              </>
            ) : null}{" "}
            · {uniCounts.active} trường đang dùng
          </p>
        </div>
      </div>

      {/* ============ 1. TRƯỜNG ĐẠI HỌC ============ */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <School className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Trường đại học</h2>
              <p className="text-xs text-gray-500">Danh sách chọn trường trong hồ sơ sinh viên và bảng điểm</p>
            </div>
          </div>
          {canUni && (
            <button type="button" onClick={() => setUniDialog({ item: null })} className={btnAdd}>
              <Plus className="w-4 h-4" /> Thêm trường
            </button>
          )}
        </div>
        {!canUni && <ReadOnlyNote>Chế độ chỉ xem — thêm/sửa/ẩn trường cần quyền quản lý danh mục trường (Admin, Trưởng nhà).</ReadOnlyNote>}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button type="button" onClick={() => setUniFilter("active")} className={tabBtn(uniFilter === "active")}>
              Đang dùng ({uniCounts.active})
            </button>
            {canUni && (
              <>
                <button type="button" onClick={() => setUniFilter("hidden")} className={tabBtn(uniFilter === "hidden")}>
                  Tạm ẩn ({uniCounts.hidden})
                </button>
                <button type="button" onClick={() => setUniFilter("deleted")} className={tabBtn(uniFilter === "deleted")}>
                  Đã xóa ({uniCounts.deleted})
                </button>
              </>
            )}
          </div>
          <div className="sm:w-64">
            <CustomInput placeholder="Tìm mã, tên, tỉnh/thành…" value={uniSearch} onChange={(e) => setUniSearch(e.target.value)} leftIcon={<Search className="w-3.5 h-3.5" />} />
          </div>
        </div>

        {/* Bảng (≥ sm) */}
        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-bold px-3 py-2">Mã</th>
                <th className="text-left font-bold px-3 py-2">Tên trường</th>
                <th className="text-left font-bold px-3 py-2">Tỉnh/thành</th>
                <th className="text-left font-bold px-3 py-2">Sử dụng</th>
                {canUni && <th className="text-right font-bold px-3 py-2">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {shownUnis.map((u) => (
                <tr key={u.id} className={cn("border-t border-gray-100", busy === u.id && "opacity-50")}>
                  <td className="px-3 py-2 font-mono font-bold text-gray-700">{u.code}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{u.name}</div>
                    {u.shortName && <div className="text-[10.5px] text-gray-400">{u.shortName}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.city ?? "—"}</td>
                  <td className="px-3 py-2">
                    <UsageText n={u.usage} what="hồ sơ, bảng điểm, môn học" />
                  </td>
                  {canUni && (
                    <td className="px-3 py-2">
                      <UniActions
                        u={u}
                        busy={!!busy}
                        onEdit={() => setUniDialog({ item: u })}
                        onToggle={() =>
                          run(u.id, () => academicConfigApi.updateUniversity(u.id, { isActive: !u.isActive }), u.isActive ? `Đã tạm ẩn "${u.name}".` : `Đã hiện lại "${u.name}".`)
                        }
                        onRestore={() => run(u.id, () => academicConfigApi.updateUniversity(u.id, { restore: true }), `Đã khôi phục "${u.name}".`)}
                        onDelete={() => setDeleteTarget({ kind: "university", item: u })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Thẻ (điện thoại) */}
        <div className="sm:hidden flex flex-col gap-2">
          {shownUnis.map((u) => (
            <div key={u.id} className={cn("p-3 rounded-2xl border border-gray-100 flex flex-col gap-1.5", busy === u.id && "opacity-50")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{u.name}</p>
                  <p className="text-[11px] text-gray-500">
                    <span className="font-mono font-bold">{u.code}</span>
                    {u.shortName ? ` · ${u.shortName}` : ""}
                    {u.city ? ` · ${u.city}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <UsageText n={u.usage} what="hồ sơ, bảng điểm, môn học" />
                {canUni && (
                  <UniActions
                    u={u}
                    busy={!!busy}
                    onEdit={() => setUniDialog({ item: u })}
                    onToggle={() =>
                      run(u.id, () => academicConfigApi.updateUniversity(u.id, { isActive: !u.isActive }), u.isActive ? `Đã tạm ẩn "${u.name}".` : `Đã hiện lại "${u.name}".`)
                    }
                    onRestore={() => run(u.id, () => academicConfigApi.updateUniversity(u.id, { restore: true }), `Đã khôi phục "${u.name}".`)}
                    onDelete={() => setDeleteTarget({ kind: "university", item: u })}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {shownUnis.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Không có trường nào trong mục này.</p>}
      </section>

      {/* ============ 2. NĂM HỌC & HỌC KỲ ============ */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarRange className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Năm học &amp; học kỳ</h2>
              <p className="text-xs text-gray-500">Năm học không chồng thời gian; học kỳ HK1, HK2, HE nằm trong năm học</p>
            </div>
          </div>
          {canTerms && (
            <button type="button" onClick={() => setYearDialog({ item: null })} className={btnAdd}>
              <Plus className="w-4 h-4" /> Thêm năm học
            </button>
          )}
        </div>
        {!canTerms && <ReadOnlyNote>Chế độ chỉ xem — năm học, học kỳ, nhiệm kỳ cần quyền “Quản lý năm học, học kỳ, nhiệm kỳ” (Trưởng nhà, Admin).</ReadOnlyNote>}

        <div className="flex flex-col gap-3">
          {years.map((y) => (
            <div
              key={y.id}
              className={cn(
                "rounded-2xl border p-3 sm:p-4 flex flex-col gap-3",
                y.isCurrent ? "border-primary/40 bg-purple-50/40" : "border-gray-100",
                busy === y.id && "opacity-50",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-extrabold text-gray-900">{y.name}</h3>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">{y.code}</span>
                    {y.isCurrent && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-white">
                        <Star className="w-3 h-3" /> Hiện hành
                      </span>
                    )}
                    {y.isOngoing && !y.isCurrent && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Đang diễn ra</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {fmtRange(y.startsOn, y.endsOn)} <UsageText n={y.usage} what="bản ghi" />
                  </p>
                </div>
                {canTerms && (
                  <div className="flex items-center gap-1">
                    {!y.isCurrent && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run(y.id, () => academicConfigApi.setCurrentYear(y.id), `Đã đặt "${y.name}" làm năm học hiện hành.`)}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-primary bg-white border border-purple-100 hover:bg-purple-50 disabled:opacity-50"
                      >
                        Đặt hiện hành
                      </button>
                    )}
                    <button type="button" onClick={() => setYearDialog({ item: y })} className={cn(iconBtn, "hover:text-primary hover:bg-purple-50")} title="Sửa năm học">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={y.isCurrent || (y.usage ?? 0) > 0}
                      onClick={() => setDeleteTarget({ kind: "year", item: y })}
                      className={cn(iconBtn, "enabled:hover:text-rose-600 enabled:hover:bg-rose-50")}
                      title={y.isCurrent ? "Năm học hiện hành không xóa được" : (y.usage ?? 0) > 0 ? "Đang có dữ liệu gắn năm học — không xóa được" : "Xóa năm học"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {y.semesters.map((s) => (
                  <div key={s.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-gray-100", busy === s.id && "opacity-50")}>
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono text-[10px] font-bold text-gray-400 w-7">{s.code}</span>
                      <span className="font-semibold text-gray-800">{s.name}</span>
                      <span className="text-gray-500">{fmtRange(s.startsOn, s.endsOn)}</span>
                      {s.isOngoing && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Đang diễn ra</span>}
                      <UsageText n={s.usage} what="bảng điểm, GPA, mục tiêu" />
                    </div>
                    {canTerms && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setSemDialog({ year: y, item: s })} className={cn(iconBtn, "hover:text-primary hover:bg-purple-50")} title="Sửa học kỳ">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={(s.usage ?? 0) > 0}
                          onClick={() => setDeleteTarget({ kind: "semester", item: s, year: y })}
                          className={cn(iconBtn, "enabled:hover:text-rose-600 enabled:hover:bg-rose-50")}
                          title={(s.usage ?? 0) > 0 ? "Đang có bảng điểm — không xóa được" : "Xóa học kỳ"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {y.semesters.length === 0 && <p className="text-[11px] text-gray-400 px-1">Chưa có học kỳ.</p>}
                {canTerms && y.semesters.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setSemDialog({ year: y, item: null })}
                    className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-purple-200 text-[10.5px] font-bold text-primary hover:bg-purple-50"
                  >
                    <Plus className="w-3 h-3" /> Thêm học kỳ
                  </button>
                )}
              </div>
            </div>
          ))}
          {years.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Chưa có năm học nào.</p>}
        </div>
      </section>

      {/* ============ 3. NHIỆM KỲ NGƯỜI QUẢN LÝ ============ */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-gray-900">Nhiệm kỳ người quản lý</h2>
              <p className="text-xs text-gray-500">Vai trò, chức vụ của người quản lý gắn theo nhiệm kỳ; chỉ một nhiệm kỳ hiệu lực</p>
            </div>
          </div>
          {canTerms && (
            <button type="button" onClick={() => setTermDialog({ item: null })} className={btnAdd}>
              <Plus className="w-4 h-4" /> Thêm nhiệm kỳ
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {terms.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-2xl border p-3 flex flex-col gap-1.5",
                t.status === "active" ? "border-emerald-200 bg-emerald-50/30" : "border-gray-100",
                busy === t.id && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{t.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {fmtRange(t.startsOn, t.endsOn)}
                    {t.academicYearName ? ` · ${t.academicYearName}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    t.status === "active" ? "bg-emerald-100 text-emerald-800" : t.status === "planned" ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {t.statusLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <UsageText n={t.usage} what="chức vụ, vai trò" />
                {canTerms && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setTermDialog({ item: t })} className={cn(iconBtn, "hover:text-primary hover:bg-purple-50")} title="Sửa nhiệm kỳ">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={t.status === "active" || (t.usage ?? 0) > 0}
                      onClick={() => setDeleteTarget({ kind: "term", item: t })}
                      className={cn(iconBtn, "enabled:hover:text-rose-600 enabled:hover:bg-rose-50")}
                      title={t.status === "active" ? "Nhiệm kỳ đang hiệu lực — không xóa được" : (t.usage ?? 0) > 0 ? "Đang gắn chức vụ/vai trò — không xóa được" : "Xóa nhiệm kỳ"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {terms.length === 0 && <p className="text-center text-xs text-gray-400 py-4 md:col-span-2">Chưa có nhiệm kỳ nào.</p>}
        </div>
      </section>

      <UniversityDialog open={!!uniDialog} onClose={() => setUniDialog(null)} initial={uniDialog?.item ?? null} showToast={showToast} />
      <YearDialog open={!!yearDialog} onClose={() => setYearDialog(null)} initial={yearDialog?.item ?? null} years={years} today={today} showToast={showToast} />
      <SemesterDialog open={!!semDialog} onClose={() => setSemDialog(null)} year={semDialog?.year ?? null} initial={semDialog?.item ?? null} showToast={showToast} />
      <TermDialog open={!!termDialog} onClose={() => setTermDialog(null)} initial={termDialog?.item ?? null} years={years} canHandover={canHandover} showToast={showToast} />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa"
        message={deleteMessage}
        confirmText="Xóa"
        variant="danger"
      />
    </div>
  );
}

function UniActions({
  u,
  busy,
  onEdit,
  onToggle,
  onRestore,
  onDelete,
}: {
  u: UniversityDto;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  if (u.deletedAt) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onRestore}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold text-primary bg-white border border-purple-100 hover:bg-purple-50 disabled:opacity-50"
        >
          <RotateCcw className="w-3 h-3" /> Khôi phục
        </button>
      </div>
    );
  }
  const inUse = (u.usage ?? 0) > 0;
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} className={cn(iconBtn, "hover:text-primary hover:bg-purple-50")} title="Sửa trường">
        <Edit2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className={cn(iconBtn, "hover:text-amber-700 hover:bg-amber-50")}
        title={u.isActive ? "Tạm ẩn khỏi danh sách chọn" : "Hiện lại trong danh sách chọn"}
      >
        {u.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        disabled={busy || inUse}
        onClick={onDelete}
        className={cn(iconBtn, "enabled:hover:text-rose-600 enabled:hover:bg-rose-50")}
        title={inUse ? "Trường đang được dùng — không xóa được, hãy tạm ẩn" : "Xóa trường"}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
