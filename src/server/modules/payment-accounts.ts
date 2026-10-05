import "server-only";
import { batch, type Tx } from "../db";
import { ApiError, forbidden, notFound } from "../errors";
import type { MemberPaymentAccountDto } from "@/lib/types/finance";

// Tài khoản nhận tiền của từng thành viên (bảng member_payment_accounts — db/app/993):
//   xem: mọi người có member.read (để chuyển khoản / hoàn ứng cho nhau) · sửa/xóa: chính chủ hoặc người có member.update.
// RLS ở DB là chốt chặn cuối; ở đây kiểm trước để trả 403/404 rõ ràng thay vì "không có dòng nào".

const ACCESS_SQL = `SELECT app.has_permission('member.read') AS can_read,
              (app.is_self($1::uuid) OR app.has_permission('member.update')) AS can_edit,
              (SELECT m.full_name FROM members m WHERE m.id = $1::uuid AND m.deleted_at IS NULL) AS member_name`;

const ACCOUNT_SQL = `SELECT bank_bin, bank_name, account_no, account_name, qr_file_id, note, updated_at
         FROM member_payment_accounts WHERE member_id = $1::uuid`;

export async function getMemberPaymentAccount(tx: Tx, memberId: string): Promise<MemberPaymentAccountDto> {
  // Gộp kiểm quyền + đọc tài khoản (chỉ đọc dưới RLS): 1 vòng mạng
  const [accessR, accountR] = await batch(tx, [
    [ACCESS_SQL, [memberId]],
    [ACCOUNT_SQL, [memberId]],
  ]);
  const a = accessR.rows[0] as { can_read: boolean; can_edit: boolean; member_name: string | null };
  if (!a.can_read) throw forbidden("Bạn không có quyền xem danh bạ thành viên.");
  if (!a.member_name) throw notFound("Không tìm thấy thành viên.");
  const r = accountR.rows[0];
  return {
    memberId,
    memberName: a.member_name,
    canEdit: !!a.can_edit,
    account: r
      ? {
          bankBin: r.bank_bin ?? null,
          bankName: r.bank_name,
          accountNo: r.account_no,
          accountName: r.account_name,
          qrFileId: r.qr_file_id ?? null,
          note: r.note ?? null,
          updatedAt: new Date(r.updated_at).toISOString(),
        }
      : null,
  };
}

export async function saveMemberPaymentAccount(
  tx: Tx,
  memberId: string,
  b: { bankBin?: string | null; bankName: string; accountNo: string; accountName: string; qrFileId?: string | null; note?: string | null }
): Promise<MemberPaymentAccountDto> {
  // Gộp kiểm quyền + kiểm ảnh QR (RLS storage_files: người tải lên hoặc tệp đã gắn): 1 vòng mạng
  const [accessR, fileR] = await batch(tx, [
    [ACCESS_SQL, [memberId]],
    ["SELECT detected_mime FROM storage_files WHERE id = $1::uuid AND status = 'ready'", [b.qrFileId ?? null]],
  ]);
  const a = accessR.rows[0] as { can_read: boolean; can_edit: boolean; member_name: string | null };
  if (!a.member_name) throw notFound("Không tìm thấy thành viên.");
  if (!a.can_edit) throw forbidden("Bạn chỉ sửa được tài khoản nhận tiền của chính mình.");
  if (b.qrFileId && !fileR.rows[0]) throw new ApiError(422, "BAD_FILE", "Không tìm thấy ảnh mã QR vừa tải lên — vui lòng tải lại.");
  await tx.query(
    `INSERT INTO member_payment_accounts (member_id, bank_bin, bank_name, account_no, account_name, qr_file_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (member_id) DO UPDATE
        SET bank_bin = EXCLUDED.bank_bin, bank_name = EXCLUDED.bank_name, account_no = EXCLUDED.account_no,
            account_name = EXCLUDED.account_name, qr_file_id = EXCLUDED.qr_file_id, note = EXCLUDED.note`,
    [memberId, b.bankBin || null, b.bankName, b.accountNo.replace(/\s/g, ""), b.accountName, b.qrFileId ?? null, b.note ?? null]
  );
  return getMemberPaymentAccount(tx, memberId);
}

export async function deleteMemberPaymentAccount(tx: Tx, memberId: string): Promise<{ ok: true }> {
  const a = (await tx.query(ACCESS_SQL, [memberId])).rows[0] as { can_edit: boolean; member_name: string | null };
  if (!a.member_name) throw notFound("Không tìm thấy thành viên.");
  if (!a.can_edit) throw forbidden("Bạn chỉ xóa được tài khoản nhận tiền của chính mình.");
  await tx.query("DELETE FROM member_payment_accounts WHERE member_id = $1", [memberId]);
  return { ok: true };
}
