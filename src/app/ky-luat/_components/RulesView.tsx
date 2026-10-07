"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, DownloadCloud, Eye, EyeOff, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomSelect, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { disciplineApi, useDisciplineRules } from "@/lib/data/discipline";
import { PENALTY_KINDS, PENALTY_LABEL, PENALTY_UNIT, type DisciplineRuleDto, type PenaltyKind } from "@/lib/types/discipline";
import { cn } from "@/lib/utils";

const KIND_OPTIONS = PENALTY_KINDS.map((k) => ({ value: k, label: PENALTY_LABEL[k] }));

const defaultPenalty = (r: DisciplineRuleDto) =>
  r.defaultPenaltyKind === "none" ? "Chỉ ghi nhận" : r.defaultPenaltyKind === "other" ? r.defaultPenaltyNote || PENALTY_LABEL.other : `${r.defaultPenaltyQty ?? "?"} ${PENALTY_UNIT[r.defaultPenaltyKind]}${r.defaultPenaltyNote ? ` — ${r.defaultPenaltyNote}` : ""}`;

/** Danh mục điều luật + mức phạt gợi ý. Mọi thành viên đọc được; người quản lý (discipline.manage) thêm/sửa/xóa. */
export function RulesView() {
  const { showToast } = useApp();
  const { rules, canManage, isLoading, error } = useDisciplineRules();
  const [form, setForm] = useState<{ rule?: DisciplineRuleDto } | null>(null);
  const [toDelete, setToDelete] = useState<DisciplineRuleDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string | ((r: never) => string)) => {
    setBusy(key);
    try {
      const r = await fn();
      showToast("success", typeof ok === "function" ? ok(r as never) : ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-2xl">
          {canManage ? "Danh mục điều luật dùng để ghi nhận vi phạm, kèm hình phạt gợi ý (tự điền khi chọn điều luật). Điều bị ẩn không còn hiện khi ghi nhận mới nhưng lịch sử vẫn giữ." : "Các điều luật của nhà và mức phạt tương ứng."}
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === "import"}
              onClick={() => run("import", () => disciplineApi.importRules(), (r: { created: number; skipped: number }) => (r.created ? `Đã nhập ${r.created} điều từ Luật nhà${r.skipped ? ` (bỏ qua ${r.skipped} điều đã có)` : ""}.` : "Không có điều mới để nhập — Luật nhà trống hoặc đã nhập hết."))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 bg-white text-primary text-xs font-bold hover:bg-purple-50 transition disabled:opacity-60"
            >
              {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />} Nhập từ Luật nhà
            </button>
            <button type="button" onClick={() => setForm({})} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
              <Plus className="w-4 h-4" /> Thêm điều luật
            </button>
          </div>
        )}
      </div>

      {error && !rules.length && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-16 rounded-2xl" />)}</div>
      ) : rules.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">Chưa có điều luật nào</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{canManage ? "Thêm từng điều luật kèm mức phạt, hoặc bấm “Nhập từ Luật nhà” để lấy các điều khoản đã có trong mục Luật nhà." : "Người quản lý sẽ cập nhật danh mục luật và mức phạt."}</p>
        </div>
      ) : (
        <ul className="bg-white border border-purple-100 rounded-2xl divide-y divide-gray-100 overflow-hidden">
          {rules.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-3.5", !r.isActive && "bg-gray-50/70", busy === r.id && "opacity-60 pointer-events-none")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900"><span className="text-primary mr-2">{r.code}</span>{r.title}{!r.isActive && <span className="ml-2 text-[10px] font-extrabold uppercase text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">Đã ẩn</span>}</p>
                {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                <p className="text-xs text-gray-700 mt-1"><span className="font-bold">Mức phạt:</span> {defaultPenalty(r)}{canManage && r.usageCount > 0 ? <span className="text-gray-400"> · đã dùng {r.usageCount} lần</span> : null}</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => run(r.id, () => disciplineApi.updateRule(r.id, { isActive: !r.isActive }), r.isActive ? "Đã ẩn điều luật." : "Đã hiện lại điều luật.")} title={r.isActive ? "Ẩn" : "Hiện"} aria-label={r.isActive ? "Ẩn điều luật" : "Hiện điều luật"} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100">{r.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  <button type="button" onClick={() => setForm({ rule: r })} title="Sửa" aria-label="Sửa điều luật" className="p-2 rounded-xl text-gray-500 hover:bg-gray-100"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setToDelete(r)} title="Xóa" aria-label="Xóa điều luật" className="p-2 rounded-xl text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {form && <RuleForm rule={form.rule} nextCode={`L${String(rules.length + 1).padStart(2, "0")}`} onClose={() => setForm(null)} />}
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { const r = toDelete; setToDelete(null); if (r) run(r.id, () => disciplineApi.deleteRule(r.id), "Đã xóa điều luật."); }}
        title="Xóa điều luật?"
        message={<>Xóa điều “<b>{toDelete?.code} — {toDelete?.title}</b>”. Các vi phạm đã ghi vẫn giữ nguyên (đã lưu tên điều luật). Chỉ muốn ngừng dùng thì hãy <b>Ẩn</b>.</>}
        confirmText="Xóa"
        cancelText="Giữ lại"
        variant="danger"
      />
    </div>
  );
}

function RuleForm({ rule, nextCode, onClose }: { rule?: DisciplineRuleDto; nextCode: string; onClose: () => void }) {
  const { showToast } = useApp();
  const [code, setCode] = useState(rule?.code ?? nextCode);
  const [title, setTitle] = useState(rule?.title ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [kind, setKind] = useState<PenaltyKind>(rule?.defaultPenaltyKind ?? "none");
  const [qty, setQty] = useState(rule?.defaultPenaltyQty ? String(rule.defaultPenaltyQty) : "");
  const [note, setNote] = useState(rule?.defaultPenaltyNote ?? "");
  const [sortOrder, setSortOrder] = useState(String(rule?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const needsQty = kind === "rosary" || kind === "mass" || kind === "duty";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return showToast("error", "Tên điều luật tối thiểu 2 ký tự.");
    if (needsQty && !(Number(qty) >= 1)) return showToast("error", "Hình phạt gợi ý cần số lượng (từ 1).");
    const body = {
      code: code.trim(),
      title: title.trim(),
      description: description.trim() || null,
      defaultPenaltyKind: kind,
      defaultPenaltyQty: needsQty ? Number(qty) : null,
      defaultPenaltyNote: kind === "none" ? null : note.trim() || null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
    };
    setBusy(true);
    try {
      if (rule) await disciplineApi.updateRule(rule.id, body);
      else await disciplineApi.createRule(body);
      showToast("success", rule ? "Đã cập nhật điều luật." : "Đã thêm điều luật.");
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={rule ? "Sửa điều luật" : "Thêm điều luật"} className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <h3 className="text-base font-extrabold text-gray-900">{rule ? "Sửa điều luật" : "Thêm điều luật"}</h3>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <CustomInput label="Mã *" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="L01" />
              <div className="col-span-2"><CustomInput label="Tên điều luật *" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="VD: Về muộn sau 22:30 không xin phép" /></div>
            </div>
            <CustomTextarea label="Mô tả (tùy chọn)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3.5 space-y-3">
              <p className="text-xs font-extrabold text-gray-700">Hình phạt gợi ý khi vi phạm</p>
              <CustomSelect<PenaltyKind> label="Loại" value={kind} onChange={setKind} options={KIND_OPTIONS} />
              {needsQty && <CustomInput label={`Số lượng (${PENALTY_UNIT[kind]}) *`} type="number" inputMode="numeric" min={1} max={365} value={qty} onChange={(e) => setQty(e.target.value)} />}
              {kind !== "none" && <CustomInput label={kind === "other" ? "Mô tả hình phạt" : "Ghi chú (tùy chọn)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <CustomInput label="Thứ tự hiển thị" type="number" inputMode="numeric" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              <CustomToggle checked={isActive} onChange={setIsActive} label="Đang áp dụng" />
            </div>
          </div>
          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
