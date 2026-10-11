"use client";

// Ô tải ảnh/tệp lên máy chủ (/api/v1/files): ảnh được thu nhỏ + nén ngay trên trình duyệt (nhanh hơn nhiều trên mạng di động), có THANH TIẾN ĐỘ và nút
// HỦY; máy chủ kiểm định dạng thật, xóa EXIF/GPS, tạo ảnh thu nhỏ. Giá trị (value) là mã tệp storage_files.id — xem trước qua /api/v1/files/:id.
// Đang tải thì phần tử gốc có data-uploading="1" (ModalGuard dùng để chặn đóng hộp thoại / bấm Lưu), tải xong có data-upload-fresh="1" (đã có thay đổi chưa lưu).
import React, { useState, useRef, useCallback, useEffect, ChangeEvent, DragEvent } from "react";
import { UploadCloud, X, FileCheck, RefreshCw, FileText } from "lucide-react";
import { errorMessage as apiError } from "@/lib/api";
import { isAbort, uploadFile, type UploadBucket, type UploadedFile, type UploadPhase } from "@/lib/uploader";
import { uploadErrorMessage, useUploader, type UploadState } from "@/lib/use-uploader";
import { UploadProgress } from "./UploadProgress";

export { uploadFile };
export type { UploadBucket, UploadedFile };

/** URL xem trước của một giá trị: mã tệp → /api/v1/files/:id; giá trị cũ (đường dẫn/data URL) giữ nguyên. */
export function previewUrl(value: string | null | undefined, variant: "thumb" | "medium" = "medium"): string {
  if (!value) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return `/api/v1/files/${value}?v=${variant}`;
  return value;
}

const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";
/** Ảnh gốc được nhận tới mức này (sẽ được nén ở trình duyệt trước khi gửi); PDF theo maxSizeMB. */
const RAW_IMAGE_MAX_MB = 60;
const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

export interface ImageUploadDropzoneProps {
  label?: string;
  required?: boolean;
  /** Mã tệp đã tải lên ("" nếu chưa có) */
  value?: string;
  onChange: (fileId: string) => void;
  /** Bucket lưu trữ (avatars, receipts, cleaning-evidence, …) */
  bucket: UploadBucket;
  /** Cho phép tệp PDF (hóa đơn, bảng điểm, đính kèm) */
  allowPdf?: boolean;
  placeholder?: string;
  helperText?: string;
  /** Giới hạn tệp PDF (ảnh được nén nên nhận rộng hơn) */
  maxSizeMB?: number;
  onUploaded?: (file: UploadedFile) => void;
  className?: string;
}

export const ImageUploadDropzone: React.FC<ImageUploadDropzoneProps> = ({
  label,
  required = false,
  value,
  onChange,
  bucket,
  allowPdf = false,
  placeholder = "Kéo thả ảnh vào đây hoặc nhấn để chọn tệp từ thiết bị",
  helperText,
  maxSizeMB = 20,
  onUploaded,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const { state, uploading, run, cancel } = useUploader();
  const [fresh, setFresh] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [mime, setMime] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // Giá trị có sẵn (sửa bản ghi) có thể là PDF: ảnh xem trước lỗi ⇒ hiện biểu tượng tệp
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const help = helperText ?? `Hỗ trợ JPG, PNG, WEBP${allowPdf ? ", PDF" : ""} — ảnh được tự thu nhỏ để tải nhanh và xóa thông tin vị trí trước khi lưu`;

  const handleProcessFile = async (file: File) => {
    setErrorMessage("");
    const isPdfFile = file.type === "application/pdf";
    const okType = ACCEPT_IMAGES.split(",").includes(file.type) || (allowPdf && isPdfFile);
    if (!okType) {
      setErrorMessage(`Chỉ chọn ảnh JPG, PNG, WEBP${allowPdf ? " hoặc PDF" : ""}.`);
      return;
    }
    const limit = isPdfFile ? maxSizeMB : RAW_IMAGE_MAX_MB;
    if (file.size > limit * 1024 * 1024) {
      setErrorMessage(`Kích thước tệp vượt quá ${limit}MB.`);
      return;
    }
    try {
      const up = await run(file, bucket);
      setFileName(file.name);
      setFileSize(fmtSize(up.sizeBytes));
      setMime(up.mime);
      setPreviewBroken(false);
      setFresh(true);
      onChange(up.id);
      onUploaded?.(up);
    } catch (e) {
      const msg = uploadErrorMessage(e);
      if (msg) setErrorMessage(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void handleProcessFile(files[0]);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) void handleProcessFile(files[0]);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange("");
    setFileName("");
    setFileSize("");
    setMime("");
    setErrorMessage("");
    setFresh(false);
  };

  const isPdf = mime === "application/pdf" || previewBroken;

  return (
    <div className={`w-full ${className}`} data-upload-zone data-uploading={uploading ? "1" : undefined} data-upload-fresh={fresh && value ? "1" : undefined}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-gray-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={allowPdf ? `${ACCEPT_IMAGES},application/pdf` : ACCEPT_IMAGES}
        onChange={handleFileChange}
        className="hidden"
      />

      {uploading ? (
        <UploadProgress state={state} onCancel={cancel} />
      ) : !value ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`relative cursor-pointer group flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition-all ${
            isDragging ? "border-primary bg-purple-50/70 scale-[0.99]" : "border-gray-200 bg-gray-50/50 hover:bg-purple-50/30 hover:border-purple-300"
          }`}
        >
          <div className="w-11 h-11 rounded-2xl bg-purple-100 text-primary flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-gray-800 text-center mb-0.5">{placeholder}</p>
          <p className="text-[11px] text-gray-400 text-center">{help}</p>
          <button
            type="button"
            className="mt-2.5 px-3 py-1 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-2xs group-hover:border-primary group-hover:text-primary transition"
          >
            Chọn tệp từ máy
          </button>
        </div>
      ) : (
        <div className="relative p-3 rounded-2xl border border-purple-200 bg-purple-50/30 flex items-center gap-3.5">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-purple-100 flex items-center justify-center">
            {isPdf ? (
              <FileText className="w-7 h-7 text-rose-500" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl(value, "thumb")} alt="Xem trước" className="w-full h-full object-cover" onError={() => setPreviewBroken(true)} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                <FileCheck className="w-3 h-3" />
                Đã lưu trên máy chủ
              </span>
              {fileSize && <span className="text-[10px] text-gray-400 font-medium">({fileSize})</span>}
            </div>
            <p className="text-xs font-bold text-gray-800 truncate mt-0.5">
              {fileName || "Tệp đính kèm"}
              {value && (
                <a href={`/api/v1/files/${value}`} target="_blank" rel="noreferrer" className="ml-2 text-[11px] font-semibold text-primary hover:underline">
                  Mở
                </a>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-container">
                <RefreshCw className="w-3 h-3" />
                <span>Đổi tệp</span>
              </button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={handleClear} className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-700">
                <X className="w-3 h-3" />
                <span>Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && <p className="mt-1 text-[11px] text-rose-600 font-semibold">{errorMessage}</p>}
    </div>
  );
};

export interface MultiImageUploadDropzoneProps {
  label?: string;
  required?: boolean;
  /** Danh sách mã tệp đã tải lên */
  values: string[];
  onChange: (values: string[]) => void;
  bucket: UploadBucket;
  maxFiles?: number;
  maxSizeMB?: number;
  className?: string;
}

/** Số ảnh tải song song (đủ nhanh mà không làm nghẽn mạng điện thoại). */
const CONCURRENCY = 3;

export const MultiImageUploadDropzone: React.FC<MultiImageUploadDropzoneProps> = ({
  label,
  required = false,
  values,
  onChange,
  bucket,
  maxFiles = 20,
  maxSizeMB = RAW_IMAGE_MAX_MB,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [batch, setBatch] = useState<{ names: string[]; ratios: number[]; phases: UploadPhase[]; done: number; total: number } | null>(null);
  const [fresh, setFresh] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => () => ctl.current?.abort(), []);

  const handleProcessFiles = async (files: FileList | File[]) => {
    setErrorMessage("");
    const list = Array.from(files).slice(0, Math.max(0, maxFiles - values.length));
    if (files.length > list.length) setErrorMessage(`Chỉ được tối đa ${maxFiles} ảnh — các ảnh thừa đã bị bỏ qua.`);
    const accepted = list.filter((f) => ACCEPT_IMAGES.split(",").includes(f.type) && f.size <= maxSizeMB * 1024 * 1024);
    if (accepted.length < list.length) setErrorMessage(`Một số tệp không phải ảnh JPG/PNG/WEBP hoặc vượt ${maxSizeMB}MB nên bị bỏ qua.`);
    if (!accepted.length) return;

    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    const total = accepted.length;
    const results: (string | null)[] = new Array(total).fill(null);
    const ratios: number[] = new Array(total).fill(0);
    const phases: UploadPhase[] = new Array(total).fill("optimizing");
    const active = new Set<number>();
    let done = 0;
    let next = 0;
    const errors: string[] = [];
    const publish = () => setBatch({ names: [...active].map((i) => accepted[i].name), ratios: [...ratios], phases: [...phases], done, total });
    publish();

    const worker = async () => {
      while (!signal.aborted) {
        const i = next++;
        if (i >= total) return;
        active.add(i);
        publish();
        try {
          const up = await uploadFile(accepted[i], bucket, {
            signal,
            onPhase: (p) => {
              phases[i] = p;
              publish();
            },
            onProgress: (r) => {
              ratios[i] = r;
              publish();
            },
          });
          results[i] = up.id;
        } catch (e) {
          if (!isAbort(e)) errors.push(`${accepted[i].name}: ${apiError(e)}`);
        }
        active.delete(i);
        done++;
        ratios[i] = 1;
        publish();
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    setBatch(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (errors.length) setErrorMessage(errors.slice(0, 2).join(" · "));
    // giữ đúng thứ tự chọn ảnh; ảnh đã tải xong vẫn được giữ lại kể cả khi hủy giữa chừng
    const uploaded = results.filter((x): x is string => !!x);
    if (uploaded.length) {
      setFresh(true);
      onChange([...valuesRef.current, ...uploaded]);
    }
  };

  const cancel = useCallback(() => ctl.current?.abort(), []);
  const handleRemove = (index: number) => onChange(values.filter((_, i) => i !== index));

  const uploading = batch !== null;
  const overall: UploadState | null = batch
    ? {
        name: batch.names.length ? batch.names.join(", ") : "Đang hoàn tất…",
        phase: batch.phases.some((p) => p === "uploading") ? "uploading" : batch.phases.every((p) => p === "optimizing") ? "optimizing" : "processing",
        ratio: Math.min(1, (batch.done + batch.ratios.reduce((a, r, i) => a + (i < batch.total && r < 1 ? r : 0), 0)) / batch.total),
        index: Math.min(batch.total, batch.done + 1),
        total: batch.total,
      }
    : null;

  return (
    <div className={`w-full ${className}`} data-upload-zone data-uploading={uploading ? "1" : undefined} data-upload-fresh={fresh ? "1" : undefined}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-gray-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[11px] text-gray-400 font-medium">
            Đã chọn {values.length}/{maxFiles} ảnh
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_IMAGES}
        onChange={(e) => {
          if (e.target.files) void handleProcessFiles(e.target.files);
        }}
        className="hidden"
      />

      {uploading ? (
        <UploadProgress state={overall} onCancel={cancel} />
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (e.dataTransfer.files) void handleProcessFiles(e.dataTransfer.files);
          }}
          className={`cursor-pointer group flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl transition-all ${
            isDragging ? "border-primary bg-purple-50/70" : "border-gray-200 bg-gray-50/50 hover:bg-purple-50/30 hover:border-purple-300"
          }`}
        >
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-gray-800 text-center">Nhấp để chọn nhiều ảnh từ máy hoặc kéo thả vào đây</p>
          <p className="text-[10px] text-gray-400 text-center mt-0.5">Chọn nhiều ảnh cùng lúc (PNG, JPG, WEBP) — ảnh được tự thu nhỏ để tải nhanh</p>
        </div>
      )}

      {errorMessage && <p className="mt-1 text-[11px] text-rose-600 font-semibold">{errorMessage}</p>}

      {values.length > 0 && (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
          {values.map((id, i) => (
            <div key={id + i} className="relative aspect-square rounded-xl overflow-hidden border border-purple-100 group shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl(id, "thumb")} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                aria-label={`Bỏ ảnh ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(i);
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition shadow-xs"
              >
                <X className="w-3 h-3" />
              </button>
              <span className="absolute bottom-1 left-1 px-1 rounded bg-black/50 text-[9px] text-white font-bold">#{i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
