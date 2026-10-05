"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Tag, Plus, Edit2, Trash2, Search, X, Check, Lock, AlertCircle } from "lucide-react";
import { CustomInput, CustomSelect, CustomToggle, type SelectOption } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage, ApiClientError } from "@/lib/api";
import { categoriesApi, useCategories } from "@/lib/data/settings";
import { CATEGORY_KINDS, type CategoryDto, type CategoryKind } from "@/lib/types/settings";
import { cn } from "@/lib/utils";

export const CATEGORY_TYPE_META: Record<CategoryKind, { label: string; bg: string; text: string; border: string }> = {
  expense: { label: "Thu Chi & Quỹ", bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  event: { label: "Lịch & Sự kiện", bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  announcement: { label: "Bảng Thông báo", bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200" },
  forum: { label: "Diễn đàn Huynh đệ", bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  maintenance: { label: "Hậu cần & Báo hỏng", bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  album: { label: "Album Khoảnh khắc", bg: "bg-pink-50", text: "text-pink-800", border: "border-pink-200" },
};

const COLOR_PRESETS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#6366f1", "#14b8a6", "#84cc16", "#64748b"];

const categoryTypeOptions: SelectOption<CategoryKind>[] = [
  { value: "expense", label: "Thu Chi & Quỹ phòng" },
  { value: "event", label: "Lịch & Sự kiện" },
  { value: "announcement", label: "Bảng Thông báo" },
  { value: "forum", label: "Diễn đàn Huynh đệ" },
  { value: "maintenance", label: "Hậu cần & Báo hỏng" },
  { value: "album", label: "Album Khoảnh khắc" },
];

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
/** Bỏ dấu tiếng Việt + ký tự lạ để gợi ý mã từ tên: "Rau củ tươi" → "RAU_CU_TUOI" */
const suggestCode = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "C_$1")
    .slice(0, 40);

export default function CategoriesTab() {
  const { showToast } = useApp();
  const { can } = useSession();
  const canManage = can("category.manage");
  const { categories, isLoading, error, mutate } = useCategories();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [selectedCatType, setSelectedCatType] = useState<"all" | CategoryKind>("all");
  const [catSearchTerm, setCatSearchTerm] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [deleteTargetCat, setDeleteTargetCat] = useState<CategoryDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formCatName, setFormCatName] = useState("");
  const [formCatCode, setFormCatCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [formCatType, setFormCatType] = useState<CategoryKind>("expense");
  const [formCatDesc, setFormCatDesc] = useState("");
  const [formCatColor, setFormCatColor] = useState(COLOR_PRESETS[0]);
  const [formCatActive, setFormCatActive] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredCategories = useMemo(() => {
    const q = catSearchTerm.trim().toLowerCase();
    return categories.filter((c) => {
      const matchType = selectedCatType === "all" || c.kind === selectedCatType;
      const matchSearch =
        !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [categories, selectedCatType, catSearchTerm]);

  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setFormCatName("");
    setFormCatCode("");
    setCodeTouched(false);
    setFormCatType(selectedCatType === "all" ? "expense" : selectedCatType);
    setFormCatDesc("");
    setFormCatColor(COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]);
    setFormCatActive(true);
    setFormErrors({});
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (cat: CategoryDto) => {
    setEditingCategory(cat);
    setFormCatName(cat.name);
    setFormCatCode(cat.code);
    setCodeTouched(true);
    setFormCatType(cat.kind);
    setFormCatDesc(cat.description || "");
    setFormCatColor(cat.color || COLOR_PRESETS[0]);
    setFormCatActive(cat.isActive);
    setFormErrors({});
    setIsCategoryModalOpen(true);
  };

  useEffect(() => {
    if (!isCategoryModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsCategoryModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCategoryModalOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    const name = formCatName.trim();
    const code = formCatCode.trim().toUpperCase();
    if (!name) errs.name = "Nhập tên danh mục.";
    else if (name.length > 100) errs.name = "Tên tối đa 100 ký tự.";
    if (!code) errs.code = "Nhập mã danh mục.";
    else if (code.length < 2 || code.length > 40) errs.code = "Mã dài 2–40 ký tự.";
    else if (!CODE_RE.test(code)) errs.code = "Chỉ chữ in hoa không dấu, số, gạch dưới; bắt đầu bằng chữ.";
    else if (categories.some((c) => c.kind === formCatType && c.code === code && c.id !== editingCategory?.id))
      errs.code = "Mã đã tồn tại trong phân hệ này.";
    if (formCatDesc.trim().length > 500) errs.desc = "Mô tả tối đa 500 ký tự.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!validate()) {
      showToast("error", "Vui lòng kiểm tra lại các trường đang báo lỗi.");
      return;
    }
    setSaving(true);
    const body = {
      name: formCatName.trim(),
      code: formCatCode.trim().toUpperCase(),
      kind: formCatType,
      description: formCatDesc.trim() || null,
      color: formCatColor,
      isActive: formCatActive,
    };
    try {
      if (editingCategory) {
        const patch: Record<string, unknown> = { ...body, version: editingCategory.version };
        if (editingCategory.isSystem) {
          delete patch.code;
          delete patch.kind;
        }
        await categoriesApi.update(editingCategory.id, patch);
        showToast("success", `Đã cập nhật danh mục "${body.name}".`);
      } else {
        await categoriesApi.create(body);
        showToast("success", `Đã thêm danh mục "${body.name}".`);
      }
      await mutate();
      setIsCategoryModalOpen(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.errors?.length)
        setFormErrors(Object.fromEntries(err.errors.map((x) => [x.field === "description" ? "desc" : x.field, x.message])));
      else if (err instanceof ApiClientError && err.code === "DUPLICATE_CODE") setFormErrors({ code: err.message });
      showToast("error", errorMessage(err));
      if (err instanceof ApiClientError && err.code === "STALE_VERSION") void mutate();
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (cat: CategoryDto) => {
    if (!canManage || busyId) return;
    setBusyId(cat.id);
    try {
      await categoriesApi.update(cat.id, { isActive: !cat.isActive, version: cat.version });
      await mutate();
      showToast("success", cat.isActive ? `Đã tạm ẩn "${cat.name}".` : `Đã kích hoạt lại "${cat.name}".`);
    } catch (err) {
      showToast("error", errorMessage(err));
      void mutate();
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const cat = deleteTargetCat;
    setDeleteTargetCat(null);
    if (!cat) return;
    setBusyId(cat.id);
    try {
      await categoriesApi.remove(cat.id);
      await mutate();
      showToast("success", `Đã xóa danh mục "${cat.name}".`);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const editingSystem = !!editingCategory?.isSystem;
  const kindLocked = editingSystem || (!!editingCategory && editingCategory.usageCount > 0);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {!canManage && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 shrink-0 text-amber-700" />
          <span>
            Bạn đang xem danh mục ở chế độ chỉ đọc. Thêm/sửa/ẩn/xóa danh mục cần quyền <b>Quản lý danh mục</b> (Admin, Trưởng nhà, Phó nhà, Thủ quỹ).
          </span>
        </div>
      )}

      {/* Top Filter & Actions */}
      <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCatType("all")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
              selectedCatType === "all" ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100",
            )}
          >
            Tất cả ({categories.length})
          </button>
          {CATEGORY_KINDS.map((type) => {
            const count = categories.filter((c) => c.kind === type).length;
            return (
              <button
                key={type}
                onClick={() => setSelectedCatType(type)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                  selectedCatType === type ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100",
                )}
              >
                {CATEGORY_TYPE_META[type].label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="w-56">
            <CustomInput
              placeholder="Tìm danh mục, mã..."
              value={catSearchTerm}
              onChange={(e) => setCatSearchTerm(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>
          {canManage && (
            <button
              onClick={handleOpenAddCategory}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm danh mục</span>
            </button>
          )}
        </div>
      </div>

      {error && !categories.length && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Không tải được danh mục: {errorMessage(error)}
        </div>
      )}

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.map((cat) => {
          const meta = CATEGORY_TYPE_META[cat.kind];
          return (
            <div
              key={cat.id}
              className={cn(
                "bg-white rounded-2xl p-4 border transition-all hover:shadow-md flex flex-col justify-between gap-3 group",
                cat.isActive ? "border-purple-50 shadow-xs" : "border-gray-200 bg-gray-50/50 opacity-75",
                busyId === cat.id && "opacity-50 pointer-events-none",
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: cat.color }} />
                    <h3 className="font-extrabold text-sm text-gray-900 group-hover:text-primary transition-colors truncate">{cat.name}</h3>
                  </div>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                    {cat.code}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border", meta.bg, meta.text, meta.border)}>{meta.label}</span>
                  {cat.isSystem && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200"
                      title="Danh mục hệ thống: không đổi mã/phân hệ, không xóa — chỉ tạm ẩn được"
                    >
                      <Lock className="w-2.5 h-2.5" /> Hệ thống
                    </span>
                  )}
                  <span
                    className="text-[10px] text-gray-400 font-medium"
                    title="Phiếu chi, sự kiện, thông báo, bài viết, sự cố, album đang dùng danh mục (trong phạm vi bạn được xem)"
                  >
                    {cat.usageCount} bản ghi liên quan
                  </span>
                </div>

                {cat.description && <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{cat.description}</p>}
              </div>

              {/* Actions & Status */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleStatus(cat)}
                    disabled={!canManage}
                    title={canManage ? (cat.isActive ? "Bấm để tạm ẩn" : "Bấm để kích hoạt lại") : "Cần quyền Quản lý danh mục"}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors disabled:cursor-default",
                      cat.isActive
                        ? "bg-emerald-50 text-emerald-700 enabled:hover:bg-emerald-100"
                        : "bg-gray-200 text-gray-600 enabled:hover:bg-gray-300",
                    )}
                  >
                    {cat.isActive ? "● Hoạt động" : "○ Tạm ẩn"}
                  </button>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditCategory(cat)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-purple-50 transition-colors"
                      title="Chỉnh sửa danh mục"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => !cat.isSystem && setDeleteTargetCat(cat)}
                      disabled={cat.isSystem}
                      className="p-1.5 rounded-lg text-gray-400 enabled:hover:text-rose-600 enabled:hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={cat.isSystem ? "Danh mục hệ thống không thể xóa — hãy tạm ẩn" : "Xóa danh mục"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && filteredCategories.length === 0 && (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
          <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800">Không tìm thấy danh mục phù hợp</h3>
          <p className="text-xs text-gray-400 mt-1">Thử đổi từ khóa tìm kiếm hoặc chọn bộ lọc phân hệ khác.</p>
        </div>
      )}

      {/* MODAL THÊM / SỬA DANH MỤC */}
      {isCategoryModalOpen &&
        mounted &&
        createPortal(
          <div
            onClick={() => setIsCategoryModalOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
              >
                <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                      <Tag className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-black text-gray-900">{editingCategory ? "Chỉnh Sửa Danh Mục" : "Thêm Danh Mục Mới"}</h3>
                  </div>
                  <button
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveCategory} className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                    {editingSystem && (
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex gap-2">
                        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Danh mục hệ thống: được đổi tên, mô tả, màu và trạng thái; không đổi mã, phân hệ và không xóa được.</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <CustomInput
                        label="Tên danh mục"
                        value={formCatName}
                        onChange={(e) => {
                          setFormCatName(e.target.value);
                          if (!codeTouched && !editingCategory) setFormCatCode(suggestCode(e.target.value));
                        }}
                        placeholder="VD: Rau củ tươi"
                        error={formErrors.name}
                        required
                      />
                      <CustomInput
                        label="Mã danh mục (Viết hoa)"
                        value={formCatCode}
                        onChange={(e) => {
                          setCodeTouched(true);
                          setFormCatCode(e.target.value.toUpperCase().replace(/\s+/g, "_"));
                        }}
                        placeholder="VD: FOOD_VEG"
                        error={formErrors.code}
                        disabled={editingSystem}
                        className={editingSystem ? "bg-gray-50 text-gray-500 cursor-not-allowed font-mono" : "font-mono"}
                        required
                      />
                    </div>

                    <div className={cn(kindLocked && "pointer-events-none opacity-60")}>
                      <CustomSelect
                        label="Phân hệ chức năng áp dụng"
                        value={formCatType}
                        onChange={(val) => setFormCatType(val as CategoryKind)}
                        options={categoryTypeOptions}
                      />
                    </div>
                    {kindLocked && !editingSystem && (
                      <p className="-mt-2 text-[10.5px] text-amber-700">
                        Danh mục đang được {editingCategory?.usageCount} bản ghi sử dụng nên không đổi được phân hệ.
                      </p>
                    )}

                    <CustomInput
                      label="Mô tả phạm vi áp dụng"
                      value={formCatDesc}
                      onChange={(e) => setFormCatDesc(e.target.value)}
                      placeholder="Ghi chú chi tiết mục đích danh mục..."
                      error={formErrors.desc}
                    />

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">Màu sắc nhận diện</label>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {COLOR_PRESETS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setFormCatColor(color)}
                            className={cn(
                              "w-7 h-7 rounded-full transition-transform flex items-center justify-center shadow-xs",
                              formCatColor.toLowerCase() === color ? "scale-110 ring-2 ring-purple-600 ring-offset-2" : "hover:scale-105",
                            )}
                            style={{ backgroundColor: color }}
                          >
                            {formCatColor.toLowerCase() === color && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
                      <CustomToggle
                        checked={formCatActive}
                        onChange={setFormCatActive}
                        label="Kích hoạt sử dụng ngay"
                        description="Hiển thị danh mục này trong các form tạo mới và danh sách lọc"
                      />
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 disabled:opacity-60"
                    >
                      {saving ? "Đang lưu..." : editingCategory ? "Lưu thay đổi" : "Tạo danh mục"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        isOpen={!!deleteTargetCat}
        onClose={() => setDeleteTargetCat(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa danh mục"
        message={
          deleteTargetCat ? (
            <span>
              Bạn có chắc chắn muốn xóa danh mục <strong className="text-gray-900 font-bold">&quot;{deleteTargetCat.name}&quot;</strong>? Danh mục sẽ
              biến mất khỏi các form và bộ lọc
              {deleteTargetCat.usageCount > 0 ? `; ${deleteTargetCat.usageCount} bản ghi cũ vẫn giữ nguyên tên danh mục này` : ""}.
            </span>
          ) : (
            ""
          )
        }
        confirmText="Xóa danh mục"
        cancelText="Hủy bỏ"
        variant="danger"
      />
    </div>
  );
}
