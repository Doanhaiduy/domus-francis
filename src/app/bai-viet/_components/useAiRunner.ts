"use client";
// Gọi một tác vụ AI (tra cứu, tạo ảnh, chú thích…): lỗi (hết hạn mức, AI tắt, mạng…) hiện thành thông báo tiếng Việt và trả null.
import { useCallback, useState } from "react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { AiInputMap, AiResultDto, AiTaskCode } from "@/lib/types/ai";

export function useAiRunner<C extends AiTaskCode>(code: C) {
  const { showToast } = useApp();
  const { available, reason, task } = useAiTask(code);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (input: AiInputMap[C], force = false): Promise<AiResultDto<C> | null> => {
      setBusy(true);
      try {
        return await aiApi.run(code, input, { force });
      } catch (e) {
        showToast("error", errorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [code, showToast]
  );
  return { available, reason, enabledTask: !!task?.enabled, busy, run };
}
