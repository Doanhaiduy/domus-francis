"use client";

import { MajorSelect } from "@/components/members/StudyFields";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, X, Plus, Loader2, Send, Save, AlertTriangle, Info } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomInput, CustomSelect, CustomTextarea, ImageUploadDropzone } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { academicApi } from "@/lib/data/academic";
import { STATUS_META, VISIBILITY_LABEL, semesterLabel } from "@/lib/academic-format";
import type {
  AcademicMetaDto,
  AcademicRecordDto,
  AcademicRecordInput,
  GoalsVisibility,
  SaveRecordResult,
} from "@/lib/types/academic";

interface Row {
  key: string;
  name: string;
  credits: string;
  processScore: string;
  finalScore: string;
  officialTotal: string;
}

const newKey = () => Math.random().toString(36).slice(2, 10);
const emptyRow = (): Row => ({ key: newKey(), name: "", credits: "3", processScore: "", finalScore: "", officialTotal: "" });
const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const n = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : NaN;
};

export default function RecordFormModal({
  open,
  meta,
  ownRecords,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  meta: AcademicMetaDto | undefined;
  ownRecords: AcademicRecordDto[];
  /** Bảng điểm cần sửa; null = tạo mới (nếu học kỳ đã có bảng điểm của mình thì tự chuyển sang sửa) */
  editing: AcademicRecordDto | null;
  onClose: () => void;
  onSaved: (r: SaveRecordResult) => void;
}) {
  const { showToast } = useApp();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [major, setMajor] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [evidenceFileId, setEvidenceFileId] = useState("");
  const [goals, setGoals] = useState("");
  const [difficulties, setDifficulties] = useState("");
  const [visibility, setVisibility] = useState<GoalsVisibility>("leadership");
  const [hasScholarship, setHasScholarship] = useState(false);
  const [scholarshipNote, setScholarshipNote] = useState("");
  const [supportNeeded, setSupportNeeded] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [rejectNote, setRejectNote] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const ownBySemester = useMemo(() => new Map(ownRecords.map((r) => [r.semester.id, r])), [ownRecords]);
  const lockedHere = (() => {
    const r = ownBySemester.get(semesterId);
    return r && r.id !== recordId && !r.can.edit ? r : null;
  })();

  const loadRecord = (r: AcademicRecordDto) => {
    setRecordId(r.id);
    setSemesterId(r.semester.id);
    setUniversityId(r.university.id);
    setMajor(r.major ?? "");
    setStudentCode(r.studentCode ?? "");
    setRows(
      r.subjects.length
        ? r.subjects.map((x) => ({
            key: x.id,
            name: x.name,
            credits: s(x.credits),
            processScore: s(x.processScore),
            finalScore: s(x.finalScore),
            officialTotal: s(x.officialTotalScore),
          }))
        : [emptyRow()]
    );
    setEvidenceFileId(r.evidence?.fileId ?? "");
    setGoals(r.goals?.goals ?? "");
    setDifficulties(r.goals?.difficulties ?? "");
    setVisibility(r.goals?.visibility ?? "leadership");
    setHasScholarship(r.hasScholarship);
    setScholarshipNote(r.scholarshipNote ?? "");
    setSupportNeeded(!!r.support);
    setSupportSubject(r.support?.subject ?? "");
    setRejectNote(r.rejectReason);
  };

  // Khởi tạo khi mở
  useEffect(() => {
    if (!open || !meta) {
      if (!open) loadedFor.current = null;
      return;
    }
    const key = editing?.id ?? "new";
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    if (editing) {
      loadRecord(editing);
      return;
    }
    const current = meta.semesters.find((x) => x.isCurrent) ?? meta.semesters[0];
    const existing = current ? ownBySemester.get(current.id) : undefined;
    if (existing && existing.can.edit) {
      loadRecord(existing);
      return;
    }
    // Bảng điểm mới: trường/ngành/MSSV theo bảng điểm gần nhất của mình, nếu chưa có thì theo hồ sơ sinh viên
    const latest = [...ownRecords].sort((a, b) => b.semester.startsOn.localeCompare(a.semester.startsOn))[0];
    setRecordId(null);
    setSemesterId(current?.id ?? "");
    setUniversityId(latest?.university.id ?? meta.profile?.universityId ?? "");
    setMajor(latest?.major ?? meta.profile?.major ?? "");
    setStudentCode(latest?.studentCode ?? meta.profile?.studentCode ?? "");
    setRows([emptyRow(), emptyRow()]);
    setEvidenceFileId("");
    setGoals("");
    setDifficulties("");
    setVisibility("leadership");
    setHasScholarship(false);
    setScholarshipNote("");
    const openSupport = ownRecords.find((r) => r.support)?.support;
    setSupportNeeded(!!openSupport);
    setSupportSubject(openSupport?.subject ?? "");
    setRejectNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meta, editing]);

  const changeSemester = (id: string) => {
    setSemesterId(id);
    const existing = ownBySemester.get(id);
    // Học kỳ này đã có bảng điểm nháp của mình ⇒ mở bảng điểm đó để cập nhật (mỗi học kỳ một bảng điểm)
    if (existing && existing.id !== recordId && existing.can.edit) {
      loadRecord(existing);
      showToast("info", `Đã mở bảng điểm ${semesterLabel(existing.semester)} của bạn để cập nhật.`);
    }
  };

  if (!open) return null;

  const updateRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const buildInput = (submit: boolean): AcademicRecordInput | string => {
    if (!semesterId) return "Chọn học kỳ.";
    if (!universityId) return "Chọn trường đại học.";
    const filled = rows.filter((r) => r.name.trim() || r.processScore.trim() || r.finalScore.trim() || r.officialTotal.trim());
    if (!filled.length) return "Vui lòng nhập ít nhất 1 môn học!";
    const subjects = [];
    for (const r of filled) {
      const name = r.name.trim();
      if (name.length < 2) return "Tên môn học tối thiểu 2 ký tự.";
      const credits = n(r.credits);
      if (credits === null || Number.isNaN(credits) || credits <= 0 || credits > 15) return `Số tín chỉ môn "${name}" phải trong khoảng 0,5 – 15.`;
      const processScore = n(r.processScore);
      const finalScore = n(r.finalScore);
      const officialTotalScore = n(r.officialTotal);
      if ([processScore, finalScore, officialTotalScore].some((x) => Number.isNaN(x as number))) return `Điểm môn "${name}" không hợp lệ.`;
      if (processScore === null && finalScore === null && officialTotalScore === null) return `Môn "${name}" chưa có điểm nào.`;
      subjects.push({ name, credits, processScore, finalScore, officialTotalScore });
    }
    if (supportNeeded && supportSubject.trim().length < 2) return "Nhập môn học cần phụ đạo.";
    return {
      semesterId,
      universityId,
      major: major.trim() || null,
      studentCode: studentCode.trim() || null,
      hasScholarship,
      scholarshipNote: hasScholarship ? scholarshipNote.trim() || null : null,
      subjects,
      evidenceFileId: evidenceFileId || null,
      goals: goals.trim() || null,
      difficulties: difficulties.trim() || null,
      goalsVisibility: visibility,
      supportNeeded,
      supportSubject: supportNeeded ? supportSubject.trim() : null,
      submit,
    };
  };

  const save = async (submit: boolean) => {
    const input = buildInput(submit);
    if (typeof input === "string") {
      showToast("error", input);
      return;
    }
    if (submit && !evidenceFileId) {
      showToast("error", "Cần tải ảnh minh chứng bảng điểm trước khi nộp xác minh (có thể “Lưu nháp” trước).");
      return;
    }
    setBusy(submit ? "submit" : "draft");
    try {
      const res = recordId ? await academicApi.update(recordId, input) : await academicApi.create(input);
      if (res.submitError) {
        // Bản nháp đã lưu; ở lại biểu mẫu để bổ sung
        setRecordId(res.record.id);
        showToast("warning", `Đã lưu bản nháp nhưng chưa nộp được: ${res.submitError}`);
        onSaved(res);
        return;
      }
      showToast("success", submit ? "Đã nộp bảng điểm — chờ Ban điều hành xác minh." : "Đã lưu bản nháp bảng điểm.");
      onSaved(res);
      onClose();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const semesterOptions = (meta?.semesters ?? []).map((x) => {
    const own = ownBySemester.get(x.id);
    return {
      value: x.id,
      label: `${semesterLabel(x)}${x.isCurrent ? " (hiện tại)" : ""}`,
      subLabel: own ? `Đã có bảng điểm — ${STATUS_META[own.status].label}` : undefined,
    };
  });
  const universityOptions = (meta?.universities ?? []).map((u) => ({ value: u.id, label: u.name, subLabel: u.shortName ?? undefined }));
  const scale = meta?.defaultScale;

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-base font-black text-gray-900">{recordId ? "Cập Nhật Bảng Điểm Của Tôi" : "Điền Kết Quả Điểm Số"}</h3>
                  <p className="text-[11px] text-gray-500">
                    {meta?.me?.fullName ?? "Thành viên"} • Điểm quá trình/giữa kỳ, cuối kỳ và ảnh minh chứng bảng điểm (EVD)
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(false);
              }}
              className="p-5 space-y-4 overflow-y-auto custom-scroll flex-1"
            >
              {rejectNote && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <b>Ghi chú của người xác minh:</b> {rejectNote}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CustomSelect label="Học kỳ" value={semesterId} onChange={changeSemester} options={semesterOptions} placeholder="-- Chọn học kỳ --" />
                <CustomSelect label="Trường Đại Học" value={universityId} onChange={setUniversityId} options={universityOptions} placeholder="-- Chọn trường --" />
              </div>

              {lockedHere && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800 flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Bạn đã có bảng điểm {semesterLabel(lockedHere.semester)} ({STATUS_META[lockedHere.status].label}).{" "}
                    {lockedHere.status === "submitted"
                      ? "Mở bảng điểm đó và bấm “Rút lại để sửa” nếu cần chỉnh."
                      : "Bảng điểm đã xác minh chỉ Ban điều hành mới mở lại được."}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MajorSelect label="Chuyên ngành" value={major} onChange={setMajor} />
                <CustomInput label="Mã Số Sinh Viên (MSSV)" placeholder="VD: 20210892" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} maxLength={40} />
              </div>

              {/* Danh sách môn */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700">Danh sách môn học, điểm quá trình/giữa kỳ &amp; cuối kỳ:</label>
                  <button type="button" onClick={() => setRows((p) => [...p, emptyRow()])} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm môn</span>
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll p-2 bg-gray-50 rounded-xl">
                  <div className="hidden sm:flex items-center gap-2 px-2 text-[10px] font-bold text-gray-400 uppercase">
                    <span className="flex-1">Tên môn học</span>
                    <span className="w-14 text-center">Tín chỉ</span>
                    <span className="w-16 text-center">QT/GK</span>
                    <span className="w-16 text-center">Cuối kỳ</span>
                    <span className="w-16 text-center" title="Điểm tổng kết chính thức do trường công bố (nếu có)">TK trường</span>
                    <span className="w-6" />
                  </div>
                  {rows.map((r) => (
                    <div key={r.key} className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                      <input
                        type="text"
                        placeholder="Tên môn học..."
                        value={r.name}
                        maxLength={200}
                        onChange={(e) => updateRow(r.key, { name: e.target.value })}
                        className="w-full sm:w-auto sm:flex-1 p-1.5 rounded-md border border-gray-100 text-xs outline-none"
                      />
                      <input
                        type="number"
                        step="0.5"
                        min={0.5}
                        max={15}
                        title="Số tín chỉ"
                        placeholder="TC"
                        value={r.credits}
                        onChange={(e) => updateRow(r.key, { credits: e.target.value })}
                        className="w-14 p-1.5 rounded-md border border-gray-100 text-xs text-center outline-none"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={scale?.maxScore ?? 10}
                        title="Điểm quá trình / giữa kỳ"
                        placeholder="QT"
                        value={r.processScore}
                        onChange={(e) => updateRow(r.key, { processScore: e.target.value })}
                        className="w-16 p-1.5 rounded-md border border-gray-100 text-xs text-center font-bold text-purple-700 outline-none"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={scale?.maxScore ?? 10}
                        title="Điểm cuối kỳ (để trống nếu chưa thi)"
                        placeholder="CK"
                        value={r.finalScore}
                        onChange={(e) => updateRow(r.key, { finalScore: e.target.value })}
                        className="w-16 p-1.5 rounded-md border border-gray-100 text-xs text-center font-bold text-indigo-700 outline-none"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={scale?.maxScore ?? 10}
                        title="Điểm tổng kết chính thức của trường (nếu có — ưu tiên hơn công thức)"
                        placeholder="TK"
                        value={r.officialTotal}
                        onChange={(e) => updateRow(r.key, { officialTotal: e.target.value })}
                        className="w-16 p-1.5 rounded-md border border-gray-100 text-xs text-center font-bold text-gray-700 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.key !== r.key) : [emptyRow()]))}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded w-6"
                        title="Bỏ môn này"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-gray-500 leading-relaxed">
                  Tổng kết, điểm chữ và GPA do hệ thống tính theo thang điểm của trường
                  {scale ? ` (mặc định: ${scale.processWeightPct}% quá trình + ${scale.finalWeightPct}% cuối kỳ, thang ${scale.maxScore})` : ""}. Chưa thi cuối kỳ thì để
                  trống — lưu nháp được nhưng chỉ nộp khi đủ điểm. Môn trường chỉ công bố điểm tổng kết: nhập vào cột “TK trường”.
                </p>
              </div>

              {/* Minh chứng */}
              <ImageUploadDropzone
                bucket="academic-evidence"
                allowPdf
                label="Ảnh Minh Chứng Bảng Điểm / Cổng Đào Tạo (EVD)"
                placeholder="Kéo thả ảnh chụp màn hình bảng điểm hoặc nhấp để chọn tệp từ máy..."
                helperText="Ảnh chụp cổng sinh viên hoặc giấy xác nhận điểm (JPG, PNG, WEBP, PDF) — bắt buộc khi nộp xác minh"
                value={evidenceFileId}
                onChange={setEvidenceFileId}
              />

              {/* Nguyện vọng */}
              <CustomTextarea
                label="Nguyện vọng / Mục tiêu học tập"
                placeholder="VD: Mục tiêu đạt học bổng; tham gia nghiên cứu khoa học..."
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                maxLength={2000}
                rows={2}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <CustomTextarea
                    label="Khó khăn (không bắt buộc)"
                    placeholder="VD: Lịch thực tập dày, cần sắp xếp giờ học nhóm..."
                    value={difficulties}
                    onChange={(e) => setDifficulties(e.target.value)}
                    maxLength={2000}
                    rows={2}
                  />
                </div>
                <CustomSelect
                  label="Ai được xem nguyện vọng?"
                  value={visibility}
                  onChange={(v) => setVisibility(v as GoalsVisibility)}
                  options={(Object.keys(VISIBILITY_LABEL) as GoalsVisibility[]).map((k) => ({ value: k, label: VISIBILITY_LABEL[k] }))}
                />
              </div>

              {/* Học bổng & phụ đạo */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-100 cursor-pointer">
                  <input type="checkbox" checked={hasScholarship} onChange={(e) => setHasScholarship(e.target.checked)} className="w-4 h-4 text-primary rounded accent-primary" />
                  <span className="text-xs font-bold text-amber-900">Đạt học bổng</span>
                </label>
                <label className="flex items-center gap-2 p-3 bg-rose-50/60 rounded-xl border border-rose-100 cursor-pointer">
                  <input type="checkbox" checked={supportNeeded} onChange={(e) => setSupportNeeded(e.target.checked)} className="w-4 h-4 text-primary rounded accent-primary" />
                  <span className="text-xs font-bold text-rose-900">Cần phụ đạo kèm</span>
                </label>
              </div>
              {hasScholarship && (
                <CustomInput
                  label="Tên / loại học bổng"
                  placeholder="VD: Học bổng khuyến khích học tập loại Giỏi"
                  value={scholarshipNote}
                  onChange={(e) => setScholarshipNote(e.target.value)}
                  maxLength={500}
                />
              )}
              {supportNeeded && (
                <CustomInput
                  label="Môn học cụ thể cần anh lớn phụ đạo"
                  placeholder="VD: Giải tích 2, Kinh tế lượng..."
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  maxLength={200}
                />
              )}
              {supportNeeded && (
                <p className="-mt-2 text-[10px] text-gray-500">Yêu cầu phụ đạo được gửi tới Ban điều hành để ghép cặp — điểm số của bạn không được chia sẻ cho người kèm.</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={!!busy || !!lockedHere}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu nháp
                </button>
                <button
                  type="button"
                  disabled={!!busy || !!lockedHere}
                  onClick={() => save(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy === "submit" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Lưu &amp; Nộp Xác Minh
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Portal>
  );
}
