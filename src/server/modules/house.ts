import "server-only";
import type { Tx } from "../db";
import { ApiError, notFound } from "../errors";
import type { FloorDto, HouseDto, RoomDto } from "@/lib/types/members";

const amenityLabel = (name: string, note: string | null, qty: number) =>
  `${qty > 1 ? `${qty} ` : ""}${name}${note ? ` (${note})` : ""}`;

export async function getHouse(tx: Tx): Promise<HouseDto> {
  const floors = (
    await tx.query("SELECT id, code, name, level, description FROM floors WHERE deleted_at IS NULL ORDER BY sort_order, level")
  ).rows.map(
    (f): FloorDto => ({ id: f.level, uuid: f.id, code: f.code, name: f.name, description: f.description ?? "" })
  );
  const rooms = (
    await tx.query(
      `SELECT r.id, r.code, r.name, f.level, r.room_type::text AS type, r.capacity, r.status::text AS status, r.description,
              r.area_m2, r.layout_x, r.layout_y, r.layout_w, r.layout_h,
              COALESCE(json_agg(json_build_object('n', a.name, 'note', ra.note, 'q', ra.quantity) ORDER BY a.name)
                       FILTER (WHERE a.id IS NOT NULL), '[]') AS amenities
         FROM rooms r
         JOIN floors f ON f.id = r.floor_id
         LEFT JOIN room_amenities ra ON ra.room_id = r.id
         LEFT JOIN amenities a ON a.id = ra.amenity_id
        WHERE r.deleted_at IS NULL
        GROUP BY r.id, f.level
        ORDER BY f.level, r.code`
    )
  ).rows.map(
    (r): RoomDto => ({
      id: r.code,
      uuid: r.id,
      name: r.name,
      floor: r.level,
      type: r.type,
      capacity: r.capacity,
      status: r.status,
      description: r.description ?? undefined,
      areaM2: r.area_m2 ?? undefined,
      x: r.layout_x ?? undefined,
      y: r.layout_y ?? undefined,
      w: r.layout_w ?? undefined,
      h: r.layout_h ?? undefined,
      amenities: (r.amenities as { n: string; note: string | null; q: number }[]).map((a) => amenityLabel(a.n, a.note, a.q)),
    })
  );
  return { floors, rooms };
}

async function roomIdByCode(tx: Tx, code: string): Promise<string> {
  const r = (await tx.query<{ id: string }>("SELECT id FROM rooms WHERE code = $1 AND deleted_at IS NULL", [code])).rows[0];
  if (!r) throw notFound(`Không tìm thấy phòng ${code}.`);
  return r.id;
}
async function floorIdByLevel(tx: Tx, level: number): Promise<string> {
  const r = (await tx.query<{ id: string }>("SELECT id FROM floors WHERE level = $1 AND deleted_at IS NULL", [level])).rows[0];
  if (!r) throw notFound(`Không tìm thấy tầng ${level}.`);
  return r.id;
}

/** "Bàn học cá nhân (bàn học đôi)" → tìm tiện ích theo tên (không phân biệt hoa thường), tạo mới nếu chưa có. */
async function syncAmenities(tx: Tx, roomId: string, labels: string[]) {
  await tx.query("DELETE FROM room_amenities WHERE room_id = $1", [roomId]);
  const seen = new Set<string>();
  for (const raw of labels) {
    const m = /^(?:(\d+)\s+)?(.+?)(?:\s*\((.+)\))?\s*$/.exec(raw.trim());
    if (!m || !m[2]) continue;
    const qty = Math.min(100, Math.max(1, Number(m[1] ?? 1)));
    const name = m[2].trim().slice(0, 80);
    const note = m[3]?.trim() || null;
    let a = (await tx.query<{ id: string }>("SELECT id FROM amenities WHERE lower(name) = lower($1) LIMIT 1", [name])).rows[0];
    if (!a) {
      const code = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      a = (await tx.query<{ id: string }>("INSERT INTO amenities (code, name) VALUES ($1, $2) RETURNING id", [code, name])).rows[0];
    }
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    await tx.query("INSERT INTO room_amenities (room_id, amenity_id, quantity, note) VALUES ($1, $2, $3, $4)", [roomId, a.id, qty, note]);
  }
}

export interface RoomInput {
  id?: string; // mã phòng khi tạo
  name?: string;
  floor?: number;
  type?: RoomDto["type"];
  capacity?: number;
  amenities?: string[];
  status?: RoomDto["status"];
  description?: string | null;
  areaM2?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
}

const normCode = (c: string) => {
  const code = c.trim().toUpperCase().replace(/^P(?!\.)/, "P.");
  if (!/^P\.[A-Z0-9_]{1,10}$/.test(code)) throw new ApiError(400, "BAD_ROOM_CODE", "Mã phòng phải có dạng P.1, P.SANH1 (chữ in hoa, số, gạch dưới).");
  return code;
};
const layout = (i: RoomInput) =>
  [i.x, i.y, i.w, i.h].every((v) => v === undefined || v === null)
    ? [null, null, null, null]
    : [Math.max(0, Math.round(i.x ?? 0)), Math.max(0, Math.round(i.y ?? 0)), Math.max(1, Math.round(i.w ?? 60)), Math.max(1, Math.round(i.h ?? 60))];

export async function createRoom(tx: Tx, i: RoomInput): Promise<string> {
  const code = normCode(i.id ?? "");
  const floorId = await floorIdByLevel(tx, i.floor ?? 1);
  const type = i.type ?? "bedroom";
  const capacity = type === "bedroom" ? Math.max(1, i.capacity ?? 1) : 0;
  const [x, y, w, h] = layout(i);
  const r = await tx.query<{ id: string }>(
    `INSERT INTO rooms (floor_id, code, name, room_type, capacity, status, description, area_m2, layout_x, layout_y, layout_w, layout_h)
     VALUES ($1, $2, $3, $4::room_type_t, $5, COALESCE($6::room_status_t, 'active'), $7, $8, $9, $10, $11, $12) RETURNING id`,
    [floorId, code, i.name?.trim() || code, type, capacity, i.status ?? null, i.description ?? null, i.areaM2 || null, x, y, w, h]
  );
  if (i.amenities) await syncAmenities(tx, r.rows[0].id, i.amenities);
  return code;
}

export async function updateRoom(tx: Tx, code: string, i: RoomInput) {
  const id = await roomIdByCode(tx, code);
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown, cast = "") => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  if (i.name !== undefined) set("name", i.name.trim());
  if (i.floor !== undefined) set("floor_id", await floorIdByLevel(tx, i.floor));
  if (i.type !== undefined) {
    set("room_type", i.type, "::room_type_t");
    if (i.type !== "bedroom") set("capacity", 0);
  }
  if (i.capacity !== undefined && (i.type ?? "bedroom") === "bedroom") set("capacity", i.capacity);
  if (i.status !== undefined) set("status", i.status, "::room_status_t");
  if (i.description !== undefined) set("description", i.description || null);
  if (i.areaM2 !== undefined) set("area_m2", i.areaM2 || null);
  if (i.x !== undefined || i.y !== undefined || i.w !== undefined || i.h !== undefined) {
    const [x, y, w, h] = layout(i);
    set("layout_x", x);
    set("layout_y", y);
    set("layout_w", w);
    set("layout_h", h);
  }
  if (i.id !== undefined && normCode(i.id) !== code) set("code", normCode(i.id));
  if (sets.length) {
    // Giảm sức chứa dưới số người đang ở ⇒ chặn
    if (i.capacity !== undefined) {
      const occ = (await tx.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM room_assignments WHERE room_id = $1 AND starts_on <= app.local_today() AND (ends_on IS NULL OR ends_on > app.local_today())", [id]
      )).rows[0].n;
      if (i.capacity < occ) throw new ApiError(422, "CAPACITY_BELOW_OCCUPANCY", `Phòng đang có ${occ} người — không thể giảm sức chứa xuống ${i.capacity}.`);
    }
    const r = await tx.query(`UPDATE rooms SET ${sets.join(", ")} WHERE id = $1`, vals);
    if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền sửa cấu trúc nhà.");
  }
  if (i.amenities) await syncAmenities(tx, id, i.amenities);
}

export async function deleteRoom(tx: Tx, code: string) {
  const id = await roomIdByCode(tx, code);
  const occ = (await tx.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM room_assignments WHERE room_id = $1 AND starts_on <= app.local_today() AND (ends_on IS NULL OR ends_on > app.local_today())", [id]
  )).rows[0].n;
  if (occ > 0) throw new ApiError(409, "ROOM_OCCUPIED", `Phòng ${code} còn ${occ} người đang ở — hãy chuyển họ sang phòng khác trước khi xóa.`);
  const r = await tx.query("UPDATE rooms SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xóa phòng.");
}

export async function createFloor(tx: Tx, i: { name: string; code?: string; description?: string; level?: number }) {
  const level = i.level ?? (((await tx.query<{ m: number }>("SELECT COALESCE(max(level), 0)::int AS m FROM floors WHERE deleted_at IS NULL")).rows[0].m) + 1);
  const code = (i.code?.trim().toUpperCase() || `T${level}`).replace(/[^A-Z0-9_]/g, "").slice(0, 10) || `T${level}`;
  await tx.query(
    "INSERT INTO floors (code, name, level, description, sort_order) VALUES ($1, $2, $3, $4, $3)",
    [code, i.name.trim(), level, i.description?.trim() || null]
  );
  return level;
}

export async function updateFloor(tx: Tx, level: number, i: { name?: string; code?: string; description?: string }) {
  const id = await floorIdByLevel(tx, level);
  const r = await tx.query(
    `UPDATE floors SET name = COALESCE($2, name), code = COALESCE($3, code), description = COALESCE($4, description) WHERE id = $1`,
    [id, i.name?.trim() || null, i.code?.trim().toUpperCase() || null, i.description ?? null]
  );
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền sửa tầng.");
}

/** Xóa tầng: chỉ khi không còn ai ở trong các phòng của tầng; các phòng trống của tầng bị xóa mềm theo. */
export async function deleteFloor(tx: Tx, level: number) {
  const id = await floorIdByLevel(tx, level);
  const occ = (await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM room_assignments ra JOIN rooms r ON r.id = ra.room_id
      WHERE r.floor_id = $1 AND (ra.ends_on IS NULL OR ra.ends_on > app.local_today())`, [id]
  )).rows[0].n;
  if (occ > 0) throw new ApiError(409, "FLOOR_OCCUPIED", `Tầng còn ${occ} người đang ở — chuyển họ sang tầng khác trước khi xóa.`);
  await tx.query("UPDATE rooms SET deleted_at = now() WHERE floor_id = $1 AND deleted_at IS NULL", [id]);
  const r = await tx.query("UPDATE floors SET deleted_at = now() WHERE id = $1", [id]);
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xóa tầng.");
}

/**
 * Quy ước "đang ở": starts_on <= hôm nay AND (ends_on IS NULL OR ends_on > hôm nay) — ends_on là ngày rời phòng.
 * Xếp/chuyển phòng: kết thúc phân phòng cũ (đến hôm qua) rồi mở phân phòng mới từ hôm nay; nếu phân phòng gần nhất
 * mới tạo trong hôm nay (xếp nhầm/hủy trong ngày) thì sửa thẳng dòng đó. Không xóa dòng nào — lịch sử được giữ.
 * Sức chứa/giới tính/loại phòng do trigger trg_room_assignments__rules kiểm (khóa advisory theo phòng — G-04).
 */
export async function assignRoom(tx: Tx, memberId: string, roomCode: string, reason?: string | null) {
  const roomId = await roomIdByCode(tx, roomCode);
  const cur = (
    await tx.query<{ id: string; room_id: string; starts_on: string; ends_on: string | null; today: string }>(
      `SELECT ra.id, ra.room_id, ra.starts_on, ra.ends_on, app.local_today()::text AS today FROM room_assignments ra
        WHERE ra.member_id = $1 AND ra.starts_on <= app.local_today() AND (ra.ends_on IS NULL OR ra.ends_on >= app.local_today())
        ORDER BY ra.starts_on DESC LIMIT 1`,
      [memberId]
    )
  ).rows[0];
  const active = cur && (cur.ends_on === null || cur.ends_on > cur.today);
  if (active && cur.room_id === roomId) return;
  if (cur && cur.starts_on >= cur.today) {
    const r = await tx.query(
      `UPDATE room_assignments SET room_id = $2, ends_on = NULL, end_reason = NULL, ended_by = NULL,
              reason = $3, assigned_by = app.current_user_id() WHERE id = $1`,
      [cur.id, roomId, reason ?? "Xếp lại phòng trong ngày"]
    );
    if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền xếp phòng.");
    return;
  }
  if (cur) {
    const r = await tx.query(
      `UPDATE room_assignments SET ends_on = app.local_today() - 1, end_reason = 'Chuyển phòng',
              ended_by = app.current_user_id() WHERE id = $1`,
      [cur.id]
    );
    if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền chuyển phòng.");
  }
  const year = (await tx.query<{ id: string }>("SELECT id FROM academic_years WHERE is_current LIMIT 1")).rows[0]?.id ?? null;
  await tx.query(
    `INSERT INTO room_assignments (member_id, room_id, academic_year_id, starts_on, reason, assigned_by)
     VALUES ($1, $2, $3, app.local_today(), $4, app.current_user_id())`,
    [memberId, roomId, year, reason ?? (active ? "Chuyển phòng" : "Xếp phòng")]
  );
}

export async function unassignRoom(tx: Tx, memberId: string, reason?: string | null) {
  const cur = (
    await tx.query<{ id: string }>(
      `SELECT id FROM room_assignments
        WHERE member_id = $1 AND starts_on <= app.local_today() AND (ends_on IS NULL OR ends_on > app.local_today())
        ORDER BY starts_on DESC LIMIT 1`,
      [memberId]
    )
  ).rows[0];
  if (!cur) return;
  const r = await tx.query(
    "UPDATE room_assignments SET ends_on = app.local_today(), end_reason = $2, ended_by = app.current_user_id() WHERE id = $1",
    [cur.id, reason ?? "Hủy gán phòng"]
  );
  if (!r.rowCount) throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền hủy gán phòng.");
}
