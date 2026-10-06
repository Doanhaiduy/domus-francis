import "server-only";
import type { Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import type {
  MomentAlbumDetailDto,
  MomentAlbumDto,
  MomentCategoryDto,
  MomentLikeResult,
  MomentListDto,
  MomentListFilter,
  MomentParticipantDto,
  MomentPhotoDto,
} from "@/lib/types/moments";
import type { CreateAlbumInput, UpdateAlbumInput } from "./moments-schema";

// ---------------------------------------------------------------------
// Khoảnh khắc (album ảnh). Quyền do RLS + trigger của DB quyết định:
//   - albums__insert: tác giả = chính mình + album.create; albums__update: tác giả hoặc album.moderate
//   - BR-COM-06: is_featured/status chỉ album.moderate; likes_count/photos_count do trigger duy trì
//   - BR-COM-07: thẻ tên mới ở trạng thái pending trừ khi người được gắn thẻ đã đồng ý photo_tagging
//   - BR-STO-05: cover_file_id / album_photos.file_id phải là tệp bucket moments do CHÍNH người thao tác tải lên
// Xóa = xóa mềm (deleted_at); API luôn lọc deleted_at IS NULL khi liệt kê.
// ---------------------------------------------------------------------

type Row = Record<string, any>;

const fileUrl = (id: string, v?: "thumb" | "medium") => `/api/v1/files/${id}${v ? `?v=${v}` : ""}`;
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const hashTag = (t: string) => (t.startsWith("#") ? t : `#${t}`);

/** "#Mùa Hè 2026" → "MùaHè2026"; bỏ trùng (không phân biệt hoa thường), tối đa 20. */
export function normalizeTags(tags: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const t = raw.replace(/^#+/, "").replace(/[\s,#]+/g, "").slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, 20);
}

const ALBUM_SELECT = `
  SELECT a.id, a.title, a.description, a.taken_on, a.location_text, a.author_member_id, a.is_featured, a.is_public, a.tags,
         a.visibility, a.status::text AS status, a.likes_count, a.photos_count, a.created_at,
         c.id AS category_id, c.code AS category_code, c.name AS category_name, c.color AS category_color,
         am.display_name AS author_name, am.full_name AS author_full_name, am.avatar_file_id AS author_avatar,
         pos.position_name AS author_role,
         (a.author_member_id = app.current_member_id()) AS is_mine,
         EXISTS (SELECT 1 FROM album_likes l WHERE l.album_id = a.id AND l.member_id = app.current_member_id()) AS is_liked,
         COALESCE(a.cover_file_id,
                  (SELECT p.file_id FROM album_photos p
                    WHERE p.album_id = a.id AND p.deleted_at IS NULL AND p.status = 'published'
                    ORDER BY p.sort_order, p.created_at LIMIT 1)) AS cover_id,
         COALESCE((SELECT json_agg(json_build_object('memberId', t.member_id, 'name', tm.display_name, 'fullName', tm.full_name,
                                                     'status', t.status, 'isMe', t.member_id = app.current_member_id())
                                   ORDER BY t.created_at, tm.full_name)
                     FROM album_member_tags t JOIN members tm ON tm.id = t.member_id
                    WHERE t.album_id = a.id AND t.status <> 'declined'), '[]'::json) AS participants
    FROM albums a
    JOIN categories c ON c.id = a.category_id
    LEFT JOIN members am ON am.id = a.author_member_id
    LEFT JOIN v_member_current_position pos ON pos.member_id = a.author_member_id`;

function toAlbumDto(r: Row, canModerate: boolean): MomentAlbumDto {
  const takenOn: string = r.taken_on;
  const isMine = !!r.is_mine;
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    categoryId: r.category_id,
    categoryCode: r.category_code,
    category: r.category_name,
    categoryColor: r.category_color,
    takenOn,
    date: dmy(takenOn),
    year: Number(takenOn.slice(0, 4)),
    month: Number(takenOn.slice(5, 7)),
    location: r.location_text ?? "",
    coverFileId: r.cover_id ?? null,
    coverUrl: r.cover_id ? fileUrl(r.cover_id, "medium") : null,
    coverThumbUrl: r.cover_id ? fileUrl(r.cover_id, "thumb") : null,
    author: {
      memberId: r.author_member_id,
      name: r.author_name ?? "Thành viên cũ",
      fullName: r.author_full_name ?? r.author_name ?? "Thành viên cũ",
      role: r.author_role ?? "Thành viên",
      avatarUrl: r.author_avatar ? fileUrl(r.author_avatar, "thumb") : undefined,
    },
    tags: (r.tags as string[]).map(hashTag),
    participants: r.participants as MomentParticipantDto[],
    photosCount: r.photos_count,
    likesCount: r.likes_count,
    isLiked: !!r.is_liked,
    isFeatured: !!r.is_featured,
    isPublic: !!r.is_public,
    status: r.status,
    visibility: r.visibility,
    isMine,
    canEdit: isMine || canModerate,
    canDelete: isMine || canModerate,
    canAddPhotos: isMine || canModerate,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

async function canModerate(tx: Tx): Promise<boolean> {
  return (await tx.query<{ ok: boolean }>("SELECT app.has_permission('album.moderate') AS ok")).rows[0].ok;
}

export async function listCategories(tx: Tx): Promise<MomentCategoryDto[]> {
  return (
    await tx.query(
      `SELECT id, code, name, color FROM categories
        WHERE kind = 'album' AND is_active AND deleted_at IS NULL ORDER BY sort_order, name`
    )
  ).rows.map((c) => ({ id: c.id, code: c.code, name: c.name, color: c.color }));
}

// ---------------------------------------------------------------------
// Danh sách + thống kê
// ---------------------------------------------------------------------
export async function listAlbums(tx: Tx, f: MomentListFilter): Promise<MomentListDto> {
  const mod = await canModerate(tx);
  const where: string[] = ["a.deleted_at IS NULL"];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace(/\$\?/g, `$${vals.length}`));
  };
  if (f.category) add("a.category_id = $?::uuid", f.category);
  if (f.year) add("extract(year FROM a.taken_on) = $?", f.year);
  if (f.month) add("extract(month FROM a.taken_on) = $?", f.month);
  if (f.day) add("to_char(a.taken_on, 'DD/MM/YYYY') LIKE '%' || $? || '%'", f.day.replace(/[%_\\]/g, ""));
  if (f.featured) where.push("a.is_featured");
  if (f.q) {
    add(
      `(app.norm_text(concat_ws(' ', a.title, a.description, a.location_text, array_to_string(a.tags, ' '),
                                 am.display_name, am.full_name, to_char(a.taken_on, 'DD/MM/YYYY'), c.name)) LIKE '%' || app.norm_text($?) || '%'
        OR EXISTS (SELECT 1 FROM album_member_tags t2 JOIN members m2 ON m2.id = t2.member_id
                    WHERE t2.album_id = a.id AND t2.status <> 'declined'
                      AND app.norm_text(concat_ws(' ', m2.full_name, m2.display_name)) LIKE '%' || app.norm_text($?) || '%'))`,
      f.q.replace(/^#/, "").replace(/[%_\\]/g, "")
    );
  }
  const albums = (
    await tx.query(`${ALBUM_SELECT} WHERE ${where.join(" AND ")} ORDER BY a.taken_on DESC, a.created_at DESC LIMIT 300`, vals)
  ).rows.map((r) => toAlbumDto(r, mod));

  const featuredRow = (
    await tx.query(
      `${ALBUM_SELECT} WHERE a.deleted_at IS NULL AND a.status = 'published'
        ORDER BY a.is_featured DESC, a.taken_on DESC, a.created_at DESC LIMIT 1`
    )
  ).rows[0];

  const s = (
    await tx.query<{ albums: number; photos: number; likes: number; years: number[] }>(
      `SELECT count(*)::int AS albums, COALESCE(sum(photos_count), 0)::int AS photos, COALESCE(sum(likes_count), 0)::int AS likes,
              COALESCE(array_agg(DISTINCT extract(year FROM taken_on)::int), '{}') AS years
         FROM albums WHERE deleted_at IS NULL`
    )
  ).rows[0];

  return {
    albums,
    featured: featuredRow ? toAlbumDto(featuredRow, mod) : null,
    stats: { albums: s.albums, photos: s.photos, likes: s.likes, years: [...s.years].sort((a, b) => b - a) },
    categories: await listCategories(tx),
    canModerate: mod,
  };
}

// ---------------------------------------------------------------------
// Chi tiết album + ảnh
// ---------------------------------------------------------------------
export async function getAlbum(tx: Tx, id: string): Promise<MomentAlbumDetailDto> {
  const mod = await canModerate(tx);
  const r = (await tx.query(`${ALBUM_SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id])).rows[0];
  if (!r) throw notFound("Không tìm thấy album (có thể đã bị xóa).");
  const album = toAlbumDto(r, mod);
  const photos = (
    await tx.query(
      `SELECT p.id, p.album_id, p.file_id, p.caption, p.uploaded_by_member_id, p.sort_order, p.status::text AS status, p.likes_count,
              to_char(app.local_date(COALESCE(p.taken_at, p.created_at)), 'DD/MM/YYYY') AS shot_dmy,
              m.display_name, m.full_name, pos.position_name, f.width_px, f.height_px,
              (p.uploaded_by_member_id = app.current_member_id()) AS is_mine,
              EXISTS (SELECT 1 FROM photo_likes l WHERE l.photo_id = p.id AND l.member_id = app.current_member_id()) AS is_liked
         FROM album_photos p
         LEFT JOIN members m ON m.id = p.uploaded_by_member_id
         LEFT JOIN v_member_current_position pos ON pos.member_id = p.uploaded_by_member_id
         LEFT JOIN storage_files f ON f.id = p.file_id
        WHERE p.album_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.sort_order, p.created_at`,
      [id]
    )
  ).rows.map(
    (p): MomentPhotoDto => ({
      id: p.id,
      albumId: p.album_id,
      fileId: p.file_id,
      url: fileUrl(p.file_id, "medium"),
      thumbUrl: fileUrl(p.file_id, "thumb"),
      originalUrl: fileUrl(p.file_id),
      downloadUrl: `${fileUrl(p.file_id)}?download=1`,
      caption: p.caption ?? "",
      uploadedBy: {
        memberId: p.uploaded_by_member_id,
        name: p.display_name ?? "Thành viên cũ",
        fullName: p.full_name ?? p.display_name ?? "Thành viên cũ",
        role: p.position_name ?? "Thành viên",
      },
      date: p.shot_dmy,
      width: p.width_px ?? null,
      height: p.height_px ?? null,
      likesCount: p.likes_count,
      isLiked: !!p.is_liked,
      sortOrder: p.sort_order,
      status: p.status,
      isMine: !!p.is_mine,
      isCover: album.coverFileId === p.file_id,
      canEdit: !!p.is_mine || mod,
      canDelete: !!p.is_mine || mod,
    })
  );
  return { ...album, photos };
}

// ---------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------
async function assertCategory(tx: Tx, categoryId: string) {
  const ok = (
    await tx.query("SELECT 1 FROM categories WHERE id = $1 AND kind = 'album' AND is_active AND deleted_at IS NULL", [categoryId])
  ).rowCount;
  if (!ok) throw new ApiError(422, "BAD_CATEGORY", "Chủ đề album không hợp lệ.");
}

/** Lỗi trùng ảnh (một tệp chỉ thuộc một album) → thông điệp dễ hiểu. */
function mapPhotoError(e: unknown): never {
  if ((e as { constraint?: string }).constraint === "ux_album_photos__file") {
    throw new ApiError(409, "PHOTO_DUPLICATE", "Ảnh này đã nằm trong một album — hãy tải lên ảnh khác.");
  }
  throw e;
}

/**
 * Thêm ảnh: chỉ tệp do chính mình tải lên (RLS storage_files + trigger BR-STO-05), album của mình hoặc có album.moderate (RLS album_photos__insert).
 * taken_at lấy từ EXIF đã được bước xử lý tin cậy xác lập trên storage_files.
 */
async function insertPhotos(tx: Tx, albumId: string, photos: { fileId: string; caption?: string | null }[]) {
  const start = (
    await tx.query<{ n: number }>(
      "SELECT COALESCE(max(sort_order) + 1, 0)::int AS n FROM album_photos WHERE album_id = $1 AND deleted_at IS NULL",
      [albumId]
    )
  ).rows[0].n;
  const seen = new Set<string>();
  let i = 0;
  for (const p of photos) {
    if (seen.has(p.fileId)) continue;
    seen.add(p.fileId);
    const r = await tx
      .query(
        `INSERT INTO album_photos (album_id, file_id, caption, uploaded_by_member_id, taken_at, sort_order)
         SELECT $1, f.id, $3, app.current_member_id(), f.taken_at, $4
           FROM storage_files f WHERE f.id = $2 AND f.deleted_at IS NULL`,
        [albumId, p.fileId, p.caption?.trim() || null, start + i]
      )
      .catch(mapPhotoError);
    if (!r.rowCount) throw new ApiError(422, "BR-STO-05", "Ảnh chưa tải lên xong hoặc không phải ảnh do bạn tải lên — vui lòng tải lại ảnh.");
    i++;
  }
  return i;
}

/** Thẻ tên: accepted ngay nếu là chính mình hoặc người được gắn thẻ đã đồng ý photo_tagging; còn lại pending chờ họ xác nhận (BR-COM-07). */
async function addTags(tx: Tx, albumId: string, memberIds: string[]) {
  if (!memberIds.length) return;
  await tx.query(
    `INSERT INTO album_member_tags (album_id, member_id, tagged_by_member_id, status, responded_at)
     SELECT $1, m.id, app.current_member_id(), x.st, CASE WHEN x.st = 'accepted' THEN now() END
       FROM members m
       CROSS JOIN LATERAL (SELECT CASE WHEN app.is_self(m.id) OR app.has_active_consent(m.id, 'photo_tagging')
                                       THEN 'accepted' ELSE 'pending' END AS st) x
      WHERE m.id = ANY($2::uuid[]) AND m.deleted_at IS NULL
     ON CONFLICT (album_id, member_id) DO NOTHING`,
    [albumId, memberIds]
  );
}

async function syncTags(tx: Tx, albumId: string, memberIds: string[]) {
  const wanted = Array.from(new Set(memberIds));
  // Gỡ thẻ không còn trong danh sách (giữ thẻ đã bị người được gắn từ chối để không gắn lại trái ý họ)
  await tx.query(
    "DELETE FROM album_member_tags WHERE album_id = $1 AND status <> 'declined' AND NOT (member_id = ANY($2::uuid[]))",
    [albumId, wanted]
  );
  await addTags(tx, albumId, wanted);
}

export async function createAlbum(tx: Tx, i: CreateAlbumInput): Promise<string> {
  await assertCategory(tx, i.categoryId);
  const me = (await tx.query<{ id: string | null }>("SELECT app.current_member_id() AS id")).rows[0].id;
  if (!me) throw forbidden("Tài khoản của bạn chưa có hồ sơ thành viên nên chưa tạo được album.");
  const r = await tx.query<{ id: string }>(
    `INSERT INTO albums (title, description, category_id, taken_on, location_text, cover_file_id, author_member_id, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [i.title.trim(), i.description?.trim() || null, i.categoryId, i.takenOn, i.location?.trim() || null, i.coverFileId, me, normalizeTags(i.tags)]
  );
  const albumId = r.rows[0].id;
  // Ảnh bìa cũng là ảnh đầu tiên của album (giữ hành vi giao diện cũ), sau đó các ảnh khác theo thứ tự tải lên
  await insertPhotos(tx, albumId, [
    { fileId: i.coverFileId, caption: i.title },
    ...(i.photoFileIds ?? []).filter((id) => id !== i.coverFileId).map((fileId) => ({ fileId })),
  ]);
  await addTags(tx, albumId, Array.from(new Set(i.participantIds ?? [])));
  return albumId;
}

/** Album còn hiển thị với người gọi? (404 nếu không) — trả về tác giả để phân biệt 403/404. */
async function requireAlbum(tx: Tx, id: string) {
  const a = (
    await tx.query<{ id: string; is_mine: boolean; cover_file_id: string | null }>(
      "SELECT id, author_member_id = app.current_member_id() AS is_mine, cover_file_id FROM albums WHERE id = $1 AND deleted_at IS NULL",
      [id]
    )
  ).rows[0];
  if (!a) throw notFound("Không tìm thấy album (có thể đã bị xóa).");
  return a;
}

export async function updateAlbum(tx: Tx, id: string, i: UpdateAlbumInput) {
  const a = await requireAlbum(tx, id);
  const mod = await canModerate(tx);
  if (!a.is_mine && !mod) throw forbidden("Chỉ người tạo album hoặc Ban Truyền thông/Ban điều hành mới sửa được album này.");
  if ((i.isFeatured !== undefined || i.hidden !== undefined || i.isPublic !== undefined) && !mod) {
    throw forbidden("Chỉ người có quyền kiểm duyệt album mới đánh dấu tiêu biểu, ẩn/hiện hoặc công khai album.");
  }
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (i.title !== undefined) set("title", i.title.trim());
  if (i.description !== undefined) set("description", i.description?.trim() || null);
  if (i.categoryId !== undefined) {
    await assertCategory(tx, i.categoryId);
    set("category_id", i.categoryId);
  }
  if (i.takenOn !== undefined) set("taken_on", i.takenOn);
  if (i.location !== undefined) set("location_text", i.location?.trim() || null);
  if (i.tags !== undefined) set("tags", normalizeTags(i.tags));
  if (i.coverFileId !== undefined) set("cover_file_id", i.coverFileId);
  if (i.isFeatured !== undefined) set("is_featured", i.isFeatured);
  if (i.hidden !== undefined) set("status", i.hidden ? "hidden" : "published");
  if (i.isPublic !== undefined) set("is_public", i.isPublic);
  if (sets.length) {
    const r = await tx.query(`UPDATE albums SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
    if (!r.rowCount) throw forbidden("Bạn không có quyền sửa album này.");
  }
  if (i.participantIds !== undefined) await syncTags(tx, id, i.participantIds);
}

export async function deleteAlbum(tx: Tx, id: string) {
  const a = await requireAlbum(tx, id);
  if (!a.is_mine && !(await canModerate(tx))) {
    throw forbidden("Bạn chỉ xóa được album do mình tạo (hoặc cần quyền kiểm duyệt album).");
  }
  const r = await tx.query("UPDATE albums SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền xóa album này.");
}

export async function addPhotos(tx: Tx, albumId: string, photos: { fileId: string; caption?: string | null }[]) {
  const a = await requireAlbum(tx, albumId);
  if (!a.is_mine && !(await canModerate(tx))) {
    throw forbidden("Chỉ người tạo album hoặc Ban Truyền thông/Ban điều hành mới thêm ảnh vào album này.");
  }
  return insertPhotos(tx, albumId, photos);
}

async function requirePhoto(tx: Tx, photoId: string) {
  const p = (
    await tx.query<{ id: string; album_id: string; file_id: string; is_mine: boolean }>(
      `SELECT p.id, p.album_id, p.file_id, p.uploaded_by_member_id = app.current_member_id() AS is_mine
         FROM album_photos p JOIN albums a ON a.id = p.album_id AND a.deleted_at IS NULL
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [photoId]
    )
  ).rows[0];
  if (!p) throw notFound("Không tìm thấy ảnh (có thể đã bị xóa).");
  return p;
}

export async function updatePhoto(tx: Tx, photoId: string, i: { caption?: string | null; hidden?: boolean }) {
  const p = await requirePhoto(tx, photoId);
  const mod = await canModerate(tx);
  if (!p.is_mine && !mod) throw forbidden("Bạn chỉ sửa được ảnh do mình tải lên.");
  if (i.hidden !== undefined && !mod) throw forbidden("Chỉ người có quyền kiểm duyệt mới ẩn/hiện ảnh.");
  const sets: string[] = [];
  const vals: unknown[] = [photoId];
  if (i.caption !== undefined) {
    vals.push(i.caption?.trim() || null);
    sets.push(`caption = $${vals.length}`);
  }
  if (i.hidden !== undefined) {
    vals.push(i.hidden ? "hidden" : "published");
    sets.push(`status = $${vals.length}::content_status_t`);
  }
  if (!sets.length) return p.album_id;
  const r = await tx.query(`UPDATE album_photos SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, vals);
  if (!r.rowCount) throw forbidden("Bạn không có quyền sửa ảnh này.");
  return p.album_id;
}

export async function deletePhoto(tx: Tx, photoId: string) {
  const p = await requirePhoto(tx, photoId);
  if (!p.is_mine && !(await canModerate(tx))) {
    throw forbidden("Bạn chỉ xóa được ảnh do mình tải lên (hoặc cần quyền kiểm duyệt album).");
  }
  const r = await tx.query("UPDATE album_photos SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [photoId]);
  if (!r.rowCount) throw forbidden("Bạn không có quyền xóa ảnh này.");
  // Ảnh vừa xóa đang là ảnh bìa ⇒ bỏ ảnh bìa để album tự lấy ảnh kế tiếp (chỉ tác giả/người kiểm duyệt sửa được album — RLS)
  await tx.query("UPDATE albums SET cover_file_id = NULL WHERE id = $1 AND cover_file_id = $2", [p.album_id, p.file_id]);
  return p.album_id;
}

// ---------------------------------------------------------------------
// Tim (mỗi người một lần — khóa chính album_id+member_id; bộ đếm do trigger)
// ---------------------------------------------------------------------
export async function setAlbumLike(tx: Tx, albumId: string, liked: boolean): Promise<MomentLikeResult> {
  await requireAlbum(tx, albumId);
  if (liked) {
    await tx.query(
      "INSERT INTO album_likes (album_id, member_id) VALUES ($1, app.current_member_id()) ON CONFLICT (album_id, member_id) DO NOTHING",
      [albumId]
    );
  } else {
    await tx.query("DELETE FROM album_likes WHERE album_id = $1 AND member_id = app.current_member_id()", [albumId]);
  }
  const r = (
    await tx.query<{ likes_count: number; liked: boolean }>(
      `SELECT a.likes_count, EXISTS (SELECT 1 FROM album_likes l WHERE l.album_id = a.id AND l.member_id = app.current_member_id()) AS liked
         FROM albums a WHERE a.id = $1`,
      [albumId]
    )
  ).rows[0];
  return { liked: r.liked, likesCount: r.likes_count };
}

export async function setPhotoLike(tx: Tx, photoId: string, liked: boolean): Promise<MomentLikeResult> {
  await requirePhoto(tx, photoId);
  if (liked) {
    await tx.query(
      "INSERT INTO photo_likes (photo_id, member_id) VALUES ($1, app.current_member_id()) ON CONFLICT (photo_id, member_id) DO NOTHING",
      [photoId]
    );
  } else {
    await tx.query("DELETE FROM photo_likes WHERE photo_id = $1 AND member_id = app.current_member_id()", [photoId]);
  }
  const r = (
    await tx.query<{ likes_count: number; liked: boolean }>(
      `SELECT p.likes_count, EXISTS (SELECT 1 FROM photo_likes l WHERE l.photo_id = p.id AND l.member_id = app.current_member_id()) AS liked
         FROM album_photos p WHERE p.id = $1`,
      [photoId]
    )
  ).rows[0];
  return { liked: r.liked, likesCount: r.likes_count };
}

// ---------------------------------------------------------------------
// Người được gắn thẻ xác nhận / gỡ thẻ của mình (BR-COM-07)
// ---------------------------------------------------------------------
export async function respondTag(tx: Tx, albumId: string, status: "accepted" | "declined") {
  await requireAlbum(tx, albumId);
  const r = await tx.query(
    `UPDATE album_member_tags SET status = $2, responded_at = now()
      WHERE album_id = $1 AND member_id = app.current_member_id()`,
    [albumId, status]
  );
  if (!r.rowCount) throw notFound("Bạn không được gắn thẻ trong album này.");
}
