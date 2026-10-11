"use client";
// Thẻ album chung "Khoảnh khắc thường ngày" ở đầu trang Khoảnh khắc: mọi anh em tự đăng ảnh / video sinh hoạt hằng ngày của lưu xá.
// Album được tạo ở lần mở đầu tiên (máy chủ: app.fn_ensure_daily_album).
import React, { useState } from "react";
import { Clapperboard, ImageIcon, Loader2, Sun, Users } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { momentsApi } from "@/lib/data/moments";
import type { MomentAlbumDto } from "@/lib/types/moments";

export function DailyAlbumCard({ album, onOpen, showToast }: { album: MomentAlbumDto | null; onOpen: (id: string) => void; showToast: (t: "error", m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onOpen(album?.id ?? (await momentsApi.openDaily()).id);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-purple-50 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 shadow-xs">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-400 text-white flex items-center justify-center shadow-md shadow-amber-200 shrink-0">
        <Sun className="w-6 h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base sm:text-lg font-black text-gray-900">Khoảnh khắc thường ngày</h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
            <Users className="w-3 h-3" /> Album chung của cả nhà
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">
          Bữa cơm, giờ học, buổi tập thể thao, những phút nghỉ ngơi bên nhau… Anh em ai cũng đăng được ảnh và video — cập nhật liên tục.
        </p>
        {album && (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-gray-500">
            <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{album.photosCount} ảnh</span>
            <span className="inline-flex items-center gap-1"><Clapperboard className="w-3.5 h-3.5" />{album.videosCount} video</span>
          </p>
        )}
      </div>
      <button
        onClick={open}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 active:scale-95 transition disabled:opacity-60 shrink-0"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Mở album &amp; chia sẻ
      </button>
    </div>
  );
}
