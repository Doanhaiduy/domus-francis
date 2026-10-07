"use client";

// Trợ lý Lưu Xá (khung chat nổi, không che trang): hướng dẫn thao tác trong ứng dụng + hỏi đáp nội quy/thông báo/lịch.
// Chỉ trả lời từ hướng dẫn sử dụng, nội quy, thông báo và lịch mà chính người hỏi được xem; luôn trích nguồn; có nút mở đúng trang.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Send, Loader2, Bot, FileText, Megaphone, CalendarDays, BookOpen, RotateCcw, Maximize2, Minimize2, Copy, Check, ArrowUpRight, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { aiApi, useAiTask } from "@/lib/data/ai";
import type { PolicyRagOutput } from "@/lib/types/ai";
import { AiConsentNotice, AiLabel } from "@/components/ai/AiParts";
import { cn } from "@/lib/utils";

interface Turn {
  id: number;
  q: string;
  a?: PolicyRagOutput;
  provider?: string | null;
  error?: string;
}

const KIND_ICON = { policy: FileText, announcement: Megaphone, event: CalendarDays, guide: BookOpen } as const;
const KIND_LABEL = { policy: "Nội quy", announcement: "Thông báo", event: "Lịch", guide: "Hướng dẫn" } as const;
const MAX_TURNS = 20;

const GENERAL_SAMPLES = ["Cách bật thông báo đẩy trên điện thoại?", "Giờ giới nghiêm của nhà là mấy giờ?", "Làm sao đổi mật khẩu hoặc email đăng nhập?", "Tuần này có sự kiện gì?"];
const BY_PATH: [RegExp, string[]][] = [
  [/^\/xin-phep/, ["Cách gửi đơn xin phép vắng sự kiện?", "Đơn xin phép của tôi bị từ chối thì làm sao?"]],
  [/^\/thu-chi/, ["Cách đóng quỹ bằng mã QR?", "Tôi đã chuyển khoản, bấm gì để báo đã đóng?"]],
  [/^\/bep-com/, ["Cách đăng ký cơm và giờ chốt là mấy giờ?"]],
  [/^\/lich-su-kien/, ["Cách điểm danh sự kiện bằng ảnh?", "Làm sao báo mình sẽ có mặt hoặc vắng?"]],
  [/^\/hau-can/, ["Cách báo hỏng thiết bị trong nhà?", "Làm sao biết tuần này ai trực vệ sinh sân?"]],
  [/^\/phung-vu/, ["Tài liệu phụng vụ nằm ở đâu?", "Cách gửi ý cầu nguyện ẩn danh?"]],
  [/^\/cai-dat/, ["Cách bật thông báo đẩy trên iPhone?", "Cách đổi email đăng nhập?"]],
  [/^\/thanh-vien/, ["Cách xem và sửa hồ sơ của tôi?"]],
  [/^\/hoc-tap/, ["Cách nộp bảng điểm kèm ảnh minh chứng?"]],
  [/^\/thong-bao/, ["Xác nhận đã đọc thông báo là gì?", "Nội quy về khách đến thăm phòng?"]],
  [/^\/ky-luat/, ["Mình xem vi phạm và hình phạt của mình ở đâu?", "Hình phạt đang chấp hành là gì, khi nào kết thúc?"]],
  [/^\/bao-cao/, ["Cách xem tổng kết tháng của mình?", "Cách tải tổng kết ra Excel hoặc PDF?"]],
];

/** **đậm** → <b>; còn lại giữ nguyên chữ. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <b key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</b> : <React.Fragment key={i}>{part}</React.Fragment>))}
    </>
  );
}

/** Hiển thị câu trả lời: dòng "1. …" thành danh sách bước có số, dòng "- …" thành gạch đầu dòng, còn lại là đoạn văn. */
function RichAnswer({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks: { kind: "p" | "ol" | "ul"; items: string[] }[] = [];
  for (const l of lines) {
    const num = /^(\d+)[.)]\s+(.*)$/.exec(l);
    const bul = /^[-•*]\s+(.*)$/.exec(l);
    const kind = num ? "ol" : bul ? "ul" : "p";
    const body = num ? num[2] : bul ? bul[1] : l;
    const last = blocks[blocks.length - 1];
    if (kind !== "p" && last?.kind === kind) last.items.push(body);
    else blocks.push({ kind, items: [body] });
  }
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === "ol" ? (
          <ol key={i} className="space-y-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-extrabold flex items-center justify-center">{j + 1}</span>
                <span className="min-w-0"><Inline text={it} /></span>
              </li>
            ))}
          </ol>
        ) : b.kind === "ul" ? (
          <ul key={i} className="space-y-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" /><span className="min-w-0"><Inline text={it} /></span></li>
            ))}
          </ul>
        ) : (
          <p key={i}><Inline text={b.items[0]} /></p>
        ),
      )}
    </div>
  );
}

export default function AiAssistantModal() {
  const { closeModal, showToast } = useApp();
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { available, needsConsent, reason, refresh } = useAiTask("community.policy_rag");
  const storeKey = `luuxa-ai-chat:${session?.user.id ?? "anon"}`;

  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const [wide, setWide] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(1);

  // Khôi phục cuộc trò chuyện trong phiên (đóng/mở lại khung chat không mất nội dung)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw) as Turn[];
        if (Array.isArray(saved)) {
          setTurns(saved.filter((t) => t && typeof t.q === "string" && !!(t.a || t.error)).slice(-MAX_TURNS));
          seq.current = saved.reduce((m, t) => Math.max(m, t.id ?? 0), 0) + 1;
        }
      }
    } catch {
      // Không có sessionStorage (chế độ riêng tư…) — bỏ qua
    }
  }, [storeKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(turns.filter((t) => t.a || t.error).slice(-MAX_TURNS)));
    } catch {
      // bỏ qua
    }
  }, [turns, storeKey]);

  useEffect(() => {
    try {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ smooth scroll
    }
  }, [turns, busy]);

  // Ô nhập tự co giãn theo nội dung (tối đa ~5 dòng)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [q]);

  const samples = useMemo(() => {
    const ctx = BY_PATH.find(([re]) => re.test(pathname))?.[1] ?? [];
    return [...new Set([...ctx, ...GENERAL_SAMPLES])].slice(0, 4);
  }, [pathname]);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (question.length < 3 || busy) return;
      const id = seq.current++;
      // Gửi kèm tối đa 3 lượt gần nhất để trợ lý hiểu câu hỏi nối tiếp
      const history = turns
        .filter((t) => t.a)
        .slice(-3)
        .map((t) => ({ q: t.q.slice(0, 500), a: t.a!.answer.slice(0, 600) }));
      setQ("");
      setBusy(true);
      setTurns((t) => [...t, { id, q: question }].slice(-MAX_TURNS));
      try {
        const r = await aiApi.run("community.policy_rag", { question, history });
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, a: r.output, provider: r.provider } : x)));
      } catch (e) {
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: errorMessage(e) } : x)));
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, turns],
  );

  const reset = () => {
    setTurns([]);
    setQ("");
    try {
      sessionStorage.removeItem(storeKey);
    } catch {
      // bỏ qua
    }
    inputRef.current?.focus();
  };

  const go = (href: string) => {
    router.push(href);
    // Điện thoại: khung chat phủ kín màn hình ⇒ đóng để thấy trang vừa mở
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) closeModal();
  };

  const copy = async (t: Turn) => {
    if (!t.a) return;
    try {
      await navigator.clipboard.writeText(t.a.answer);
      setCopied(t.id);
      setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1500);
    } catch {
      showToast("error", "Không sao chép được — hãy bôi đen và chép thủ công.");
    }
  };

  const blocked = needsConsent && !consentDone;
  const canType = available && !blocked;

  return (
    <div
      role="dialog"
      aria-label="Trợ lý Lưu Xá"
      className={cn(
        "fixed z-[60] flex flex-col bg-white border border-purple-100 shadow-2xl shadow-violet-300/30 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200",
        // Điện thoại: phủ kín màn hình; máy tính: khung nổi góc phải dưới
        "inset-0 rounded-none md:inset-auto md:right-6 md:bottom-6 md:rounded-3xl",
        wide ? "md:w-[680px] md:h-[min(820px,calc(100vh-3rem))]" : "md:w-[420px] md:h-[min(660px,calc(100vh-3rem))]",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-gray-900 text-sm leading-tight">Trợ lý Lưu Xá</h3>
            <p className="text-[11px] text-gray-500 truncate">Hướng dẫn thao tác · nội quy · lịch sinh hoạt</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {turns.length > 0 && (
            <button onClick={reset} className="p-2 rounded-xl hover:bg-white/80 text-gray-500" title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setWide((w) => !w)} className="hidden md:inline-flex p-2 rounded-xl hover:bg-white/80 text-gray-500" title={wide ? "Thu nhỏ" : "Mở rộng"} aria-label={wide ? "Thu nhỏ" : "Mở rộng"}>
            {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={closeModal} className="p-2 rounded-xl hover:bg-white/80 text-gray-500" title="Đóng (Esc)" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4 custom-scroll">
        {!available && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
            Trợ lý AI hiện chưa dùng được{reason ? `: ${reason}` : "."} Bạn vẫn xem được hướng dẫn ở mục <b>Hướng dẫn sử dụng</b> và nội quy ở <b>Thông báo</b>.
          </div>
        )}
        {available && blocked && <AiConsentNotice onDone={() => setConsentDone(true)} />}

        {canType && turns.length === 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-surface-container-low text-xs text-gray-700 leading-relaxed">
              <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p>
                Chào bạn! Mình giúp bạn <b>làm quen cách dùng ứng dụng</b> (đăng ký cơm, xin phép, đóng quỹ, bật thông báo…), tra <b>nội quy</b> và xem <b>lịch sinh hoạt</b>. Mình chỉ trả lời từ tài liệu của nhà và luôn ghi nguồn.
              </p>
            </div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thử hỏi</p>
            <div className="flex flex-col gap-2">
              {samples.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-left px-3.5 py-2.5 rounded-xl border border-purple-100 bg-white hover:bg-purple-50 text-xs font-medium text-gray-700 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="flex flex-col gap-2">
            <div className="self-end max-w-[88%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-white text-xs font-medium whitespace-pre-wrap break-words">{t.q}</div>
            {t.a && (
              <div className="self-start max-w-[96%] px-3.5 py-3 rounded-2xl rounded-bl-md bg-surface-container-low text-xs text-gray-800 flex flex-col gap-2.5">
                <RichAnswer text={t.a.answer} />
                {!t.a.confident && t.a.sources.length > 0 && <p className="text-[11px] text-amber-700">Mình chưa chắc chắn hoàn toàn — hãy xác nhận lại với người quản lý nếu việc quan trọng.</p>}
                {t.a.actions && t.a.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {t.a.actions.map((a) => (
                      <button key={a.href} onClick={() => go(a.href)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-white text-[11px] font-bold hover:bg-primary-container transition active:scale-95">
                        {a.label} <ArrowUpRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
                {t.a.sources && Array.isArray(t.a.sources) && t.a.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {t.a.sources.map((s, idx) => {
                      const Icon = (s?.kind && KIND_ICON[s.kind as keyof typeof KIND_ICON]) || FileText;
                      const kind = s?.kind ? KIND_LABEL[s.kind as keyof typeof KIND_LABEL] : null;
                      return (
                        <span key={s?.label || idx} title={kind ? `${kind}: ${s?.title}` : s?.title} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-[10px] font-semibold text-gray-600 max-w-full">
                          <Icon className="w-3 h-3 shrink-0" /> <span className="truncate">{s?.title || s?.label || "Nguồn"}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {t.provider ? <AiLabel result={{ provider: t.provider as "groq" | "gemini", model: null, cached: false }} className="self-start" /> : <span />}
                  <button onClick={() => copy(t)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-primary" title="Sao chép câu trả lời">
                    {copied === t.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />} {copied === t.id ? "Đã chép" : "Sao chép"}
                  </button>
                </div>
              </div>
            )}
            {t.error && (
              <div className="self-start max-w-[96%] px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex flex-col gap-1.5">
                <span>{t.error}</span>
                <button onClick={() => { setTurns((all) => all.filter((x) => x.id !== t.id)); void ask(t.q); }} className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline">
                  <RotateCcw className="w-3 h-3" /> Thử lại
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="self-start flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-surface-container-low text-xs text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tìm trong hướng dẫn và nội quy…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex items-end gap-2 px-3 pt-3 pb-2 border-t border-gray-100 bg-white"
      >
        <textarea
          ref={inputRef}
          value={q}
          rows={1}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter gửi, Shift+Enter xuống dòng (không gửi khi đang gõ tiếng Việt bằng bộ gõ)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask(q);
            }
          }}
          maxLength={500}
          disabled={!canType}
          placeholder={canType ? "Hỏi cách thao tác, nội quy, lịch…" : "Chưa dùng được"}
          aria-label="Câu hỏi cho trợ lý"
          className="flex-1 resize-none px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-transparent focus:border-primary focus:bg-white text-xs font-medium focus:outline-none disabled:opacity-60 max-h-[120px]"
        />
        <button
          type="submit"
          disabled={busy || !canType || q.trim().length < 3}
          className="p-2.5 rounded-xl bg-primary hover:bg-primary-container text-white disabled:opacity-50 transition shrink-0"
          title="Gửi (Enter)"
          aria-label="Gửi"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      <div className="px-4 pb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] text-gray-400">AI trả lời chỉ để tham khảo · Enter gửi, Shift+Enter xuống dòng. Đừng nhập thông tin cá nhân của người khác.</p>
        {available && !needsConsent && (
          <button
            type="button"
            onClick={async () => {
              try {
                await aiApi.setConsent(false);
                await refresh();
                setConsentDone(false);
                showToast("info", "Đã rút đồng ý — AI sẽ không xử lý nội dung của bạn nữa.");
              } catch (e) {
                showToast("error", errorMessage(e));
              }
            }}
            className="text-[10px] font-semibold text-gray-400 hover:text-rose-600 underline"
          >
            Rút đồng ý dùng AI
          </button>
        )}
      </div>
    </div>
  );
}
