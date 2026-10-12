import { withTx } from "./db";
import { purgeActivity } from "./activity";
import { purgeStorageFiles, type Bucket } from "./storage";
import { runLiturgyNotices } from "./liturgy/notices";
import { autoImportLectionary } from "./modules/liturgy-lectionary";

declare global {
  // eslint-disable-next-line no-var
  var __luuxaJobs: NodeJS.Timeout | undefined;
}

// Các hàm dưới đây NÉM LỖI khi hỏng để cron hằng ngày (src/server/cron/daily.ts) ghi nhận vào job_runs và báo Admin;
// bộ hẹn giờ của máy chủ chạy lâu (startBackgroundJobs, chỉ local / tự host) tự bắt lỗi và in log.

/** Dọn dẹp định kỳ: app.fn_housekeeping (token/nhật ký hết hạn, tệp mồ côi, đơn đổi ca, biểu quyết, phân vùng audit) + các nhật ký của ứng dụng. */
export async function housekeeping(): Promise<string[]> {
  const notes: string[] = [];
  const r = await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
    const out = (await tx.query("SELECT app.fn_housekeeping() AS r")).rows[0].r;
    await purgeActivity(tx); // nhật ký hoạt động quá 180 ngày
    await tx.query("DELETE FROM zalo_message_log WHERE sent_at < now() - interval '180 days'");
    // Nhật ký vận hành (db/app/1041): lượt chạy tác vụ 180 ngày, lỗi 90 ngày kể từ lần cuối, giới hạn tần suất 2 ngày, khóa chống gửi trùng 400 ngày
    await tx.query("DELETE FROM job_runs WHERE started_at < now() - interval '180 days'");
    await tx.query("DELETE FROM error_events WHERE last_seen < now() - interval '90 days'");
    await tx.query("DELETE FROM rate_limit_hits WHERE at < now() - interval '2 days'");
    await tx.query("DELETE FROM system_post_log WHERE created_at < now() - interval '400 days'");
    // Tệp đã đánh dấu xóa quá hạn giữ: lấy danh sách — chỉ xóa dấu purge_after SAU KHI kho xác nhận đã xóa (lỗi ⇒ lượt sau thử lại)
    const purge = (
      await tx.query<{ id: string; bucket: Bucket; object_key: string; variants: Record<string, string> }>(
        `SELECT id, bucket, object_key, variants FROM storage_files
          WHERE status = 'deleted' AND purge_after IS NOT NULL AND purge_after < now()
          ORDER BY purge_after LIMIT 300`
      )
    ).rows;
    return { out, purge };
  });
  if (r.purge.length) {
    const done = await purgeStorageFiles(r.purge);
    if (done.length) {
      await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", (tx) => tx.query("UPDATE storage_files SET purge_after = NULL WHERE id = ANY($1::uuid[])", [done]));
    }
    notes.push(`đã xóa hẳn ${done.length}/${r.purge.length} tệp`);
    if (done.length < r.purge.length) notes.push(`${r.purge.length - done.length} tệp xóa trên kho lưu trữ lỗi — sẽ thử lại lượt sau`);
  }
  if (process.env.NODE_ENV !== "production") console.log("[jobs] housekeeping", JSON.stringify(r.out), r.purge.length ? `purge ${r.purge.length}` : "");
  return notes;
}

/** Job AI treo (tiến trình dừng giữa chừng) quá 5 phút ⇒ đánh dấu lỗi để không kẹt ở 'running'. */
export async function dutyJobs() {
  await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
    await tx.query(
      `UPDATE ai_jobs SET status = 'failed', error_message = 'Quá thời gian xử lý', finished_at = now()
        WHERE status IN ('queued','running') AND created_at < now() - interval '5 minutes'`,
    );
  });
}

/** Mỗi 30 phút (máy chủ chạy lâu): nhắc lễ trọng / Bổn mạng / ngày đặc biệt và nhắc check-in đi lễ (chống gửi trùng bằng liturgy_notice_log). */
async function liturgyJobs() {
  const { sent: n } = await runLiturgyNotices();
  if (n && process.env.NODE_ENV !== "production") console.log("[jobs] nhắc lễ:", n, "thông báo");
}

/** Lời Chúa chưa nạp ⇒ thử nạp từ nguồn mở (một lần lúc khởi động + mỗi ngày); lỗi mạng thì để lần sau. */
export async function lectionaryJob() {
  await autoImportLectionary();
}

const safe = (name: string, fn: () => Promise<unknown>) => () => {
  fn().catch((e) => console.error(`[jobs] ${name} lỗi:`, (e as Error).message));
};

/** Bộ hẹn giờ trong tiến trình — CHỈ khi tự chạy máy chủ lâu dài (local / tự host); trên Vercel dùng cron (xem instrumentation.ts). */
export function startBackgroundJobs() {
  if (globalThis.__luuxaJobs) return;
  setTimeout(safe("duty", dutyJobs), 20_000);
  setInterval(safe("duty", dutyJobs), 10 * 60 * 1000);
  setTimeout(safe("housekeeping", housekeeping), 15_000);
  setTimeout(safe("nhắc lễ", liturgyJobs), 30_000);
  setInterval(safe("nhắc lễ", liturgyJobs), 30 * 60 * 1000);
  setTimeout(safe("nạp Lời Chúa", lectionaryJob), 45_000);
  setInterval(safe("nạp Lời Chúa", lectionaryJob), 24 * 60 * 60 * 1000);
  globalThis.__luuxaJobs = setInterval(safe("housekeeping", housekeeping), 60 * 60 * 1000);
}
