"use client";

import React, { useState } from "react";
import { Send, WifiOff, Lock, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { settingsApi } from "@/lib/data/settings";
import type { TelegramTestDto } from "@/lib/types/settings";
import type { SettingsDraft } from "./useSettingsDraft";
import { TextSetting, ToggleSetting } from "./SettingFields";

const EVENTS_KEY = "integration.telegram.group_events";
const ENABLED_KEY = "integration.telegram.group_enabled";
const CHAT_KEY = "integration.telegram.group_chat_id";
export const TELEGRAM_KEYS = [ENABLED_KEY, CHAT_KEY, EVENTS_KEY];

const minus = (hhmm: string | undefined, mins: number) => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) - mins;
  const x = (t + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

export default function TelegramTab({ draft }: { draft: SettingsDraft }) {
  const { showToast } = useApp();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TelegramTestDto | null>(null);

  const visible = !!draft.meta(CHAT_KEY);
  const enabled = draft.value<boolean>(ENABLED_KEY) === true;
  const chatId = draft.value<string>(CHAT_KEY) ?? "";
  const events = (draft.value<Record<string, boolean>>(EVENTS_KEY) ?? {}) as Record<string, boolean>;
  const setEvent = (k: string, on: boolean) => draft.set(EVENTS_KEY, { ...events, [k]: on });
  const unsaved = TELEGRAM_KEYS.some((k) => draft.isDirty(k));

  const lunch = draft.value<string>("meal.lunch_cutoff_time") ?? "09:00";
  const dinner = draft.value<string>("meal.dinner_cutoff_time") ?? "15:00";
  const prayer = draft.value<string>("liturgy.night_prayer_time");
  const prayerRemind = minus(prayer, 15);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await settingsApi.telegramTest();
      setResult(r);
      showToast("info", "Chế độ local: không có tin nhắn nào được gửi ra Telegram — xem bản xem trước bên dưới.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tích hợp Bot Telegram Lưu Xá</h2>
              <p className="text-xs text-gray-500">Tự động hóa thông báo điểm danh cơm, phân chia ca trực, thông báo khẩn và nhắc giờ kinh tối</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold self-start sm:self-auto">
            <WifiOff className="w-3.5 h-3.5" />
            Chế độ local · không gửi ra ngoài
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          <b>Hệ thống đang chạy ở chế độ LOCAL.</b> Mọi kết nối ra Internet — kể cả Telegram Bot API — đều bị tắt, nên bot sẽ không gửi tin nhắn nào.
          Bạn vẫn có thể lưu cấu hình nhóm và các công tắc tự động bên dưới; chúng sẽ có hiệu lực khi hệ thống được triển khai với kết nối mạng và Bot
          Token ở cấu hình máy chủ.
        </div>

        {!visible ? (
          <div className="p-4 rounded-2xl bg-surface-container-low flex items-center gap-2.5 text-xs text-gray-700">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            Cấu hình Telegram chỉ hiển thị với người có quyền sửa cấu hình hệ thống (Admin, Trưởng nhà).
          </div>
        ) : (
          <>
            <div className="p-4 rounded-2xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-bold text-xl shadow-xs">🤖</div>
                <div>
                  <div className="text-xs font-bold text-gray-900">Bot thông báo nhóm chung lưu xá</div>
                  <div className="text-[11px] text-gray-500">
                    Chat ID: {chatId || "chưa cấu hình"} · {enabled ? "Đã bật gửi tin nhóm" : "Đang tắt gửi tin nhóm"} · Không kết nối (local)
                  </div>
                </div>
              </div>
              <button
                onClick={runTest}
                disabled={testing}
                className="px-4 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 shadow-2xs transition disabled:opacity-60"
                title="Kiểm tra cấu hình đã lưu và xem trước nội dung — không gửi gì ra ngoài"
              >
                {testing ? "Đang kiểm tra..." : "Kiểm tra gửi tin nhắn Bot"}
              </button>
            </div>

            {unsaved && (
              <p className="-mt-3 text-[10.5px] text-amber-700">
                Bạn có thay đổi chưa lưu — “Kiểm tra” dùng cấu hình ĐÃ LƯU; bấm “Lưu tất cả thay đổi” trước.
              </p>
            )}

            {result && (
              <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/40 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 text-xs text-blue-900">
                    <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <b>Không gửi (chế độ local).</b> {result.reason}
                    </span>
                  </div>
                  <button onClick={() => setResult(null)} className="p-1 rounded-lg text-gray-400 hover:bg-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <h4 className="text-[11px] font-bold text-gray-700">Kiểm tra cấu hình đã lưu</h4>
                    {result.problems.map((p, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-[2px]" />
                        {p}
                      </p>
                    ))}
                    {result.enabled && result.chatId && result.activeEvents.length > 0 && (
                      <p className="flex items-start gap-1.5 text-[11px] text-emerald-700">
                        <CheckCircle2 className="w-3 h-3 shrink-0 mt-[2px]" /> Cấu hình nhóm đầy đủ.
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-gray-700 mb-1.5">Bản xem trước tin nhắn</h4>
                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap bg-white rounded-xl border border-gray-100 p-3 text-gray-800 font-sans">
                      {result.preview}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <CustomInput
                  label="Bot Token"
                  type="password"
                  value=""
                  placeholder="Không lưu trong CSDL"
                  disabled
                  className="bg-gray-50 cursor-not-allowed"
                />
                <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-gray-500">
                  <Lock className="w-3 h-3 mt-[1px] shrink-0" />
                  Theo thiết kế, Bot Token là bí mật ở cấu hình máy chủ (biến môi trường), không có khóa cấu hình trong CSDL nên không nhập ở đây. Bản
                  cài đặt local không dùng token.
                </p>
              </div>
              <TextSetting draft={draft} k={CHAT_KEY} label="Group Chat ID" placeholder="VD: -1001928471920 hoặc @ten_kenh" />
            </div>

            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
              <ToggleSetting
                draft={draft}
                k={ENABLED_KEY}
                label="Gửi tin tự động vào nhóm Telegram chung"
                description="Công tắc tổng — tắt thì bot không gửi bất kỳ loại tin nào dưới đây"
              />
            </div>

            <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-gray-800">Các kịch bản tự động hóa đang kích hoạt:</h3>
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.duty_morning === true}
                onChange={(x) => setEvent("duty_morning", x)}
                label="Nhắc nhở ca trực cổng và chuẩn bị nấu ăn sáng"
                description="Gửi tin nhắn đầu ca sáng nêu tên các anh em trong ca trực nhật"
              />
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.meal_summary === true}
                onChange={(x) => setEvent("meal_summary", x)}
                label={`Báo cáo chốt danh sách cơm trưa (${lunch}) & cơm tối (${dinner})`}
                description="Báo số lượng suất ăn cụ thể để ban ẩm thực chuẩn bị nguyên liệu đi chợ"
              />
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.facility_new === true}
                onChange={(x) => setEvent("facility_new", x)}
                label="Cảnh báo sự cố hỏng hóc cơ sở vật chất mới"
                description="Chuyển tiếp báo cáo hư hỏng từ anh em tới Ban Hậu Cần ngay khi gửi"
              />
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.night_prayer === true}
                onChange={(x) => setEvent("night_prayer", x)}
                label="Nhắc giờ kinh tối chung trước 15 phút"
                description={
                  prayerRemind
                    ? `Chuông nhắc nhở anh em thu xếp việc học để cùng quy tụ về nguyện đường lúc ${prayerRemind} (Kinh Tối ${prayer})`
                    : "Chuông nhắc nhở anh em thu xếp việc học để cùng quy tụ về nguyện đường"
                }
              />
              <ToggleSetting
                draft={draft}
                k={EVENTS_KEY}
                checked={events.dues_reminder === true}
                onChange={(x) => setEvent("dues_reminder", x)}
                label="Nhắc đóng quỹ hàng tháng"
                description="Cùng công tắc với mục “nhắc đóng quỹ qua Telegram” ở tab Cấu hình chung"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
