"use client";

// Tích hợp nhóm Zalo (thay cho Telegram): gửi tin tự động vào nhóm Zalo chung qua Zalo Bot.
// Bot Token nằm ở biến môi trường máy chủ ZALO_BOT_TOKEN — không lưu CSDL, không hiện ở trình duyệt.
import React, { useRef, useState } from "react";
import useSWR from "swr";
import { MessageCircle, Lock, CheckCircle2, AlertTriangle, Search, Send, ExternalLink, Info } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import type { SettingsDraft } from "./useSettingsDraft";
import { TextSetting, ToggleSetting } from "./SettingFields";
import { ZALO_EVENT_KEYS, ZALO_EVENT_LABEL, zaloEventOn, type ZaloEventKey } from "@/lib/types/settings";
import { FormCardsSkeleton } from "./TabSkeletons";
import { ZALO_TEMPLATES, renderTemplate, sampleVars, templateFor, validateTemplate } from "@/lib/zalo-templates";
import { ChevronDown, RotateCcw } from "lucide-react";

const CHAT_RE = /^[A-Za-z0-9._:-]{3,100}$/;
const EVENTS_KEY = "integration.zalo.group_events";
const ENABLED_KEY = "integration.zalo.group_enabled";
const CHAT_KEY = "integration.zalo.group_chat_id";
const TEMPLATES_KEY = "integration.zalo.templates";
export const ZALO_KEYS = [ENABLED_KEY, CHAT_KEY, EVENTS_KEY, TEMPLATES_KEY];

interface ZaloStatus {
  tokenConfigured: boolean;
  enabled: boolean;
  chatId: string;
  bot: { ok: boolean; name?: string; error?: string } | null;
}
interface DailyPreview {
  slot: "morning" | "evening";
  date: string;
  dry: boolean;
  items: { key: string; event: string; text: string; status: string; inApp: boolean; reason?: string }[];
  notes: string[];
}
const STATUS_TEXT: Record<string, string> = { planned: "Sẽ gửi", sent: "Đã gửi", not_sent: "Chưa gửi được", duplicate: "Đã gửi trước đó" };

interface ZaloChats {
  ok: boolean;
  chats: { chatId: string; type: string | null; title: string | null; lastText: string | null }[];
  error?: string;
  webhook?: string | null;
  raw?: string;
}

const EVENT_DESC: Record<ZaloEventKey, string> = {
  duty_week: "Khi Trưởng nhà xếp / sửa người trực của một tuần, bot gửi lịch vào nhóm",
  dues_reminder: "Khi Thủ quỹ/Trưởng nhà bấm “Nhắc nhóm Zalo” ở trang Thu chi, bot gửi danh sách chưa đóng + tài khoản nhận quỹ",
  facility_new: "Chuyển tiếp báo hỏng cơ sở vật chất mới vào nhóm ngay khi có người gửi",
  liturgy: "Báo trước lễ trọng, Bổn mạng, ngày đặc biệt của nhà (7h sáng hằng ngày)",
  announcement: "Khi đăng thông báo, tick “Đăng cả vào nhóm Zalo” để gửi kèm",
  event_new: "Khi tạo sự kiện, tick “Báo cả nhà” để gửi kèm vào nhóm",
  event_reminder: "7h sáng: nhắc các sự kiện diễn ra hôm nay và ngày mai",
  reminder_schedule: "Các lịch nhắc lặp hằng tuần bạn tạo ở tab “Nhắc lịch”",
  room_change: "Khi Trưởng nhà chuyển / xếp phòng cho một thành viên (mặc định tắt)",
  member_joined: "Khi đơn xin vào nhà được duyệt (mặc định tắt)",
  birthday: "7h sáng ngày sinh nhật của thành viên (theo ngày/tháng sinh trong hồ sơ, không nêu tuổi)",
};

/** Một mẫu tin: sửa văn bản, chèn biến, xem trước bằng dữ liệu mẫu, khôi phục mặc định. */
function TemplateRow({ draft, k }: { draft: SettingsDraft; k: ZaloEventKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const templates = (draft.value<Record<string, string>>(TEMPLATES_KEY) ?? {}) as Record<string, string>;
  const def = ZALO_TEMPLATES[k];
  const current = templateFor(templates, k);
  const custom = typeof templates[k] === "string" && templates[k].trim() !== "" && templates[k] !== def.default;
  const error = validateTemplate(k, current);
  const writable = !!draft.meta(TEMPLATES_KEY)?.canWrite;

  const set = (text: string) => {
    const next = { ...templates };
    if (text.trim() === "" || text === def.default) delete next[k];
    else next[k] = text;
    draft.set(TEMPLATES_KEY, next);
  };
  const insert = (name: string) => {
    const el = ref.current;
    const token = `{${name}}`;
    if (!el) return set(current + token);
    const a = el.selectionStart ?? current.length;
    const b = el.selectionEnd ?? current.length;
    set(current.slice(0, a) + token + current.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-gray-900 truncate">{ZALO_EVENT_LABEL[k]}</span>
          <span className="block text-[11px] text-gray-400 truncate">{current.split("\n")[0]}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {custom && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">Đã tùy chỉnh</span>}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-gray-50">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-700">Mẫu tin</label>
            <textarea
              ref={ref}
              value={current}
              disabled={!writable}
              onChange={(e) => set(e.target.value)}
              rows={Math.min(14, Math.max(5, current.split("\n").length + 1))}
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary disabled:bg-gray-50"
            />
            {error && <p className="text-[11px] text-rose-600">{error}</p>}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-1.5">Biến có thể chèn (bấm để thêm vào chỗ con trỏ)</p>
              <div className="flex flex-wrap gap-1.5">
                {def.placeholders.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    disabled={!writable}
                    onClick={() => insert(p.name)}
                    title={p.desc}
                    className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-primary text-[11px] font-mono font-bold disabled:opacity-50"
                  >
                    {`{${p.name}}`}
                  </button>
                ))}
              </div>
              <ul className="mt-2 space-y-0.5">
                {def.placeholders.map((p) => (
                  <li key={p.name} className="text-[10.5px] text-gray-500">
                    <code className="font-bold text-gray-700">{`{${p.name}}`}</code> — {p.desc}
                  </li>
                ))}
              </ul>
              <p className="text-[10.5px] text-gray-400 mt-2">Dòng nào chỉ có biến rỗng sẽ tự bị bỏ. Cuối mỗi tin hệ thống tự thêm “— Thao tác bởi &lt;tên&gt;” hoặc “— 🤖 Tin tự động của hệ thống”.</p>
            </div>
            {custom && (
              <button type="button" onClick={() => set(def.default)} disabled={!writable} className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                <RotateCcw className="w-3 h-3" /> Khôi phục mẫu mặc định
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-700">Xem trước (dữ liệu mẫu)</label>
            <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap bg-sky-50/50 border border-sky-100 rounded-xl p-3 font-sans text-gray-800">
              {renderTemplate(current, sampleVars(k))}
              {"\n— Thao tác bởi Văn Đức"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ZaloTab({ draft }: { draft: SettingsDraft }) {
  const { showToast } = useApp();
  const visible = !!draft.meta(CHAT_KEY);
  const { data: status, isLoading, mutate } = useSWR<ZaloStatus>(visible ? "/api/v1/integrations/zalo/status" : null, swrFetcher, { revalidateOnFocus: false });
  const [testing, setTesting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [chats, setChats] = useState<ZaloChats | null>(null);
  const [daily, setDaily] = useState<DailyPreview | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const runDaily = async (slot: "morning" | "evening", dry: boolean) => {
    setRunning(`${slot}:${dry}`);
    try {
      setDaily(await api.post<DailyPreview>("/api/v1/integrations/cron/run", { slot, dry }));
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setRunning(null);
    }
  };

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
      const r = await api.post<{ sent: boolean; reason?: string }>("/api/v1/integrations/zalo/test", { chatId: chatId.trim() });
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
            Lưu ý: Zalo Bot Platform còn mới, khả năng gửi vào <i>nhóm</i> có thể bị giới hạn theo từng bot. Nếu không gửi được, các nút “Gửi nhóm Zalo” trong hệ thống tự
            sao chép sẵn nội dung để bạn dán vào nhóm bằng tay.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
          <ToggleSetting draft={draft} k={ENABLED_KEY} label="Gửi tin tự động vào nhóm Zalo" description="Công tắc tổng — tắt thì bot không gửi bất kỳ loại tin nào dưới đây" />
        </div>

        <div className="flex flex-col gap-3">
          <TextSetting draft={draft} k={CHAT_KEY} label="Mã nhóm Zalo (chat_id)" placeholder="Bấm “Dò nhóm” để lấy mã" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={findChats}
              disabled={finding || !status?.tokenConfigured}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 shadow-2xs transition disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" /> {finding ? "Đang nghe 15 giây…" : "Dò nhóm"}
            </button>
            <button
              onClick={sendTest}
              disabled={testing || !status?.tokenConfigured || !CHAT_RE.test(chatId.trim())}
              title={!CHAT_RE.test(chatId.trim()) ? "Nhập hoặc chọn mã nhóm hợp lệ trước khi gửi thử" : "Gửi một tin thử tới mã nhóm đang nhập (không cần lưu trước)"}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-md shadow-sky-200 transition disabled:opacity-50 disabled:shadow-none"
            >
              <Send className="w-3.5 h-3.5" /> {testing ? "Đang gửi..." : "Gửi tin thử"}
            </button>
            {unsaved && <span className="text-[11px] text-amber-700">Có thay đổi chưa lưu — nhớ bấm “Lưu tất cả thay đổi”.</span>}
          </div>
        </div>

        {chats && (
          <div className="p-4 rounded-2xl border border-sky-100 bg-sky-50/40 flex flex-col gap-2">
            {!chats.ok ? (
              <p className="text-xs text-rose-700">Không dò được: {chats.error}</p>
            ) : chats.webhook ? (
              <p className="text-xs text-amber-800">Bot này đang dùng <b>webhook</b> ({chats.webhook}) nên không dò bằng cách này được — hãy tắt webhook của bot trong Zalo Bot Creator rồi dò lại.</p>
            ) : chats.raw ? (
              <p className="text-xs text-gray-700 break-all">Bot nhận được dữ liệu nhưng không đọc ra mã nhóm. Gửi dòng này cho người hỗ trợ: <code>{chats.raw}</code></p>
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
              checked={zaloEventOn(events, k)}
              onChange={(x) => draft.set(EVENTS_KEY, { ...events, [k]: x })}
              label={ZALO_EVENT_LABEL[k]}
              description={EVENT_DESC[k]}
            />
          ))}
        </div>
        {enabled && !chatId && <p className="text-xs text-amber-700">Đã bật nhưng chưa có mã nhóm — bot chưa thể gửi.</p>}

        <div className="p-4 rounded-2xl bg-surface-container-low/60 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-bold text-gray-800">Mẫu tin nhắn</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Chỉnh nội dung từng loại tin gửi vào nhóm. Chọn một loại để sửa; thay đổi có hiệu lực sau khi bấm “Lưu tất cả thay đổi”.</p>
          </div>
          {draft.errorOf(TEMPLATES_KEY) && <p className="text-[11px] text-rose-600">{draft.errorOf(TEMPLATES_KEY)}</p>}
          {ZALO_EVENT_KEYS.map((k) => (
            <TemplateRow key={k} draft={draft} k={k} />
          ))}
        </div>

        <div className="p-4 rounded-2xl border border-amber-100 bg-amber-50/40 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-bold text-gray-800">Tác vụ tự động hằng ngày</h3>
            <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">
              Vercel chạy hai tác vụ mỗi ngày: <b>7:00 sáng</b> (nhắc lễ, nhắc quỹ sắp/quá hạn, sự kiện hôm nay &amp; ngày mai, lịch nhắc lặp, đầu tuần đăng lịch trực) và <b>19:00 tối</b>
              (nhắc check-in đi lễ, lịch nhắc lặp buổi tối). Cần biến môi trường <code className="px-1 rounded bg-white border">CRON_SECRET</code> trên Vercel. Bấm “Xem trước” để biết hôm nay sẽ gửi những gì (không gửi thật).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => runDaily("morning", true)} disabled={!!running} className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 disabled:opacity-50">
              {running === "morning:true" ? "Đang xem…" : "Xem trước buổi sáng"}
            </button>
            <button onClick={() => runDaily("evening", true)} disabled={!!running} className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-800 disabled:opacity-50">
              {running === "evening:true" ? "Đang xem…" : "Xem trước buổi tối"}
            </button>
            <button
              onClick={() => confirm("Chạy thật tác vụ buổi sáng ngay bây giờ? Các tin đã gửi hôm nay sẽ không gửi lại.") && runDaily("morning", false)}
              disabled={!!running}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {running === "morning:false" ? "Đang chạy…" : "Chạy thật ngay (sáng)"}
            </button>
          </div>
          {daily && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold text-gray-700">
                {daily.dry ? "Xem trước" : "Kết quả chạy"} · {daily.slot === "morning" ? "buổi sáng" : "buổi tối"} · {daily.date}
              </p>
              {daily.items.length === 0 && <p className="text-xs text-gray-500">Hôm nay không có tin nào cần gửi.</p>}
              {daily.items.map((it, i) => (
                <div key={i} className="p-3 rounded-xl bg-white border border-gray-100">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">{ZALO_EVENT_LABEL[it.event as ZaloEventKey] ?? it.event}</span>
                    <span className="text-[10px] font-semibold text-gray-500">{STATUS_TEXT[it.status] ?? it.status}{it.inApp ? " · kèm thông báo trong ứng dụng" : ""}</span>
                  </div>
                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-gray-800">{it.text}</pre>
                  {it.reason && <p className="text-[10.5px] text-amber-700 mt-1">{it.reason}</p>}
                </div>
              ))}
              {daily.notes.map((n, i) => (
                <p key={i} className="text-[10.5px] text-gray-500">• {n}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
