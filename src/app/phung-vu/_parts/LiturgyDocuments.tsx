"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Library,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/community-format";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MobileDetailSheet } from "@/components/ui/MobileDetailSheet";
import { liturgyDocsApi, refreshLiturgyDocuments, useLiturgyDocument, useLiturgyDocuments } from "@/lib/data/liturgy-documents";
import {
  LITURGY_DOC_KINDS,
  TEXT_KINDS,
  isYoutubeUrl,
  urlHost,
  youtubeEmbedUrl,
  youtubeVideoId,
  type LiturgyDocKind,
  type LiturgyDocumentDto,
  type LiturgyDocumentSummaryDto,
} from "@/lib/types/liturgy-documents";
import { cn } from "@/lib/utils";
import { KIND_META, fmtBytes } from "./liturgy-doc-meta";
import LiturgyDocumentDialog from "./LiturgyDocumentDialog";

type Toast = (type: "success" | "error" | "info", msg: string) => void;

/** Sao chép văn bản (có phương án dự phòng cho trình duyệt không hỗ trợ Clipboard API / trang không bảo mật). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* thử cách dự phòng */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function KindIcon({ kind, size = "md" }: { kind: LiturgyDocKind; size?: "sm" | "md" }) {
  const m = KIND_META[kind];
  const Icon = m.icon;
  return (
    <span className={cn("rounded-xl flex items-center justify-center shrink-0", m.tone, size === "sm" ? "w-8 h-8" : "w-10 h-10")}>
      <Icon className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
    </span>
  );
}

const btnSoft =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-purple-100 bg-white text-primary hover:bg-purple-50 active:scale-95 transition";
const btnSolid =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-container shadow-md shadow-primary/20 active:scale-95 transition";

/** Khối YouTube: KHÔNG nhúng khi tải trang — chỉ chèn iframe youtube-nocookie khi người dùng bấm "Xem tại đây". */
function YoutubeBlock({ url, title }: { url: string; title: string }) {
  const id = youtubeVideoId(url);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {id && (
          <button type="button" onClick={() => setPlaying((v) => !v)} className={btnSolid}>
            {playing ? <X className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? "Đóng trình phát" : "Xem tại đây"}
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={btnSoft}>
          <ExternalLink className="w-3.5 h-3.5" /> Mở trên YouTube
        </a>
      </div>
      {!id && <p className="text-[11px] text-gray-500">Liên kết tìm kiếm / kênh / danh sách phát — mở trên YouTube để chọn video.</p>}
      {id && playing && (
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-gray-200">
          <iframe
            src={youtubeEmbedUrl(id)}
            title={title}
            className="w-full h-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            // Trang đặt Referrer-Policy: same-origin; YouTube cần biết nguồn nhúng nên iframe gửi origin (không gửi đường dẫn)
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {id && !playing && <p className="text-[10.5px] text-gray-400">Video chỉ tải khi bấm “Xem tại đây” (chế độ không cookie của YouTube).</p>}
    </div>
  );
}

interface DetailProps {
  summary: LiturgyDocumentSummaryDto | null;
  id: string;
  canManage: boolean;
  showToast: Toast;
  onEdit: (doc: LiturgyDocumentDto) => void;
  onDelete: (doc: LiturgyDocumentDto) => void;
  onPickTag: (tag: string) => void;
  onPickCategory: (category: string) => void;
}

function DocumentDetail({ summary, id, canManage, showToast, onEdit, onDelete, onPickTag, onPickCategory }: DetailProps) {
  const { doc, isLoading, error, mutate } = useLiturgyDocument(id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = doc ?? null;
  const kind = (d ?? summary)?.kind ?? "note";
  const title = (d ?? summary)?.title ?? "";

  if (error && !d) {
    return (
      <div className="p-6 text-center text-xs text-gray-500">
        Không mở được tài liệu: {errorMessage(error)}
      </div>
    );
  }

  const copy = async () => {
    if (!d?.content) return;
    const ok = await copyText(`${d.title}\n\n${d.content}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      showToast("success", kind === "song" ? "Đã sao chép lời bài hát." : kind === "prayer" ? "Đã sao chép lời kinh." : "Đã sao chép nội dung.");
    } else showToast("error", "Trình duyệt không cho sao chép — hãy bôi đen và sao chép thủ công.");
  };

  const togglePin = async () => {
    if (!d || busy) return;
    setBusy(true);
    try {
      const next = await liturgyDocsApi.update(d.id, { isPinned: !d.isPinned, version: d.version });
      await mutate(next, { revalidate: false });
      await refreshLiturgyDocuments();
      showToast("success", next.isPinned ? "Đã ghim lên đầu thư viện." : "Đã bỏ ghim.");
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutate();
    } finally {
      setBusy(false);
    }
  };

  const isText = TEXT_KINDS.includes(kind);

  return (
    <div className="flex flex-col gap-4">
      {/* Đầu thẻ */}
      <div className="flex items-start gap-3">
        <KindIcon kind={kind} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-extrabold text-gray-900 leading-snug break-words">{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={cn("px-2 py-0.5 rounded-md font-bold", KIND_META[kind].tone)}>{KIND_META[kind].label}</span>
            {(d ?? summary)?.category && (
              <button
                type="button"
                onClick={() => onPickCategory((d ?? summary)!.category!)}
                className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-semibold hover:bg-purple-100 hover:text-primary"
                title="Xem các tài liệu cùng chuyên mục"
              >
                {(d ?? summary)!.category}
              </button>
            )}
            {(d ?? summary)?.isPinned && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">
                <Pin className="w-3 h-3" /> Đã ghim
              </span>
            )}
          </div>
        </div>
      </div>

      {canManage && d && (
        <div className="flex flex-wrap gap-2 -mt-1">
          <button type="button" onClick={() => onEdit(d)} className={btnSoft}>
            <Pencil className="w-3.5 h-3.5" /> Sửa
          </button>
          <button type="button" onClick={togglePin} disabled={busy} className={cn(btnSoft, "disabled:opacity-60")}>
            {d.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            {d.isPinned ? "Bỏ ghim" : "Ghim lên đầu"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(d)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-rose-100 bg-white text-rose-600 hover:bg-rose-50 active:scale-95 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Xóa
          </button>
        </div>
      )}

      {!d && isLoading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
          <div className="h-3 bg-gray-100 rounded w-5/6" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      )}

      {d && (
        <>
          {/* Theo loại */}
          {d.kind === "youtube" && d.url && <YoutubeBlock url={d.url} title={d.title} />}

          {d.kind === "link" && d.url && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className={btnSolid}>
                  <ExternalLink className="w-3.5 h-3.5" /> Mở liên kết
                </a>
              </div>
              <p className="text-[11px] text-gray-500 break-all">
                <b className="text-gray-700">{urlHost(d.url)}</b> · {d.url}
              </p>
            </div>
          )}

          {d.kind === "pdf" && d.fileId && (
            <div className="p-3 rounded-2xl border border-amber-100 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <KindIcon kind="pdf" size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{d.fileName || `${d.title}.pdf`}</p>
                  <p className="text-[10.5px] text-gray-500">Tệp PDF{d.fileSizeBytes ? ` · ${fmtBytes(d.fileSizeBytes)}` : ""}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={`/api/v1/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className={btnSolid}>
                  <Eye className="w-3.5 h-3.5" /> Mở xem
                </a>
                <a href={`/api/v1/files/${d.fileId}?download=1`} download className={btnSoft}>
                  <Download className="w-3.5 h-3.5" /> Tải về
                </a>
              </div>
            </div>
          )}

          {d.content && (
            <div className={cn("relative rounded-2xl border", isText ? "border-purple-100 bg-purple-50/30 p-4 sm:p-5" : "border-gray-100 bg-gray-50/60 p-3")}>
              {isText && (
                <button
                  type="button"
                  onClick={copy}
                  className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-purple-100 text-[11px] font-bold text-primary hover:bg-purple-50"
                  title="Sao chép toàn bộ nội dung"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Đã chép" : "Sao chép"}
                </button>
              )}
              {!isText && <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide mb-1">Mô tả</p>}
              <div
                className={cn(
                  "whitespace-pre-wrap break-words text-gray-800",
                  isText ? "text-[15px] leading-7 pr-20 sm:pr-24" : "text-xs leading-relaxed",
                )}
              >
                {d.content}
              </div>
            </div>
          )}

          {/* Liên kết tham khảo của kinh / bài hát / ghi chú */}
          {isText && d.url && (
            <div className="flex flex-col gap-2">
              <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide">Liên kết tham khảo</p>
              {isYoutubeUrl(d.url) ? (
                <YoutubeBlock url={d.url} title={d.title} />
              ) : (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className={cn(btnSoft, "self-start max-w-full")}>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{urlHost(d.url) || d.url}</span>
                </a>
              )}
            </div>
          )}

          {d.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              {d.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPickTag(t)}
                  className="px-2 py-0.5 rounded-lg bg-gray-100 text-[11px] font-semibold text-gray-600 hover:bg-purple-100 hover:text-primary"
                  title="Tìm tài liệu có thẻ này"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          <p className="text-[10.5px] text-gray-400 border-t border-gray-100 pt-2">
            {d.createdByName ? `Nhập bởi ${d.createdByName} · ` : ""}Cập nhật {formatDate(d.updatedAt)}
          </p>
        </>
      )}
    </div>
  );
}

/** Khu "Tài liệu phụng vụ" của trang Phụng vụ: tìm kiếm không dấu, lọc loại/chuyên mục, xem chi tiết, quản lý (liturgy.document.manage). */
export default function LiturgyDocuments({ showToast }: { showToast: Toast }) {
  const { can } = useSession();
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<LiturgyDocKind | "">("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ doc: LiturgyDocumentDto | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiturgyDocumentDto | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Tìm kiếm ở máy chủ (bỏ dấu bằng DB) — chờ người dùng ngừng gõ 300 ms
  useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  // Mở thẳng một tài liệu: /phung-vu?doc=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("doc");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setSelectedId(id);
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, []);

  const { data, error, isLoading } = useLiturgyDocuments({ q, kind, category });
  const canManage = can("liturgy.document.manage") || !!data?.canManage;
  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((x) => x.id === selectedId) ?? null;
  const filtered = !!(q || kind || category);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Tất cả chuyên mục" },
      ...(data?.categories ?? []).map((c) => ({ value: c.name, label: c.name, subLabel: `${c.count} tài liệu` })),
    ],
    [data?.categories],
  );

  const clearFilters = () => {
    setTerm("");
    setQ("");
    setKind("");
    setCategory("");
  };

  const confirmDelete = async () => {
    const d = deleteTarget;
    setDeleteTarget(null);
    if (!d) return;
    try {
      await liturgyDocsApi.remove(d.id);
      if (selectedId === d.id) setSelectedId(null);
      await refreshLiturgyDocuments();
      showToast("success", `Đã xóa "${d.title}" khỏi thư viện.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  return (
    <section
      id="tai-lieu-phung-vu"
      ref={sectionRef}
      className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4 scroll-mt-20"
    >
      {/* Tiêu đề */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center shrink-0">
            <Library className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Tài liệu phụng vụ</h2>
            <p className="text-xs text-gray-500">Kinh nguyện, bài hát, video, PDF và liên kết để anh em tìm đọc, tập hát</p>
          </div>
        </div>
        {canManage && (
          <button type="button" onClick={() => setEditing({ doc: null })} className={btnSolid}>
            <Plus className="w-4 h-4" /> Thêm tài liệu
          </button>
        )}
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <CustomInput
              placeholder="Tìm kinh, bài hát, thẻ… (gõ không dấu cũng được)"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
              aria-label="Tìm tài liệu phụng vụ"
            />
            {term && (
              <button
                type="button"
                onClick={() => setTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                title="Xóa từ khóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="sm:w-60">
            <CustomSelect value={category} onChange={setCategory} options={categoryOptions} placeholder="Tất cả chuyên mục" />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => setKind("")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition",
              kind === "" ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100",
            )}
          >
            Tất cả ({data?.total ?? 0})
          </button>
          {LITURGY_DOC_KINDS.map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(kind === k ? "" : k)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition",
                  kind === k ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100",
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {m.short} ({data?.kindCounts[k] ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Danh sách + chi tiết */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 flex flex-col gap-2 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
          {error && !data && <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-xs text-rose-700">Không tải được thư viện: {errorMessage(error)}</div>}
          {isLoading && !data && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-gray-50 animate-pulse" />
              ))}
            </div>
          )}
          {items.map((d) => {
            const active = d.id === selectedId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "w-full text-left p-3 rounded-2xl border flex items-start gap-3 transition",
                  active ? "border-primary bg-purple-50/70 ring-2 ring-purple-100" : "border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/30",
                )}
              >
                <KindIcon kind={d.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900 truncate">{d.title}</span>
                    {d.isPinned && <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Đã ghim" />}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">
                    {d.kindLabel}
                    {d.category ? ` · ${d.category}` : ""}
                    {d.kind === "link" || (d.kind === "youtube" && !d.excerpt) ? ` · ${urlHost(d.url)}` : ""}
                  </p>
                  {d.excerpt && <p className="text-[11px] text-gray-400 truncate mt-0.5">{d.excerpt}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 self-center lg:hidden" />
              </button>
            );
          })}
          {data && items.length === 0 && (
            <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200">
              <Library className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              {filtered ? (
                <>
                  <p className="text-sm font-bold text-gray-800">Không tìm thấy tài liệu phù hợp</p>
                  <button type="button" onClick={clearFilters} className="mt-2 text-xs font-bold text-primary hover:underline">
                    Xóa bộ lọc
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-gray-800">Thư viện chưa có tài liệu nào</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {canManage ? "Thêm kinh nguyện, bài hát hay liên kết đầu tiên cho cả nhà." : "Ban Phụng vụ sẽ sớm cập nhật."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <MobileDetailSheet
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
          title={selected?.title ?? "Tài liệu phụng vụ"}
          className="lg:col-span-7 lg:sticky lg:top-4"
        >
          <div className="rounded-3xl border border-purple-50 bg-white p-4 sm:p-5 min-h-[220px]">
            {selectedId ? (
              <DocumentDetail
                key={selectedId}
                id={selectedId}
                summary={selected}
                canManage={canManage}
                showToast={showToast}
                onEdit={(doc) => setEditing({ doc })}
                onDelete={(doc) => setDeleteTarget(doc)}
                onPickTag={(t) => {
                  setTerm(t);
                  setKind("");
                  setCategory("");
                  setSelectedId(null);
                }}
                onPickCategory={(c) => {
                  setCategory(c);
                  setKind("");
                  setSelectedId(null);
                }}
              />
            ) : (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-2 text-gray-400">
                <Library className="w-10 h-10 text-gray-200" />
                <p className="text-xs font-semibold text-gray-500">Chọn một tài liệu bên trái để xem</p>
                <p className="text-[11px] max-w-xs">Lời kinh, lời bài hát hiển thị nguyên định dạng và sao chép được; video chỉ phát khi bạn bấm xem.</p>
              </div>
            )}
          </div>
        </MobileDetailSheet>
      </div>

      <LiturgyDocumentDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing?.doc ?? null}
        categories={(data?.categories ?? []).map((c) => c.name)}
        showToast={showToast}
        onSaved={(doc) => {
          setSelectedId(doc.id);
          void refreshLiturgyDocuments();
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xóa tài liệu phụng vụ?"
        message={
          <span>
            Tài liệu <b className="text-gray-900">&quot;{deleteTarget?.title}&quot;</b> sẽ biến mất khỏi thư viện của cả nhà.
          </span>
        }
        confirmText="Xóa tài liệu"
        variant="danger"
      />
    </section>
  );
}
