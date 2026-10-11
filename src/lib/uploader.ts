"use client";

// Tải ảnh/tệp lên máy chủ (POST /api/v1/files) CÓ TIẾN ĐỘ và HỦY ĐƯỢC. Các bước: tối ưu ảnh ngay trên trình duyệt (thu nhỏ + nén, xem image-optimize.ts)
// → gửi bằng XHR (để có % tiến độ) → máy chủ kiểm tra/xóa EXIF/tạo ảnh thu nhỏ rồi trả mã tệp. Hết phiên (401) thì làm mới phiên một lần rồi gửi lại.
import { ApiClientError, getCsrfToken, refreshSession } from "./api";
import { optimizeImage } from "./image-optimize";

export type UploadBucket = "avatars" | "receipts" | "cleaning-evidence" | "academic-evidence" | "maintenance" | "moments" | "attachments" | "documents";

export interface UploadedFile {
  id: string;
  bucket: UploadBucket;
  mime: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  url: string;
}

export type UploadPhase = "optimizing" | "uploading" | "processing";

export interface UploadOptions {
  /** Tỷ lệ đã gửi (0–1) của bước "uploading" */
  onProgress?: (ratio: number) => void;
  onPhase?: (phase: UploadPhase) => void;
  /** Hủy giữa chừng: ném DOMException AbortError */
  signal?: AbortSignal;
  /** false = gửi nguyên bản, không thu nhỏ/nén (mặc định tối ưu ảnh) */
  optimize?: boolean;
}

const abortError = () => new DOMException("Đã hủy tải lên.", "AbortError");

function post(form: FormData, opts: UploadOptions): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/files");
    xhr.setRequestHeader("accept", "application/json");
    xhr.setRequestHeader("x-csrf-token", getCsrfToken());
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.min(1, e.loaded / e.total));
    xhr.upload.onload = () => {
      opts.onProgress?.(1);
      opts.onPhase?.("processing");
    };
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => opts.signal?.removeEventListener("abort", onAbort);
    xhr.onabort = () => {
      done();
      reject(abortError());
    };
    xhr.onerror = () => {
      done();
      reject(new Error("Mất kết nối khi tải lên — kiểm tra mạng rồi thử lại."));
    };
    xhr.ontimeout = () => {
      done();
      reject(new Error("Tải lên quá lâu — kiểm tra mạng rồi thử lại."));
    };
    xhr.onload = () => {
      done();
      let body: { detail?: string; code?: string; errors?: { field: string; message: string }[] } & Partial<UploadedFile> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* không phải JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as UploadedFile);
      reject(new ApiClientError(xhr.status, body.code ?? `HTTP_${xhr.status}`, body.detail ?? `Lỗi ${xhr.status}`, body.errors));
    };
    xhr.send(form);
  });
}

export async function uploadFile(file: File, bucket: UploadBucket, opts: UploadOptions = {}): Promise<UploadedFile> {
  opts.onPhase?.("optimizing");
  const { file: out, exifDate } = opts.optimize === false ? { file, exifDate: null } : await optimizeImage(file);
  if (opts.signal?.aborted) throw abortError();
  const build = () => {
    const form = new FormData();
    form.append("bucket", bucket);
    if (exifDate) form.append("exifDate", exifDate);
    form.append("file", out);
    return form;
  };
  opts.onPhase?.("uploading");
  opts.onProgress?.(0);
  try {
    return await post(build(), opts);
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401 && (await refreshSession())) {
      opts.onProgress?.(0);
      opts.onPhase?.("uploading");
      return post(build(), opts);
    }
    throw e;
  }
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
