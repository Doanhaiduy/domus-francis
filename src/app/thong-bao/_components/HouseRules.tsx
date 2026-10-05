"use client";

// Luật nhà: các mục (giờ giấc, vệ sinh, khách…) + điều khoản, có giờ cụ thể. Mọi thành viên xem và tải PDF;
// Trưởng nhà / Admin soạn, sửa, sắp xếp từng mục.
import React, { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clock, Download, EyeOff, FilePlus2, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { houseRulesApi, minutesOf, refreshHouseRules, useHouseRules } from "@/lib/data/house-rules";
import { HOUSE_RULE_TEMPLATES, type HouseRuleInput, type HouseRuleItemDto, type HouseRuleSectionDto } from "@/lib/types/house-rules";
import { exportElementToPdf } from "@/lib/pdfExport";
import { CustomInput, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

function RulesSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Đang tải luật nhà">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="w-40 h-7" />
          <Skeleton className="w-72 h-3.5" />
        </div>
        <Skeleton className="w-32 h-10 rounded-xl" />
      </div>
      <Skeleton className="w-full h-40 rounded-3xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-3">
          <Skeleton className="w-48 h-5" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-5/6 h-4" />
          <Skeleton className="w-4/6 h-4" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Soạn / sửa một mục
// ---------------------------------------------------------------------
function SectionEditor({
  open,
  onClose,
  section,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  section: HouseRuleSectionDto | null;
  initial?: HouseRuleInput | null;
}) {
  const { showToast } = useApp();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<HouseRuleItemDto[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const src = section ?? initial ?? null;
    setTitle(src?.title ?? "");
    setIcon(src?.icon ?? "");
    setDescription(src?.description ?? "");
    setItems(src?.items?.length ? src.items.map((i) => ({ ...i })) : [{ time: null, text: "" }]);
    setActive(section ? section.isActive : true);
    setError(null);
  }, [open, section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setItem = (i: number, patch: Partial<HouseRuleItemDto>) => setItems((list) => list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const n = [...list];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    setError(null);
    const clean = items.map((x) => ({ time: x.time?.trim() || null, text: x.text.trim() })).filter((x) => x.text);
    if (title.trim().length < 2) return setError("Nhập tên mục (tối thiểu 2 ký tự).");
    if (!clean.length) return setError("Thêm ít nhất một điều khoản.");
    const body: HouseRuleInput = { title: title.trim(), icon: icon.trim() || null, description: description.trim() || null, items: clean, isActive: active };
    setBusy(true);
    try {
      if (section) await houseRulesApi.update(section.id, body);
      else await houseRulesApi.create(body);
      await refreshHouseRules();
      showToast("success", section ? "Đã cập nhật mục luật nhà." : "Đã thêm mục luật nhà.");
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
      icon={<ScrollText className="w-5 h-5" />}
      title={section ? "Sửa mục luật nhà" : "Thêm mục luật nhà"}
      subtitle="Mỗi điều khoản có thể kèm giờ cụ thể (vd. 22:30 — tắt đèn)"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Hủy bỏ
          </button>
          <button disabled={busy} onClick={save} className={btnPrimary}>
            {busy ? "Đang lưu..." : "Lưu mục"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <CustomInput label="Biểu tượng" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="⏰" maxLength={8} />
        <CustomInput label="Tên mục *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Giờ giấc sinh hoạt" maxLength={120} />
      </div>
      <CustomTextarea label="Mô tả ngắn (tùy chọn)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-1.5">Các điều khoản</label>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-xl border border-gray-100 bg-gray-50/50">
              <div className="w-28 shrink-0">
                <input
                  value={it.time ?? ""}
                  onChange={(e) => setItem(i, { time: e.target.value })}
                  placeholder="Giờ (22:30)"
                  maxLength={30}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
              <textarea
                value={it.text}
                onChange={(e) => setItem(i, { text: e.target.value })}
                rows={2}
                maxLength={400}
                placeholder="Nội dung điều khoản…"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 resize-y"
              />
              <div className="flex flex-col gap-0.5 shrink-0">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Lên">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Xuống">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <button type="button" onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : [{ time: null, text: "" }]))} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 shrink-0" aria-label="Xóa điều khoản">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((l) => [...l, { time: null, text: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" /> Thêm điều khoản
        </button>
      </div>
      <CustomToggle checked={active} onChange={setActive} label="Hiển thị với thành viên" description="Tắt để ẩn mục này (chỉ Ban điều hành còn thấy)" />
      <ErrorBox error={error} />
    </DialogShell>
  );
}

// ---------------------------------------------------------------------
// Bản in PDF
// ---------------------------------------------------------------------
function Printable({ innerRef, houseName, sections, updatedAt, timetable }: { innerRef: React.RefObject<HTMLDivElement>; houseName: string; sections: HouseRuleSectionDto[]; updatedAt: string | null; timetable: { time: string; text: string; section: string }[] }) {
  return (
    <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden>
      <div ref={innerRef} style={{ width: 760, padding: 36, background: "#fff", color: "#111827", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: "#5f3add", fontWeight: 700 }}>{houseName.toUpperCase()}</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>LUẬT NHÀ</div>
          {updatedAt && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Cập nhật ngày {fmtDate(updatedAt)}</div>}
        </div>
        {timetable.length > 0 && (
          <div style={{ marginBottom: 18, border: "1px solid #e9d5ff", borderRadius: 10, padding: 12, background: "#faf5ff" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Giờ giấc chung</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {timetable.map((t, i) => (
                  <tr key={i}>
                    <td style={{ width: 130, padding: "3px 6px", fontWeight: 700, color: "#5f3add", verticalAlign: "top" }}>{t.time}</td>
                    <td style={{ padding: "3px 6px" }}>{t.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sections.map((s, idx) => (
          <div key={s.id} style={{ marginBottom: 16, pageBreakInside: "avoid" }}>
            <div style={{ fontSize: 16, fontWeight: 800, borderBottom: "2px solid #e5e7eb", paddingBottom: 4, marginBottom: 6 }}>
              {idx + 1}. {s.icon ? `${s.icon} ` : ""}
              {s.title}
            </div>
            {s.description && <div style={{ color: "#4b5563", fontStyle: "italic", marginBottom: 4 }}>{s.description}</div>}
            <ol style={{ margin: 0, paddingLeft: 22 }}>
              {s.items.map((it, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  {it.time && <b style={{ color: "#5f3add" }}>[{it.time}] </b>}
                  {it.text}
                </li>
              ))}
            </ol>
          </div>
        ))}
        <div style={{ marginTop: 22, textAlign: "center", color: "#6b7280", fontSize: 12 }}>Mọi thành viên có trách nhiệm tuân thủ luật nhà. Pax et Bonum! 🕊️</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Màn hình chính
// ---------------------------------------------------------------------
export default function HouseRules() {
  const { showToast } = useApp();
  const { rules, error, isLoading, mutate } = useHouseRules();
  const [editing, setEditing] = useState<HouseRuleSectionDto | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [template, setTemplate] = useState<HouseRuleInput | null>(null);
  const [deleting, setDeleting] = useState<HouseRuleSectionDto | null>(null);
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const sections = rules?.sections ?? [];
  const visible = useMemo(() => sections.filter((s) => s.isActive || rules?.canManage), [sections, rules?.canManage]);
  const timetable = useMemo(() => {
    const rows = sections
      .filter((s) => s.isActive)
      .flatMap((s) => s.items.filter((i) => minutesOf(i.time) !== null).map((i) => ({ time: i.time as string, text: i.text, section: s.title })));
    return rows.sort((a, b) => (minutesOf(a.time) ?? 0) - (minutesOf(b.time) ?? 0));
  }, [sections]);

  if (error && !rules) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
        Không tải được luật nhà: {errorMessage(error)} (nếu vừa cập nhật hệ thống, cơ sở dữ liệu có thể chưa được nâng cấp — báo Admin).
      </div>
    );
  }
  if (isLoading && !rules) return <RulesSkeleton />;
  if (!rules) return null;

  const canManage = rules.canManage;
  const openNew = (tpl?: HouseRuleInput | null) => {
    setEditing(null);
    setTemplate(tpl ?? null);
    setEditorOpen(true);
  };
  const openEdit = (s: HouseRuleSectionDto) => {
    setEditing(s);
    setTemplate(null);
    setEditorOpen(true);
  };

  const move = async (id: string, d: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await houseRulesApi.reorder(ids);
      await mutate();
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  const useTemplates = async () => {
    try {
      for (const t of HOUSE_RULE_TEMPLATES) await houseRulesApi.create(t);
      await refreshHouseRules();
      showToast("success", "Đã tạo các mục mẫu — hãy sửa lại cho đúng thực tế của nhà.");
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 60));
      if (!printRef.current) throw new Error("no element");
      const ok = await exportElementToPdf({ element: printRef.current, filename: "Luat_Nha", margin: 8, scale: 2 });
      showToast(ok ? "success" : "error", ok ? "Đã tải PDF luật nhà." : "Không thể xuất PDF. Vui lòng thử lại!");
    } catch {
      showToast("error", "Không thể xuất PDF. Vui lòng thử lại!");
    } finally {
      setExporting(false);
    }
  };

  const activeForPdf = sections.filter((s) => s.isActive);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ScrollText className="w-4 h-4" />
            <span>Nội quy cộng đoàn</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Luật nhà</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Giờ giấc và quy định sinh hoạt chung{rules.updatedAt ? ` · cập nhật ${fmtDate(rules.updatedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportPdf}
            disabled={exporting || activeForPdf.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-primary" /> {exporting ? "Đang tạo PDF..." : "Tải PDF"}
          </button>
          {canManage && (
            <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95">
              <Plus className="w-4 h-4" /> Thêm mục
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="bg-white rounded-3xl p-10 border border-dashed border-gray-200 text-center">
          <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-800">Nhà chưa có luật nhà nào</p>
          <p className="text-xs text-gray-500 mt-1">{canManage ? "Thêm từng mục hoặc bắt đầu từ bộ mẫu gợi ý rồi chỉnh lại cho đúng thực tế." : "Trưởng nhà sẽ đăng luật nhà tại đây."}</p>
          {canManage && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold">
                <Plus className="w-4 h-4" /> Thêm mục đầu tiên
              </button>
              <button onClick={useTemplates} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold">
                <FilePlus2 className="w-4 h-4" /> Dùng bộ mẫu gợi ý
              </button>
            </div>
          )}
        </div>
      )}

      {timetable.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 to-white rounded-3xl p-5 sm:p-6 border border-purple-100 shadow-xs">
          <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" /> Giờ giấc chung
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {timetable.map((t, i) => (
              <div key={i} className="flex items-baseline gap-3 text-xs">
                <span className="w-24 shrink-0 font-extrabold text-primary tabular-nums">{t.time}</span>
                <span className="text-gray-700">{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visible.map((s, idx) => (
        <section key={s.id} className={`bg-white rounded-3xl p-5 sm:p-6 border shadow-xs flex flex-col gap-3 ${s.isActive ? "border-purple-50" : "border-dashed border-gray-300 opacity-80"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-xl shrink-0">{s.icon || "📜"}</div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-gray-900">
                  {idx + 1}. {s.title}
                  {!s.isActive && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">
                      <EyeOff className="w-3 h-3" /> Đang ẩn
                    </span>
                  )}
                </h2>
                {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => move(s.id, -1)} disabled={idx === 0} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30" aria-label="Lên">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button onClick={() => move(s.id, 1)} disabled={idx === visible.length - 1} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30" aria-label="Xuống">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-purple-50" aria-label="Sửa">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleting(s)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Xóa">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <ol className="flex flex-col gap-2">
            {s.items.map((it, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-800">
                <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span className="flex-1 leading-relaxed">
                  {it.time && <span className="inline-block mr-2 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[11px] font-extrabold align-middle tabular-nums">{it.time}</span>}
                  {it.text}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {canManage && (
        <SectionEditor open={editorOpen} onClose={() => setEditorOpen(false)} section={editing} initial={template} />
      )}
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const s = deleting;
          if (!s) return;
          try {
            await houseRulesApi.remove(s.id);
            await refreshHouseRules();
            showToast("success", "Đã xóa mục luật nhà.");
          } catch (e) {
            showToast("error", errorMessage(e));
          }
        }}
        title="Xóa mục luật nhà?"
        message={<>Mục <b>{deleting?.title}</b> sẽ bị xóa khỏi luật nhà. Nếu chỉ muốn tạm gỡ, hãy sửa mục và tắt “Hiển thị với thành viên”.</>}
        confirmText="Xóa mục"
      />
      {exporting && <Printable innerRef={printRef} houseName={rules.houseName ?? "Lưu Xá Phanxicô"} sections={activeForPdf} updatedAt={rules.updatedAt} timetable={timetable} />}
    </div>
  );
}
