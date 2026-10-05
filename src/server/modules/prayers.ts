import "server-only";
import type { Tx } from "../db";
import { ApiError, notFound } from "../errors";
import type { PrayerDto, PrayerListDto } from "@/lib/types/community";
import { currentMemberId, denyOrMissing, iso, permissions } from "./community-shared";
import { resolveReports } from "./forum";

// ---------------------------------------------------------------------
// Ý cầu nguyện — ẩn danh THẬT: ý ẩn danh có author_member_id = NULL; tác giả chỉ nằm ở prayer_intention_authors
// (RLS: chỉ chính chủ đọc). Không ai — kể cả Trưởng nhà — thấy tác giả ẩn danh qua API danh sách;
// xem tác giả chỉ qua app.fn_reveal_prayer_author (cần prayer.reveal_author + báo cáo vi phạm mở do NGƯỜI KHÁC lập, ghi audit).
// ---------------------------------------------------------------------

export async function listPrayers(tx: Tx): Promise<PrayerListDto> {
  await currentMemberId(tx);
  const p = await permissions(tx, ["prayer.moderate", "prayer.reveal_author"] as const);
  const rows = (
    await tx.query(
      `SELECT pi.id, pi.content, pi.is_anonymous, pi.author_member_id, m.display_name AS author_name,
              pi.status, pi.visibility::text AS visibility, pi.prayer_count, pi.created_at, pi.expires_at,
              (pi.author_member_id = app.current_member_id()
                 OR EXISTS (SELECT 1 FROM prayer_intention_authors a WHERE a.intention_id = pi.id)) AS is_mine,
              EXISTS (SELECT 1 FROM prayer_responses r WHERE r.intention_id = pi.id AND r.member_id = app.current_member_id()) AS has_prayed,
              (SELECT count(*) FROM content_reports cr WHERE cr.entity_type = 'prayer_intention' AND cr.entity_id = pi.id AND cr.status = 'open') AS open_reports,
              EXISTS (SELECT 1 FROM content_reports cr WHERE cr.entity_type = 'prayer_intention' AND cr.entity_id = pi.id
                         AND cr.reporter_member_id = app.current_member_id()) AS my_reported,
              EXISTS (SELECT 1 FROM content_reports cr WHERE cr.entity_type = 'prayer_intention' AND cr.entity_id = pi.id AND cr.status = 'open'
                         AND cr.reporter_member_id IS DISTINCT FROM app.current_member_id()) AS revealable
         FROM prayer_intentions pi
         LEFT JOIN members m ON m.id = pi.author_member_id
        WHERE pi.status <> 'closed' AND (pi.expires_at > now() OR (pi.status = 'answered' AND pi.updated_at > now() - interval '30 days'))
        ORDER BY (pi.status = 'open') DESC, pi.created_at DESC
        LIMIT 100`
    )
  ).rows;
  const items: PrayerDto[] = rows.map((r) => ({
    id: r.id,
    text: r.content,
    isAnonymous: r.is_anonymous,
    author: r.is_anonymous ? "Ẩn danh" : r.author_name ?? "Thành viên",
    authorId: r.is_anonymous ? null : r.author_member_id,
    isMine: !!r.is_mine,
    createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at),
    prayingCount: Number(r.prayer_count) || 0,
    hasPrayed: !!r.has_prayed,
    status: r.status,
    visibility: r.visibility,
    openReports: p["prayer.moderate"] ? Number(r.open_reports) : null,
    myReported: !!r.my_reported,
    revealable: p["prayer.reveal_author"] && r.is_anonymous && !!r.revealable,
  }));
  const s = (
    await tx.query(
      `SELECT count(*) FILTER (WHERE pi.created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS month,
              count(*) FILTER (WHERE pi.created_at >= now() - interval '7 days')::int AS week,
              app.fn_prayer_praying_members() AS praying
         FROM prayer_intentions pi
        WHERE pi.status <> 'closed' AND pi.visibility = 'published'`
    )
  ).rows[0];
  return {
    items,
    stats: { total: items.filter((i) => i.visibility === "published").length, monthCount: s.month, weekNew: s.week, prayingMembers: s.praying },
  };
}

export async function postPrayer(tx: Tx, content: string, anonymous: boolean): Promise<string> {
  await currentMemberId(tx);
  return (await tx.query<{ id: string }>("SELECT app.fn_post_prayer($1, $2) AS id", [content.trim(), anonymous])).rows[0].id;
}

/**
 * "Đang cầu nguyện" của chính mình (prayer_responses, bộ đếm do trigger). `desired` = trạng thái mong muốn (idempotent —
 * bấm liên tiếp/nhiều tab không lệch); bỏ trống = đảo trạng thái hiện tại.
 */
export async function togglePraying(tx: Tx, id: string, desired?: boolean): Promise<{ hasPrayed: boolean; prayingCount: number }> {
  await currentMemberId(tx);
  const it = (await tx.query("SELECT status FROM prayer_intentions WHERE id = $1", [id])).rows[0];
  if (!it) throw notFound("Không tìm thấy ý cầu nguyện.");
  const del =
    desired === true
      ? { rowCount: 0 }
      : await tx.query("DELETE FROM prayer_responses WHERE intention_id = $1 AND member_id = app.current_member_id()", [id]);
  let hasPrayed = false;
  if (desired === true || (desired === undefined && !del.rowCount)) {
    if (it.status !== "open") throw new ApiError(422, "PRAYER_CLOSED", "Ý cầu nguyện này đã đóng.");
    await tx.query(
      "INSERT INTO prayer_responses (intention_id, member_id) VALUES ($1, app.current_member_id()) ON CONFLICT DO NOTHING",
      [id]
    );
    hasPrayed = true;
  }
  const n = (await tx.query("SELECT prayer_count FROM prayer_intentions WHERE id = $1", [id])).rows[0]?.prayer_count ?? 0;
  return { hasPrayed, prayingCount: Number(n) };
}

/** Chính chủ (kể cả ẩn danh) hoặc người kiểm duyệt: mở / đã được nhậm lời / gỡ (closed). */
export async function setPrayerStatus(tx: Tx, id: string, status: "open" | "answered" | "closed") {
  await tx.query("SELECT app.fn_set_prayer_status($1, $2)", [id, status]);
}

/** Người kiểm duyệt ẩn/hiện ý cầu nguyện (trigger BR-COM-06 chặn người khác đổi visibility). */
export async function setPrayerHidden(tx: Tx, id: string, hidden: boolean) {
  const r = await tx.query("UPDATE prayer_intentions SET visibility = $2 WHERE id = $1", [id, hidden ? "hidden" : "published"]);
  if (!r.rowCount) await denyOrMissing(tx, "prayer_intentions", id, "Chỉ người kiểm duyệt được ẩn ý cầu nguyện.");
  if (hidden) await resolveReports(tx, "prayer_intention", id, "actioned", "Đã ẩn ý cầu nguyện", true);
}

/** Xem tác giả ý ẩn danh theo quy trình D-007 (báo cáo mở do người khác lập + lý do ≥ 10 ký tự, ghi audit READ_SENSITIVE). */
export async function revealAuthor(tx: Tx, id: string, reason: string): Promise<{ memberId: string | null; name: string | null; fullName: string | null }> {
  const author = (await tx.query<{ a: string | null }>("SELECT app.fn_reveal_prayer_author($1, $2) AS a", [id, reason.trim()])).rows[0]?.a ?? null;
  if (!author) return { memberId: null, name: null, fullName: null };
  const m = (await tx.query("SELECT display_name, full_name FROM members WHERE id = $1", [author])).rows[0];
  return { memberId: author, name: m?.display_name ?? null, fullName: m?.full_name ?? null };
}
