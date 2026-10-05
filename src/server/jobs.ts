import { withTx } from "./db";
import { purgeStorageFiles, type Bucket } from "./storage";

declare global {
  // eslint-disable-next-line no-var
  var __luuxaJobs: NodeJS.Timeout | undefined;
}

async function housekeeping() {
  try {
    const r = await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
      const out = (await tx.query("SELECT app.fn_housekeeping() AS r")).rows[0].r;
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

/** Mỗi 10 phút: đánh dấu ca trực bỏ lỡ + lượt giặt không đến (thiết kế giao cho worker). */
async function dutyJobs() {
  try {
    await withTx({ requestId: crypto.randomUUID() }, "luuxa_worker", async (tx) => {
      await tx.query("SELECT app.fn_mark_missed_duties()");
      await tx.query("SELECT app.fn_expire_laundry_noshows()");
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

export function startBackgroundJobs() {
  if (globalThis.__luuxaJobs) return;
  setTimeout(dutyJobs, 20_000);
  setInterval(dutyJobs, 10 * 60 * 1000);
  setTimeout(housekeeping, 15_000);
  globalThis.__luuxaJobs = setInterval(housekeeping, 60 * 60 * 1000);
}
