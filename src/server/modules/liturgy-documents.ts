import "server-only";
import { z } from "zod";
import { batch, type Tx } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { zText, zUuid } from "../http";
import {
  DOC_LIMITS,
  LITURGY_DOC_KIND_LABEL,
  LITURGY_DOC_KINDS,
  TEXT_KINDS,
  URL_KINDS,
  isHttpUrl,
  isYoutubeUrl,
  youtubeVideoId,
  type LiturgyDocKind,
  type LiturgyDocumentDto,
  type LiturgyDocumentInput,
  type LiturgyDocumentListDto,
  type LiturgyDocumentPatch,
  type LiturgyDocumentSummaryDto,
} from "@/lib/types/liturgy-documents";
import { iso, previewOf } from "./community-shared";

// =====================================================================
// Thư viện tài liệu phụng vụ (bảng liturgy_documents — db/app/995_liturgy_documents.sql)
//   • đọc: mọi thành viên (RLS); API luôn lọc deleted_at IS NULL (người quản lý vẫn "thấy" dòng đã xóa dưới RLS);
//   • ghi: liturgy.document.manage (Trưởng nhà, Ban Phụng vụ, Admin) — kiểm trước để trả 403 rõ ràng, RLS là lớp thứ hai;
//   • ràng buộc theo loại kiểm ở đây (400 kèm từng trường) và ở DB (CHECK + trigger: tệp PDF đúng bucket/định dạng/người tải).
// =====================================================================

const MANAGE = "liturgy.document.manage";
const CAN_MANAGE_SQL = `SELECT app.has_permission('${MANAGE}') AS ok`;

type Row = Record<string, any>;

// ---------------------------------------------------------------------
// Schema body
// ---------------------------------------------------------------------
const zKind = z.enum(LITURGY_DOC_KINDS, { message: "Loại tài liệu không hợp lệ." });
const zCategory = z.string().trim().max(DOC_LIMITS.categoryMax, `Chuyên mục tối đa ${DOC_LIMITS.categoryMax} ký tự.`).nullable().optional();
const zTags = z
  .array(z.string().trim().min(1, "Thẻ không được để trống.").max(DOC_LIMITS.tagMax, `Mỗi thẻ tối đa ${DOC_LIMITS.tagMax} ký tự.`))
  .max(DOC_LIMITS.tagsMax, `Tối đa ${DOC_LIMITS.tagsMax} thẻ.`)
  .optional();
const zContent = z.string().max(DOC_LIMITS.contentMax, "Nội dung tối đa 50.000 ký tự.").nullable().optional();
const zUrl = z.string().trim().max(DOC_LIMITS.urlMax, `Liên kết tối đa ${DOC_LIMITS.urlMax} ký tự.`).nullable().optional();

export const LiturgyDocumentCreateSchema = z.object({
  title: zText(DOC_LIMITS.titleMin, DOC_LIMITS.titleMax, "Tiêu đề"),
  kind: zKind,
  category: zCategory,
  tags: zTags,
  content: zContent,
  url: zUrl,
  fileId: zUuid.nullable().optional(),
  isPinned: z.boolean().optional(),
});

export const LiturgyDocumentPatchSchema = z.object({
  title: zText(DOC_LIMITS.titleMin, DOC_LIMITS.titleMax, "Tiêu đề").optional(),
  kind: zKind.optional(),
  category: zCategory,
  tags: zTags,
  content: zContent,
  url: zUrl,
  fileId: zUuid.nullable().optional(),
  isPinned: z.boolean().optional(),
  version: z.number().int().min(1).optional(),
});

interface NormalizedDoc {
  title: string;
  kind: LiturgyDocKind;
  category: string | null;
  tags: string[];
  content: string | null;
  url: string | null;
  fileId: string | null;
  isPinned: boolean;
}

/** Chuẩn hóa + kiểm ràng buộc theo loại; lỗi ⇒ 400 kèm danh sách trường. */
function normalize(d: NormalizedDoc): NormalizedDoc {
  const out: NormalizedDoc = {
    title: d.title.trim(),
    kind: d.kind,
    category: d.category?.trim() || null,
    tags: [...new Map(d.tags.map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()],
    content: d.content && d.content.trim() ? d.content.replace(/\r\n/g, "\n") : null,
    url: d.url?.trim() || null,
    fileId: d.kind === "pdf" ? d.fileId : null,
    isPinned: d.isPinned,
  };
  const errors: { field: string; message: string }[] = [];
  if (TEXT_KINDS.includes(out.kind) && !out.content)
    errors.push({ field: "content", message: out.kind === "song" ? "Nhập lời bài hát." : out.kind === "prayer" ? "Nhập lời kinh." : "Nhập nội dung ghi chú." });
  if (URL_KINDS.includes(out.kind) && !out.url)
    errors.push({ field: "url", message: out.kind === "youtube" ? "Nhập liên kết video YouTube." : "Nhập địa chỉ liên kết." });
  if (out.url && !isHttpUrl(out.url)) errors.push({ field: "url", message: "Liên kết phải bắt đầu bằng http:// hoặc https:// và không chứa khoảng trắng." });
  else if (out.kind === "youtube" && out.url && !isYoutubeUrl(out.url))
    errors.push({ field: "url", message: "Liên kết video phải thuộc youtube.com hoặc youtu.be." });
  if (out.kind === "pdf" && !out.fileId) errors.push({ field: "fileId", message: "Hãy tải lên tệp PDF." });
  if (errors.length) throw badRequest(errors[0].message, errors);
  return out;
}

// ---------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------
function toSummary(r: Row): LiturgyDocumentSummaryDto {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    kindLabel: LITURGY_DOC_KIND_LABEL[r.kind as LiturgyDocKind] ?? r.kind,
    category: r.category ?? null,
    tags: r.tags ?? [],
    excerpt: r.excerpt ? previewOf(r.excerpt, 160) : null,
    url: r.url ?? null,
    fileId: r.file_id ?? null,
    youtubeId: youtubeVideoId(r.url),
    isPinned: !!r.is_pinned,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Chuỗi LIKE an toàn: thoát \ % _ trước khi DB bỏ dấu (app.norm_text giữ nguyên các ký tự này). */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function listDocuments(
  tx: Tx,
  f: { q?: string | null; kind?: string | null; category?: string | null }
): Promise<LiturgyDocumentListDto> {
  const q = f.q?.trim().slice(0, 100) || null;
  const kind = f.kind && (LITURGY_DOC_KINDS as readonly string[]).includes(f.kind) ? f.kind : null;
  if (f.kind && !kind) throw badRequest("Loại tài liệu không hợp lệ.");
  const category = f.category?.trim() || null;
  // 1 vòng mạng: danh sách theo bộ lọc + đếm theo loại + chuyên mục + quyền quản lý
  const [listR, kindR, catR, canR] = await batch(tx, [
    [
      `SELECT d.id, d.title, d.kind, d.category, d.tags, left(d.content, 400) AS excerpt, d.url, d.file_id, d.is_pinned, d.created_at, d.updated_at
         FROM liturgy_documents d
        WHERE d.deleted_at IS NULL
          AND ($1::text IS NULL OR d.kind = $1::text)
          AND ($2::text IS NULL OR d.category = $2::text)
          AND ($3::text IS NULL OR d.search_norm LIKE ALL (
                SELECT '%' || t || '%' FROM regexp_split_to_table(app.norm_text($3::text), ' ') AS t WHERE t <> ''))
        ORDER BY d.is_pinned DESC, d.created_at DESC
        LIMIT 300`,
      [kind, category, q ? likeEscape(q) : null],
    ],
    ["SELECT kind, count(*)::int AS n FROM liturgy_documents WHERE deleted_at IS NULL GROUP BY kind"],
    [
      `SELECT category AS name, count(*)::int AS n FROM liturgy_documents
        WHERE deleted_at IS NULL AND category IS NOT NULL GROUP BY category ORDER BY lower(category)`,
    ],
    [CAN_MANAGE_SQL],
  ]);
  const kindCounts = Object.fromEntries(LITURGY_DOC_KINDS.map((k) => [k, 0])) as Record<LiturgyDocKind, number>;
  for (const r of kindR.rows) if (r.kind in kindCounts) kindCounts[r.kind as LiturgyDocKind] = r.n;
  return {
    items: listR.rows.map(toSummary),
    categories: catR.rows.map((r) => ({ name: r.name, count: r.n })),
    kindCounts,
    total: Object.values(kindCounts).reduce((a, b) => a + b, 0),
    canManage: !!canR.rows[0]?.ok,
  };
}

const DETAIL_SQL = `
  SELECT d.id, d.title, d.kind, d.category, d.tags, d.content, d.url, d.file_id, d.is_pinned, d.created_at, d.updated_at, d.version,
         f.original_name AS file_name, f.size_bytes AS file_size,
         (SELECT COALESCE(m.display_name, m.full_name) FROM members m WHERE m.user_id = d.created_by AND m.deleted_at IS NULL LIMIT 1) AS created_by_name
    FROM liturgy_documents d
    LEFT JOIN storage_files f ON f.id = d.file_id
   WHERE d.id = $1 AND d.deleted_at IS NULL`;

function toDetail(r: Row): LiturgyDocumentDto {
  const { excerpt: _excerpt, ...base } = toSummary(r);
  void _excerpt;
  return {
    ...base,
    content: r.content ?? null,
    fileName: r.file_name ?? null,
    fileSizeBytes: r.file_size == null ? null : Number(r.file_size),
    createdByName: r.created_by_name ?? null,
    version: r.version,
  };
}

export async function getDocument(tx: Tx, id: string): Promise<LiturgyDocumentDto> {
  const r = (await tx.query(DETAIL_SQL, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy tài liệu (có thể đã bị xóa).");
  return toDetail(r);
}

// ---------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------
function assertCanManage(ok: unknown, action: string) {
  if (!ok) throw forbidden(`Chỉ Ban Phụng vụ hoặc người quản lý (quyền "Thêm/sửa/xóa tài liệu phụng vụ") mới ${action} tài liệu phụng vụ.`);
}

export async function createDocument(tx: Tx, b: LiturgyDocumentInput): Promise<LiturgyDocumentDto> {
  const can = (await tx.query(CAN_MANAGE_SQL)).rows[0]?.ok;
  assertCanManage(can, "thêm được");
  const d = normalize({
    title: b.title,
    kind: b.kind,
    category: b.category ?? null,
    tags: b.tags ?? [],
    content: b.content ?? null,
    url: b.url ?? null,
    fileId: b.fileId ?? null,
    isPinned: !!b.isPinned,
  });
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO liturgy_documents (title, kind, category, tags, content, url, file_id, is_pinned)
       VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8) RETURNING id`,
      [d.title, d.kind, d.category, d.tags, d.content, d.url, d.fileId, d.isPinned]
    )
  ).rows[0].id;
  return getDocument(tx, id);
}

export async function updateDocument(tx: Tx, id: string, p: LiturgyDocumentPatch): Promise<LiturgyDocumentDto> {
  const [canR, curR] = await batch(tx, [[CAN_MANAGE_SQL], [DETAIL_SQL, [id]]]);
  assertCanManage(canR.rows[0]?.ok, "sửa được");
  const cur = curR.rows[0];
  if (!cur) throw notFound("Không tìm thấy tài liệu (có thể đã bị xóa).");
  if (p.version !== undefined && p.version !== cur.version)
    throw conflict(`Tài liệu "${cur.title}" vừa được người khác sửa — tải lại để xem bản mới.`, "STALE_VERSION");
  const pick = <K extends keyof LiturgyDocumentPatch>(k: K, fallback: unknown) => (p[k] !== undefined ? p[k] : fallback);
  const d = normalize({
    title: pick("title", cur.title) as string,
    kind: pick("kind", cur.kind) as LiturgyDocKind,
    category: pick("category", cur.category) as string | null,
    tags: (pick("tags", cur.tags) as string[] | null) ?? [],
    content: pick("content", cur.content) as string | null,
    url: pick("url", cur.url) as string | null,
    fileId: pick("fileId", cur.file_id) as string | null,
    isPinned: pick("isPinned", cur.is_pinned) as boolean,
  });
  const r = await tx.query(
    `UPDATE liturgy_documents
        SET title = $2, kind = $3, category = $4, tags = $5::text[], content = $6, url = $7, file_id = $8, is_pinned = $9
      WHERE id = $1 AND version = $10 AND deleted_at IS NULL`,
    [id, d.title, d.kind, d.category, d.tags, d.content, d.url, d.fileId, d.isPinned, cur.version]
  );
  if (!r.rowCount) throw conflict(`Tài liệu "${cur.title}" vừa được người khác sửa hoặc xóa — tải lại để xem bản mới.`, "STALE_VERSION");
  return getDocument(tx, id);
}

/** Xóa mềm (deleted_at) — tài liệu biến mất khỏi thư viện; nhật ký kiểm toán vẫn giữ nội dung. */
export async function deleteDocument(tx: Tx, id: string): Promise<void> {
  const can = (await tx.query(CAN_MANAGE_SQL)).rows[0]?.ok;
  assertCanManage(can, "xóa được");
  const r = await tx.query("UPDATE liturgy_documents SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy tài liệu (có thể đã bị xóa).");
}
