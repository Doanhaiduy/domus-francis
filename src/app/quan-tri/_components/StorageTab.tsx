"use client";

// Tab "Dung lượng" — CHỈ Admin (quyền system.monitor): theo dõi % dùng của CSDL, Supabase Storage, Cloudinary (gói miễn phí), dự báo ngày đầy,
// gợi ý cách xử lý khi gần đầy, số tệp tải lên theo loại / ngày / tháng / nơi lưu. Hạn mức gói + ngưỡng cảnh báo sửa ngay tại đây.
// Cron hằng ngày ghi ảnh chụp số liệu (xu hướng) và báo Admin khi chạm ngưỡng (src/server/cron/storage-monitor.ts).
import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Database, HardDrive, Info, Loader2, RefreshCw, Save } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { CustomInput } from "@/components/ui/FormControls";
import { refreshSettings, settingsApi, useSettings } from "@/lib/data/settings";
import { refreshStorageOverview, useStorageOverview, useStorageProviders } from "@/lib/data/storage-monitor";
import { adviceFor, daysUntilFull, formatBytes, formatDaysLeft, growthPerDay, LEVEL_LABEL, levelOf, percentOf } from "@/lib/storage-monitor";
import type { MonitorLevel, StorageOverviewDto } from "@/lib/types/storage-monitor";
import { cn } from "@/lib/utils";
import { FormCardsSkeleton } from "@/components/settings/TabSkeletons";
import { Card, TablesCard, TrendCard, UploadsSection } from "./StorageStats";

const LEVEL_STYLE: Record<MonitorLevel, { bar: string; chip: string; ring: string }> = {
  ok: { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", ring: "border-emerald-100" },
  warn: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-700", ring: "border-amber-200" },
  critical: { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-700", ring: "border-rose-200" },
  unknown: { bar: "bg-gray-300", chip: "bg-gray-100 text-gray-500", ring: "border-purple-100" },
};

interface GaugeProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  percent: number | null;
  level: MonitorLevel;
  usedLabel: string;
  /** Thay chữ lớn (mặc định là %) — vd. "Local" khi không có hạn mức */
  bigText?: string;
  /** Thay nhãn mức (mặc định theo level) */
  chip?: string;
  limitLabel?: string;
  forecast?: string | null;
  rows?: { label: string; value: string }[];
  note?: React.ReactNode;
  loading?: boolean;
}

function Gauge({ icon, title, subtitle, percent, level, usedLabel, bigText, chip, limitLabel, forecast, rows, note, loading }: GaugeProps) {
  const st = LEVEL_STYLE[level];
  return (
    <div className={cn("bg-white rounded-3xl p-5 border shadow-xs space-y-3.5", st.ring)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-gray-900 leading-tight break-words">{title}</p>
            <p className="text-[11px] text-gray-400 leading-snug break-words">{subtitle}</p>
          </div>
        </div>
        <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap", st.chip)}>{loading ? "Đang đo…" : (chip ?? LEVEL_LABEL[level])}</span>
      </div>

      <div>
        <p className="text-3xl font-extrabold text-gray-900 tabular-nums leading-none">
          {loading ? <Loader2 className="w-6 h-6 animate-spin text-gray-300" /> : bigText ? bigText : percent === null ? "—" : `${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`}
        </p>
        <div className="mt-3 h-2.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === null ? undefined : Math.min(100, Math.round(percent))} aria-label={`${title}: đã dùng`}>
          <div className={cn("h-full rounded-full transition-all", st.bar)} style={{ width: `${percent === null ? 0 : Math.max(percent > 0 ? 1.5 : 0, Math.min(100, percent))}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-gray-600">
          <b className="text-gray-900">{usedLabel}</b>
          {limitLabel ? <span className="text-gray-400"> / {limitLabel}</span> : null}
        </p>
      </div>

      {forecast !== undefined && (
        <p className="text-[11px] text-gray-500 rounded-xl bg-surface/60 px-3 py-2">
          Dự báo đầy: <b className="text-gray-800">{forecast ?? "chưa đủ dữ liệu"}</b>
        </p>
      )}
      {rows && rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {rows.map((r) => (
            <React.Fragment key={r.label}>
              <dt className="text-gray-400">{r.label}</dt>
              <dd className="text-right font-semibold text-gray-700 tabular-nums truncate">{r.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {note}
    </div>
  );
}

const LIMIT_FIELDS = [
  { key: "monitor.supabase.db_limit_mb", label: "Hạn mức CSDL Supabase", suffix: "MB" },
  { key: "monitor.supabase.storage_limit_mb", label: "Hạn mức Supabase Storage", suffix: "MB" },
  { key: "monitor.warn_percent", label: "Ngưỡng cảnh báo (vàng)", suffix: "%" },
  { key: "monitor.critical_percent", label: "Ngưỡng nguy hiểm (đỏ)", suffix: "%" },
] as const;

function LimitsCard() {
  const { showToast } = useApp();
  const { settings } = useSettings();
  const byKey = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const val = (k: string) => draft[k] ?? String(byKey.get(k)?.value ?? "");
  const dirty = LIMIT_FIELDS.some((f) => draft[f.key] !== undefined && draft[f.key] !== String(byKey.get(f.key)?.value ?? ""));

  const save = async () => {
    const changes = LIMIT_FIELDS.filter((f) => draft[f.key] !== undefined && draft[f.key] !== String(byKey.get(f.key)?.value ?? "")).map((f) => ({
      key: f.key,
      value: Number(draft[f.key]),
      version: byKey.get(f.key)?.version,
    }));
    if (changes.some((c) => !Number.isFinite(c.value) || c.value <= 0)) {
      showToast("error", "Mỗi ô phải là một số lớn hơn 0.");
      return;
    }
    setSaving(true);
    try {
      await settingsApi.save(changes);
      await refreshSettings();
      await refreshStorageOverview();
      setDraft({});
      showToast("success", "Đã lưu hạn mức dung lượng.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Hạn mức gói & ngưỡng cảnh báo" icon={<Database className="w-4 h-4 text-primary" />}>
      <p className="text-xs text-gray-500 leading-relaxed">
        Mặc định theo gói miễn phí của Supabase (CSDL 500 MB, Storage 1 GB). Khi nâng gói, đổi hạn mức ở đây để % đã dùng luôn đúng. Hạn mức Cloudinary lấy thẳng từ Cloudinary.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LIMIT_FIELDS.map((f) => {
          const m = byKey.get(f.key);
          return (
            <CustomInput
              key={f.key}
              label={f.label}
              type="number"
              inputMode="numeric"
              min={m?.min ?? undefined}
              max={m?.max ?? undefined}
              value={val(f.key)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              rightSuffix={f.suffix}
              disabled={!m?.canWrite || saving}
            />
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Lưu hạn mức
        </button>
      </div>
    </Card>
  );
}

export default function StorageTab() {
  const { showToast } = useApp();
  const [days, setDays] = useState(30);
  const overview = useStorageOverview(days);
  const prov = useStorageProviders();
  const data: StorageOverviewDto | undefined = overview.data;
  const p = prov.data;

  const view = useMemo(() => {
    if (!data) return null;
    const { limits, history, files, periods } = data;
    const lv = (pct: number | null) => levelOf(pct, limits);

    // --- CSDL ---
    const dbUsed = data.database.sizeBytes;
    const dbPct = percentOf(dbUsed, limits.dbLimitBytes);
    const dbGrowth = growthPerDay(history.map((h) => ({ day: h.day, value: h.dbBytes })));

    // --- Supabase Storage ---
    const sb = p?.supabase;
    const measured = sb && sb.usedBytes !== null ? sb.usedBytes : null;
    const isLocal = sb?.source === "local";
    const primaryDb = files.byStore.filter((s) => s.store !== "cloudinary").reduce((s, x) => s + x.bytes, 0);
    const estimate = primaryDb; // chưa gồm bản thu nhỏ ⇒ thấp hơn thực tế
    const stUsed = measured ?? estimate;
    const stPct = isLocal ? null : percentOf(stUsed, limits.storageLimitBytes);
    const d30 = periods.find((x) => x.key === "d30");
    const ratio = measured !== null && primaryDb > 0 ? Math.max(1, measured / primaryDb) : 1;
    const histGrowth = growthPerDay(history.filter((h) => h.storageSource === "supabase").map((h) => ({ day: h.day, value: h.storageBytes })));
    const stGrowth = histGrowth ?? (d30 ? (d30.storageBytes / 30) * ratio : null);

    // --- Cloudinary ---
    const cl = p?.cloudinary;
    const clPct = cl?.ok ? cl.creditsPercent : null;

    return {
      limits,
      db: { used: dbUsed, pct: dbPct, level: lv(dbPct), days: daysUntilFull(dbUsed, limits.dbLimitBytes, dbGrowth) },
      st: { used: stUsed, measured, estimate: measured === null, pct: stPct, level: isLocal ? ("unknown" as MonitorLevel) : lv(stPct), days: isLocal ? null : daysUntilFull(stUsed, limits.storageLimitBytes, stGrowth), local: isLocal },
      cl: { pct: clPct, level: lv(clPct) },
    };
  }, [data, p]);

  const refreshAll = async () => {
    try {
      await Promise.all([prov.refresh(), overview.mutate()]);
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  if (overview.error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p>{errorMessage(overview.error)}</p>
      </div>
    );
  }
  if (!data || !view) return <FormCardsSkeleton cards={3} />;

  const sb = p?.supabase;
  const cl = p?.cloudinary;
  const provLoading = prov.isLoading;
  const advice = [
    ...adviceFor("db", view.db.level).map((t) => ({ metric: "CSDL", level: view.db.level, t })),
    ...adviceFor("storage", view.st.level).map((t) => ({ metric: "Supabase Storage", level: view.st.level, t })),
    ...adviceFor("cloudinary", view.cl.level).map((t) => ({ metric: "Cloudinary", level: view.cl.level, t })),
  ];
  const worst: MonitorLevel = [view.db.level, view.st.level, view.cl.level].includes("critical") ? "critical" : [view.db.level, view.st.level, view.cl.level].includes("warn") ? "warn" : "ok";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Dung lượng & lưu trữ</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl leading-relaxed">
            Chỉ Admin thấy. Theo dõi mức dùng của gói miễn phí để biết trước khi đầy. Hệ thống ghi số liệu mỗi sáng và báo cho Admin khi chạm ngưỡng.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={prov.refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition disabled:opacity-60"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", prov.refreshing && "animate-spin")} /> Đo lại
        </button>
      </div>

      <div
        className={cn(
          "rounded-2xl border p-3.5 flex items-start gap-3 text-xs",
          worst === "ok" ? "border-emerald-100 bg-emerald-50 text-emerald-900" : worst === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"
        )}
      >
        {worst === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
        <p className="leading-relaxed">
          {worst === "ok"
            ? "Các chỉ số đo được đều dưới ngưỡng cảnh báo."
            : worst === "warn"
              ? `Có chỉ số đã chạm ngưỡng cảnh báo (${view.limits.warnPercent}%). Xem gợi ý bên dưới.`
              : `Có chỉ số sắp đầy (≥ ${view.limits.criticalPercent}%) — cần xử lý sớm. Xem gợi ý bên dưới.`}
          {sb?.source === "unavailable" && <span> Chưa đo được Supabase Storage ({sb.error}); số hiển thị là ước tính từ CSDL.</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Gauge
          icon={<Database className="w-5 h-5" />}
          title="CSDL"
          subtitle="Supabase Database (PostgreSQL)"
          percent={view.db.pct}
          level={view.db.level}
          usedLabel={formatBytes(view.db.used)}
          limitLabel={formatBytes(view.limits.dbLimitBytes, 0)}
          forecast={view.db.days === null ? null : formatDaysLeft(view.db.days)}
          note={<p className="text-[10.5px] text-gray-400">Dự báo dựa trên số liệu ghi mỗi ngày (cần vài ngày dữ liệu).</p>}
        />
        <Gauge
          icon={<HardDrive className="w-5 h-5" />}
          title="Supabase Storage"
          subtitle={view.st.local ? "Ổ đĩa local (máy dev) — không có hạn mức" : "Ảnh, PDF và video nhỏ"}
          percent={view.st.pct}
          level={view.st.level}
          usedLabel={`${view.st.estimate ? "~" : ""}${formatBytes(view.st.used)}`}
          bigText={view.st.local ? "Local" : undefined}
          chip={view.st.local ? "Chạy thử" : undefined}
          limitLabel={view.st.local ? undefined : formatBytes(view.limits.storageLimitBytes, 0)}
          forecast={view.st.local ? undefined : view.st.days === null ? null : formatDaysLeft(view.st.days)}
          loading={provLoading && !p}
          rows={sb && sb.objects !== null ? [{ label: "Số đối tượng", value: sb.objects.toLocaleString("vi-VN") }, ...sb.buckets.slice(0, 3).map((b) => ({ label: b.bucket, value: formatBytes(b.bytes) }))] : undefined}
          note={
            <p className="text-[10.5px] text-gray-400">
              {view.st.estimate ? "Ước tính từ CSDL (chưa gồm bản thu nhỏ) vì chưa đo được từ Supabase." : "Đếm thật qua Storage API, gồm cả bản thu nhỏ của ảnh."}
            </p>
          }
        />
        {cl && !cl.configured ? (
          <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-xs space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center"><Cloud className="w-5 h-5" /></span>
              <p className="text-sm font-extrabold text-gray-900">Cloudinary</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">Môi trường này chưa cấu hình Cloudinary nên video được lưu ở nơi khác (Supabase / ổ đĩa).</p>
          </div>
        ) : (
          <Gauge
            icon={<Cloud className="w-5 h-5" />}
            title="Cloudinary"
            subtitle={cl?.plan ? `Gói ${cl.plan} · video (chuyển mã, phát)` : "Video (chuyển mã, phát)"}
            percent={view.cl.pct}
            level={view.cl.level}
            usedLabel={cl?.ok && cl.creditsUsed !== null ? `${cl.creditsUsed} credits` : "—"}
            limitLabel={cl?.ok && cl.creditsLimit ? `${cl.creditsLimit} credits` : undefined}
            loading={provLoading && !p}
            rows={
              cl?.ok
                ? [
                    { label: "Lưu trữ", value: formatBytes(cl.storageBytes) },
                    { label: "Băng thông", value: formatBytes(cl.bandwidthBytes) },
                    { label: "Biến đổi", value: cl.transformations === null ? "—" : cl.transformations.toLocaleString("vi-VN") },
                    { label: "Tệp", value: cl.resources === null ? "—" : cl.resources.toLocaleString("vi-VN") },
                  ]
                : undefined
            }
            note={
              cl && !cl.ok ? (
                <p className="text-[11px] text-rose-600 leading-relaxed">{cl.error}</p>
              ) : (
                <p className="text-[10.5px] text-gray-400">
                  Credits tính theo chu kỳ tháng (lưu trữ, băng thông và biến đổi cùng quy ra credits).{cl?.lastUpdated ? ` Cập nhật: ${cl.lastUpdated}.` : ""}
                </p>
              )
            }
          />
        )}
      </div>

      {advice.length > 0 && (
        <Card title="Nên làm gì" icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}>
          <ul className="space-y-2">
            {advice.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-gray-700 leading-relaxed">
                <span className={cn("shrink-0 mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold h-fit", LEVEL_STYLE[a.level].chip)}>{a.metric}</span>
                <span>{a.t}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TrendCard history={data.history} limits={view.limits} />

      <UploadsSection data={data} days={days} onDays={setDays} />

      <TablesCard data={data} />

      <LimitsCard />

      <div className="rounded-2xl border border-purple-100 bg-surface/40 p-4 flex gap-3 text-[11px] text-gray-500 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          Chưa theo dõi được: băng thông (egress) của Supabase và mức dùng của Vercel — các nhà cung cấp này không cho ứng dụng đọc trực tiếp; xem ở trang <b>Usage</b> trong bảng điều khiển của họ. Số đo Supabase/Cloudinary được nhớ tối đa 10 phút; bấm “Đo lại” để đo ngay.
          {p ? ` Lần đo gần nhất: ${new Date(p.fetchedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}.` : ""}
        </p>
      </div>
    </div>
  );
}
