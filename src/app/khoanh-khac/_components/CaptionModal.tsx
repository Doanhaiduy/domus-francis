"use client";
// Sửa chú thích một ảnh (người tải ảnh lên hoặc người kiểm duyệt album).
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, X } from "lucide-react";
import { CustomTextarea } from "@/components/ui/FormControls";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import type { MomentAlbumDetailDto, MomentPhotoDto } from "@/lib/types/moments";

export interface CaptionModalProps {
  photo: MomentPhotoDto | null;
  onClose: () => void;
  onSaved: (album: MomentAlbumDetailDto) => void;
  showToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export function CaptionModal({ photo, onClose, onSaved, showToast }: CaptionModalProps) {
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCaption(photo?.caption ?? "");
    setSaving(false);
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, saving, onClose]);

  if (!photo || typeof document === "undefined") return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const saved = await momentsApi.updatePhoto(photo.id, { caption: caption.trim() || null });
      showToast("success", "Đã lưu chú thích ảnh.");
      onSaved(saved);
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div onClick={() => !saving && onClose()} className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="flex min-h-full items-center justify-center">
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-50 flex flex-col overflow-hidden my-auto">
          <div className="shrink-0 flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumbUrl} alt="" className="w-9 h-9 rounded-xl object-cover border border-purple-100" />
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-primary" /> Chú thích ảnh
                </h3>
                <p className="text-[11px] text-gray-500">
                  {photo.uploadedBy.name} • {photo.date}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={submit} className="p-5 space-y-4">
            <CustomTextarea
              label="Chú thích bức ảnh (Caption)"
              rows={3}
              maxLength={500}
              placeholder="VD: Anh em cùng nhau tạ ơn sau giờ kinh tối..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Lưu chú thích
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
