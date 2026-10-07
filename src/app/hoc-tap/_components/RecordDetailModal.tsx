"use client";

import React from "react";
import {
  Image as ImageIcon,
  X,
  FileText,
  CheckCircle2,
  Undo2,
  Send,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Loader2,
  Lock,
} from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/api";
import { STATUS_META, VISIBILITY_LABEL, fmtDateTime, fmtGpa, fmtScore, rankBadge, semesterLabel } from "@/lib/academic-format";
import type { AcademicAction, AcademicRecordDto } from "@/lib/types/academic";

export default function RecordDetailModal({
  record,
  busy,
  onClose,
  onEdit,
  onDelete,
  onAction,
}: {
  record: AcademicRecordDto | null;
  busy: AcademicAction | "delete" | null;
  onClose: () => void;
  onEdit: (r: AcademicRecordDto) => void;
  onDelete: (r: AcademicRecordDto) => void;
  onAction: (r: AcademicRecordDto, action: AcademicAction) => void;
}) {
  if (!record) return null;
  const r = record;
  const badge = rankBadge(r.rank);
  const st = STATUS_META[r.status];
  const isPdf = r.evidence?.mime === "application/pdf";
  const spin = (a: AcademicAction | "delete") => (busy === a ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null);

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[90vh] overflow-hidden my-auto"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-gray-900 truncate">Bảng Điểm &amp; Minh Chứng (EVD): {r.memberName}</h3>
                  <p className="text-[11px] text-gray-500 truncate">
                    {r.university.name} • {semesterLabel(r.semester)} • {r.room}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scroll space-y-4 flex-1">
              {/* Trạng thái */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={cn("px-2.5 py-0.5 rounded-full font-bold border", st.cls)}>{st.label}</span>
                {r.submittedAt && <span className="text-gray-500">Nộp lúc {fmtDateTime(r.submittedAt)}</span>}
                {r.status === "verified" && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Xác minh bởi {r.verifiedByName ?? "Người quản lý"} • {fmtDateTime(r.verifiedAt)}
                  </span>
                )}
              </div>
              {r.rejectReason && (r.status === "rejected" || r.status === "draft") && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-800 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <b>{r.status === "rejected" ? "Lý do trả lại" : "Ghi chú khi mở lại"}:</b> {r.rejectReason}
                  </span>
                </div>
              )}

              {/* Ảnh minh chứng */}
              {r.evidence ? (
                isPdf ? (
                  <a
                    href={fileUrl(r.evidence.fileId) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 transition"
                  >
                    <FileText className="w-8 h-8 text-rose-500" />
                    <span className="text-xs font-bold text-gray-800">Mở bản PDF bảng điểm minh chứng</span>
                  </a>
                ) : (
                  <a
                    href={fileUrl(r.evidence.fileId) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl overflow-hidden border border-purple-100 shadow-sm relative group bg-gray-950"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(r.evidence.fileId, "medium") ?? ""} alt="EVD Minh Chứng" className="w-full max-h-72 object-contain mx-auto" />
                    <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold">
                      Ảnh chụp cổng thông tin sinh viên • bấm để xem cỡ lớn
                    </span>
                  </a>
                )
              ) : (
                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs">
                  Sinh viên chưa tải ảnh minh chứng bảng điểm.
                </div>
              )}

              {/* Tổng hợp GPA */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">GPA học kỳ</span>
                  <div className="font-mono text-lg font-black text-primary">{fmtGpa(r.gpa4)}</div>
                  <span className="text-[10px] text-gray-500 font-mono">({fmtGpa(r.gpa10)}/10){r.gpaPreview && r.gpa4 !== null ? " • tạm tính" : ""}</span>
                </div>
                <div className="p-3 rounded-2xl bg-white border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Xếp loại</span>
                  <div className="mt-1">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-block", badge.bg, badge.text, badge.border)}>
                      {r.rank ?? "Chưa xếp loại"}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Tín chỉ đạt</span>
                  <div className="font-mono text-lg font-black text-gray-900">
                    {fmtScore(r.creditsPassed, 1)}
                    <span className="text-xs text-gray-400">/{fmtScore(r.creditsAttempted, 1)}</span>
                  </div>
                  {r.failedCourses > 0 && <span className="text-[10px] font-bold text-rose-600">{r.failedCourses} môn nợ</span>}
                </div>
                <div className="p-3 rounded-2xl bg-white border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">GPA tích lũy</span>
                  <div className="font-mono text-lg font-black text-gray-900">{r.cumulative ? fmtGpa(r.cumulative.gpa4) : "—"}</div>
                  <span className="text-[10px] text-gray-500">{r.cumulative?.rank ?? "Sau khi nộp"}</span>
                </div>
              </div>

              {/* Điểm từng môn */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Chi tiết điểm từng môn học ({r.subjects.length} môn):</h4>
                <div className="border border-gray-100 rounded-xl overflow-x-auto custom-scroll">
                  <table className="w-full text-left text-xs border-collapse min-w-[520px]">
                    <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase font-bold">
                      <tr>
                        <th className="py-2 px-3">Tên môn học</th>
                        <th className="py-2 px-3 text-center">Tín chỉ</th>
                        <th className="py-2 px-3 text-center">QT/GK</th>
                        <th className="py-2 px-3 text-center">Cuối kỳ</th>
                        <th className="py-2 px-3 text-center">Tổng kết</th>
                        <th className="py-2 px-3 text-center">Điểm chữ</th>
                        <th className="py-2 px-3 text-center">Hệ 4</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {r.subjects.map((sub) => (
                        <tr key={sub.id} className="hover:bg-purple-50/20">
                          <td className="py-2 px-3 font-bold text-gray-900">
                            {sub.name}
                            {!sub.countsInGpa && sub.totalScore !== null && <span className="ml-1 text-[9px] font-semibold text-gray-400">(không tính GPA)</span>}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">{fmtScore(sub.credits, 1)}</td>
                          <td className="py-2 px-3 text-center font-mono text-purple-700 font-bold">{fmtScore(sub.processScore)}</td>
                          <td className="py-2 px-3 text-center font-mono text-indigo-700 font-bold">{fmtScore(sub.finalScore)}</td>
                          <td className="py-2 px-3 text-center font-mono font-black text-gray-900">
                            {sub.totalScore === null ? <span className="text-[10px] font-semibold text-amber-600">Chưa đủ điểm</span> : fmtScore(sub.totalScore)}
                            {sub.officialTotalScore !== null && <span className="block text-[9px] font-semibold text-gray-400">điểm trường</span>}
                          </td>
                          <td className={cn("py-2 px-3 text-center font-mono font-bold", sub.isPass === false ? "text-rose-600" : "text-emerald-700")}>
                            {sub.letterGrade ?? "—"}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">{fmtScore(sub.gpaPoints)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10px] text-gray-400">
                  Thang điểm: {r.scale.name} — tổng kết = {r.scale.processWeightPct}% quá trình + {r.scale.finalWeightPct}% cuối kỳ (hoặc điểm tổng kết chính thức của trường).
                </p>
              </div>

              {/* Học bổng, phụ đạo */}
              {(r.hasScholarship || r.support) && (
                <div className="flex flex-wrap gap-2">
                  {r.hasScholarship && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-800">
                      <Sparkles className="w-3.5 h-3.5" />
                      Đạt học bổng{r.scholarshipNote ? `: ${r.scholarshipNote}` : ""}
                    </span>
                  )}
                  {r.support && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-100 text-[11px] font-bold text-rose-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Cần phụ đạo: {r.support.subject}
                      {r.support.status === "matched" ? " (đã ghép cặp)" : ""}
                    </span>
                  )}
                </div>
              )}

              {/* Nguyện vọng */}
              <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1">
                <span className="text-xs font-bold text-purple-900 flex items-center justify-between gap-2">
                  <span>Nguyện vọng &amp; Ghi chú học tập:</span>
                  {r.goals && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-500">
                      <Lock className="w-3 h-3" />
                      {VISIBILITY_LABEL[r.goals.visibility]}
                    </span>
                  )}
                </span>
                {r.goals?.goals || r.goals?.difficulties ? (
                  <>
                    {r.goals?.goals && <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{r.goals.goals}</p>}
                    {r.goals?.difficulties && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                        <b className="text-gray-600">Khó khăn:</b> {r.goals.difficulties}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    {r.isOwn ? "Chưa ghi nguyện vọng cho học kỳ này." : "Không có nguyện vọng được chia sẻ."}
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 bg-gray-50/50">
              {r.can.delete && (
                <button
                  onClick={() => onDelete(r)}
                  disabled={!!busy}
                  className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  {spin("delete") ?? <Trash2 className="w-3.5 h-3.5" />}
                  Xóa bản nháp
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Đóng
              </button>
              {r.can.withdraw && (
                <button
                  onClick={() => onAction(r, "withdraw")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {spin("withdraw") ?? <Undo2 className="w-3.5 h-3.5" />}
                  Rút lại để sửa
                </button>
              )}
              {r.can.edit && (
                <button
                  onClick={() => onEdit(r)}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary text-xs font-bold border border-purple-200 disabled:opacity-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Sửa bảng điểm
                </button>
              )}
              {r.can.submit && (
                <button
                  onClick={() => onAction(r, "submit")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 disabled:opacity-50"
                >
                  {spin("submit") ?? <Send className="w-3.5 h-3.5" />}
                  Nộp xác minh
                </button>
              )}
              {r.can.reject && (
                <button
                  onClick={() => onAction(r, "reject")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  {spin("reject") ?? <Undo2 className="w-3.5 h-3.5" />}
                  Trả lại
                </button>
              )}
              {r.can.verify && (
                <button
                  onClick={() => onAction(r, "verify")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 disabled:opacity-50"
                >
                  {spin("verify") ?? <CheckCircle2 className="w-3.5 h-3.5" />}
                  Xác minh bảng điểm
                </button>
              )}
              {r.can.reopen && (
                <button
                  onClick={() => onAction(r, "reopen")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-amber-200 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  {spin("reopen") ?? <RotateCcw className="w-3.5 h-3.5" />}
                  Mở lại để sửa
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
