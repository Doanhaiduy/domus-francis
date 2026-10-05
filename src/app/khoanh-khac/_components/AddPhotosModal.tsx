"use client";
// Thêm ảnh vào album có sẵn: tải nhiều ảnh lên máy chủ local (bucket moments) + chú thích từng ảnh.
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Upload, X } from "lucide-react";
import { CustomInput, MultiImageUploadDropzone, previewUrl } from "@/components/ui/FormControls";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import type { MomentAlbumDetailDto, MomentAlbumDto } from "@/lib/types/moments";

export interface AddPhotosModalProps {
  album: MomentAlbumDto | null;
  open: boolean;
  onClose: () => void;
  onSaved: (album: MomentAlbumDetailDto) => void;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export function AddPhotosModal({ album, open, onClose, onSaved, showToast }: AddPhotosModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFileIds([]);
      setCaptions({});
      setSaving(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open || !album || !mounted) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!fileIds.length) return showToast("error", "Vui lòng tải lên ít nhất một ảnh!");
    setSaving(true);
    try {
      const saved = await momentsApi.addPhotos(
        album.id,
        fileIds.map((fileId) => ({ fileId, caption: captions[fileId]?.trim() || null }))
      );
      showToast("success", `Đã thêm ${fileIds.length} ảnh vào album "${saved.title}".`);
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
          className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
        >
          <div className="shrink-0 flex items-center justify-between p-5 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">Thêm Ảnh Vào Album</h3>
                <p className="text-[11px] text-gray-500 truncate max-w-xs">{album.title}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 custom-scroll">
              <MultiImageUploadDropzone bucket="moments" label="Tải ảnh khoảnh khắc lên Album" values={fileIds} onChange={setFileIds} maxFiles={30} required />

              {fileIds.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-700">Chú thích cho từng ảnh (không bắt buộc)</p>
                  {fileIds.map((id, i) => (
                    <div key={id} className="flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl(id, "thumb")} alt={`Ảnh ${i + 1}`} className="w-11 h-11 rounded-xl object-cover border border-purple-100 shrink-0" />
                      <div className="flex-1">
                        <CustomInput
                          placeholder={i === 0 ? "VD: Anh em cùng nhau tạ ơn sau giờ kinh tối..." : `Chú thích ảnh #${i + 1}`}
                          value={captions[id] ?? ""}
                          maxLength={500}
                          onChange={(e) => setCaptions((prev) => ({ ...prev, [id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center justify-end gap-2.5 p-4 px-5 border-t border-gray-100">
              <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving || !fileIds.length}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Lưu {fileIds.length > 0 ? `${fileIds.length} ảnh` : "ảnh"} vào album
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
