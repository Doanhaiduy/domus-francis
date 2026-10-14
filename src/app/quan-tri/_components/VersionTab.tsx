"use client";

import React, { useEffect, useState } from "react";
import { GitCommitHorizontal, History, RefreshCw, Rocket, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANGELOG, CHANGE_LABEL, type ChangeKind } from "@/content/changelog";
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME, DEPLOY_ENV, DEPLOY_ENV_LABEL, formatReleaseDate, formatVnDateTime } from "@/lib/version";
import { Card } from "./StorageStats";

const KIND_STYLE: Record<ChangeKind, string> = {
  feat: "bg-emerald-50 text-emerald-700 border-emerald-100",
  improve: "bg-violet-50 text-violet-700 border-violet-100",
  fix: "bg-amber-50 text-amber-800 border-amber-100",
  ops: "bg-sky-50 text-sky-700 border-sky-100",
};

/** **chữ đậm** trong mô tả thay đổi. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <b key={i} className="font-bold text-gray-900">
            {part.slice(2, -2)}
          </b>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function Fact({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-low border border-purple-50 p-3.5 min-w-0">
      <div className="text-[11px] font-bold text-gray-500 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-extrabold text-gray-900 break-words">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-500 leading-snug">{hint}</div>}
    </div>
  );
}

/** Quản trị → Phiên bản & cập nhật: bản đang chạy (số phiên bản, thời điểm dựng, mã commit, môi trường) + lịch sử các lần cập nhật. */
export default function VersionTab() {
  const [shown, setShown] = useState(4);
  // Trình duyệt có thể còn giữ mã của bản cũ sau khi máy chủ đã cập nhật ⇒ so với bản máy chủ đang chạy để nhắc tải lại
  const [server, setServer] = useState<{ version: string | null; commit: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { version?: string | null; commit?: string | null }) => alive && setServer({ version: j.version ?? null, commit: j.commit ?? null }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const latest = CHANGELOG[0];
  const stale = !!server?.version && server.version !== APP_VERSION;
  const envLabel = DEPLOY_ENV_LABEL[DEPLOY_ENV] ?? DEPLOY_ENV;

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Phiên bản đang chạy"
        icon={<Rocket className="w-4 h-4 text-primary" />}
        right={<span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-extrabold font-mono">v{APP_VERSION}</span>}
      >
        {stale && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex flex-wrap items-center gap-3 text-xs text-amber-900" role="status">
            <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0 leading-relaxed">
              Máy chủ đã chạy bản <b>v{server?.version}</b> mới hơn bản trình duyệt đang giữ (v{APP_VERSION}). Tải lại trang để dùng bản mới.
            </span>
            <button type="button" onClick={() => window.location.reload()} className="px-3.5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition">
              Tải lại trang
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Fact icon={<Rocket className="w-3.5 h-3.5" />} label="Phiên bản" value={`v${APP_VERSION}`} hint={latest && latest.version === APP_VERSION ? latest.title : undefined} />
          <Fact icon={<History className="w-3.5 h-3.5" />} label="Cập nhật lần cuối" value={BUILD_TIME ? formatVnDateTime(BUILD_TIME) : latest ? formatReleaseDate(latest.date) : "—"} hint={BUILD_TIME ? "Thời điểm dựng bản này (giờ Việt Nam)" : "Theo ngày phát hành trong nhật ký"} />
          <Fact icon={<GitCommitHorizontal className="w-3.5 h-3.5" />} label="Mã commit" value={BUILD_COMMIT || "—"} hint={BUILD_COMMIT ? undefined : "Chỉ có khi dựng trên Vercel"} />
          <Fact icon={<Server className="w-3.5 h-3.5" />} label="Môi trường" value={envLabel} />
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Mỗi lần cập nhật ứng dụng đều tăng số phiên bản và ghi vào lịch sử bên dưới: sửa lỗi nhỏ tăng số cuối (1.7.<b>1</b>), thêm tính năng hoặc màn hình tăng số giữa (1.<b>8</b>.0), đổi lớn tăng số đầu (<b>2</b>.0.0).
        </p>
      </Card>

      <Card title="Lịch sử cập nhật" icon={<History className="w-4 h-4 text-primary" />} right={<span className="text-[11px] font-semibold text-gray-500">{CHANGELOG.length} bản phát hành</span>}>
        <ol className="relative flex flex-col gap-5 pl-5 border-l-2 border-purple-100">
          {CHANGELOG.slice(0, shown).map((r) => {
            const current = r.version === APP_VERSION;
            return (
              <li key={r.version} className="relative">
                <span className={cn("absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 border-white", current ? "bg-primary ring-4 ring-purple-100" : "bg-purple-300")} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono", current ? "bg-primary text-white" : "bg-purple-100 text-purple-700")}>v{r.version}</span>
                  <span className="text-xs font-semibold text-gray-500">{formatReleaseDate(r.date)}</span>
                  {current && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Đang chạy</span>}
                </div>
                <h4 className="mt-1.5 text-sm font-bold text-gray-900 leading-snug">{r.title}</h4>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {r.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                      <span className={cn("mt-0.5 shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] font-bold", KIND_STYLE[c.kind])}>{CHANGE_LABEL[c.kind]}</span>
                      <span className="min-w-0">
                        <Rich text={c.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
        {shown < CHANGELOG.length && (
          <button type="button" onClick={() => setShown(CHANGELOG.length)} className="self-start px-4 py-2 rounded-xl bg-surface-container-low hover:bg-purple-50 border border-purple-100 text-xs font-bold text-primary transition">
            Xem {CHANGELOG.length - shown} bản cũ hơn
          </button>
        )}
      </Card>
    </div>
  );
}
