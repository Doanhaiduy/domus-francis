import "server-only";
import type { Tx } from "../db";

// Admin dọn dữ liệu rác: xóa vĩnh viễn một bản ghi thuộc danh sách cho phép. Kiểm quyền (data.purge) và xóa nằm trong hàm CSDL
// app.fn_admin_delete (db/app/1028) — tầng này chỉ chuyển lời gọi, KHÔNG nhận tên bảng từ người dùng.
export type PurgeEntity = "leave" | "issue" | "prayer" | "inquiry" | "application";

export async function adminDelete(tx: Tx, entity: PurgeEntity, id: string): Promise<{ ok: true }> {
  await tx.query("SELECT app.fn_admin_delete($1, $2::uuid)", [entity, id]);
  return { ok: true };
}
