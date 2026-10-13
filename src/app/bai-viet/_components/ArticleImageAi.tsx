"use client";

// Ảnh bìa / ảnh minh họa cho bài viết: tạo bằng AI (Cloudflare Workers AI — miễn phí trong hạn mức ngày) hoặc chọn từ Khoảnh khắc.
// Ảnh AI luôn gắn nhãn "Ảnh minh họa do AI tạo" ở trang công khai; AI không vẽ người, hình tượng thánh hay chữ.
import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, ImageIcon, Images, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errorMessage } from "@/lib/api";
import { useMomentAlbum, useMoments } from "@/lib/data/moments";
import type { ArticleImageOutput, ArticleImageStyle } from "@/lib/types/ai";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { Shell, Thinking, btnGhost, btnPrimary, btnSoft } from "./ArticleAi";
import { useAiRunner } from "./useAiRunner";

const STYLES: { value: ArticleImageStyle; label: string; subLabel: string }[] = [
  { value: "flat", label: "Minh họa phẳng", subLabel: "Màu tím – vàng, gọn gàng (khuyên dùng)" },
  { value: "watercolor", label: "Màu nước", subLabel: "Nét mềm, ánh sáng ấm" },
  { value: "line", label: "Nét vẽ tối giản", subLabel: "Thanh thoát, nền sáng" },
  { value: "scenic", label: "Phong cảnh / kiến trúc", subLabel: "Sân nhà thờ, cây hoa, ánh hoàng hôn" },
];

const fileSrc = (id: string, v: "thumb" | "medium" = "medium") => `/api/v1/files/${id}?v=${v}`;

export interface PickedImage {
  fileId: string;
  alt: string;
}

/** Tạo 2 phương án ảnh (bìa 16:10 hoặc minh họa 3:2) rồi để người soạn chọn một. */
export function ImageGenDialog({
  mode,
  title,
  summary,
  category,
  excerpt,
  onClose,
  onPick,
}: {
  mode: "cover" | "inline";
  title: string;
  summary?: string;
  category: string;
  /** Đoạn văn cần minh họa (ảnh trong bài). */
  excerpt?: string;
  onClose: () => void;
  onPick: (img: PickedImage) => void;
}) {
  const ai = useAiRunner("content.article_image");
  const [style, setStyle] = useState<ArticleImageStyle>("flat");
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<ArticleImageOutput | null>(null);
  const [sel, setSel] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Đếm giây chờ (ảnh mất 15–40 giây) để người dùng biết hệ thống vẫn đang làm việc
  useEffect(() => {
    if (!ai.busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [ai.busy]);

  const generate = async (force: boolean) => {
    if (ai.busy) return;
    const r = await ai.run(
      { purpose: mode, title: title.trim(), summary: summary?.trim() || undefined, excerpt: excerpt?.trim() || undefined, category, style, hint: hint.trim() || undefined, count: 2 },
      force
    );
    if (r) {
      setResult(r.output);
      setSel(0);
    }
  };

  const heading = mode === "cover" ? "Tạo ảnh bìa bằng AI" : "Tạo ảnh minh họa bằng AI";

  return (
    <Shell
      wide
      noVeil
      title={result ? "Chọn một ảnh" : heading}
      subtitle={
        result
          ? "Bấm vào ảnh bạn thích. Chưa ưng thì bấm “Tạo lại”. Ảnh sẽ có nhãn “Ảnh minh họa do AI tạo” trên trang công khai."
          : "AI vẽ ảnh minh họa chung theo tiêu đề và nội dung bài — không vẽ người, hình tượng Chúa/Đức Mẹ/Thánh hay chữ. Miễn phí, có giới hạn lượt mỗi ngày."
      }
      onClose={onClose}
      footer={
        result ? (
          <>
            <button type="button" className={btnGhost} onClick={() => setResult(null)} disabled={ai.busy}>
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Đổi phong cách
            </button>
            <button type="button" className={btnSoft} onClick={() => generate(true)} disabled={ai.busy}>
              {ai.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Tạo lại
            </button>
            <button type="button" className={btnPrimary} onClick={() => onPick(result.images[sel])} disabled={ai.busy}>
              <Check className="w-3.5 h-3.5" /> Dùng ảnh này
            </button>
          </>
        ) : (
          <>
            <button type="button" className={btnGhost} onClick={onClose}>Hủy</button>
            <button type="button" className={btnPrimary} onClick={() => generate(false)} disabled={ai.busy || !ai.available}>
              {ai.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {ai.busy ? "AI đang vẽ…" : "Tạo 2 ảnh"}
            </button>
          </>
        )
      }
    >
      {ai.busy ? (
        <div className="flex flex-col gap-3" data-uploading="1">
          <Thinking text={`AI đang vẽ — đã ${elapsed} giây (thường 15–40 giây)…`} />
          <div className="grid grid-cols-2 gap-3">
            <div className={cn("shimmer-box rounded-2xl", mode === "cover" ? "aspect-[16/10]" : "aspect-[3/2]")} />
            <div className={cn("shimmer-box rounded-2xl", mode === "cover" ? "aspect-[16/10]" : "aspect-[3/2]")} />
          </div>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.images.map((img, i) => (
              <button
                key={img.fileId}
                type="button"
                onClick={() => setSel(i)}
                aria-pressed={sel === i}
                className={cn("relative rounded-2xl overflow-hidden border-2 transition focus:outline-none", sel === i ? "border-violet-600 shadow-lg shadow-violet-300/40" : "border-transparent hover:border-violet-200")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileSrc(img.fileId)} alt={img.alt} className={cn("w-full object-cover bg-gray-100", mode === "cover" ? "aspect-[16/10]" : "aspect-[3/2]")} />
                {sel === i && (
                  <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
          {result.fallback && <p className="text-[11px] text-amber-800">Mô hình chính đang bận nên dùng mô hình dự phòng (ảnh có thể kém nét hơn).</p>}
          <details className="text-[11px] text-gray-500">
            <summary className="cursor-pointer font-semibold">AI đã hiểu ảnh như thế nào?</summary>
            <p className="mt-1 leading-relaxed">{result.prompt}</p>
          </details>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Ảnh AI chỉ để minh họa chung. Bài về <b>sự kiện thật</b> nên dùng ảnh chụp thật (tải lên hoặc chọn từ Khoảnh khắc).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!ai.available && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">AI tạo ảnh chưa dùng được{ai.reason ? `: ${ai.reason}` : "."}</p>}
          <CustomSelect label="Phong cách" value={style} onChange={setStyle} options={STYLES} />
          <CustomInput
            label="Gợi ý thêm (tùy chọn)"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            maxLength={200}
            placeholder="VD: ánh nến, cửa sổ kính màu, hoa giấy"
            hint="Mô tả vật thể, ánh sáng, màu sắc. AI sẽ không vẽ người hay chữ dù bạn yêu cầu."
          />
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Dựa trên: <b>{title.trim() || "(chưa có tiêu đề)"}</b>
            {excerpt?.trim() ? ` · đoạn văn đã chọn (${excerpt.trim().length} ký tự)` : ""}
          </p>
        </div>
      )}
    </Shell>
  );
}

/** Chọn một ảnh trong Khoảnh khắc: album → ảnh; máy chủ sao chép ảnh thành ảnh mới của bài (bucket attachments). */
export function MomentsPickerDialog({ onClose, onPicked }: { onClose: () => void; onPicked: (fileId: string) => void }) {
  const { showToast } = useApp();
  const { data, isLoading } = useMoments({});
  const [albumId, setAlbumId] = useState<string | null>(null);
  const { album, isLoading: loadingAlbum } = useMomentAlbum(albumId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const choose = async (fileId: string) => {
    if (busyId) return;
    setBusyId(fileId);
    try {
      const r = await api.post<{ fileId: string }>("/api/v1/articles/media/from-file", { fileId });
      onPicked(r.fileId);
    } catch (e) {
      showToast("error", errorMessage(e));
      setBusyId(null);
    }
  };

  const albums = (data?.albums ?? []).filter((a) => a.photosCount > 0);

  return (
    <Shell
      wide
      noVeil
      title="Chọn ảnh từ Khoảnh khắc"
      subtitle={albumId ? "Bấm vào một ảnh để dùng làm ảnh bìa." : "Chọn một album."}
      onClose={onClose}
      footer={
        <>
          {albumId && (
            <button type="button" className={btnGhost} onClick={() => setAlbumId(null)} disabled={!!busyId}>
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Về danh sách album
            </button>
          )}
          <button type="button" className={btnGhost} onClick={onClose} disabled={!!busyId}>Đóng</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
          Bài đăng công khai ai cũng xem được — chỉ chọn ảnh mà những người trong ảnh đã đồng ý cho đăng.
        </p>
        {!albumId ? (
          isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-box aspect-[4/3] rounded-2xl" />)}
            </div>
          ) : albums.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có album nào có ảnh.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {albums.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setAlbumId(a.id)} className="group w-full text-left rounded-2xl overflow-hidden border border-purple-100 hover:border-violet-300 transition bg-white">
                    {a.coverThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.coverThumbUrl} alt="" className="w-full aspect-[4/3] object-cover bg-gray-100" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-gray-300"><ImageIcon className="w-8 h-8" /></div>
                    )}
                    <span className="block px-3 py-2">
                      <span className="block text-xs font-bold text-gray-900 truncate group-hover:text-violet-700">{a.title}</span>
                      <span className="block text-[11px] text-gray-500">{a.date} · {a.photosCount} ảnh</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : loadingAlbum || !album ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer-box aspect-square rounded-xl" />)}
          </div>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {album.photos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.fileId)}
                  disabled={!!busyId}
                  className="relative w-full aspect-square rounded-xl overflow-hidden border border-purple-100 hover:border-violet-400 transition disabled:opacity-60"
                  title={p.caption || "Chọn ảnh này"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl} alt={p.caption} className="w-full h-full object-cover bg-gray-100" loading="lazy" />
                  {busyId === p.fileId && (
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white"><Loader2 className="w-5 h-5 animate-spin" /></span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/** Hai nút dưới ô "Ảnh bìa": tạo bằng AI / chọn từ Khoảnh khắc. `onCover` nhận mã ảnh + có phải ảnh AI không. */
export function CoverAiPanel({
  title,
  summary,
  category,
  isAi,
  onCover,
}: {
  title: string;
  summary: string;
  category: string;
  /** Ảnh bìa hiện tại do AI tạo. */
  isAi: boolean;
  onCover: (fileId: string, isAi: boolean) => void;
}) {
  const { showToast } = useApp();
  const ai = useAiRunner("content.article_image");
  const [genOpen, setGenOpen] = useState(false);
  const [momentsOpen, setMomentsOpen] = useState(false);

  const openGen = () => {
    if (title.trim().length < 3) return showToast("info", "Hãy nhập tiêu đề bài trước — AI dựa vào tiêu đề và nội dung để chọn hình.");
    setGenOpen(true);
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openGen}
          disabled={!ai.available}
          title={ai.available ? "AI vẽ ảnh bìa theo tiêu đề và nội dung bài" : ai.reason ?? "AI tạo ảnh chưa dùng được"}
          className={cn(btnSoft, "!px-3 !py-1.5")}
        >
          <Sparkles className="w-3.5 h-3.5" /> Tạo bằng AI
        </button>
        <button type="button" onClick={() => setMomentsOpen(true)} className={cn(btnSoft, "!px-3 !py-1.5 !bg-white")} title="Chọn một ảnh trong album Khoảnh khắc của nhà">
          <Images className="w-3.5 h-3.5" /> Từ Khoảnh khắc
        </button>
      </div>
      {isAi && <p className="text-[11px] text-violet-700">Ảnh bìa do AI tạo — trang công khai sẽ ghi “Ảnh minh họa do AI tạo”.</p>}
      {!ai.available && ai.reason && <p className="text-[11px] text-gray-400">Tạo ảnh bằng AI chưa dùng được: {ai.reason}</p>}
      {genOpen && (
        <ImageGenDialog
          mode="cover"
          title={title}
          summary={summary}
          category={category}
          onClose={() => setGenOpen(false)}
          onPick={(img) => {
            onCover(img.fileId, true);
            setGenOpen(false);
            showToast("success", "Đã đặt ảnh bìa — nhớ bấm lưu bài.");
          }}
        />
      )}
      {momentsOpen && (
        <MomentsPickerDialog
          onClose={() => setMomentsOpen(false)}
          onPicked={(fileId) => {
            onCover(fileId, false);
            setMomentsOpen(false);
            showToast("success", "Đã đặt ảnh bìa từ Khoảnh khắc — nhớ bấm lưu bài.");
          }}
        />
      )}
    </div>
  );
}
