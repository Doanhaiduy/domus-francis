"use client";

// Luật nhà: các mục (giờ giấc, vệ sinh, khách…) + điều khoản, có giờ cụ thể. Mọi thành viên xem và tải PDF;
// Trưởng nhà / Admin soạn, sửa, sắp xếp từng mục.
import React, { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clock, Download, EyeOff, FilePlus2, Pencil, Plus, ScrollText, ShieldAlert, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { houseRulesApi, minutesOf, refreshHouseRules, useHouseRules } from "@/lib/data/house-rules";
import { HOUSE_RULE_TEMPLATES, type HouseRuleInput, type HouseRuleItemDto, type HouseRuleSectionDto } from "@/lib/types/house-rules";
import { downloadHouseRulesPdf } from "@/lib/pdf/house-rules";
import { CustomInput, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RedBadge } from "@/components/ui/RedBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { DialogShell, ErrorBox, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Đánh số điều khoản: điều con (sub) không có số riêng, các điều còn lại đếm liên tục trong mục. */
function numberItems(items: HouseRuleItemDto[]): (number | null)[] {
  let n = 0;
  return items.map((it) => (it.sub ? null : ++n));
}

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
    const clean: HouseRuleItemDto[] = items
      .map((x) => ({ time: x.time?.trim() || null, text: x.text.trim(), ...(x.red ? { red: true } : {}), ...(x.sub ? { sub: true } : {}), ...(x.note ? { note: true } : {}) }))
      .filter((x) => x.text);
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
      subtitle="Mỗi điều khoản có thể kèm giờ cụ thể (vd. 22:30 — tắt đèn) và được đánh dấu Lỗi đỏ"
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
            <div key={i} className={`p-2 rounded-xl border ${it.red ? "border-red-200 bg-red-50/60" : "border-gray-100 bg-gray-50/50"}`}>
             <div className="flex items-start gap-2">
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
             {/* Kiểu điều khoản: Lỗi đỏ (nổi bật) · Điều con (thụt vào) · Ghi chú (không phải điều để ghi vi phạm) */}
             <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:pl-[7.5rem]">
               {([
                 { key: "red", label: "Lỗi đỏ", hint: "Vi phạm nghiêm trọng — hiện nhãn và nền đỏ", on: "bg-red-600 text-white border-red-600" },
                 { key: "sub", label: "Điều con", hint: "Thụt vào dưới điều phía trên, không đánh số riêng", on: "bg-primary text-white border-primary" },
                 { key: "note", label: "Ghi chú", hint: "Giải thích, không phải điều để ghi nhận vi phạm", on: "bg-primary text-white border-primary" },
               ] as const).map((c) => (
                 <button
                   key={c.key}
                   type="button"
                   title={c.hint}
                   aria-pressed={!!it[c.key]}
                   onClick={() => setItem(i, { [c.key]: it[c.key] ? undefined : true })}
                   className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${it[c.key] ? c.on : "bg-white text-gray-500 border-gray-200 hover:border-purple-300"}`}
                 >
                   {c.label}
                 </button>
               ))}
             </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((l) => [...l, { time: null, text: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" /> Thêm điều khoản
        </button>
      </div>
      <CustomToggle checked={active} onChange={setActive} label="Hiển thị với thành viên" description="Tắt để ẩn mục này (chỉ người quản lý còn thấy)" />
      <ErrorBox error={error} />
    </DialogShell>
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
      await downloadHouseRulesPdf({
        houseName: rules?.houseName ?? "Lưu Xá Phanxicô",
        sections: sections.filter((x) => x.isActive),
        updatedAt: rules?.updatedAt ?? null,
        timetable,
      });
      showToast("success", "Đã tải PDF luật nhà.");
    } catch (e) {
      console.error(e);
      showToast("error", "Không thể xuất PDF. Vui lòng thử lại!");
    } finally {
      setExporting(false);
    }
  };

  const activeForPdf = sections.filter((s) => s.isActive);
  // Điều con (sub) và ghi chú không tính là "điều khoản" trong tổng số
  const totalClauses = activeForPdf.reduce((a, x) => a + x.items.filter((i) => !i.sub).length, 0);
  const redCount = activeForPdf.reduce((a, x) => a + x.items.filter((i) => i.red).length, 0);

  const groups: { label: string; icon: string; rows: typeof timetable }[] = [
    { label: "Buổi sáng", icon: "🌅", rows: timetable.filter((t) => (minutesOf(t.time) ?? 0) < 12 * 60) },
    { label: "Buổi trưa & chiều", icon: "☀️", rows: timetable.filter((t) => (minutesOf(t.time) ?? 0) >= 12 * 60 && (minutesOf(t.time) ?? 0) < 18 * 60) },
    { label: "Buổi tối", icon: "🌙", rows: timetable.filter((t) => (minutesOf(t.time) ?? 0) >= 18 * 60) },
  ].filter((g) => g.rows.length > 0);

  const goTo = (id: string) => document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-col gap-6">
      {/* BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#6f4ae6] to-[#8b6cf0] text-white p-6 sm:p-8 shadow-lg shadow-primary/20">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute right-8 bottom-4 text-[110px] leading-none opacity-[0.08] select-none pointer-events-none">✝</div>
        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 flex items-center gap-1.5">
              <ScrollText className="w-4 h-4" /> {rules.houseName ?? "Lưu Xá Phanxicô"}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-2">Luật nhà</h1>
            <p className="text-sm text-white/85 mt-1.5 max-w-xl">Giờ giấc và quy định sinh hoạt chung của cộng đoàn. Mọi anh em cùng gìn giữ để nhà luôn bình an, ngăn nắp.</p>
            <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur">{activeForPdf.length} mục</span>
              <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur">{totalClauses} điều khoản</span>
              {redCount > 0 && <span className="px-2.5 py-1 rounded-full bg-red-600 text-white shadow-sm shadow-red-900/30">{redCount} Lỗi đỏ</span>}
              {rules.updatedAt && <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur">Cập nhật {fmtDate(rules.updatedAt)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportPdf}
              disabled={exporting || activeForPdf.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-primary text-xs font-extrabold shadow-md hover:bg-purple-50 transition active:scale-95 disabled:opacity-60"
            >
              <Download className="w-4 h-4" /> {exporting ? "Đang tạo PDF..." : "Tải PDF"}
            </button>
            {canManage && (
              <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold border border-white/30 transition active:scale-95">
                <Plus className="w-4 h-4" /> Thêm mục
              </button>
            )}
          </div>
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

      {visible.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* MỤC LỤC + GIỜ GIẤC (cột trái, dính khi cuộn) */}
          <aside className="lg:col-span-4 flex flex-col gap-5 lg:sticky lg:top-20">
            <nav className="bg-white rounded-3xl border border-purple-50 shadow-xs p-4">
              <h2 className="px-2 pb-2 text-[11px] font-black uppercase tracking-wider text-gray-400">Mục lục</h2>
              <ol className="flex flex-col gap-0.5">
                {visible.map((s, idx) => (
                  <li key={s.id}>
                    <button onClick={() => goTo(s.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-purple-50 transition group">
                      <span className="w-7 h-7 rounded-lg bg-purple-100 text-primary text-xs font-black flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition">{idx + 1}</span>
                      <span className="flex-1 min-w-0 text-xs font-bold text-gray-800 truncate">
                        {s.icon ? `${s.icon} ` : ""}
                        {s.title}
                      </span>
                      {s.items.some((i) => i.red) && <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" title="Có điều Lỗi đỏ" aria-label="Có điều Lỗi đỏ" />}
                      <span className="text-[10px] text-gray-400 shrink-0">{s.items.filter((i) => !i.sub).length}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {groups.length > 0 && (
              <div className="bg-white rounded-3xl border border-purple-50 shadow-xs p-5">
                <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-primary" /> Giờ giấc chung
                </h2>
                <div className="flex flex-col gap-5">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="text-[11px] font-bold text-gray-500 mb-2">
                        {g.icon} {g.label}
                      </div>
                      <ol className="relative ml-1.5 border-l-2 border-purple-100 flex flex-col gap-3">
                        {g.rows.map((t, i) => (
                          <li key={i} className="relative pl-5">
                            <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-[3px] border-primary" />
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-black text-primary tabular-nums shrink-0">{t.time}</span>
                              <span className="text-xs text-gray-700 leading-snug">{t.text}</span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* CÁC MỤC */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {redCount > 0 && (
              <div role="note" className="flex gap-3.5 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
                <span className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-red-800">Lỗi đỏ — những điều tuyệt đối phải giữ</p>
                  <p className="text-xs text-red-800/90 mt-1 leading-relaxed">
                    Điều có nhãn <RedBadge className="mx-0.5 align-[1px]" /> là vi phạm nghiêm trọng. Hãy đọc kỹ để tránh vi phạm; cách xử lý ghi trong luật nhà.
                  </p>
                </div>
              </div>
            )}
            {visible.map((s, idx) => (
              <section
                key={s.id}
                id={`rule-${s.id}`}
                className={`scroll-mt-24 bg-white rounded-3xl border shadow-xs overflow-hidden ${s.isActive ? "border-purple-50" : "border-dashed border-gray-300 opacity-80"}`}
              >
                <header className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-gradient-to-r from-purple-50 to-white border-b border-purple-100/60">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-purple-100 flex items-center justify-center text-2xl">{s.icon || "📜"}</div>
                      <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">{idx + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                        {s.title}
                        {!s.isActive && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">
                            <EyeOff className="w-3 h-3" /> Đang ẩn
                          </span>
                        )}
                      </h2>
                      {s.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.description}</p>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => move(s.id, -1)} disabled={idx === 0} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30" aria-label="Lên">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => move(s.id, 1)} disabled={idx === visible.length - 1} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30" aria-label="Xuống">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-500 hover:text-primary hover:bg-white" aria-label="Sửa">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleting(s)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Xóa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </header>
                <ol>
                  {(() => {
                    const nums = numberItems(s.items);
                    return s.items.map((it, i) => (
                      <li
                        key={i}
                        // Viền trên làm đường kẻ giữa các dòng (không dùng divide-*: nó ghi đè màu viền trái đỏ của các dòng sau)
                        className={`flex items-start gap-3 sm:gap-4 border-l-4 border-t border-t-gray-50 first:border-t-0 py-3.5 pr-5 sm:pr-6 transition ${
                          it.red ? "border-l-red-600 bg-red-50 hover:bg-red-50" : "border-l-transparent hover:bg-purple-50/30"
                        } ${it.sub ? "pl-12 sm:pl-[4.5rem] py-2.5" : "pl-4 sm:pl-5"}`}
                      >
                        {it.sub ? (
                          <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-primary/60" aria-hidden />
                        ) : (
                          <span className={`w-9 shrink-0 text-xs font-black tabular-nums pt-0.5 ${it.red ? "text-red-600" : "text-gray-300"}`}>
                            {idx + 1}.{nums[i]}
                          </span>
                        )}
                        <p className={`flex-1 min-w-0 leading-relaxed ${it.sub ? "text-[13px] text-gray-700" : "text-sm text-gray-800"} ${it.red ? "font-semibold text-red-900" : ""}`}>{it.text}</p>
                        {it.red && <RedBadge className="mt-0.5" />}
                        {it.time && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 text-[11px] font-extrabold tabular-nums">
                            <Clock className="w-3 h-3" /> {it.time}
                          </span>
                        )}
                      </li>
                    ));
                  })()}
                </ol>
              </section>
            ))}
            <p className="text-center text-[11px] text-gray-400 py-2">Mọi thành viên có trách nhiệm tuân thủ luật nhà · Pax et Bonum 🕊️</p>
          </div>
        </div>
      )}

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
    </div>
  );
}
