"use client";

// Tải video khoảnh khắc: đọc thông tin + chụp ảnh bìa NGAY TRÊN TRÌNH DUYỆT, rồi gửi thẳng tệp lên nơi lưu trữ (Cloudinary / Supabase Storage /
// máy chủ local) theo địa chỉ và tham số do máy chủ cấp — video không đi qua hàm máy chủ nên không vướng giới hạn 4,5 MB của Vercel.
import { getCsrfToken } from "./api";
import type { VideoUploadInitDto } from "./types/moments";

export interface VideoProbe {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** Khung hình JPEG làm ảnh bìa (null nếu trình duyệt không giải mã được video, vd. HEVC trên Chrome) */
  poster: Blob | null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Đọc thời lượng / kích thước và chụp khung hình bìa của video (bỏ qua êm nếu trình duyệt không giải mã được). */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const out: VideoProbe = { durationMs: null, width: null, height: null, poster: null };
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "metadata";
  v.src = url;
  try {
    const meta = await withTimeout(
      new Promise<boolean>((resolve) => {
        v.onloadedmetadata = () => resolve(true);
        v.onerror = () => resolve(false);
      }),
      8000
    );
    if (!meta) return out;
    if (Number.isFinite(v.duration) && v.duration > 0) out.durationMs = Math.round(v.duration * 1000);
    if (v.videoWidth > 0) {
      out.width = v.videoWidth;
      out.height = v.videoHeight;
    }
    // chụp khung hình ở ~10% thời lượng (tối đa giây thứ 1) để tránh khung đen đầu video
    const at = Math.min(1, (v.duration || 1) * 0.1);
    const seeked = await withTimeout(
      new Promise<boolean>((resolve) => {
        v.onseeked = () => resolve(true);
        v.onerror = () => resolve(false);
        v.currentTime = at;
      }),
      6000
    );
    if (seeked && v.videoWidth > 0) {
      const scale = Math.min(1, 960 / v.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      out.poster = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
    }
  } catch {
    /* bỏ qua: vẫn tải được video không có ảnh bìa */
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
  return out;
}

export interface CloudinaryUploadResponse {
  public_id: string;
  version: number | string;
  signature: string;
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  resource_type?: string;
}

export interface VideoUploadHandle {
  promise: Promise<{ cloudinary?: CloudinaryUploadResponse }>;
  abort: () => void;
}

/** Gửi tệp lên nơi lưu trữ theo tham số máy chủ cấp (XHR để có thanh tiến độ). */
export function uploadVideoFile(file: File, init: VideoUploadInitDto, onProgress: (ratio: number) => void): VideoUploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ cloudinary?: CloudinaryUploadResponse }>((resolve, reject) => {
    xhr.open(init.method, init.uploadUrl);
    for (const [k, v] of Object.entries(init.headers)) xhr.setRequestHeader(k, v);
    let body: XMLHttpRequestBodyInit;
    if (init.fileField === null) {
      // local: thân thô + CSRF của ứng dụng
      xhr.setRequestHeader("x-csrf-token", getCsrfToken());
      xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
      xhr.withCredentials = true;
      body = file;
    } else {
      const form = new FormData();
      for (const [k, v] of Object.entries(init.fields)) form.append(k, v);
      form.append(init.fileField, file);
      body = form;
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new Error("Mất kết nối khi tải video lên — kiểm tra mạng rồi thử lại."));
    xhr.ontimeout = () => reject(new Error("Tải video quá lâu — kiểm tra mạng rồi thử lại."));
    xhr.onabort = () => reject(new DOMException("Đã hủy tải video.", "AbortError"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        if (init.provider === "cloudinary") {
          try {
            resolve({ cloudinary: JSON.parse(xhr.responseText) as CloudinaryUploadResponse });
          } catch {
            reject(new Error("Cloudinary trả về dữ liệu không hợp lệ."));
          }
        } else resolve({});
        return;
      }
      let detail = "";
      try {
        const j = JSON.parse(xhr.responseText);
        detail = j?.error?.message ?? j?.message ?? j?.detail ?? "";
      } catch {
        /* không phải JSON */
      }
      reject(new Error(detail ? `Không tải được video (${xhr.status}): ${detail}` : `Không tải được video lên nơi lưu trữ (lỗi ${xhr.status}).`));
    };
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export const fmtDuration = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
