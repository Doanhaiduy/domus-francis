"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Library } from "lucide-react";
import { ApiClientError, errorMessage } from "@/lib/api";
import { CustomInput, CustomTextarea, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";
import { DialogShell, btnGhost, btnPrimary } from "@/app/thu-chi/_components/dialogs";
import { liturgyDocsApi } from "@/lib/data/liturgy-documents";
import {
  DOC_LIMITS,
  LITURGY_DOC_KINDS,
  TEXT_KINDS,
  URL_KINDS,
  isHttpUrl,
  isYoutubeUrl,
  parseTags,
  type LiturgyDocKind,
  type LiturgyDocumentDto,
  type LiturgyDocumentInput,
} from "@/lib/types/liturgy-documents";
import { cn } from "@/lib/utils";
import { KIND_META, SUGGESTED_CATEGORIES } from "./liturgy-doc-meta";

type Toast = (type: "success" | "error" | "info", msg: string) => void;

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = thêm mới */
  initial: LiturgyDocumentDto | null;
  categories: string[];
  showToast: Toast;
  onSaved: (doc: LiturgyDocumentDto) => void;
}

/** Biểu mẫu thêm/sửa tài liệu phụng vụ: chọn loại ⇒ hiện đúng trường (lời văn / liên kết / tệp PDF). */
export default function LiturgyDocumentDialog({ open, onClose, initial, categories, showToast, onSaved }: Props) {
  const [kind, setKind] = useState<LiturgyDocKind>("prayer");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [fileId, setFileId] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? "prayer");
    setTitle(initial?.title ?? "");
    setCategory(initial?.category ?? "");
    setTagsText((initial?.tags ?? []).join(", "));
    setContent(initial?.content ?? "");
    setUrl(initial?.url ?? "");
    setFileId(initial?.fileId ?? "");
    setIsPinned(initial?.isPinned ?? false);
    setErrors({});
  }, [open, initial]);

  const categoryChips = useMemo(() => {
    const seen = new Set<string>();
    return [...categories, ...SUGGESTED_CATEGORIES].filter((c) => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 14);
  }, [categories]);

  const isText = TEXT_KINDS.includes(kind);
  const needsUrl = URL_KINDS.includes(kind);

  const validate = () => {
    const e: Record<string, string> = {};
    const t = title.trim();
    if (t.length < DOC_LIMITS.titleMin) e.title = "Tiêu đề tối thiểu 2 ký tự.";
    else if (t.length > DOC_LIMITS.titleMax) e.title = "Tiêu đề tối đa 200 ký tự.";
    if (category.trim().length > DOC_LIMITS.categoryMax) e.category = "Chuyên mục tối đa 60 ký tự.";
    if (content.length > DOC_LIMITS.contentMax) e.content = "Nội dung tối đa 50.000 ký tự.";
    if (isText && !content.trim()) e.content = kind === "song" ? "Nhập lời bài hát." : kind === "prayer" ? "Nhập lời kinh." : "Nhập nội dung.";
    const u = url.trim();
    if (needsUrl && !u) e.url = kind === "youtube" ? "Nhập liên kết video YouTube." : "Nhập địa chỉ liên kết.";
    else if (u && !isHttpUrl(u)) e.url = "Liên kết phải bắt đầu bằng http:// hoặc https://.";
    else if (kind === "youtube" && !isYoutubeUrl(u)) e.url = "Liên kết phải thuộc youtube.com hoặc youtu.be.";
    if (kind === "pdf" && !fileId) e.fileId = "Hãy tải lên tệp PDF.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (saving) return;
    if (!validate()) {
      showToast("error", "Vui lòng kiểm tra lại các trường đang báo lỗi.");
      return;
    }
    const body: LiturgyDocumentInput = {
      title: title.trim(),
      kind,
      category: category.trim() || null,
      tags: parseTags(tagsText),
      content: content.trim() ? content : null,
      // PDF không có ô liên kết; loại khác giữ liên kết (bắt buộc với YouTube/Liên kết, tùy chọn với kinh/bài hát/ghi chú)
      url: kind === "pdf" ? null : url.trim() || null,
      fileId: kind === "pdf" ? fileId : null,
      isPinned,
    };
    setSaving(true);
    try {
      const doc = initial ? await liturgyDocsApi.update(initial.id, { ...body, version: initial.version }) : await liturgyDocsApi.create(body);
      showToast("success", initial ? `Đã cập nhật "${doc.title}".` : `Đã thêm "${doc.title}" vào thư viện.`);
      onSaved(doc);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.errors?.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      showToast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const urlLabel = kind === "youtube" ? "Liên kết YouTube" : kind === "link" ? "Địa chỉ liên kết" : "Liên kết tham khảo (không bắt buộc)";
  const urlPlaceholder =
    kind === "youtube" ? "https://www.youtube.com/watch?v=… hoặc https://youtu.be/…" : kind === "link" ? "https://…" : "VD: video hướng dẫn hát trên YouTube";
  const contentLabel =
    kind === "prayer" ? "Lời kinh" : kind === "song" ? "Lời bài hát" : kind === "note" ? "Nội dung" : "Mô tả / ghi chú (không bắt buộc)";

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      icon={<Library className="w-5 h-5" />}
      title={initial ? "Sửa tài liệu phụng vụ" : "Thêm tài liệu phụng vụ"}
      subtitle="Kinh nguyện, bài hát, video, PDF hay liên kết để anh em tìm đọc"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Hủy
          </button>
          <button type="submit" form="liturgy-doc-form" disabled={saving} className={btnPrimary}>
            {saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm vào thư viện"}
          </button>
        </>
      }
    >
      <form id="liturgy-doc-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Loại tài liệu</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LITURGY_DOC_KINDS.map((k) => {
              const m = KIND_META[k];
              const Icon = m.icon;
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setErrors({});
                  }}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-2xl border text-left transition",
                    active ? "border-primary bg-purple-50 ring-2 ring-purple-100" : "border-gray-200 bg-white hover:border-purple-200",
                  )}
                >
                  <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", m.tone)}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-gray-900 leading-tight">{m.label}</span>
                    <span className="block text-[10px] text-gray-500 leading-tight mt-0.5">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <CustomInput
          label="Tiêu đề"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "prayer" ? "VD: Kinh Lạy Cha" : kind === "song" ? "VD: Hồng ân Thiên Chúa" : "VD: Lịch phụng vụ tháng 11"}
          maxLength={DOC_LIMITS.titleMax}
          error={errors.title}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CustomInput
              label="Chuyên mục"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="VD: Kinh hằng ngày, Mùa Vọng…"
              maxLength={DOC_LIMITS.categoryMax}
              list="liturgy-doc-categories"
              error={errors.category}
            />
            <datalist id="liturgy-doc-categories">
              {categoryChips.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <CustomInput
            label="Thẻ (cách nhau bằng dấu phẩy)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="VD: Đức Mẹ, Mân Côi"
            error={errors.tags}
          />
        </div>
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {categoryChips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold transition",
                category.trim().toLowerCase() === c.toLowerCase()
                  ? "border-primary bg-purple-50 text-primary"
                  : "border-gray-200 text-gray-500 hover:border-purple-200 hover:text-primary",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {kind === "pdf" && (
          <div>
            <ImageUploadDropzone
              label="Tệp PDF"
              required
              bucket="documents"
              allowPdf
              value={fileId}
              onChange={setFileId}
              onUploaded={(f) => {
                if (f.mime !== "application/pdf") {
                  setFileId("");
                  setErrors((e) => ({ ...e, fileId: "Loại tài liệu PDF chỉ nhận tệp .pdf — ảnh hãy dùng loại khác hoặc chuyển sang PDF." }));
                } else
                  setErrors((e) => {
                    const next = { ...e };
                    delete next.fileId;
                    return next;
                  });
              }}
              placeholder="Kéo thả tệp PDF vào đây hoặc nhấn để chọn"
              helperText="Chỉ nhận tệp PDF (tối đa 20 MB) — tệp lưu trên máy chủ của lưu xá"
            />
            {errors.fileId && <p className="mt-1 text-[11px] text-rose-500">{errors.fileId}</p>}
          </div>
        )}

        {kind !== "pdf" && (needsUrl || isText) && (
          <CustomInput
            label={urlLabel}
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={urlPlaceholder}
            maxLength={DOC_LIMITS.urlMax}
            error={errors.url}
          />
        )}

        <div>
          <CustomTextarea
            label={contentLabel}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={isText ? 10 : 3}
            maxLength={DOC_LIMITS.contentMax}
            placeholder={
              kind === "song"
                ? "ĐK: …\n\n1. …\n\n2. …"
                : kind === "prayer"
                  ? "Gõ hoặc dán lời kinh — xuống dòng được giữ nguyên khi hiển thị."
                  : "Vài dòng giới thiệu để anh em biết tài liệu dùng vào dịp nào."
            }
            error={errors.content}
            className={isText ? "text-sm leading-relaxed" : ""}
          />
          <p className="mt-1 text-right text-[10px] text-gray-400">
            {content.length.toLocaleString("vi-VN")}/{DOC_LIMITS.contentMax.toLocaleString("vi-VN")} ký tự
          </p>
        </div>

        <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-100">
          <CustomToggle
            checked={isPinned}
            onChange={setIsPinned}
            label="Ghim lên đầu thư viện"
            description="Tài liệu dùng thường xuyên (kinh hằng ngày, lịch tháng) luôn hiện trên cùng"
          />
        </div>
      </form>
    </DialogShell>
  );
}
