// DTO + hằng số + tiện ích thuần cho Thư viện tài liệu phụng vụ (/api/v1/liturgy/documents). Dùng chung client/server.

export const LITURGY_DOC_KINDS = ["prayer", "song", "youtube", "pdf", "link", "note"] as const;
export type LiturgyDocKind = (typeof LITURGY_DOC_KINDS)[number];

export const LITURGY_DOC_KIND_LABEL: Record<LiturgyDocKind, string> = {
  prayer: "Kinh nguyện",
  song: "Bài hát / Thánh ca",
  youtube: "Video YouTube",
  pdf: "Tài liệu PDF",
  link: "Liên kết",
  note: "Ghi chú / Bài đọc",
};

/** Loại có lời văn bắt buộc (hiển thị nguyên định dạng xuống dòng + nút sao chép). */
export const TEXT_KINDS: readonly LiturgyDocKind[] = ["prayer", "song", "note"];
/** Loại bắt buộc URL. */
export const URL_KINDS: readonly LiturgyDocKind[] = ["youtube", "link"];

export const DOC_LIMITS = {
  titleMin: 2,
  titleMax: 200,
  categoryMax: 60,
  tagMax: 30,
  tagsMax: 12,
  contentMax: 50_000,
  urlMax: 2000,
} as const;

export interface LiturgyDocumentSummaryDto {
  id: string;
  title: string;
  kind: LiturgyDocKind;
  kindLabel: string;
  category: string | null;
  tags: string[];
  /** Trích đoạn một dòng của lời văn / mô tả (≤ 160 ký tự). */
  excerpt: string | null;
  url: string | null;
  fileId: string | null;
  /** Mã video YouTube suy từ URL (null nếu URL là trang tìm kiếm/kênh/danh sách phát). */
  youtubeId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LiturgyDocumentDto extends Omit<LiturgyDocumentSummaryDto, "excerpt"> {
  content: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  createdByName: string | null;
  version: number;
}

export interface LiturgyDocumentListDto {
  items: LiturgyDocumentSummaryDto[];
  /** Chuyên mục đang có (kèm số tài liệu) — cho ô lọc và gợi ý khi nhập. */
  categories: { name: string; count: number }[];
  /** Số tài liệu theo loại (không áp bộ lọc loại/chuyên mục/từ khóa). */
  kindCounts: Record<LiturgyDocKind, number>;
  total: number;
  canManage: boolean;
}

export interface LiturgyDocumentInput {
  title: string;
  kind: LiturgyDocKind;
  category?: string | null;
  tags?: string[];
  content?: string | null;
  url?: string | null;
  fileId?: string | null;
  isPinned?: boolean;
}

export interface LiturgyDocumentPatch extends Partial<LiturgyDocumentInput> {
  version?: number;
}

// ---------------------------------------------------------------------
// Tiện ích URL (giống ràng buộc ck_liturgy_documents__url_format / __youtube trong DB)
// ---------------------------------------------------------------------
const HTTP_RE = /^https?:\/\/[^\s/?#]+[^\s]*$/i;
const YT_HOST_RE = /^([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isHttpUrl(url: string | null | undefined): boolean {
  if (!url || url.length > DOC_LIMITS.urlMax || !HTTP_RE.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isYoutubeUrl(url: string | null | undefined): boolean {
  if (!isHttpUrl(url)) return false;
  try {
    const u = new URL(url!);
    return !u.username && !u.password && YT_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/** Mã video từ youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>; không có ⇒ null. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!isYoutubeUrl(url)) return null;
  const u = new URL(url!);
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be" || host.endsWith(".youtu.be")) id = u.pathname.split("/")[1] ?? null;
  else if (u.pathname === "/watch") id = u.searchParams.get("v");
  else {
    const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
    id = m ? m[2] : null;
  }
  return id && YT_ID_RE.test(id) ? id : null;
}

/** Trình nhúng không cookie — chỉ chèn khi người dùng bấm "Xem tại đây". */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
}

/** Tên miền hiển thị của một liên kết ("ktcgkpv.org"). */
export function urlHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Tách ô "thẻ" người dùng nhập (phẩy / chấm phẩy / xuống dòng) thành danh sách gọn, bỏ trùng. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw.split(/[,;\n]/)) {
    const v = t.trim().replace(/^#/, "").slice(0, DOC_LIMITS.tagMax);
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, DOC_LIMITS.tagsMax);
}
