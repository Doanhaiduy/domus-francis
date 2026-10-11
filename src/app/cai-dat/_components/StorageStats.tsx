"use client";

// Phần số liệu của tab "Dung lượng": tệp tải lên theo loại / ngày / tháng / nơi lưu, người tải nhiều nhất, tệp lớn nhất, bảng CSDL lớn nhất, xu hướng.
import React from "react";
import { AlertTriangle, Database, FileText, Film, HardDrive, Image as ImageIcon, Users } from "lucide-react";
import { CustomSelect } from "@/components/ui/FormControls";
import { formatBytes } from "@/lib/storage-monitor";
import type { DailyStat, FileKind, SnapshotPoint, StorageOverviewDto } from "@/lib/types/storage-monitor";
import { cn } from "@/lib/utils";

export const KIND_META: Record<FileKind, { label: string; plural: string; icon: React.ComponentType<{ className?: string }>; bar: string; chip: string }> = {
  image: { label: "Ảnh", plural: "ảnh", icon: ImageIcon, bar: "bg-primary", chip: "bg-purple-100 text-primary" },
  video: { label: "Video", plural: "video", icon: Film, bar: "bg-sky-500", chip: "bg-sky-100 text-sky-700" },
  pdf: { label: "PDF / tệp", plural: "PDF", icon: FileText, bar: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
};

const STORE_LABEL: Record<string, string> = {
  primary: "Kho tệp chính (ảnh, PDF) — Supabase Storage",
  supabase: "Video ở Supabase Storage",
  cloudinary: "Video ở Cloudinary",
  local: "Video ở ổ đĩa local (máy dev)",
};

const BUCKET_LABEL: Record<string, string> = {
  avatars: "Ảnh đại diện",
  receipts: "Hóa đơn / chứng từ",
  "cleaning-evidence": "Ảnh vệ sinh / điểm danh",
  "academic-evidence": "Minh chứng bảng điểm",
  maintenance: "Báo hỏng / sự cố",
  moments: "Khoảnh khắc",
  attachments: "Đính kèm (bài viết, thông báo…)",
  documents: "Tài liệu",
  videos: "Video",
};

const PERIOD_LABEL = { today: "Hôm nay", d7: "7 ngày qua", d30: "30 ngày qua", d90: "90 ngày qua" } as const;

const n = (v: number) => v.toLocaleString("vi-VN");
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

export function Card({ title, icon, right, children, className }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs space-y-4", className)}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-extrabold text-gray-900 inline-flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className={cn("h-full rounded-full", className ?? "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Đường xu hướng nhỏ (SVG). `limit` vẽ đường hạn mức nét đứt. */
function Sparkline({ points, limit, label }: { points: number[]; limit?: number | null; label: string }) {
  if (points.length < 2) return <p className="text-[11px] text-gray-400">Chưa đủ dữ liệu để vẽ xu hướng (hệ thống ghi một điểm mỗi ngày).</p>;
  const W = 320;
  const H = 70;
  const top = Math.max(...points, limit ?? 0) * 1.05 || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - (v / top) * (H - 6) - 3;
  const path = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" role="img" aria-label={label} preserveAspectRatio="none">
      {limit ? <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} className="stroke-rose-300" strokeWidth="1" strokeDasharray="4 3" /> : null}
      <path d={path} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TrendCard({ history, limits }: { history: SnapshotPoint[]; limits: StorageOverviewDto["limits"] }) {
  const db = history.map((h) => h.dbBytes);
  const st = history.filter((h) => h.storageBytes !== null && h.storageSource === "supabase").map((h) => h.storageBytes as number);
  const span = history.length ? `${dm(history[0].day)} → ${dm(history[history.length - 1].day)}` : "";
  return (
    <Card title="Xu hướng theo ngày" icon={<HardDrive className="w-4 h-4 text-primary" />} right={span ? <span className="text-[11px] text-gray-400">{span} · {history.length} điểm</span> : null}>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">CSDL <span className="font-medium text-gray-400">(đường đỏ nét đứt = hạn mức {formatBytes(limits.dbLimitBytes, 0)})</span></p>
          <Sparkline points={db} limit={limits.dbLimitBytes} label="Xu hướng dung lượng CSDL" />
          {db.length >= 2 && <p className="text-[11px] text-gray-500">{formatBytes(db[0])} → <b className="text-gray-800">{formatBytes(db[db.length - 1])}</b></p>}
        </div>
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">Supabase Storage <span className="font-medium text-gray-400">(hạn mức {formatBytes(limits.storageLimitBytes, 0)})</span></p>
          <Sparkline points={st} limit={limits.storageLimitBytes} label="Xu hướng dung lượng Supabase Storage" />
          {st.length >= 2 && <p className="text-[11px] text-gray-500">{formatBytes(st[0])} → <b className="text-gray-800">{formatBytes(st[st.length - 1])}</b></p>}
        </div>
      </div>
    </Card>
  );
}

function DailyChart({ daily }: { daily: DailyStat[] }) {
  const max = Math.max(1, ...daily.map((d) => d.images + d.videos + d.pdfs));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-32" role="img" aria-label="Biểu đồ số tệp tải lên theo ngày">
        {daily.map((d) => {
          const total = d.images + d.videos + d.pdfs;
          const h = (total / max) * 100;
          return (
            <div
              key={d.day}
              className="flex-1 min-w-[3px] h-full flex flex-col justify-end"
              title={`${dm(d.day)}: ${d.images} ảnh, ${d.videos} video, ${d.pdfs} PDF · ${formatBytes(d.bytes)}`}
            >
              <div className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${h}%`, minHeight: total ? 2 : 0 }}>
                {d.images > 0 && <div className={KIND_META.image.bar} style={{ flexGrow: d.images }} />}
                {d.videos > 0 && <div className={KIND_META.video.bar} style={{ flexGrow: d.videos }} />}
                {d.pdfs > 0 && <div className={KIND_META.pdf.bar} style={{ flexGrow: d.pdfs }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{daily.length ? dm(daily[0].day) : ""}</span>
        <span>{daily.length ? dm(daily[daily.length - 1].day) : ""}</span>
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">
        {(Object.keys(KIND_META) as FileKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("w-2.5 h-2.5 rounded-sm", KIND_META[k].bar)} /> {KIND_META[k].label}
          </span>
        ))}
        <span className="text-gray-400">· rê chuột / chạm vào cột để xem chi tiết</span>
      </div>
    </div>
  );
}

export function UploadsSection({ data, days, onDays }: { data: StorageOverviewDto; days: number; onDays: (d: number) => void }) {
  const { files, periods, daily, monthly, topUploaders, largest } = data;
  const totalBytes = Math.max(1, files.totals.bytes);
  const kinds = (["image", "video", "pdf"] as FileKind[]).map((k) => files.byKind.find((x) => x.kind === k) ?? { kind: k, count: 0, bytes: 0 });
  const maxBucket = Math.max(1, ...files.byBucket.map((b) => b.bytes));
  const maxMonth = Math.max(1, ...monthly.map((m) => m.images + m.videos + m.pdfs));
  const maxUp = Math.max(1, ...topUploaders.map((u) => u.bytes));
  return (
    <>
      <Card title="Tệp đã tải lên" icon={<ImageIcon className="w-4 h-4 text-primary" />} right={<span className="text-xs text-gray-500"><b className="text-gray-900">{n(files.totals.count)}</b> tệp · <b className="text-gray-900">{formatBytes(files.totals.bytes)}</b></span>}>
        <div className="grid sm:grid-cols-3 gap-3">
          {kinds.map((k) => {
            const M = KIND_META[k.kind];
            return (
              <div key={k.kind} className="rounded-2xl border border-purple-100 bg-surface/40 p-3.5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center", M.chip)}>
                    <M.icon className="w-4 h-4" />
                  </span>
                  <p className="text-xs font-bold text-gray-800">{M.label}</p>
                </div>
                <p className="text-lg font-extrabold text-gray-900 leading-none">
                  {n(k.count)} <span className="text-[11px] font-semibold text-gray-400">tệp</span>
                </p>
                <p className="text-[11px] text-gray-500">{formatBytes(k.bytes)} · {Math.round((k.bytes / totalBytes) * 100)}% dung lượng</p>
                <Meter value={k.bytes} max={totalBytes} className={M.bar} />
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          “Dung lượng” ở đây là dung lượng tệp gốc đã nén. Mỗi ảnh còn có {n(files.variantCount)} bản thu nhỏ (thumb/medium) chiếm thêm chỗ — số đo thật ở thẻ “Supabase Storage” phía trên đã gồm các bản này.
        </p>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[420px]">
            <thead>
              <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
                <th className="py-1.5 font-bold">Khoảng thời gian</th>
                <th className="py-1.5 font-bold text-right">Ảnh</th>
                <th className="py-1.5 font-bold text-right">Video</th>
                <th className="py-1.5 font-bold text-right">PDF</th>
                <th className="py-1.5 font-bold text-right">Dung lượng</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.key} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 font-semibold text-gray-800">{PERIOD_LABEL[p.key]}</td>
                  <td className="py-2 text-right tabular-nums">{n(p.images)}</td>
                  <td className="py-2 text-right tabular-nums">{n(p.videos)}</td>
                  <td className="py-2 text-right tabular-nums">{n(p.pdfs)}</td>
                  <td className="py-2 text-right tabular-nums font-semibold">{formatBytes(p.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Tải lên theo ngày"
        icon={<HardDrive className="w-4 h-4 text-primary" />}
        right={
          <div className="w-36">
            <CustomSelect<string>
              value={String(days)}
              onChange={(v) => onDays(Number(v))}
              options={[
                { value: "7", label: "7 ngày" },
                { value: "30", label: "30 ngày" },
                { value: "90", label: "90 ngày" },
              ]}
            />
          </div>
        }
      >
        <DailyChart daily={daily} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Theo tháng (12 tháng)" icon={<FileText className="w-4 h-4 text-primary" />}>
          <ul className="space-y-2">
            {[...monthly].reverse().map((m) => {
              const total = m.images + m.videos + m.pdfs;
              return (
                <li key={m.month} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-gray-700">{monthLabel(m.month)}</span>
                    <span className="text-gray-500">
                      {m.images} ảnh · {m.videos} video · {m.pdfs} PDF · <b className="text-gray-800">{formatBytes(m.bytes)}</b>
                    </span>
                  </div>
                  <Meter value={total} max={maxMonth} />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Theo nơi lưu & mục dùng" icon={<Database className="w-4 h-4 text-primary" />}>
          <div className="space-y-2.5">
            {files.byStore.map((s) => (
              <div key={s.store} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-700 font-semibold">{STORE_LABEL[s.store] ?? s.store}</span>
                <span className="text-gray-500 tabular-nums shrink-0">
                  {n(s.count)} tệp · <b className="text-gray-800">{formatBytes(s.bytes)}</b>
                </span>
              </div>
            ))}
            {!files.byStore.length && <p className="text-xs text-gray-400">Chưa có tệp nào.</p>}
          </div>
          <div className="pt-3 border-t border-gray-100 space-y-2">
            {files.byBucket.map((b) => (
              <div key={b.bucket} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-gray-700">{BUCKET_LABEL[b.bucket] ?? b.bucket}</span>
                  <span className="text-gray-500 tabular-nums">
                    {n(b.count)} · {formatBytes(b.bytes)}
                  </span>
                </div>
                <Meter value={b.bytes} max={maxBucket} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Người tải lên nhiều nhất (30 ngày)" icon={<Users className="w-4 h-4 text-primary" />}>
          {topUploaders.length ? (
            <ul className="space-y-2.5">
              {topUploaders.map((u, i) => (
                <li key={(u.memberId ?? "x") + i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800 truncate">{u.name}</span>
                    <span className="text-gray-500 tabular-nums shrink-0">
                      {n(u.count)} tệp · <b className="text-gray-800">{formatBytes(u.bytes)}</b>
                    </span>
                  </div>
                  <Meter value={u.bytes} max={maxUp} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">Chưa có tệp nào trong 30 ngày qua.</p>
          )}
        </Card>

        <Card title="Tệp lớn nhất" icon={<HardDrive className="w-4 h-4 text-primary" />}>
          {largest.length ? (
            <ul className="divide-y divide-gray-100">
              {largest.map((f) => {
                const M = KIND_META[f.kind];
                return (
                  <li key={f.id} className="py-2 flex items-center gap-2.5">
                    <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", M.chip)}>
                      <M.icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-800 truncate">{f.name || BUCKET_LABEL[f.bucket] || f.bucket}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {BUCKET_LABEL[f.bucket] ?? f.bucket} · {f.uploader ?? "Không rõ"} · {new Date(f.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-gray-900 tabular-nums shrink-0">{formatBytes(f.bytes)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">Chưa có tệp nào.</p>
          )}
        </Card>
      </div>

      {files.stale.count > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Có <b>{n(files.stale.count)}</b> tệp ({formatBytes(files.stale.bytes)}) kẹt ở trạng thái chưa xử lý xong / bị từ chối / cách ly quá 1 ngày — thường là lần tải lên bị hủy giữa chừng. Đây là ứng viên để dọn khi cần giải phóng chỗ.
          </p>
        </div>
      )}
    </>
  );
}

export function TablesCard({ data }: { data: StorageOverviewDto }) {
  const { tables, sizeBytes } = data.database;
  const max = Math.max(1, ...tables.map((t) => t.bytes));
  return (
    <Card title="Bảng CSDL lớn nhất" icon={<Database className="w-4 h-4 text-primary" />} right={<span className="text-xs text-gray-500">Tổng CSDL: <b className="text-gray-900">{formatBytes(sizeBytes)}</b></span>}>
      <ul className="space-y-2">
        {tables.map((t) => (
          <li key={t.name} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-semibold text-gray-700 truncate">{t.name}</span>
              <span className="text-gray-500 tabular-nums shrink-0">
                ~{n(t.rows)} dòng · <b className="text-gray-800">{formatBytes(t.bytes)}</b>
              </span>
            </div>
            <Meter value={t.bytes} max={max} />
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-400">Số dòng là ước lượng của PostgreSQL. Kích thước gồm cả chỉ mục. Tổng CSDL còn gồm các schema hệ thống của Supabase (auth, storage…).</p>
    </Card>
  );
}
