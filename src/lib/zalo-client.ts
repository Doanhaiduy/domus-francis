"use client";
// Gửi văn bản vào nhóm Zalo của nhà bằng bot (thay cho nút "Sao chép Zalo"). Chỉ Admin / Trưởng nhà (setting.write) dùng được;
// tin được ghi chú "Thao tác bởi <tên>". Chưa gửi được (tắt tích hợp, chưa có token…) ⇒ tự sao chép nội dung để dán tay.
import { useState } from "react";
import { api, errorMessage } from "./api";
import { useApp } from "./store";
import { useSession } from "./session";
import { copyTextToClipboard } from "./zaloShare";

export function useZaloSend() {
  const { showToast } = useApp();
  const { can } = useSession();
  const [sending, setSending] = useState(false);
  const canSend = can("setting.write");

  /** Gửi `text`; trả về true nếu bot đã gửi. `okMessage` thay cho thông báo mặc định. */
  const send = async (text: string, okMessage = "Đã gửi vào nhóm Zalo bằng bot."): Promise<boolean> => {
    if (sending) return false;
    setSending(true);
    try {
      const r = await api.post<{ sent: boolean; reason?: string }>("/api/v1/integrations/zalo/send", { text });
      if (r.sent) {
        showToast("success", okMessage);
        return true;
      }
      const copied = await copyTextToClipboard(text);
      showToast("info", `Chưa gửi được qua bot: ${r.reason ?? "không rõ lý do"}.${copied ? " Đã sao chép nội dung — hãy dán (Ctrl+V) vào nhóm." : ""}`);
      return false;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setSending(false);
    }
  };

  return { canSend, sending, send };
}
