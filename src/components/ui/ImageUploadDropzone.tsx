"use client";

// Ô tải ảnh/tệp lên máy chủ LOCAL (/api/v1/files): server kiểm tra định dạng thật, xóa EXIF/GPS, tạo ảnh thu nhỏ.
// Giá trị (value) là mã tệp storage_files.id — xem trước qua /api/v1/files/:id (kiểm quyền theo RLS).
import React, { useState, useRef, ChangeEvent, DragEvent } from "react";
import { UploadCloud, X, FileCheck, RefreshCw, Loader2, FileText } from "lucide-react";
import { api, errorMessage as apiError } from "@/lib/api";

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

/** URL xem trước của một giá trị: mã tệp → /api/v1/files/:id; giá trị cũ (đường dẫn/data URL) giữ nguyên. */
export function previewUrl(value: string | null | undefined, variant: "thumb" | "medium" = "medium"): string {
  if (!value) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return `/api/v1/files/${value}?v=${variant}`;
  return value;
}

export async function uploadFile(file: File, bucket: UploadBucket): Promise<UploadedFile> {
  const form = new FormData();
  form.append("bucket", bucket);
  form.append("file", file);
  return api.upload<UploadedFile>("/api/v1/files", form);
}

const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";
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
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [mime, setMime] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // Giá trị có sẵn (sửa bản ghi) có thể là PDF: ảnh xem trước lỗi ⇒ hiện biểu tượng tệp
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const help = helperText ?? `Hỗ trợ JPG, PNG, WEBP${allowPdf ? ", PDF" : ""} (tối đa ${maxSizeMB}MB) — ảnh được xóa thông tin vị trí trước khi lưu`;

  const handleProcessFile = async (file: File) => {
    setErrorMessage("");
    const okType = ACCEPT_IMAGES.split(",").includes(file.type) || (allowPdf && file.type === "application/pdf");
    if (!okType) {
      setErrorMessage(`Chỉ chọn ảnh JPG, PNG, WEBP${allowPdf ? " hoặc PDF" : ""}.`);
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrorMessage(`Kích thước tệp vượt quá ${maxSizeMB}MB.`);
      return;
    }
    setUploading(true);
    try {
      const up = await uploadFile(file, bucket);
      setFileName(file.name);
      setFileSize(fmtSize(up.sizeBytes));
      setMime(up.mime);
      setPreviewBroken(false);
      onChange(up.id);
      onUploaded?.(up);
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setUploading(false);
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
  };

  const isPdf = mime === "application/pdf" || previewBroken;

  return (
    <div className={`w-full ${className}`}>
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

      {!value ? (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
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
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
          </div>
          <p className="text-xs font-bold text-gray-800 text-center mb-0.5">{uploading ? "Đang tải lên và xử lý ảnh…" : placeholder}</p>
          <p className="text-[11px] text-gray-400 text-center">{help}</p>
          {!uploading && (
            <button
              type="button"
              className="mt-2.5 px-3 py-1 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-2xs group-hover:border-primary group-hover:text-primary transition"
            >
              Chọn tệp từ máy
            </button>
          )}
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
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-container"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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

export const MultiImageUploadDropzone: React.FC<MultiImageUploadDropzoneProps> = ({
  label,
  required = false,
  values,
  onChange,
  bucket,
  maxFiles = 20,
  maxSizeMB = 20,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFiles = async (files: FileList | File[]) => {
    setErrorMessage("");
    const list = Array.from(files).slice(0, Math.max(0, maxFiles - values.length));
    if (files.length > list.length) setErrorMessage(`Chỉ được tối đa ${maxFiles} ảnh — các ảnh thừa đã bị bỏ qua.`);
    const accepted = list.filter((f) => ACCEPT_IMAGES.split(",").includes(f.type) && f.size <= maxSizeMB * 1024 * 1024);
    if (accepted.length < list.length) setErrorMessage(`Một số tệp không phải ảnh JPG/PNG/WEBP hoặc vượt ${maxSizeMB}MB nên bị bỏ qua.`);
    if (!accepted.length) return;
    // Tải tuần tự và cộng dồn kết quả (tránh lỗi chỉ giữ ảnh cuối cùng khi chọn nhiều ảnh)
    const uploaded: string[] = [];
    setProgress({ done: 0, total: accepted.length });
    for (const f of accepted) {
      try {
        uploaded.push((await uploadFile(f, bucket)).id);
      } catch (e) {
        setErrorMessage(`${f.name}: ${apiError(e)}`);
      }
      setProgress({ done: uploaded.length, total: accepted.length });
    }
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (uploaded.length) onChange([...values, ...uploaded]);
  };

  const handleRemove = (index: number) => onChange(values.filter((_, i) => i !== index));

  return (
    <div className={`w-full ${className}`}>
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

      <div
        onClick={() => !progress && fileInputRef.current?.click()}
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
          {progress ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
        </div>
        <p className="text-xs font-bold text-gray-800 text-center">
          {progress ? `Đang tải ${progress.done}/${progress.total} ảnh…` : "Nhấp để chọn nhiều ảnh từ máy hoặc kéo thả vào đây"}
        </p>
        <p className="text-[10px] text-gray-400 text-center mt-0.5">Hỗ trợ chọn nhiều ảnh cùng lúc (PNG, JPG, WEBP)</p>
      </div>

      {errorMessage && <p className="mt-1 text-[11px] text-rose-600 font-semibold">{errorMessage}</p>}

      {values.length > 0 && (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
          {values.map((id, i) => (
            <div key={id + i} className="relative aspect-square rounded-xl overflow-hidden border border-purple-100 group shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl(id, "thumb")} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(i);
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition shadow-xs"
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
