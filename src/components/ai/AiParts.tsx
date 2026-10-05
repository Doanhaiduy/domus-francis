"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { AiResultDto, AiTaskCode } from "@/lib/types/ai";

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

/** Hỏi đồng ý ai_processing một lần (BR-AI-03): nội dung được gửi tới dịch vụ AI bên ngoài sau khi ẩn danh. */
export function AiConsentNotice({ onDone }: { onDone: () => void }) {
  const { showToast } = useApp();
  const { refresh } = useAiTask("community.policy_rag");
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await aiApi.setConsent(true);
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
        <p className="leading-relaxed">
          Để dùng AI, nội dung bạn nhập sẽ được <b>loại bỏ tên, email, số điện thoại</b> rồi gửi tới dịch vụ AI bên ngoài (Groq, dự phòng Gemini) để xử lý. Kết quả chỉ là
          <b> gợi ý</b>, bạn xem và quyết định. Bạn có thể rút lại đồng ý bất cứ lúc nào ở phần Cài đặt cá nhân.
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="self-start px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-60"
      >
        {busy ? "Đang lưu…" : "Tôi đồng ý dùng AI"}
      </button>
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
  const { available, needsConsent } = useAiTask(task);
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
      {askConsent && needsConsent && <AiConsentNotice onDone={() => setAskConsent(false)} />}
    </div>
  );
}
