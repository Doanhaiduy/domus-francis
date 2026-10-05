import "server-only";
import { z } from "zod";
import type { Tx } from "../db";
import { forbidden, notFound } from "../errors";
import type { ReminderDto } from "@/lib/types/reminders";

// Lịch nhắc lặp hằng tuần (db/app/1014_scheduled_notices.sql). Ghi/đọc dưới RLS: chỉ người có event.manage (Trưởng nhà, Admin).

export const ReminderSchema = z.object({
  title: z.string().trim().min(2, "Tên nhắc tối thiểu 2 ký tự.").max(150, "Tên nhắc tối đa 150 ký tự."),
  message: z.string().trim().max(500, "Nội dung tối đa 500 ký tự.").nullable().optional().transform((v) => v || null),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Chọn ít nhất một ngày trong tuần.").max(7).transform((a) => [...new Set(a)].sort()),
  slot: z.enum(["morning", "evening"]),
  timeLabel: z.string().trim().max(30).nullable().optional().transform((v) => v || null),
  sendApp: z.boolean(),
  sendZalo: z.boolean(),
  isActive: z.boolean().optional(),
});
type Input = z.infer<typeof ReminderSchema>;

const COLS = "id, title, message, weekdays, slot, time_label, send_app, send_zalo, is_active";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toDto = (r: any): ReminderDto => ({
  id: r.id,
  title: r.title,
  message: r.message ?? null,
  weekdays: (r.weekdays as number[]).map(Number),
  slot: r.slot,
  timeLabel: r.time_label ?? null,
  sendApp: r.send_app,
  sendZalo: r.send_zalo,
  isActive: r.is_active,
});

export async function listReminders(tx: Tx): Promise<{ reminders: ReminderDto[]; canManage: boolean }> {
  const canManage = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('event.manage') AS ok")).rows[0].ok;
  if (!canManage) return { reminders: [], canManage };
  const rows = (await tx.query(`SELECT ${COLS} FROM recurring_reminders ORDER BY created_at`)).rows;
  return { reminders: rows.map(toDto), canManage };
}

export async function createReminder(tx: Tx, b: Input): Promise<ReminderDto> {
  const canManage = (await tx.query<{ ok: boolean }>("SELECT app.has_permission('event.manage') AS ok")).rows[0].ok;
  if (!canManage) throw forbidden("Chỉ Trưởng nhà hoặc Admin mới tạo được lịch nhắc.");
  const r = (
    await tx.query(
      `INSERT INTO recurring_reminders (title, message, weekdays, slot, time_label, send_app, send_zalo, is_active)
       VALUES ($1, $2, $3::smallint[], $4, $5, $6, $7, $8) RETURNING ${COLS}`,
      [b.title, b.message, b.weekdays, b.slot, b.timeLabel, b.sendApp, b.sendZalo, b.isActive ?? true],
    )
  ).rows[0];
  return toDto(r);
}

export async function updateReminder(tx: Tx, id: string, b: Input): Promise<ReminderDto> {
  const r = (
    await tx.query(
      `UPDATE recurring_reminders SET title = $2, message = $3, weekdays = $4::smallint[], slot = $5, time_label = $6,
              send_app = $7, send_zalo = $8, is_active = COALESCE($9, is_active)
        WHERE id = $1 RETURNING ${COLS}`,
      [id, b.title, b.message, b.weekdays, b.slot, b.timeLabel, b.sendApp, b.sendZalo, b.isActive ?? null],
    )
  ).rows[0];
  if (!r) throw notFound("Không tìm thấy lịch nhắc (hoặc bạn không có quyền sửa).");
  return toDto(r);
}

export async function deleteReminder(tx: Tx, id: string) {
  const r = await tx.query("DELETE FROM recurring_reminders WHERE id = $1", [id]);
  if (!r.rowCount) throw notFound("Không tìm thấy lịch nhắc (hoặc bạn không có quyền xóa).");
}
