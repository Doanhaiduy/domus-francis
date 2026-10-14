import "server-only";
import { withTx, type DbRole, type Tx } from "../db";
import { getProviders, limitsFromSettings } from "../modules/storage-monitor";
import { formatBytes, levelOf, percentOf } from "@/lib/storage-monitor";
import type { MonitorLevel } from "@/lib/types/storage-monitor";

// =====================================================================
// Bước của cron hằng ngày: (1) đo Supabase Storage + Cloudinary, (2) ghi ảnh chụp số liệu của hôm nay (usage_snapshots — nuôi biểu đồ xu hướng
// và dự báo ngày đầy), (3) chỉ số nào chạm ngưỡng cảnh báo/nguy hiểm thì thông báo cho Admin (tối đa một lần mỗi tuần cho mỗi chỉ số + mức).
// =====================================================================

const LABEL = { db: "CSDL (Supabase Database)", storage: "Supabase Storage", cloudinary: "Cloudinary (video)" } as const;
type Metric = keyof typeof LABEL;

/** Khóa tuần: năm + số thứ tự tuần trong năm (đủ để chống gửi trùng, không cần chuẩn ISO). */
export function weekKey(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000) + 1;
  return `${d.getUTCFullYear()}-W${Math.floor((dayOfYear - 1) / 7) + 1}`;
}

export async function runStorageMonitor(today: string): Promise<string[]> {
  const requestId = crypto.randomUUID();
  const W = <T,>(fn: (tx: Tx) => Promise<T>, role: DbRole = "luuxa_worker") => withTx({ requestId }, role, fn);
  const notes: string[] = [];

  // Cron có thời hạn 60 giây: giới hạn thời gian quét Supabase ở 20 giây
  const prov = await getProviders({ refresh: true, deadlineMs: 20_000 });
  const settings = (await W((tx) => tx.query<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key LIKE 'monitor.%'"))).rows;
  const limits = limitsFromSettings(Object.fromEntries(settings.map((r) => [r.key, r.value])));
  const dbBytes = Number((await W((tx) => tx.query<{ b: string }>("SELECT pg_database_size(current_database())::bigint AS b"))).rows[0].b);

  const cl = prov.cloudinary;
  const sb = prov.supabase;
  await W((tx) =>
    tx.query("SELECT app.fn_usage_snapshot_save($1::bigint, $2, $3::numeric, $4::numeric, $5::bigint, $6::bigint)", [
      sb.usedBytes,
      sb.source === "unavailable" ? null : sb.source,
      cl.ok ? cl.creditsUsed : null,
      cl.ok ? cl.creditsLimit : null,
      cl.ok ? cl.storageBytes : null,
      cl.ok ? cl.bandwidthBytes : null,
    ]),
  );
  if (sb.error) notes.push(`Đo Supabase Storage lỗi: ${sb.error}`);
  if (cl.configured && !cl.ok) notes.push(`Đọc Cloudinary lỗi: ${cl.error}`);

  const checks: { metric: Metric; percent: number | null; detail: string }[] = [
    { metric: "db", percent: percentOf(dbBytes, limits.dbLimitBytes), detail: `${formatBytes(dbBytes)} / ${formatBytes(limits.dbLimitBytes)}` },
  ];
  // Ổ đĩa local (máy dev) không có hạn mức gói ⇒ chỉ cảnh báo khi đo được thật từ Supabase
  if (sb.source === "supabase") checks.push({ metric: "storage", percent: percentOf(sb.usedBytes, limits.storageLimitBytes), detail: `${formatBytes(sb.usedBytes)} / ${formatBytes(limits.storageLimitBytes)}` });
  if (cl.ok) checks.push({ metric: "cloudinary", percent: cl.creditsPercent, detail: `${cl.creditsUsed ?? "?"} / ${cl.creditsLimit ?? "?"} credits` });

  const week = weekKey(today);
  for (const c of checks) {
    const level: MonitorLevel = levelOf(c.percent, limits);
    if (level === "ok" || level === "unknown") continue;
    const key = `storage-alert:${c.metric}:${level}:${week}`;
    const first = (await W((tx) => tx.query("INSERT INTO system_post_log (key, kind) VALUES ($1, 'daily') ON CONFLICT (key) DO NOTHING RETURNING key", [key]))).rowCount === 1;
    if (!first) continue;
    const pct = Math.round(c.percent ?? 0);
    const title = `${level === "critical" ? "🚨" : "⚠"} ${LABEL[c.metric]} đã dùng ${pct}%`;
    const body = `${c.detail}. Mở Quản trị → Dung lượng để xem dự báo ngày đầy và cách xử lý.`;
    await W((tx) => tx.query("SELECT app.fn_notify_roles(ARRAY['admin'], 'system.storage_alert', $1, $2, $3::jsonb)", [title, body, JSON.stringify({ link: "/quan-tri?tab=storage" })]));
    notes.push(`${title} — đã báo Admin`);
  }
  return notes;
}
