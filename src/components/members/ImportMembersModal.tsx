"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X, XCircle } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople, type MemberImportResult } from "@/lib/data/members";
import { downloadImportTemplate, readImportFile, type ImportRowInput } from "@/lib/members-import-file";
import { cn } from "@/lib/utils";

type Step = "pick" | "preview" | "done";

/** Nhập thành viên hàng loạt từ Excel/CSV: chọn tệp → xem kết quả kiểm tra từng dòng → xác nhận. */
export default function ImportMembersModal({ onClose, showToast }: { onClose: () => void; showToast: (t: "success" | "error" | "info" | "warning", m: string) => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [rows, setRows] = useState<ImportRowInput[]>([]);
  const [fileName, setFileName] = useState("");
  const [unknown, setUnknown] = useState<string[]>([]);
  const [result, setResult] = useState<MemberImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await readImportFile(file);
      if (!parsed.rows.length) throw new Error("Tệp không có dòng dữ liệu nào.");
      if (parsed.rows.length > 300) throw new Error(`Tệp có ${parsed.rows.length} dòng — mỗi lần nhập tối đa 300 dòng. Hãy chia nhỏ tệp.`);
      const check = await membersApi.importRows(parsed.rows as Record<string, string>[], true);
      setRows(parsed.rows);
      setUnknown(parsed.unknownHeaders);
      setFileName(file.name);
      setResult(check);
      setStep("preview");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await membersApi.importRows(rows as Record<string, string>[], false);
      setResult(r);
      setStep("done");
      await refreshPeople();
      showToast(r.created ? "success" : "warning", r.created ? `Đã thêm ${r.created} thành viên.` : "Không thêm được thành viên nào.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const problems = result?.rows.filter((r) => r.status === "error" || r.status === "failed" || r.status === "warning" || r.messages.length) ?? [];
  const list = showAll ? (result?.rows ?? []) : problems;
  const importable = result ? result.total - result.errors : 0;

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Nhập thành viên từ Excel" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start gap-3 p-5 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><FileSpreadsheet className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-gray-900">Nhập thành viên từ Excel / CSV</h3>
              <p className="text-xs text-gray-500 mt-0.5">Thêm nhiều thành viên một lần — hợp lúc đầu năm học hoặc khi chuyển từ sổ sách cũ sang.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-5 pb-4 overflow-y-auto custom-scroll flex-1 min-h-0 space-y-4">
            {step === "pick" && (
              <>
                <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5">
                  <li>Tải <b>tệp mẫu</b>, điền thông tin mỗi người một dòng (chỉ cần “Họ và tên”).</li>
                  <li>Chọn tệp .xlsx hoặc .csv đã điền — hệ thống <b>kiểm tra từng dòng</b> trước khi thêm.</li>
                  <li>Xem kết quả, rồi xác nhận để thêm các dòng hợp lệ.</li>
                </ol>
                <button type="button" onClick={() => void downloadImportTemplate()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 bg-purple-50 text-primary text-xs font-bold hover:bg-purple-100 transition">
                  <Download className="w-4 h-4" /> Tải tệp mẫu (.xlsx)
                </button>
                <label className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/40 p-8 text-center cursor-pointer hover:bg-purple-50 transition", busy && "opacity-60 pointer-events-none")}>
                  {busy ? <Loader2 className="w-7 h-7 animate-spin text-primary" /> : <Upload className="w-7 h-7 text-primary" />}
                  <span className="text-sm font-bold text-gray-800">{busy ? "Đang đọc và kiểm tra…" : "Chọn tệp Excel hoặc CSV"}</span>
                  <span className="text-xs text-gray-500">Tối đa 300 dòng, 5 MB</span>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
                </label>
                <p className="text-[11px] text-gray-500 leading-relaxed">Không nhập hàng loạt: thông tin Công giáo (tên thánh, giáo xứ…) và tài khoản đăng nhập — những mục này cần chính thành viên đồng ý / được cấp riêng.</p>
              </>
            )}

            {step !== "pick" && result && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Stat label="Tổng số dòng" value={result.total} />
                  <Stat label={step === "done" ? "Đã thêm" : "Sẽ thêm"} value={step === "done" ? result.created : importable} tone="ok" />
                  <Stat label="Cảnh báo" value={problems.filter((p) => p.status === "warning" || (p.status === "created" && p.messages.length)).length} tone="warn" />
                  <Stat label={step === "done" ? "Bị bỏ qua / lỗi" : "Lỗi (bỏ qua)"} value={result.errors} tone="err" />
                </div>
                {step === "preview" && <p className="text-xs text-gray-500">Tệp: <b>{fileName}</b>{unknown.length ? ` · Cột không nhận ra (bỏ qua): ${unknown.join(", ")}` : ""}</p>}

                {list.length > 0 ? (
                  <ul className="rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-[320px] overflow-y-auto custom-scroll">
                    {list.map((r) => (
                      <li key={r.line} className="px-3.5 py-2.5 flex gap-2.5 text-sm">
                        {r.status === "error" || r.status === "failed" ? <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" /> : r.status === "warning" || r.messages.length ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900">Dòng {r.line}: {r.fullName}</p>
                          {r.messages.map((m, i) => <p key={i} className={cn("text-xs", r.status === "error" || r.status === "failed" ? "text-rose-700" : "text-amber-700")}>{m}</p>)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800 font-semibold">Mọi dòng đều hợp lệ.</p>
                )}
                {result.rows.length > problems.length && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-bold text-primary hover:underline">{showAll ? "Chỉ hiện dòng có vấn đề" : `Hiện cả ${result.rows.length} dòng`}</button>
                )}
              </>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2.5">
            {step === "preview" && (
              <>
                <button type="button" onClick={() => { setStep("pick"); setResult(null); }} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Chọn tệp khác</button>
                <button type="button" onClick={confirm} disabled={busy || importable === 0} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Thêm {importable} thành viên
                </button>
              </>
            )}
            {step !== "preview" && <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Đóng</button>}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const c = tone === "ok" ? "text-emerald-700 bg-emerald-50" : tone === "warn" ? "text-amber-700 bg-amber-50" : tone === "err" ? "text-rose-700 bg-rose-50" : "text-gray-800 bg-gray-50";
  return (
    <div className={cn("rounded-2xl px-3.5 py-3", c)}>
      <div className="text-xl font-extrabold leading-none">{value}</div>
      <div className="text-[11px] font-semibold mt-1 opacity-80">{label}</div>
    </div>
  );
}
