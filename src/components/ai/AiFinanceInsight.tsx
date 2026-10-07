"use client";

// Thẻ "AI nhận xét thu chi tháng MM/YYYY" (tác vụ finance.monthly_insight) — dành cho Thủ quỹ / người quản lý.
//  • Tự chạy MỘT lần khi mở (SWR theo tháng: chuyển tab qua lại không gọi lại); máy chủ còn cache 24 giờ theo nội dung
//    số liệu nên mở lại trang không tốn thêm lượt gọi. "Phân tích lại" lấy số liệu mới nhất (số liệu không đổi ⇒ dùng lại nhận xét đã lưu).
//  • Mọi con số trong bảng so sánh do MÁY CHỦ tính từ sổ quỹ — AI chỉ viết lời nhận xét.
//  • Tác vụ không dùng được ⇒ không hiện gì (riêng người quản lý AI thấy một dòng nhắc bật). Lỗi AI ⇒ một dòng thông báo nhỏ.
import React, { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { ApiClientError, errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import { formatVND } from "@/lib/utils";
import type { AiResultDto, FinanceInsightComparison } from "@/lib/types/ai";
import { AiChangeChip, AiInsightCard, AiInsightList, AiInsightSkeleton } from "./AiParts";

const TASK = "finance.monthly_insight" as const;
const FIN_PERMS = ["finance.ledger.read", "finance.expense.read_all", "finance.contribution.read_all"];

/** 'YYYY-MM' của hôm nay theo giờ Việt Nam (trước khi máy chủ trả kết quả). */
const thisMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(new Date());
const mmYyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const pctText = (c: FinanceInsightComparison) =>
  c.changePct === null ? (c.current === c.previous ? "0%" : "—") : `${c.changePct > 0 ? "+" : ""}${c.changePct.toLocaleString("vi-VN")}%`;

export default function AiFinanceInsight({ month }: { month?: string }) {
  const { showToast } = useApp();
  const { can } = useSession();
  const { available, status, reason } = useAiTask(TASK);
  const allowed = can("finance.summary.read") && can(FIN_PERMS);
  const [refreshing, setRefreshing] = useState(false);

  const key = available && allowed ? ["ai-insight", TASK, month ?? "current"] : null;
  const { data, error, mutate } = useSWR<AiResultDto<typeof TASK>>(key, () => aiApi.run(TASK, month ? { month } : {}), {
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
        AI nhận xét thu chi chưa dùng được{reason ? ` (${lowerFirst(reason.replace(/\.$/, ""))})` : ""} — bật trong{" "}
        <Link href="/cai-dat?tab=ai" className="font-semibold text-violet-600 hover:underline">
          Cài đặt → Trợ lý AI
        </Link>
        .
      </p>
    );
  }
  // Máy chủ từ chối quyền (vai trò vừa đổi) ⇒ ẩn hẳn thẻ.
  if (!data && error instanceof ApiClientError && error.status === 403) return null;

  const shownMonth = data?.output.month ?? month ?? thisMonth();
  const o = data?.output;

  const rerun = async () => {
    setRefreshing(true);
    try {
      const r = await aiApi.run(TASK, month ? { month } : {}, { force: true });
      await mutate(r, { revalidate: false });
      showToast("success", "Đã tạo lại nhận xét AI.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AiInsightCard
      icon={<Wallet className="w-5 h-5" />}
      title={`AI nhận xét thu chi tháng ${mmYyyy(shownMonth)}`}
      subtitle={
        o ? (
          <>
            So với tháng {mmYyyy(o.previousMonth)}
            {o.partial ? " · tháng chưa kết thúc, số liệu tính đến hôm nay" : ""} · số tiền lấy trực tiếp từ sổ quỹ
          </>
        ) : (
          "So với tháng trước · số tiền lấy trực tiếp từ sổ quỹ"
        )
      }
      result={data}
      onRefresh={data || error ? rerun : undefined}
      refreshing={refreshing}
      footer="Nhận xét do AI viết, chỉ để tham khảo — các con số do hệ thống tính."
    >
      {!data && !error && <AiInsightSkeleton />}
      {!data && error && (
        <p className="text-xs text-gray-500">
          Chưa lấy được nhận xét AI: {errorMessage(error)} Bạn vẫn xem đầy đủ số liệu thu chi ở trang này.
        </p>
      )}
      {o && (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-gray-900 text-sm leading-snug">{o.headline}</p>
            <p className="text-xs text-gray-600 leading-relaxed">{o.summary}</p>
          </div>

          {o.comparisons.length > 0 && (
            <>
              {/* Điện thoại: dạng thẻ */}
              <div className="sm:hidden flex flex-col gap-2">
                {o.comparisons.map((c) => (
                  <div key={c.label} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-800">{c.label}</span>
                      <AiChangeChip diff={c.current - c.previous} better={c.better} text={pctText(c)} />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-bold text-gray-900">{formatVND(c.current)}</span>
                      <span className="text-[11px] text-gray-400">
                        T{Number(o.previousMonth.slice(5, 7))}: {formatVND(c.previous)}
                      </span>
                    </div>
                    {c.comment && <p className="text-[11px] text-gray-500 leading-relaxed">{c.comment}</p>}
                  </div>
                ))}
              </div>
              {/* Máy tính bảng / máy tính: dạng bảng */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-semibold">Chỉ số</th>
                      <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Tháng {mmYyyy(o.month)}</th>
                      <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Tháng {mmYyyy(o.previousMonth)}</th>
                      <th className="py-2 px-3 font-semibold text-right">Thay đổi</th>
                      <th className="py-2 pl-3 font-semibold">Nhận xét</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.comparisons.map((c) => (
                      <tr key={c.label} className="border-b border-gray-50 last:border-0 align-top">
                        <td className="py-2 pr-3 font-semibold text-gray-800 whitespace-nowrap">{c.label}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatVND(c.current)}</td>
                        <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap">{formatVND(c.previous)}</td>
                        <td className="py-2 px-3 text-right">
                          <AiChangeChip diff={c.current - c.previous} better={c.better} text={pctText(c)} />
                        </td>
                        <td className="py-2 pl-3 text-gray-600 leading-relaxed min-w-[180px]">{c.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {(o.highlights.length > 0 || o.warnings.length > 0 || o.suggestions.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <AiInsightList title="Điểm nổi bật" items={o.highlights} tone="good" />
              <AiInsightList title="Cần lưu ý" items={o.warnings} tone="warn" />
              <AiInsightList title="Gợi ý" items={o.suggestions} tone="tip" />
            </div>
          )}
        </>
      )}
    </AiInsightCard>
  );
}
