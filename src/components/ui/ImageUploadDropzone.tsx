"use client";

import React, { useState, useRef, ChangeEvent, DragEvent } from "react";
import {
  UploadCloud,
  Image as ImageIcon,
  X,
  FileCheck,
  RefreshCw,
  Link as LinkIcon,
  HardDrive,
  Eye,
} from "lucide-react";

export interface ImageUploadDropzoneProps {
  label?: string;
  required?: boolean;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  maxSizeMB?: number;
  presets?: { label: string; url: string }[];
  allowUrlToggle?: boolean;
  className?: string;
}

export const ImageUploadDropzone: React.FC<ImageUploadDropzoneProps> = ({
  label,
  required = false,
  value,
  onChange,
  placeholder = "Kéo thả ảnh vào đây hoặc nhấn để chọn tệp từ thiết bị",
  helperText = "Hỗ trợ định dạng PNG, JPG, JPEG, WEBP (Tối đa 10MB)",
  maxSizeMB = 10,
  presets,
  allowUrlToggle = true,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = (file: File) => {
    setErrorMessage("");

    // Validate type
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Vui lòng chỉ chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP...)");
      return;
    }

    // Validate size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMessage(`Kích thước tệp vượt quá ${maxSizeMB}MB. Vui lòng chọn ảnh nhỏ hơn.`);
      return;
    }

    // Read as Data URL for instant local preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange(result);
        setFileName(file.name);
        const sizeKb = (file.size / 1024).toFixed(1);
        setFileSize(file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKb} KB`);
      }
    };
    reader.onerror = () => {
      setErrorMessage("Không thể đọc tệp. Vui lòng thử lại.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange("");
    setFileName("");
    setFileSize("");
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isLocalUpload = value?.startsWith("data:image");

  return (
    <div className={`w-full ${className}`}>
      {/* Header with Mode Switcher */}
      <div className="flex items-center justify-between mb-1.5">
        {label ? (
          <label className="block text-xs font-bold text-gray-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        ) : <div />}

        {allowUrlToggle && (
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-[11px] font-semibold text-gray-600">
            <button
              type="button"
              onClick={() => setMode("file")}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition ${
                mode === "file"
                  ? "bg-white text-primary font-bold shadow-2xs"
                  : "hover:text-gray-900"
              }`}
            >
              <HardDrive className="w-3 h-3" />
              <span>Tải từ máy</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition ${
                mode === "url"
                  ? "bg-white text-primary font-bold shadow-2xs"
                  : "hover:text-gray-900"
              }`}
            >
              <LinkIcon className="w-3 h-3" />
              <span>Nhập URL</span>
            </button>
          </div>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Mode A: URL Text Input */}
      {mode === "url" && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="url"
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://images.unsplash.com/... hoặc dán link ảnh"
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition"
            />
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mode B: Local File Dropzone */}
      {mode === "file" && (
        <div>
          {!value ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative cursor-pointer group flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition-all ${
                isDragging
                  ? "border-primary bg-purple-50/70 scale-[0.99]"
                  : "border-gray-200 bg-gray-50/50 hover:bg-purple-50/30 hover:border-purple-300"
              }`}
            >
              <div className="w-11 h-11 rounded-2xl bg-purple-100 text-primary flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-800 text-center mb-0.5">
                {placeholder}
              </p>
              <p className="text-[11px] text-gray-400 text-center">
                {helperText}
              </p>
              <button
                type="button"
                className="mt-2.5 px-3 py-1 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 shadow-2xs group-hover:border-primary group-hover:text-primary transition"
              >
                Chọn tệp từ máy
              </button>
            </div>
          ) : (
            /* Selected File Preview Box */
            <div className="relative p-3 rounded-2xl border border-purple-200 bg-purple-50/30 flex items-center gap-3.5">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-purple-100">
                <img
                  src={value}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                    <FileCheck className="w-3 h-3" />
                    {isLocalUpload ? "Đã tải từ máy" : "Ảnh từ URL"}
                  </span>
                  {fileSize && (
                    <span className="text-[10px] text-gray-400 font-medium">
                      ({fileSize})
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-gray-800 truncate mt-0.5">
                  {fileName || "Ảnh minh chứng đính kèm"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-container"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Đổi ảnh</span>
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-700"
                  >
                    <X className="w-3 h-3" />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <p className="mt-1 text-[11px] text-rose-600 font-semibold">
          {errorMessage}
        </p>
      )}

      {/* Presets Chips if provided */}
      {presets && presets.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Hoặc chọn ảnh mẫu nhanh:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  onChange(p.url);
                  setFileName(p.label);
                  setFileSize("");
                  setErrorMessage("");
                }}
                className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-left transition ${
                  value === p.url
                    ? "border-primary bg-purple-50/70 text-primary font-bold shadow-2xs"
                    : "border-gray-200 bg-white hover:border-purple-200 text-gray-600"
                }`}
              >
                <img
                  src={p.url}
                  alt={p.label}
                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                />
                <span className="text-[10px] truncate leading-tight">
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export interface MultiImageUploadDropzoneProps {
  label?: string;
  required?: boolean;
  values: string[];
  onChange: (values: string[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  className?: string;
}

export const MultiImageUploadDropzone: React.FC<MultiImageUploadDropzoneProps> = ({
  label,
  required = false,
  values,
  onChange,
  maxFiles = 20,
  maxSizeMB = 10,
  className = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFiles = (files: FileList | File[]) => {
    setErrorMessage("");
    const newUrls: string[] = [];
    const maxBytes = maxSizeMB * 1024 * 1024;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("Một số tệp không phải định dạng ảnh và đã bị bỏ qua.");
        return;
      }
      if (file.size > maxBytes) {
        setErrorMessage(`Một số tệp vượt quá ${maxSizeMB}MB và đã bị bỏ qua.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          onChange([...values, ...newUrls, result]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleProcessFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

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
        accept="image/*"
        onChange={(e) => {
          if (e.target.files) handleProcessFiles(e.target.files);
        }}
        className="hidden"
      />

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
        onDrop={handleDrop}
        className={`cursor-pointer group flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl transition-all ${
          isDragging
            ? "border-primary bg-purple-50/70"
            : "border-gray-200 bg-gray-50/50 hover:bg-purple-50/30 hover:border-purple-300"
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
          <UploadCloud className="w-5 h-5" />
        </div>
        <p className="text-xs font-bold text-gray-800 text-center">
          Nhấp để chọn nhiều ảnh từ máy hoặc kéo thả vào đây
        </p>
        <p className="text-[10px] text-gray-400 text-center mt-0.5">
          Hỗ trợ chọn nhiều ảnh cùng lúc (PNG, JPG, WEBP)
        </p>
      </div>

      {errorMessage && (
        <p className="mt-1 text-[11px] text-rose-600 font-semibold">
          {errorMessage}
        </p>
      )}

      {/* Thumbnails list */}
      {values.length > 0 && (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
          {values.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden border border-purple-100 group shadow-2xs"
            >
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
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
              <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/50 text-[9px] text-white font-bold">
                #{i + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
