"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpen, Download, Link2, Loader2, Search, Users, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import {
  GUIDE_AUDIENCE_LABEL, GUIDE_INTRO, GUIDE_QUICK, GUIDE_ROLES, GUIDE_SECTIONS,
  type GuideAudience, type GuideBlock, type GuideSection,
} from "@/content/guide";
import { cn } from "@/lib/utils";
import { Inline } from "@/components/ui/MiniMarkdown";
import { Blocks, ICONS } from "./_components/GuideBlocks";

const SYSTEM_ROLES = new Set(["admin", "house_head", "treasurer", "member"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

function blockText(b: GuideBlock): string {
  switch (b.t) {
    case "md": return b.text;
    case "heading": return b.text;
    case "callout": return `${b.title ?? ""} ${b.text}`;
    case "steps": return `${b.title ?? ""} ${b.items.map((i) => `${i.title} ${i.text ?? ""} ${(i.path ?? []).join(" ")}`).join(" ")}`;
    case "path": return b.items.join(" ");
    case "cards": return b.items.map((c) => `${c.title} ${c.text}`).join(" ");
    case "demo": return b.caption ?? "";
    case "table": return [...b.head, ...b.rows.flat()].join(" ");
    case "tabs": return b.tabs.map((t) => `${t.label} ${t.blocks.map(blockText).join(" ")}`).join(" ");
    case "accordion": return b.items.map((i) => `${i.title} ${i.blocks.map(blockText).join(" ")}`).join(" ");
  }
}
const sectionText = (s: GuideSection) => norm(`${s.title} ${s.summary} ${s.blocks.map(blockText).join(" ")}`.replace(/[*`]/g, ""));

/** Hướng dẫn sử dụng theo vai trò — mặc định chỉ hiện phần dành cho vai trò của người đang xem. */
export default function HuongDanPage() {
  const { session } = useSession();
  const { showToast } = useApp();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(GUIDE_SECTIONS[0].id);
  const [showTop, setShowTop] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const mine = useMemo(() => {
    const set = new Set<GuideAudience>(["all"]);
    for (const r of session?.roles ?? []) set.add(SYSTEM_ROLES.has(r) ? (r as GuideAudience) : "custom");
    if (!session?.roles?.length) set.add("member");
    return set;
  }, [session?.roles]);
  const myLabels = [...mine].filter((a) => a !== "all").map((a) => GUIDE_AUDIENCE_LABEL[a]);

  const index = useMemo(() => GUIDE_SECTIONS.map((s) => ({ s, text: sectionText(s) })), []);
  const q = norm(query.trim());
  const sections = useMemo(
    () => index.filter(({ s, text }) => (q ? text.includes(q) : showAll || s.audience.some((a) => mine.has(a)))).map(({ s }) => s),
    [index, q, showAll, mine],
  );

  // Scrollspy: mục nào đang ở gần đầu màn hình thì sáng trong mục lục
  const ids = sections.map((s) => s.id).join("|");
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Liên kết sâu /huong-dan#dong-quy: mở đúng mục (kể cả mục của vai trò khác) rồi cuộn tới
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !GUIDE_SECTIONS.some((s) => s.id === id)) return;
    setShowAll(true);
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 250);
    return () => clearTimeout(t);
  }, []);

  // Phím "/" để tìm nhanh
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const list = GUIDE_SECTIONS.filter((s) => showAll || s.audience.some((a) => mine.has(a)));
      const { downloadGuidePdf } = await import("@/lib/pdf/guide");
      await downloadGuidePdf(list, showAll ? "Mọi vai trò" : myLabels.join(", ") || "Thành viên");
      showToast("success", `Đã tải PDF hướng dẫn (${list.length} mục).`);
    } catch (e) {
      console.error(e);
      showToast("error", "Không thể tạo PDF. Vui lòng thử lại!");
    } finally {
      setPdfBusy(false);
    }
  };

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };
  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/huong-dan#${id}`);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* trình duyệt chặn clipboard — bỏ qua */
    }
  };

  const quick = GUIDE_QUICK.filter((x) => GUIDE_SECTIONS.some((s) => s.id === x.target));

  return (
    <div className="flex flex-col w-full gap-6 pb-16">
      {/* HERO */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-indigo-500 text-white p-5 sm:p-8">
        <div aria-hidden className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="absolute right-24 -bottom-16 w-48 h-48 rounded-full bg-fuchsia-300/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><BookOpen className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Hướng dẫn sử dụng</h1>
              <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-xl"><Inline text={GUIDE_INTRO} /></p>
            </div>
          </div>
          <button
            onClick={downloadPdf}
            disabled={pdfBusy}
            title={showAll ? "Tải PDF hướng dẫn cho mọi vai trò" : "Tải PDF hướng dẫn cho vai trò của bạn"}
            className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-primary hover:bg-white/90 text-xs font-bold shadow-sm disabled:opacity-70 print:hidden"
          >
            {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{pdfBusy ? "Đang tạo PDF…" : "Tải PDF"}</span>
          </button>
        </div>

        <div className="relative mt-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm hướng dẫn (vd. đóng quỹ, Zalo)"
              aria-label="Tìm trong hướng dẫn"
              className="w-full h-11 pl-10 pr-20 rounded-2xl bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30"
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label="Xóa tìm kiếm" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            ) : (
              <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-[10px] font-mono font-bold text-gray-400">/</kbd>
            )}
          </div>
          <div className="inline-flex p-1 rounded-2xl bg-white/15 backdrop-blur self-start sm:self-auto shrink-0">
            <button onClick={() => setShowAll(false)} className={cn("px-3.5 py-2 rounded-xl text-xs font-bold transition", !showAll ? "bg-white text-primary shadow" : "text-white/90 hover:bg-white/10")}>Của tôi</button>
            <button onClick={() => setShowAll(true)} className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition", showAll ? "bg-white text-primary shadow" : "text-white/90 hover:bg-white/10")}>
              <Users className="w-3.5 h-3.5" /> Mọi vai trò
            </button>
          </div>
        </div>
        <p className="relative mt-3 text-[11px] text-white/80">
          {q ? `${sections.length} mục khớp “${query.trim()}” (tìm trong mọi vai trò).` : showAll ? "Đang xem hướng dẫn cho mọi vai trò." : `Dành cho bạn: ${myLabels.join(", ") || "Thành viên"}.`}
        </p>
      </header>

      {/* BẮT ĐẦU NHANH + VAI TRÒ */}
      {!q && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quick.map((c) => {
              const Icon = ICONS[c.icon];
              return (
                <button key={c.title} onClick={() => go(c.target)} className="group text-left rounded-2xl bg-white border border-purple-50 shadow-xs p-4 hover:border-primary/40 hover:shadow-md transition">
                  <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center mb-2.5 group-hover:bg-primary group-hover:text-white transition"><Icon className="w-4 h-4" /></span>
                  <p className="text-[13px] font-extrabold text-gray-900">{c.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{c.text}</p>
                </button>
              );
            })}
          </div>

          <details className="group rounded-2xl bg-white border border-purple-50 shadow-xs">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 text-[13px] font-bold text-gray-900">
              Các vai trò trong ứng dụng
              <span className="text-[11px] font-semibold text-gray-400 group-open:hidden">Xem</span>
              <span className="text-[11px] font-semibold text-gray-400 hidden group-open:inline">Thu gọn</span>
            </summary>
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GUIDE_ROLES.map((r) => (
                <div key={r.role} className={cn("rounded-xl border px-3.5 py-2.5", mine.has(r.role) ? "border-primary/30 bg-purple-50/50" : "border-gray-100")}>
                  <p className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">{r.title}{mine.has(r.role) && r.role !== "all" && <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold">Bạn</span>}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {/* MỤC LỤC (điện thoại): thanh chip cuộn ngang, dính đầu trang */}
      <nav aria-label="Mục lục" className="lg:hidden sticky top-14 z-20 -mx-1 px-1 py-2 bg-surface/90 backdrop-blur overflow-x-auto flex gap-2 print:hidden">
        {sections.map((s) => (
          <button key={s.id} onClick={() => go(s.id)} className={cn("shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition", active === s.id ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200")}>
            {s.title.split(":")[0]}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-6 items-start">
        {/* MỤC LỤC (máy tính) */}
        <aside className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto print:hidden">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">Mục lục</p>
          <nav className="flex flex-col gap-0.5 border-l border-gray-100">
            {sections.map((s) => {
              const Icon = ICONS[s.icon];
              const on = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  className={cn("-ml-px flex items-center gap-2 pl-3 pr-2 py-2 text-left text-xs font-semibold border-l-2 transition", on ? "border-primary text-primary bg-purple-50/60" : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300")}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="leading-snug">{s.title.split(":")[0]}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* NỘI DUNG */}
        <div className="flex flex-col gap-5 min-w-0">
          {sections.length === 0 && (
            <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-gray-200">
              <p className="text-sm font-bold text-gray-700">Không tìm thấy mục nào khớp “{query.trim()}”.</p>
              <p className="text-xs text-gray-500 mt-1">Thử từ khóa ngắn hơn, ví dụ “quỹ”, “cơm”, “Zalo”.</p>
              <button onClick={() => setQuery("")} className="mt-3 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold">Xóa tìm kiếm</button>
            </div>
          )}
          {sections.map((s) => {
            const Icon = ICONS[s.icon];
            return (
              <section key={s.id} id={s.id} className="scroll-mt-28 bg-white rounded-3xl p-4 sm:p-7 border border-purple-50 shadow-xs">
                <div className="flex items-start gap-3.5 mb-4 pb-4 border-b border-gray-50">
                  <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 text-primary flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 leading-snug">{s.title}</h2>
                      {s.audience.filter((a) => a !== "all").map((a) => (
                        <span key={a} className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold">{GUIDE_AUDIENCE_LABEL[a]}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{s.summary}</p>
                  </div>
                  <button onClick={() => copyLink(s.id)} title="Sao chép liên kết tới mục này" aria-label="Sao chép liên kết" className="shrink-0 w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary flex items-center justify-center print:hidden">
                    {copied === s.id ? <span className="text-[10px] font-bold text-emerald-600">Đã chép</span> : <Link2 className="w-4 h-4" />}
                  </button>
                </div>
                <Blocks blocks={s.blocks} />
              </section>
            );
          })}
        </div>
      </div>

      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Lên đầu trang" className="fixed bottom-20 lg:bottom-6 right-4 z-30 w-10 h-10 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition print:hidden">
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
