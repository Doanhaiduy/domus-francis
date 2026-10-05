"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, Lightbulb, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiStatus, useAiTask } from "@/lib/data/ai";
import type { AiConsentPurpose, AiResultDto, AiTaskCode } from "@/lib/types/ai";

/** Nhãn bắt buộc cạnh mọi nội dung do AI sinh (BR-AI-09). */
export function AiLabel({ result, className = "" }: { result?: Pick<AiResultDto, "provider" | "model" | "cached"> | null; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-bold ${className}`}>
      <Sparkles className="w-3 h-3" />
      AI gợi ý
      {result?.provider && <span className="font-medium text-violet-500">· {result.provider}{result.cached ? " · đã lưu" : ""}</span>}
    </span>
  );
}

/** Nội dung giải thích theo từng mục đích đồng ý (BR-AI-03): gửi gì, gửi tới đâu, ai thấy kết quả. */
const CONSENT_TEXT: Record<AiConsentPurpose, { body: React.ReactNode; button: string }> = {
  ai_processing: {
    body: (
      <>
        Để dùng AI, nội dung bạn nhập sẽ được <b>loại bỏ tên, email, số điện thoại</b> rồi gửi tới dịch vụ AI bên ngoài (Groq, dự phòng Gemini) để xử lý. Kết quả chỉ là
        <b> gợi ý</b>, bạn xem và quyết định. Bạn có thể rút lại đồng ý bất cứ lúc nào (nút “Rút đồng ý dùng AI” ở cuối cửa sổ Trợ lý AI).
      </>
    ),
    button: "Tôi đồng ý dùng AI",
  },
  ai_academic_summary: {
    body: (
      <>
        Để AI nhận xét kết quả học tập của bạn, hệ thống chỉ gửi <b>điểm trung bình, số tín chỉ và số môn theo từng học kỳ</b> — <b>đã ẩn danh</b> (không tên, không
        trường, không mã sinh viên, không tên môn) — tới dịch vụ AI bên ngoài (Groq, dự phòng Gemini). Nhận xét <b>chỉ hiển thị cho riêng bạn</b>, Ban điều hành không
        xem được. Bạn có thể rút lại đồng ý bất cứ lúc nào ngay tại thẻ nhận xét.
      </>
    ),
    button: "Đồng ý để AI nhận xét điểm của tôi",
  },
};

/** Hỏi đồng ý một mục đích AI (mặc định ai_processing) trước lần dùng đầu tiên (BR-AI-03). */
export function AiConsentNotice({ onDone, onCancel, purpose = "ai_processing" }: { onDone: () => void; onCancel?: () => void; purpose?: AiConsentPurpose }) {
  const { showToast } = useApp();
  const { mutate: refresh } = useAiStatus();
  const [busy, setBusy] = useState(false);
  const text = CONSENT_TEXT[purpose];
  const accept = async () => {
    setBusy(true);
    try {
      await aiApi.setConsent(true, purpose);
      await refresh();
      onDone();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3.5 text-xs text-gray-700 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">{text.body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-60"
        >
          {busy ? "Đang lưu…" : text.button}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="px-3 py-2 rounded-xl text-gray-500 hover:bg-white font-semibold">
            Để sau
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Nút "✨ Gợi ý bằng AI" dùng chung: tự ẩn khi tác vụ không dùng được (AI tắt, chưa cấu hình, không có quyền).
 * Chưa đồng ý ⇒ hiện hộp đồng ý trước. Lỗi/chặn ⇒ hiện thông báo tiếng Việt, người dùng vẫn nhập tay như thường.
 */
export function AiSuggestButton<C extends AiTaskCode>({
  task,
  label = "Gợi ý bằng AI",
  getInput,
  onResult,
  disabled,
  className = "",
}: {
  task: C;
  label?: string;
  /** Trả về đầu vào hoặc null (kèm toast) nếu chưa đủ dữ liệu. */
  getInput: () => import("@/lib/types/ai").AiInputMap[C] | null;
  onResult: (r: AiResultDto<C>) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { showToast } = useApp();
  const { available, needsConsent, consentPurpose } = useAiTask(task);
  const [busy, setBusy] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  if (!available) return null;

  const run = async () => {
    if (needsConsent) {
      setAskConsent(true);
      return;
    }
    const input = getInput();
    if (!input) return;
    setBusy(true);
    try {
      onResult(await aiApi.run(task, input));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 text-xs font-bold transition disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {busy ? "AI đang xử lý…" : label}
      </button>
      {askConsent && needsConsent && <AiConsentNotice purpose={consentPurpose ?? "ai_processing"} onDone={() => setAskConsent(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Khung dùng chung cho các thẻ "AI nhận xét" (thu chi theo tháng, học tập)
// ---------------------------------------------------------------------

/** Thẻ nhận xét AI: tiêu đề, nút "Phân tích lại", nhãn AI bắt buộc (BR-AI-09) và lời nhắc tham khảo ở chân thẻ. */
export function AiInsightCard({
  icon,
  title,
  subtitle,
  result,
  onRefresh,
  refreshing,
  footer = "Nhận xét do AI viết, chỉ để tham khảo.",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  result?: Pick<AiResultDto, "provider" | "model" | "cached" | "createdAt"> | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center">{icon}</div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-snug">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Tạo lại nhận xét mới (tốn một lượt AI). Nhận xét hiện tại được lưu 1 giờ."
            aria-label="Tạo lại nhận xét"
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 text-xs font-bold transition disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Đang tạo…" : "Tạo lại"}</span>
          </button>
        )}
      </div>
      {children}
      {result && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400">
          <AiLabel result={result} />
          <span>{footer}</span>
          {result.createdAt && (
            <span className="text-gray-400">
              · Tạo lúc {new Date(result.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} — lưu tạm 1 giờ, bấm “Tạo lại” để làm mới
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** Khung chờ trong lúc AI phân tích. */
export function AiInsightSkeleton({ label = "AI đang phân tích số liệu…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {label}
      </p>
      <div className="h-4 w-3/4 rounded-lg bg-gray-100 animate-pulse" />
      <div className="h-3 w-full rounded-lg bg-gray-100 animate-pulse" />
      <div className="h-3 w-5/6 rounded-lg bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-14 rounded-2xl bg-gray-50 border border-gray-100 animate-pulse ${i === 2 ? "hidden sm:block" : ""}`} />
        ))}
      </div>
    </div>
  );
}

/** Danh sách ý ngắn của nhận xét AI: điểm nổi bật / cần lưu ý / gợi ý. Rỗng ⇒ không hiện. */
export function AiInsightList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "warn" | "tip" }) {
  if (!items.length) return null;
  const t = {
    good: { Icon: CheckCircle2, icon: "text-emerald-600", box: "bg-emerald-50/50 border-emerald-100" },
    warn: { Icon: AlertTriangle, icon: "text-amber-600", box: "bg-amber-50/50 border-amber-100" },
    tip: { Icon: Lightbulb, icon: "text-violet-600", box: "bg-violet-50/50 border-violet-100" },
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 flex flex-col gap-1.5 min-w-0 ${t.box}`}>
      <p className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
        <t.Icon className={`w-3.5 h-3.5 shrink-0 ${t.icon}`} />
        {title}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((x, i) => (
          <li key={i} className="relative pl-4 text-xs text-gray-700 leading-relaxed break-words">
            <span className="absolute left-1 top-[0.6em] w-1 h-1 rounded-full bg-gray-400" />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chip thay đổi: xanh khi đi đúng chiều "tốt" (thu tăng, chi giảm…), đỏ khi ngược lại, xám khi không đổi/không tính được. */
export function AiChangeChip({ diff, better, text }: { diff: number | null; better: "up" | "down"; text: string }) {
  if (diff === null || diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold whitespace-nowrap">
        <Minus className="w-3 h-3" />
        {text}
      </span>
    );
  }
  const good = diff > 0 ? better === "up" : better === "down";
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
    >
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}
