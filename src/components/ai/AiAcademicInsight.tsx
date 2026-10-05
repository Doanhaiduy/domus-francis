"use client";

// Thẻ "AI nhận xét học tập":
//  • scope="self"  — điểm của CHÍNH người xem (tác vụ academic.insight). Cần đồng ý "Dùng AI nhận xét điểm học tập của tôi"
//    (ai_academic_summary) — chưa đồng ý thì chỉ hiện hộp giải thích, KHÔNG gửi gì đi. Chỉ gửi điểm trung bình/tín chỉ/số môn
//    theo học kỳ đã ẩn danh; nhận xét chỉ người đó đọc được. Có nút rút lại đồng ý ngay trên thẻ.
//  • scope="house" — tình hình học tập chung của nhà (tác vụ academic.house_insight, quyền academic.read_aggregate):
//    số liệu tổng hợp ẩn danh, bỏ học kỳ có dưới 3 bảng điểm.
// Tự chạy một lần khi mở (SWR, không gọi lại khi chuyển tab; máy chủ cache 24 giờ). Bảng so sánh và xu hướng do máy chủ tính.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { GraduationCap, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { ApiClientError, errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { AcademicInsightOutput, AcademicInsightRow, AiResultDto } from "@/lib/types/ai";
import { AiChangeChip, AiConsentNotice, AiInsightCard, AiInsightList, AiInsightSkeleton } from "./AiParts";

type Scope = "self" | "house";
const TASK_OF = { self: "academic.insight", house: "academic.house_insight" } as const;
const DISMISS_KEY = "luuxa.ai.academic_consent_later";

const TREND: Record<AcademicInsightOutput["trend"], { text: string; cls: string; Icon: typeof TrendingUp }> = {
  up: { text: "Đang tiến bộ", cls: "bg-emerald-50 text-emerald-700 border-emerald-100", Icon: TrendingUp },
  down: { text: "Giảm so với trước", cls: "bg-rose-50 text-rose-700 border-rose-100", Icon: TrendingDown },
  stable: { text: "Ổn định", cls: "bg-sky-50 text-sky-700 border-sky-100", Icon: Minus },
  unknown: { text: "Chưa đủ dữ liệu so sánh", cls: "bg-gray-50 text-gray-500 border-gray-100", Icon: HelpCircle },
};

const fmt = (v: number | null, d: number) => (v === null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const diffOf = (r: AcademicInsightRow) => (r.current === null || r.previous === null ? null : Math.round((r.current - r.previous) * 100) / 100);
const diffText = (r: AcademicInsightRow) => {
  const d = diffOf(r);
  return d === null ? "—" : `${d > 0 ? "+" : ""}${fmt(d, r.decimals)}`;
};

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AiAcademicInsight({ scope }: { scope: Scope }) {
  const task = TASK_OF[scope];
  const { showToast } = useApp();
  const { session, can } = useSession();
  const { available, needsConsent, status, reason, refresh } = useAiTask(task);
  const allowed = scope === "self" ? !!session?.member : can("academic.read_aggregate");
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(readDismissed()), []);

  // Chỉ tự chạy khi tác vụ dùng được VÀ (phạm vi toàn nhà hoặc đã đồng ý) — chưa đồng ý thì không gửi gì đi.
  const ready = allowed && available && (scope === "house" || !needsConsent);
  const key = ready ? ["ai-insight", task, scope === "self" ? session?.member?.id ?? "" : "house"] : null;
  const run = (force = false) =>
    scope === "self" ? aiApi.run("academic.insight", { scope: "self" }, { force }) : aiApi.run("academic.house_insight", {}, { force });
  const { data, error, mutate } = useSWR<AiResultDto<typeof task>>(key, () => run(), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
    dedupingInterval: 10 * 60_000,
  });

  if (!allowed || !status) return null;
  if (!available) {
    if (!status.canManage) return null;
    return (
      <p className="text-[11px] text-gray-400">
        AI nhận xét học tập {scope === "house" ? "toàn nhà " : ""}chưa dùng được{reason ? ` (${reason.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())})` : ""} — bật trong{" "}
        <Link href="/cai-dat?tab=ai" className="font-semibold text-violet-600 hover:underline">
          Cài đặt → Trợ lý AI
        </Link>
        .
      </p>
    );
  }
  if (!data && error instanceof ApiClientError && error.status === 403) return null;

  const title = scope === "self" ? "AI nhận xét kết quả học tập của bạn" : "AI nhận xét học tập toàn nhà";
  const subtitle =
    scope === "self"
      ? "So với năm học trước · chỉ bạn xem được nhận xét này"
      : "So với năm học trước · số liệu tổng hợp ẩn danh (học kỳ có từ 3 bảng điểm)";

  // Chưa đồng ý (chỉ phạm vi của tôi): hộp giải thích; "Để sau" ẩn thẻ tới khi mở lại trình duyệt.
  if (scope === "self" && needsConsent) {
    if (dismissed) return null;
    return (
      <AiInsightCard icon={<GraduationCap className="w-5 h-5" />} title={title} subtitle="AI có thể tóm tắt điểm các học kỳ và so sánh với năm học trước giúp bạn.">
        <AiConsentNotice
          purpose="ai_academic_summary"
          onDone={() => undefined}
          onCancel={() => {
            try {
              window.sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* trình duyệt chặn lưu trữ — chỉ ẩn trong lần xem này */
            }
            setDismissed(true);
          }}
        />
      </AiInsightCard>
    );
  }

  const rerun = async () => {
    setRefreshing(true);
    try {
      const r = await run(true);
      await mutate(r as AiResultDto<typeof task>, { revalidate: false });
      showToast("success", "Đã tạo lại nhận xét AI.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      await aiApi.setConsent(false, "ai_academic_summary");
      await mutate(undefined, { revalidate: false });
      await refresh();
      showToast("success", "Đã rút lại đồng ý — AI sẽ không nhận xét điểm của bạn nữa.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setWithdrawing(false);
    }
  };

  const o = data?.output;
  const trend = o ? TREND[o.trend] : null;
  const cmp = o?.compare ?? null;

  return (
    <AiInsightCard
      icon={<GraduationCap className="w-5 h-5" />}
      title={title}
      subtitle={subtitle}
      result={data}
      onRefresh={data || error ? rerun : undefined}
      refreshing={refreshing}
      footer="Nhận xét do AI viết, chỉ để tham khảo — điểm và xu hướng do hệ thống tính."
    >
      {!data && !error && <AiInsightSkeleton label="AI đang xem kết quả học tập…" />}
      {!data && error && <p className="text-xs text-gray-500">Chưa lấy được nhận xét AI: {errorMessage(error)}</p>}
      {o && trend && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${trend.cls}`}>
                <trend.Icon className="w-3 h-3" />
                {trend.text}
              </span>
            </div>
            <p className="font-bold text-gray-900 text-sm leading-snug">{o.headline}</p>
            <p className="text-xs text-gray-600 leading-relaxed">{o.summary}</p>
          </div>

          {cmp && (
            <>
              {/* Điện thoại: dạng thẻ */}
              <div className="sm:hidden flex flex-col gap-2">
                <p className="text-[11px] text-gray-500">
                  <b className="text-gray-700">{cmp.currentLabel}</b>
                  {cmp.previousLabel ? <> so với {cmp.previousLabel}</> : " (chưa có kỳ trước để so sánh)"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {cmp.rows.map((r) => (
                    <div key={r.label} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-2.5 flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] font-semibold text-gray-500 leading-tight">{r.label}</span>
                      <span className="text-sm font-bold text-gray-900">{fmt(r.current, r.decimals)}</span>
                      {cmp.previousLabel && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-gray-400">trước: {fmt(r.previous, r.decimals)}</span>
                          <AiChangeChip diff={diffOf(r)} better={r.better} text={diffText(r)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Máy tính bảng / máy tính: dạng bảng */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-semibold">Chỉ số</th>
                      <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">{cmp.currentLabel}</th>
                      {cmp.previousLabel && <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">{cmp.previousLabel}</th>}
                      {cmp.previousLabel && <th className="py-2 pl-3 font-semibold text-right">Thay đổi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cmp.rows.map((r) => (
                      <tr key={r.label} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3 font-semibold text-gray-800">{r.label}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">{fmt(r.current, r.decimals)}</td>
                        {cmp.previousLabel && <td className="py-2 px-3 text-right text-gray-500">{fmt(r.previous, r.decimals)}</td>}
                        {cmp.previousLabel && (
                          <td className="py-2 pl-3 text-right">
                            <AiChangeChip diff={diffOf(r)} better={r.better} text={diffText(r)} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {(o.points.length > 0 || o.suggestions.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <AiInsightList title="Nhận xét chính" items={o.points} tone="good" />
              <AiInsightList title="Gợi ý" items={o.suggestions} tone="tip" />
            </div>
          )}
        </>
      )}
      {scope === "self" && (data || error) && (
        <button
          type="button"
          onClick={withdraw}
          disabled={withdrawing}
          className="self-start text-[11px] font-semibold text-gray-400 hover:text-rose-600 disabled:opacity-60"
        >
          {withdrawing ? "Đang rút lại…" : "Rút lại đồng ý cho AI nhận xét điểm của tôi"}
        </button>
      )}
    </AiInsightCard>
  );
}
