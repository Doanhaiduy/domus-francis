"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ALL_MAJORS, MAJOR_OTHER, canonicalMajor } from "@/lib/majors";

/** Ngành học: chọn trong danh sách ngành phổ biến; ngành khác thì chọn "Khác" rồi tự nhập. */
export function MajorSelect({ value, onChange, label = "Ngành học" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const known = useMemo(() => (value ? canonicalMajor(value) : null), [value]);
  // Chế độ tự nhập: giá trị hiện có không nằm trong danh sách, hoặc người dùng chủ động chọn "Khác"
  const [custom, setCustom] = useState(!!value && !known);
  useEffect(() => {
    // Giá trị nạp từ hồ sơ: ngành có sẵn → ô chọn; ngành lạ → ô tự nhập. (Giá trị rỗng không đổi chế độ để "Khác" không bị tắt.)
    if (value) setCustom(!canonicalMajor(value));
  }, [value]);

  const options = useMemo(
    () => [{ value: "", label: "— Chọn ngành —" }, ...ALL_MAJORS.map((m) => ({ value: m, label: m })), { value: MAJOR_OTHER, label: "Khác (tự nhập)…" }],
    []
  );
  const selected = custom ? MAJOR_OTHER : (known ?? "");

  return (
    <div className="space-y-2">
      <CustomSelect
        label={label}
        value={selected}
        onChange={(v) => {
          if (v === MAJOR_OTHER) {
            setCustom(true);
            if (known) onChange(""); // đổi từ ngành có sẵn sang tự nhập: xóa để nhập mới
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
        options={options}
      />
      {custom && <CustomInput aria-label="Tên ngành (tự nhập)" value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="Nhập tên ngành học" />}
    </div>
  );
}

const thisYear = new Date().getFullYear();

/** Niên khóa: năm nhập học → năm dự kiến ra trường. */
export function StudyYears({
  enrollmentYear,
  graduationYear,
  onChange,
}: {
  enrollmentYear: number | null | undefined;
  graduationYear: number | null | undefined;
  onChange: (v: { enrollmentYear: number | null; expectedGraduationYear: number | null }) => void;
}) {
  const years = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: "", label: "— Chọn —" }];
    const from = Math.min(thisYear - 12, enrollmentYear ?? thisYear, graduationYear ?? thisYear);
    const to = Math.max(thisYear + 8, graduationYear ?? thisYear);
    for (let y = to; y >= from; y--) out.push({ value: String(y), label: String(y) });
    return out;
  }, [enrollmentYear, graduationYear]);
  const num = (v: string) => (v ? Number(v) : null);
  const bad = enrollmentYear && graduationYear && graduationYear < enrollmentYear;
  return (
    <div>
      <p className="block text-xs font-bold text-gray-700 mb-1.5">Niên khóa</p>
      <div className="grid grid-cols-2 gap-3">
        <CustomSelect aria-label="Năm nhập học" value={enrollmentYear ? String(enrollmentYear) : ""} onChange={(v) => onChange({ enrollmentYear: num(v), expectedGraduationYear: graduationYear ?? null })} options={years.map((y) => (y.value ? { ...y, label: `Nhập học ${y.label}` } : { ...y, label: "Năm nhập học" }))} />
        <CustomSelect aria-label="Năm dự kiến ra trường" value={graduationYear ? String(graduationYear) : ""} onChange={(v) => onChange({ enrollmentYear: enrollmentYear ?? null, expectedGraduationYear: num(v) })} options={years.map((y) => (y.value ? { ...y, label: `Ra trường ${y.label}` } : { ...y, label: "Năm ra trường" }))} />
      </div>
      {bad ? <p className="mt-1 text-[11px] text-rose-500">Năm ra trường phải sau năm nhập học.</p> : <p className="mt-1 text-[11px] text-gray-400">Ví dụ: nhập học 2022 → ra trường 2026.</p>}
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: `Tháng ${i + 1}` }));

/** Tháng/năm vào nhà lưu xá. Giá trị là ngày ISO (YYYY-MM-DD): đổi tháng/năm thì giữ ngày cũ (hoặc ngày 01). */
export function JoinedMonthYear({ value, onChange, label = "Vào nhà lưu xá (tháng/năm)", disabled = false }: { value: string; onChange: (iso: string) => void; label?: string; disabled?: boolean }) {
  const y = value ? value.slice(0, 4) : "";
  const m = value ? value.slice(5, 7) : "";
  const years = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: "", label: "Năm" }];
    for (let yy = thisYear + 1; yy >= thisYear - 25; yy--) out.push({ value: String(yy), label: String(yy) });
    if (y && !out.some((o) => o.value === y)) out.push({ value: y, label: y });
    return out;
  }, [y]);
  const set = (ny: string, nm: string) => {
    if (!ny || !nm) {
      if (ny && !nm) onChange(`${ny}-01-01`);
      return;
    }
    const day = value ? value.slice(8, 10) : "01";
    const maxDay = new Date(Number(ny), Number(nm), 0).getDate();
    onChange(`${ny}-${nm}-${String(Math.min(Number(day) || 1, maxDay)).padStart(2, "0")}`);
  };
  return (
    <div>
      <p className="block text-xs font-bold text-gray-700 mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <CustomSelect aria-label="Tháng vào nhà" value={m} onChange={(v) => set(y || String(thisYear), v)} options={[{ value: "", label: "Tháng" }, ...MONTHS]} disabled={disabled} />
        <CustomSelect aria-label="Năm vào nhà" value={y} onChange={(v) => set(v, m || "09")} options={years} disabled={disabled} />
      </div>
    </div>
  );
}
