import { withTx } from "./db";
import { purgeActivity } from "./activity";
import { purgeStorageFiles, type Bucket } from "./storage";
import { runLiturgyNotices } from "./liturgy/notices";
import { autoImportLectionary } from "./modules/liturgy-lectionary";

declare global {
  // eslint-disable-next-line no-var
  var __luuxaJobs: NodeJS.Timeout | undefined;
}

export async function housekeeping() {
  try {
    const r = await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
      const out = (await tx.query("SELECT app.fn_housekeeping() AS r")).rows[0].r;
      await purgeActivity(tx); // nhật ký hoạt động quá 180 ngày
      await tx.query("DELETE FROM zalo_message_log WHERE sent_at < now() - interval '180 days'");
      // Tệp đã đánh dấu xóa quá hạn giữ: xóa nội dung trên Supabase Storage / đĩa local
      const purge = (
        await tx.query<{ id: string; bucket: Bucket; object_key: string; variants: Record<string, string> }>(
          `UPDATE storage_files SET purge_after = NULL
            WHERE status = 'deleted' AND purge_after IS NOT NULL AND purge_after < now()
          RETURNING id, bucket, object_key, variants`
        )
      ).rows;
      return { out, purge };
    });
    await purgeStorageFiles(r.purge);
    if (process.env.NODE_ENV !== "production") console.log("[jobs] housekeeping", JSON.stringify(r.out), r.purge.length ? `purged ${r.purge.length}` : "");
  } catch (e) {
    console.error("[jobs] housekeeping lỗi:", (e as Error).message);
  }
}

/** Mỗi 10 phút: đánh dấu ca trực bỏ lỡ (thiết kế giao cho worker). */
export async function dutyJobs() {
  try {
    await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
      await tx.query("SELECT app.fn_mark_missed_duties()");
      // Job AI treo (tiến trình dừng giữa chừng) quá 5 phút ⇒ đánh dấu lỗi để không kẹt ở 'running'.
      await tx.query(
        `UPDATE ai_jobs SET status = 'failed', error_message = 'Quá thời gian xử lý', finished_at = now()
          WHERE status IN ('queued','running') AND created_at < now() - interval '5 minutes'`,
      );
    });
  } catch (e) {
    console.error("[jobs] duty lỗi:", (e as Error).message);
  }
}

/** Mỗi 30 phút: nhắc lễ trọng / Bổn mạng / ngày đặc biệt và nhắc check-in đi lễ (chống gửi trùng bằng liturgy_notice_log). */
async function liturgyJobs() {
  try {
    const { sent: n } = await runLiturgyNotices();
    if (n && process.env.NODE_ENV !== "production") console.log("[jobs] nhắc lễ:", n, "thông báo");
  } catch (e) {
    console.error("[jobs] nhắc lễ lỗi:", (e as Error).message);
  }
}

/** Lời Chúa chưa nạp ⇒ thử nạp từ nguồn mở (một lần lúc khởi động + mỗi ngày); lỗi mạng thì để lần sau. */
export async function lectionaryJob() {
  try {
    await autoImportLectionary();
  } catch (e) {
    console.error("[jobs] nạp Lời Chúa lỗi:", (e as Error).message);
  }
}

export function startBackgroundJobs() {
  if (globalThis.__luuxaJobs) return;
  setTimeout(dutyJobs, 20_000);
  setInterval(dutyJobs, 10 * 60 * 1000);
  setTimeout(housekeeping, 15_000);
  setTimeout(liturgyJobs, 30_000);
  setInterval(liturgyJobs, 30 * 60 * 1000);
  setTimeout(lectionaryJob, 45_000);
  setInterval(lectionaryJob, 24 * 60 * 60 * 1000);
  globalThis.__luuxaJobs = setInterval(housekeeping, 60 * 60 * 1000);
}
