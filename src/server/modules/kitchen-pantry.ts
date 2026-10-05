import "server-only";
import type { Tx } from "../db";
import { ApiError, conflict, forbidden, notFound } from "../errors";
import type { PantryDto, PantryItemDto, RestockRequestDto, ShoppingItemDto } from "@/lib/types/kitchen";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function perms(tx: Tx) {
  return (
    await tx.query<{ manage: boolean; register: boolean; me: string | null; today: string }>(
      `SELECT app.has_permission('meal.manage') AS manage, app.has_permission('meal.register') AS register,
              app.current_member_id() AS me, app.local_today()::text AS today`
    )
  ).rows[0];
}
async function requireManage(tx: Tx, what: string) {
  const p = await perms(tx);
  if (!p.manage) throw forbidden(`Chỉ Ban Ẩm thực (quyền quản lý bếp) mới ${what}.`);
  return p;
}

// ---------------------------------------------------------------------
// Đọc: kho + yêu cầu mua thêm + danh sách cần mua
// ---------------------------------------------------------------------
export async function getPantry(tx: Tx): Promise<PantryDto> {
  const p = await perms(tx);
  const items = (
    await tx.query(
      `SELECT p.id, p.name, p.unit, p.qty_on_hand, p.par_level, p.icon, p.last_restocked_on::text AS restocked,
              CASE WHEN p.par_level = 0 OR p.qty_on_hand >= p.par_level THEN 'ok'
                   WHEN p.qty_on_hand >= p.par_level * 0.4 THEN 'low' ELSE 'urgent' END AS status,
              (SELECT r.id FROM pantry_restock_requests r WHERE r.pantry_item_id = p.id AND r.status IN ('open', 'approved') LIMIT 1) AS open_req,
              EXISTS (SELECT 1 FROM shopping_list_items s WHERE s.pantry_item_id = p.id AND NOT s.is_purchased) AS on_list
         FROM pantry_items p
        WHERE p.is_active
        ORDER BY CASE WHEN p.par_level = 0 OR p.qty_on_hand >= p.par_level THEN 2 WHEN p.qty_on_hand >= p.par_level * 0.4 THEN 1 ELSE 0 END, p.name`
    )
  ).rows.map(
    (r): PantryItemDto => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      qty: Number(r.qty_on_hand),
      par: Number(r.par_level),
      icon: r.icon ?? null,
      status: r.status,
      lastRestockedOn: r.restocked ?? null,
      openRequestId: r.open_req ?? null,
      onShoppingList: !!r.on_list,
    })
  );
  const requests = (
    await tx.query(
      `SELECT r.id, r.pantry_item_id, r.item_name, r.qty, r.unit, r.note, r.status, r.requested_by, rq.display_name AS requested_name,
              r.created_at, rs.display_name AS resolved_name, r.resolved_at, r.resolution_note, app.is_self(r.requested_by) AS mine
         FROM pantry_restock_requests r
         JOIN members rq ON rq.id = r.requested_by
         LEFT JOIN members rs ON rs.user_id = r.resolved_by
        WHERE r.status IN ('open', 'approved') OR r.resolved_at > now() - interval '14 days'
        ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, COALESCE(r.resolved_at, r.created_at) DESC
        LIMIT 60`
    )
  ).rows.map(
    (r): RestockRequestDto => ({
      id: r.id,
      pantryItemId: r.pantry_item_id ?? null,
      itemName: r.item_name,
      qty: num(r.qty),
      unit: r.unit ?? null,
      note: r.note ?? null,
      status: r.status,
      requestedById: r.requested_by,
      requestedBy: r.requested_name,
      createdAt: iso(r.created_at)!,
      resolvedBy: r.resolved_name ?? null,
      resolvedAt: iso(r.resolved_at),
      resolutionNote: r.resolution_note ?? null,
      mine: !!r.mine,
    })
  );
  const shopping = (
    await tx.query(
      `SELECT s.id, s.name, s.qty, s.unit, s.note, s.pantry_item_id, s.restock_request_id, s.needed_on::text AS needed_on, s.est_cost_vnd,
              s.is_purchased, s.purchased_at, pb.display_name AS purchased_name, cb.display_name AS created_name, s.created_at
         FROM shopping_list_items s
         LEFT JOIN members pb ON pb.user_id = s.purchased_by
         LEFT JOIN members cb ON cb.user_id = s.created_by
        WHERE NOT s.is_purchased OR s.purchased_at > now() - interval '7 days'
        ORDER BY s.is_purchased, s.needed_on NULLS LAST, s.created_at
        LIMIT 100`
    )
  ).rows.map(
    (r): ShoppingItemDto => ({
      id: r.id,
      name: r.name,
      qty: num(r.qty),
      unit: r.unit ?? null,
      note: r.note ?? null,
      pantryItemId: r.pantry_item_id ?? null,
      restockRequestId: r.restock_request_id ?? null,
      neededOn: r.needed_on ?? null,
      estCostVnd: num(r.est_cost_vnd),
      isPurchased: r.is_purchased,
      purchasedAt: iso(r.purchased_at),
      purchasedBy: r.purchased_name ?? null,
      createdBy: r.created_name ?? null,
      createdAt: iso(r.created_at)!,
    })
  );
  return { items, requests, shopping, canManage: p.manage, canRequest: p.register || p.manage, today: p.today };
}

// ---------------------------------------------------------------------
// Mặt hàng kho (Ban Ẩm thực)
// ---------------------------------------------------------------------
export async function createPantryItem(tx: Tx, b: { name: string; unit: string; qtyOnHand: number; parLevel: number; icon?: string | null }) {
  await requireManage(tx, "thêm mặt hàng vào kho");
  const dup = (await tx.query("SELECT 1 FROM pantry_items WHERE is_active AND lower(btrim(name)) = lower(btrim($1))", [b.name])).rowCount;
  if (dup) throw conflict(`"${b.name}" đã có trong kho.`, "DUPLICATE");
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO pantry_items (name, unit, qty_on_hand, par_level, icon, last_restocked_on)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $3::numeric > 0 THEN app.local_today() END) RETURNING id`,
      [b.name.trim(), b.unit.trim(), b.qtyOnHand, b.parLevel, b.icon?.trim() || null]
    )
  ).rows[0];
}

export async function updatePantryItem(
  tx: Tx,
  id: string,
  b: { name?: string; unit?: string; qtyOnHand?: number; parLevel?: number; icon?: string | null; delta?: number }
) {
  const cur = (await tx.query("SELECT qty_on_hand FROM pantry_items WHERE id = $1 AND is_active", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy mặt hàng trong kho.");
  await requireManage(tx, "cập nhật tồn kho");
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (sql: string, v: unknown) => {
    vals.push(v);
    sets.push(sql.replace("$?", `$${vals.length}`));
  };
  if (b.name !== undefined) set("name = $?", b.name.trim());
  if (b.unit !== undefined) set("unit = $?", b.unit.trim());
  if (b.parLevel !== undefined) set("par_level = $?", b.parLevel);
  if (b.icon !== undefined) set("icon = $?", b.icon?.trim() || null);
  let newQty: number | null = null;
  if (b.delta !== undefined) newQty = Math.max(0, Number(cur.qty_on_hand) + b.delta);
  if (b.qtyOnHand !== undefined) newQty = b.qtyOnHand;
  if (newQty !== null) {
    set("qty_on_hand = $?", newQty);
    if (newQty > Number(cur.qty_on_hand)) sets.push("last_restocked_on = app.local_today()");
  }
  if (!sets.length) return;
  const r = await tx.query(`UPDATE pantry_items SET ${sets.join(", ")} WHERE id = $1`, vals);
  if (!r.rowCount) throw forbidden("Bạn không có quyền cập nhật kho bếp.");
}

export async function archivePantryItem(tx: Tx, id: string) {
  await requireManage(tx, "xóa mặt hàng khỏi kho");
  const r = await tx.query("UPDATE pantry_items SET is_active = false WHERE id = $1 AND is_active", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy mặt hàng trong kho.");
}

// ---------------------------------------------------------------------
// Yêu cầu mua thêm
// ---------------------------------------------------------------------
export async function createRestockRequest(
  tx: Tx,
  b: { pantryItemId?: string | null; itemName?: string | null; qty?: number | null; unit?: string | null; note?: string | null }
) {
  const p = await perms(tx);
  if (!p.me) throw forbidden("Tài khoản của bạn chưa gắn hồ sơ thành viên.");
  if (!p.register && !p.manage) throw forbidden("Bạn không có quyền đề xuất mua thêm đồ bếp.");
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO pantry_restock_requests (pantry_item_id, item_name, qty, unit, note, requested_by)
       VALUES ($1, COALESCE($2, ''), $3, $4, $5, $6) RETURNING id`,
      [b.pantryItemId ?? null, b.itemName?.trim() || null, b.qty ?? null, b.unit?.trim() || null, b.note?.trim() || null, p.me]
    )
  ).rows[0];
}

export async function actOnRestockRequest(tx: Tx, id: string, b: { action: "approve" | "reject" | "cancel"; note?: string | null; neededOn?: string | null }) {
  const cur = (await tx.query("SELECT status, app.is_self(requested_by) AS mine FROM pantry_restock_requests WHERE id = $1", [id])).rows[0];
  if (!cur) throw notFound("Không tìm thấy yêu cầu mua thêm.");
  const p = await perms(tx);
  if (b.action === "cancel") {
    if (!cur.mine && !p.manage) throw forbidden("Chỉ người đề xuất (hoặc Ban Ẩm thực) mới hủy được yêu cầu.");
    if (cur.status !== "open") throw conflict("Yêu cầu đã được xử lý, không hủy được nữa.", "ALREADY_RESOLVED");
    await tx.query("UPDATE pantry_restock_requests SET status = 'cancelled', resolution_note = $2 WHERE id = $1", [id, b.note?.trim() || null]);
    return;
  }
  if (!p.manage) throw forbidden("Chỉ Ban Ẩm thực mới duyệt / từ chối yêu cầu mua thêm.");
  if (b.action === "approve") {
    if (cur.status !== "open") throw conflict("Yêu cầu không còn ở trạng thái chờ duyệt.", "ALREADY_RESOLVED");
    const r = (
      await tx.query(
        `UPDATE pantry_restock_requests SET status = 'approved', resolution_note = $2 WHERE id = $1
         RETURNING item_name, qty, unit, pantry_item_id`,
        [id, b.note?.trim() || "Đã đưa vào danh sách cần mua"]
      )
    ).rows[0];
    await tx.query(
      `INSERT INTO shopping_list_items (name, qty, unit, pantry_item_id, restock_request_id, needed_on)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, app.local_today() + 1))`,
      [r.item_name, r.qty, r.unit, r.pantry_item_id, id, b.neededOn ?? null]
    );
    return;
  }
  // reject
  if (!["open", "approved"].includes(cur.status)) throw conflict("Yêu cầu đã được xử lý xong.", "ALREADY_RESOLVED");
  if (!b.note?.trim()) throw new ApiError(400, "VALIDATION_FAILED", "Nhập lý do từ chối để người đề xuất biết.");
  await tx.query("UPDATE pantry_restock_requests SET status = 'rejected', resolution_note = $2 WHERE id = $1", [id, b.note.trim()]);
  await tx.query("DELETE FROM shopping_list_items WHERE restock_request_id = $1 AND NOT is_purchased", [id]);
}

// ---------------------------------------------------------------------
// Danh sách cần mua (Ban Ẩm thực)
// ---------------------------------------------------------------------
export async function createShoppingItem(
  tx: Tx,
  b: { name?: string | null; qty?: number | null; unit?: string | null; note?: string | null; pantryItemId?: string | null; neededOn?: string | null; estCostVnd?: number | null }
) {
  await requireManage(tx, "thêm vào danh sách cần mua");
  return (
    await tx.query<{ id: string }>(
      `INSERT INTO shopping_list_items (name, qty, unit, note, pantry_item_id, needed_on, est_cost_vnd)
       VALUES (COALESCE($1, ''), $2, $3, $4, $5, COALESCE($6::date, app.local_today() + 1), $7) RETURNING id`,
      [b.name?.trim() || null, b.qty ?? null, b.unit?.trim() || null, b.note?.trim() || null, b.pantryItemId ?? null, b.neededOn ?? null, b.estCostVnd ?? null]
    )
  ).rows[0];
}

export async function updateShoppingItem(
  tx: Tx,
  id: string,
  b: { isPurchased?: boolean; name?: string; qty?: number | null; unit?: string | null; note?: string | null; neededOn?: string | null; estCostVnd?: number | null }
) {
  const exists = (await tx.query("SELECT 1 FROM shopping_list_items WHERE id = $1", [id])).rowCount;
  if (!exists) throw notFound("Không tìm thấy mục cần mua.");
  await requireManage(tx, "cập nhật danh sách cần mua");
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const set = (col: string, v: unknown, cast = "") => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  if (b.name !== undefined) set("name", b.name.trim());
  if (b.qty !== undefined) set("qty", b.qty);
  if (b.unit !== undefined) set("unit", b.unit?.trim() || null);
  if (b.note !== undefined) set("note", b.note?.trim() || null);
  if (b.neededOn !== undefined) set("needed_on", b.neededOn, "::date");
  if (b.estCostVnd !== undefined) set("est_cost_vnd", b.estCostVnd);
  if (b.isPurchased !== undefined) set("is_purchased", b.isPurchased);
  if (!sets.length) return;
  const r = await tx.query(`UPDATE shopping_list_items SET ${sets.join(", ")} WHERE id = $1`, vals);
  if (!r.rowCount) throw forbidden("Bạn không có quyền sửa danh sách cần mua.");
}

export async function deleteShoppingItem(tx: Tx, id: string) {
  await requireManage(tx, "xóa khỏi danh sách cần mua");
  const r = await tx.query("DELETE FROM shopping_list_items WHERE id = $1", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy mục cần mua.");
}
