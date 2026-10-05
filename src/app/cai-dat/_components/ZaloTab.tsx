"use client";

// Tích hợp nhóm Zalo (thay cho Telegram): gửi tin tự động vào nhóm Zalo chung qua Zalo Bot.
// Bot Token nằm ở biến môi trường máy chủ ZALO_BOT_TOKEN — không lưu CSDL, không hiện ở trình duyệt.
import React, { useState } from "react";
import useSWR from "swr";
import { MessageCircle, Lock, CheckCircle2, AlertTriangle, Search, Send, ExternalLink, Info } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import type { SettingsDraft } from "./useSettingsDraft";
import { TextSetting, ToggleSetting } from "./SettingFields";
import { ZALO_EVENT_KEYS, ZALO_EVENT_LABEL, type ZaloEventKey } from "@/lib/types/settings";
import { FormCardsSkeleton } from "./TabSkeletons";

const EVENTS_KEY = "integration.zalo.group_events";
const ENABLED_KEY = "integration.zalo.group_enabled";
const CHAT_KEY = "integration.zalo.group_chat_id";
export const ZALO_KEYS = [ENABLED_KEY, CHAT_KEY, EVENTS_KEY];

interface ZaloStatus {
  tokenConfigured: boolean;
  enabled: boolean;
  chatId: string;
  bot: { ok: boolean; name?: string; error?: string } | null;
}
interface ZaloChats {
  ok: boolean;
  chats: { chatId: string; type: string | null; title: string | null; lastText: string | null }[];
  error?: string;
}

const EVENT_DESC: Record<ZaloEventKey, string> = {
  duty_week: "Khi Trưởng nhà xếp / sửa người trực của một tuần, bot gửi lịch vào nhóm",
  dues_reminder: "Khi Thủ quỹ/Trưởng nhà bấm “Nhắc nhóm Zalo” ở trang Thu chi, bot gửi danh sách chưa đóng + tài khoản nhận quỹ",
  facility_new: "Chuyển tiếp báo hỏng cơ sở vật chất mới vào nhóm ngay khi có người gửi",
};

export default function ZaloTab({ draft }: { draft: SettingsDraft }) {
  const { showToast } = useApp();
  const visible = !!draft.meta(CHAT_KEY);
  const { data: status, isLoading, mutate } = useSWR<ZaloStatus>(visible ? "/api/v1/integrations/zalo/status" : null, swrFetcher, { revalidateOnFocus: false });
  const [testing, setTesting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [chats, setChats] = useState<ZaloChats | null>(null);

  const enabled = draft.value<boolean>(ENABLED_KEY) === true;
  const chatId = draft.value<string>(CHAT_KEY) ?? "";
  const events = (draft.value<Record<string, boolean>>(EVENTS_KEY) ?? {}) as Record<string, boolean>;
  const unsaved = ZALO_KEYS.some((k) => draft.isDirty(k));

  if (!visible) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs">
        <div className="p-4 rounded-2xl bg-surface-container-low flex items-center gap-2.5 text-xs text-gray-700">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          Cấu hình Zalo chỉ hiển thị với người có quyền sửa cấu hình hệ thống (Admin, Trưởng nhà).
        </div>
      </div>
    );
  }
  if (isLoading && !status) return <FormCardsSkeleton cards={2} />;

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ sent: boolean; reason?: string }>("/api/v1/integrations/zalo/test", {});
      showToast(r.sent ? "success" : "warning", r.sent ? "Đã gửi tin thử vào nhóm Zalo — hãy kiểm tra nhóm." : r.reason ?? "Không gửi được.");
      void mutate();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const findChats = async () => {
    setFinding(true);
    try {
      setChats(await api.get<ZaloChats>("/api/v1/integrations/zalo/chats"));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tích hợp nhóm Zalo của nhà</h2>
              <p className="text-xs text-gray-500">Tự động gửi lịch trực, nhắc đóng quỹ và báo hỏng vào nhóm Zalo chung qua Zalo Bot</p>
            </div>
          </div>
          {status?.tokenConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold self-start sm:self-auto">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã có Bot Token{status.bot?.ok && status.bot.name ? ` · ${status.bot.name}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold self-start sm:self-auto">
              <AlertTriangle className="w-3.5 h-3.5" /> Chưa có Bot Token
            </span>
          )}
        </div>

        {status?.tokenConfigured && status.bot && !status.bot.ok && (
          <p className="text-xs text-rose-700 p-3 rounded-xl bg-rose-50 border border-rose-200">Zalo từ chối Bot Token: {status.bot.error}</p>
        )}

        <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 text-xs text-sky-900 leading-relaxed flex flex-col gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Info className="w-4 h-4" /> Cách thiết lập (làm một lần)
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Vào{" "}
              <a href="https://bot.zaloplatforms.com" target="_blank" rel="noreferrer" className="font-bold underline inline-flex items-center gap-0.5">
                bot.zaloplatforms.com <ExternalLink className="w-3 h-3" />
              </a>{" "}
              tạo một Zalo Bot, lấy <b>Bot Token</b>.
            </li>
            <li>
              Quản trị hệ thống đặt biến môi trường <code className="px-1 rounded bg-white border">ZALO_BOT_TOKEN</code> trên máy chủ (Vercel → Settings → Environment Variables) rồi triển khai lại.
            </li>
            <li>Thêm bot vào nhóm Zalo của nhà, rồi nhắn một câu trong nhóm (có thể cần nhắc tên bot).</li>
            <li>Bấm <b>“Dò nhóm”</b> bên dưới, chọn nhóm vừa nhắn để điền mã nhóm, bật công tắc và <b>Lưu</b>.</li>
            <li>Bấm <b>“Gửi tin thử”</b> để kiểm tra.</li>
          </ol>
          <p className="text-[11px] text-sky-800/80">
            Lưu ý: Zalo Bot Platform còn mới, khả năng gửi vào <i>nhóm</i> có thể bị giới hạn theo từng bot. Nếu không gửi được, các nút “Chép gửi Zalo” trong hệ thống vẫn
            sao chép sẵn nội dung để bạn dán vào nhóm bằng tay.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
          <ToggleSetting draft={draft} k={ENABLED_KEY} label="Gửi tin tự động vào nhóm Zalo" description="Công tắc tổng — tắt thì bot không gửi bất kỳ loại tin nào dưới đây" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <TextSetting draft={draft} k={CHAT_KEY} label="Mã nhóm Zalo (chat_id)" placeholder="Bấm “Dò nhóm” để lấy mã" />
          <div className="flex flex-wrap items-center gap-2 md:pt-6">
            <button
              onClick={findChats}
              disabled={finding || !status?.tokenConfigured}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 shadow-2xs transition disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" /> {finding ? "Đang nghe 15 giây…" : "Dò nhóm"}
            </button>
            <button
              onClick={sendTest}
              disabled={testing || !status?.tokenConfigured || !status?.chatId}
              title={!status?.chatId ? "Lưu mã nhóm trước khi gửi thử" : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-md shadow-sky-200 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> {testing ? "Đang gửi..." : "Gửi tin thử"}
            </button>
          </div>
        </div>
        {unsaved && <p className="-mt-3 text-[10.5px] text-amber-700">Bạn có thay đổi chưa lưu — “Gửi tin thử” dùng cấu hình ĐÃ LƯU; bấm “Lưu tất cả thay đổi” trước.</p>}

        {chats && (
          <div className="p-4 rounded-2xl border border-sky-100 bg-sky-50/40 flex flex-col gap-2">
            {!chats.ok ? (
              <p className="text-xs text-rose-700">Không dò được: {chats.error}</p>
            ) : chats.chats.length === 0 ? (
              <p className="text-xs text-gray-600">Chưa thấy tin nào. Bấm “Dò nhóm”, rồi <b>trong vòng 15 giây</b> nhắn một câu trong nhóm có bot (ví dụ “@tên bot xin chào”, nhắc đúng tên bot). Nếu bot không nhận được tin của nhóm, hãy thử nhắn riêng cho bot để kiểm tra kết nối.</p>
            ) : (
              chats.chats.map((c) => (
                <div key={c.chatId} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-gray-100">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">
                      {c.title ?? "(không có tên)"} <span className="font-medium text-gray-400">· {c.type ?? "?"}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate">{c.chatId}</div>
                    {c.lastText && <div className="text-[11px] text-gray-400 truncate">“{c.lastText}”</div>}
                  </div>
                  <button
                    onClick={() => {
                      draft.set(CHAT_KEY, c.chatId);
                      showToast("info", "Đã điền mã nhóm — nhớ bấm “Lưu tất cả thay đổi”.");
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold"
                  >
                    Dùng nhóm này
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-3">
          <h3 className="text-xs font-bold text-gray-800">Các loại tin tự động:</h3>
          {ZALO_EVENT_KEYS.map((k) => (
            <ToggleSetting
              key={k}
              draft={draft}
              k={EVENTS_KEY}
              checked={events[k] !== false}
              onChange={(x) => draft.set(EVENTS_KEY, { ...events, [k]: x })}
              label={ZALO_EVENT_LABEL[k]}
              description={EVENT_DESC[k]}
            />
          ))}
        </div>
        {enabled && !chatId && <p className="text-xs text-amber-700">Đã bật nhưng chưa có mã nhóm — bot chưa thể gửi.</p>}
      </div>
    </div>
  );
}
