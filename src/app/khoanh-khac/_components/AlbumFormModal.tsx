"use client";
// Tạo / chỉnh sửa album khoảnh khắc. Ảnh tải lên máy chủ local (bucket moments) — giá trị là mã tệp storage_files.id.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FolderPlus, Loader2, Pencil, X } from "lucide-react";
import {
  CustomDatePicker,
  CustomInput,
  CustomSelect,
  CustomTextarea,
  ImageUploadDropzone,
  MultiImageUploadDropzone,
  SelectOption,
} from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import { dmyToIso, isoToDmy, parseTags, todayDmyVN } from "@/lib/moments-format";
import type { MomentAlbumDetailDto, MomentCategoryDto } from "@/lib/types/moments";

interface MemberOption {
  id: string;
  fullName: string;
}

export interface AlbumFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  album?: MomentAlbumDetailDto | null;
  categories: MomentCategoryDto[];
  members: MemberOption[];
  meId?: string | null;
  onClose: () => void;
  onSaved: (album: MomentAlbumDetailDto) => void;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export function AlbumFormModal({ open, mode, album, categories, members, meId, onClose, onSaved, showToast }: AlbumFormModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const defaultCategory = useMemo(() => categories.find((c) => c.code === "ALB_TRIP")?.id ?? categories[0]?.id ?? "", [categories]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayDmyVN());
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState("#KyNiemLuuXa, #PhanxicoAssisi");
  const [coverFileId, setCoverFileId] = useState("");
  const [photoFileIds, setPhotoFileIds] = useState<string[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Nạp giá trị mỗi lần mở
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && album) {
      setTitle(album.title);
      setDescription(album.description);
      setCategoryId(album.categoryId);
      setDate(isoToDmy(album.takenOn));
      setLocation(album.location);
      setTags(album.tags.join(", "));
      setParticipants(album.participants.filter((p) => p.status !== "declined").map((p) => p.memberId));
    } else {
      setTitle("");
      setDescription("");
      setCategoryId(defaultCategory);
      setDate(todayDmyVN());
      setLocation("");
      setTags("#KyNiemLuuXa, #PhanxicoAssisi");
      setParticipants(meId ? [meId] : []);
    }
    setCoverFileId("");
    setPhotoFileIds([]);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, album?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open || !mounted) return null;

  const categoryOptions: SelectOption<string>[] = categories.map((c) => ({ value: c.id, label: c.name }));
  // Thành viên đã gắn thẻ nhưng không còn trong danh bạ đang ở (đã rời nhà) vẫn giữ trong lựa chọn
  const memberOptions: MemberOption[] = [
    ...members,
    ...(album?.participants ?? [])
      .filter((p) => !members.some((m) => m.id === p.memberId))
      .map((p) => ({ id: p.memberId, fullName: p.fullName })),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (title.trim().length < 3) return showToast("error", "Vui lòng nhập tiêu đề album (tối thiểu 3 ký tự)!");
    const takenOn = dmyToIso(date);
    if (!takenOn) return showToast("error", "Vui lòng chọn ngày diễn ra hợp lệ!");
    if (!categoryId) return showToast("error", "Vui lòng chọn chủ đề album!");
    if (mode === "create" && !coverFileId) return showToast("error", "Vui lòng tải lên ảnh bìa album!");
    setSaving(true);
    try {
      const common = {
        title: title.trim(),
        description: description.trim() || null,
        categoryId,
        takenOn,
        location: location.trim() || null,
        tags: parseTags(tags),
        participantIds: participants,
      };
      const saved =
        mode === "create" ? await momentsApi.create({ ...common, coverFileId, photoFileIds }) : await momentsApi.update(album!.id, common);
      const pending = saved.participants.filter((p) => p.status === "pending").length;
      showToast(
        "success",
        mode === "create"
          ? `Đã xuất bản album "${saved.title}" với ${saved.photosCount} ảnh!${pending ? ` ${pending} thành viên cần xác nhận thẻ tên.` : ""}`
          : `Đã lưu thay đổi album "${saved.title}".`
      );
      onSaved(saved);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      onClick={() => !saving && onClose()}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
        >
          <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                {mode === "create" ? <FolderPlus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">{mode === "create" ? "Tạo Album Khoảnh Khắc Mới" : "Chỉnh Sửa Album"}</h3>
                <p className="text-[11px] text-gray-500 truncate max-w-xs">
                  {mode === "create" ? "Lưu giữ kỷ niệm hoạt động cộng đoàn Lưu Xá" : album?.title}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 custom-scroll">
              <CustomInput
                label="Tiêu đề album kỷ niệm"
                placeholder="VD: Dã ngoại Vũng Tàu – Tình Huynh Đệ 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect label="Chủ đề album" value={categoryId} onChange={(v) => setCategoryId(String(v))} options={categoryOptions} />
                <CustomDatePicker label="Ngày diễn ra" placeholder="Chọn ngày..." value={date} onChange={setDate} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomInput
                  label="Địa điểm tổ chức"
                  placeholder="VD: Linh địa La Vang, Quảng Trị"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={300}
                />
                <CustomInput
                  label="Hashtags (cách nhau bằng dấu phẩy)"
                  placeholder="#LaVang, #MuaHe2026"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>

              <CustomTextarea
                label="Mô tả câu chuyện &amp; ý nghĩa kỷ niệm"
                rows={3}
                placeholder="Kể lại cảm xúc, những dấu ấn không thể quên của anh em..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
              />

              {mode === "create" && (
                <>
                  <ImageUploadDropzone
                    bucket="moments"
                    label="Ảnh bìa Album (Cover Photo)"
                    placeholder="Kéo thả ảnh bìa hoặc nhấp để chọn tệp từ máy..."
                    helperText="Ảnh bìa đại diện cho toàn bộ Album và là ảnh đầu tiên trong thư mục (PNG, JPG, WEBP)"
                    value={coverFileId}
                    onChange={setCoverFileId}
                    required
                  />

                  <MultiImageUploadDropzone bucket="moments" label="Thêm các ảnh khác vào Album" values={photoFileIds} onChange={setPhotoFileIds} maxFiles={30} />
                </>
              )}

              {/* Participant picker → thẻ tên album_member_tags */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Thành viên đồng hành cùng tham gia:</label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scroll p-2 bg-surface-container-low rounded-xl">
                  {memberOptions.map((m) => {
                    const isSelected = participants.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setParticipants((prev) => (isSelected ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1",
                          isSelected ? "bg-primary text-white shadow-2xs" : "bg-white text-gray-700 border border-gray-200 hover:border-purple-200"
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        <span>{m.fullName}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Thành viên chưa đồng ý cho gắn thẻ ảnh sẽ nhận thẻ ở trạng thái “chờ xác nhận”; ai cũng có thể tự gỡ thẻ tên của mình.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
              <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {mode === "create" ? "Lưu & Xuất bản Album" : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
