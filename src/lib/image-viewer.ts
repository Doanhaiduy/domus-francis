"use client";

// Trình xem ảnh DÙNG CHUNG (phóng to, kéo, chụm hai ngón, xoay, tải về, lướt nhiều ảnh) — mở từ bất kỳ đâu bằng openImageViewer(...).
// <ImageViewerHost /> (gắn ở layout.tsx) lắng nghe sự kiện và vẽ trình xem, nên không cần truyền state qua từng component.

export interface ViewerImage {
  /** Ảnh hiển thị ngay (bản vừa/ảnh thu nhỏ) */
  src: string;
  /** Ảnh gốc nét hơn — được nạp ngầm rồi thay vào khi tải xong */
  fullSrc?: string;
  alt?: string;
  /** Dòng chú thích hiện ở dưới */
  caption?: string;
  /** Địa chỉ tải về (mặc định: ảnh gốc) */
  downloadUrl?: string;
  /** Tên tệp khi tải về (ảnh QR dạng data: không có tên sẵn) */
  downloadName?: string;
}

export const IMAGE_VIEWER_EVENT = "luuxa:image-viewer";

export function openImageViewer(images: ViewerImage | ViewerImage[], index = 0) {
  if (typeof window === "undefined") return;
  const list = Array.isArray(images) ? images : [images];
  if (!list.length) return;
  window.dispatchEvent(new CustomEvent(IMAGE_VIEWER_EVENT, { detail: { images: list, index: Math.min(Math.max(0, index), list.length - 1) } }));
}

/** Ảnh lưu trên máy chủ (kiểm quyền theo RLS): hiện bản vừa trước, nạp ảnh gốc ngầm; tải về qua ?download=1. */
export const fileViewerImage = (fileId: string, alt?: string, caption?: string): ViewerImage => ({
  src: `/api/v1/files/${fileId}?v=medium`,
  fullSrc: `/api/v1/files/${fileId}`,
  downloadUrl: `/api/v1/files/${fileId}?download=1`,
  alt,
  caption,
});

/** Ảnh công khai của bài viết / thư viện (không cần đăng nhập). */
export const publicViewerImage = (fileId: string, alt?: string, caption?: string): ViewerImage => ({
  src: `/api/v1/public/files/${fileId}?v=medium`,
  fullSrc: `/api/v1/public/files/${fileId}`,
  alt,
  caption,
});

/** Nhận diện mã tệp (UUID) hoặc đường dẫn /api/v1/files/<mã> để dựng ViewerImage; không nhận ra ⇒ dùng nguyên URL. */
export function viewerImageFromSrc(src: string, alt?: string, caption?: string): ViewerImage {
  const m = /^\/api\/v1\/(public\/)?files\/([0-9a-f-]{36})(?:\?.*)?$/i.exec(src);
  if (m) return m[1] ? publicViewerImage(m[2], alt, caption) : fileViewerImage(m[2], alt, caption);
  return { src, alt, caption };
}
