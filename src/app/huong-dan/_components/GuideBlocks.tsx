"use client";

import React, { useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, Bell, Calendar, ChevronDown, ChevronRight, Church, GraduationCap, Home, Info, Lightbulb, LogIn, MessageCircle,
  Receipt, ScrollText, ShieldAlert, ShieldCheck, Settings, Sparkles, UtensilsCrossed, Users, Wallet, Wrench, HelpCircle,
} from "lucide-react";
import { Inline, MiniMarkdown } from "@/components/ui/MiniMarkdown";
import type { CalloutTone, GuideBlock, GuideIcon } from "@/content/guide";
import { cn } from "@/lib/utils";
import { DemoView } from "./GuideDemos";

export const ICONS: Record<GuideIcon, React.ComponentType<{ className?: string }>> = {
  start: LogIn, bell: Bell, calendar: Calendar, church: Church, wallet: Wallet, meal: UtensilsCrossed, wrench: Wrench, rules: ScrollText,
  users: Users, sparkles: Sparkles, shield: ShieldCheck, settings: Settings, zalo: MessageCircle, help: HelpCircle, school: GraduationCap,
  activity: Activity, home: Home, book: BookOpen, receipt: Receipt,
};

const TONE: Record<CalloutTone, { cls: string; icon: React.ReactNode; label: string }> = {
  tip: { cls: "bg-emerald-50/70 border-emerald-200 text-emerald-950", icon: <Lightbulb className="w-4 h-4 text-emerald-600" />, label: "Mẹo" },
  info: { cls: "bg-sky-50/70 border-sky-200 text-sky-950", icon: <Info className="w-4 h-4 text-sky-600" />, label: "Lưu ý" },
  warn: { cls: "bg-amber-50/80 border-amber-200 text-amber-950", icon: <AlertTriangle className="w-4 h-4 text-amber-600" />, label: "Chú ý" },
  danger: { cls: "bg-rose-50/70 border-rose-200 text-rose-950", icon: <ShieldAlert className="w-4 h-4 text-rose-600" />, label: "Quan trọng" },
};

/** "Vào đâu": đường dẫn menu dạng breadcrumb. */
export function PathCrumbs({ items, label }: { items: string[]; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
      {label && <span className="text-gray-400 mr-0.5">{label}:</span>}
      {items.map((p, i) => (
        <React.Fragment key={`${p}${i}`}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          <span className={cn("px-2 py-0.5 rounded-md border", i === items.length - 1 ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-200")}>{p}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Steps({ title, items }: { title?: string; items: Extract<GuideBlock, { t: "steps" }>["items"] }) {
  return (
    <div className="my-4">
      {title && <h4 className="text-sm font-extrabold text-gray-900 mb-3">{title}</h4>}
      <ol className="relative">
        {items.map((s, i) => (
          <li key={i} className="relative pl-11 pb-5 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 to-primary/10" />}
            <span className="absolute left-0 top-0 w-8 h-8 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center shadow-sm shadow-primary/30">{i + 1}</span>
            <p className="text-[13px] font-bold text-gray-900 leading-8">{s.title}</p>
            {s.path && <div className="mt-1"><PathCrumbs items={s.path} /></div>}
            {s.text && <p className="mt-1 text-[13px] text-gray-600 leading-relaxed"><Inline text={s.text} /></p>}
            {s.demo && <DemoView name={s.demo} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tabs({ tabs }: { tabs: Extract<GuideBlock, { t: "tabs" }>["tabs"] }) {
  const [i, setI] = useState(0);
  return (
    <div className="my-4 rounded-2xl border border-gray-100 overflow-hidden">
      <div role="tablist" className="flex gap-1 p-1.5 bg-surface-container-low overflow-x-auto">
        {tabs.map((t, n) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={i === n}
            onClick={() => setI(n)}
            className={cn("px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition", i === n ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3.5 sm:p-4"><Blocks blocks={tabs[i].blocks} /></div>
    </div>
  );
}

function Accordion({ items }: { items: Extract<GuideBlock, { t: "accordion" }>["items"] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="my-3 flex flex-col gap-2">
      {items.map((it, n) => {
        const on = open === n;
        return (
          <div key={it.title} className={cn("rounded-2xl border bg-white transition-colors", on ? "border-primary/30 shadow-xs" : "border-gray-100")}>
            <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : n)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black transition", on ? "bg-primary text-white" : "bg-gray-100 text-gray-500")}>{n + 1}</span>
              <span className="flex-1 text-[13px] font-bold text-gray-900">{it.title}</span>
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", on && "rotate-180 text-primary")} />
            </button>
            {on && <div className="px-4 pb-4 pt-0 border-t border-gray-50"><Blocks blocks={it.blocks} /></div>}
          </div>
        );
      })}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "md":
            return <MiniMarkdown key={i} source={b.text} />;
          case "heading":
            return <h3 key={i} className="text-base font-extrabold text-gray-900 mt-6 mb-2 first:mt-0">{b.text}</h3>;
          case "callout": {
            const t = TONE[b.tone];
            return (
              <div key={i} className={cn("my-3 flex gap-3 rounded-2xl border px-4 py-3", t.cls)}>
                <span className="mt-0.5 shrink-0">{t.icon}</span>
                <div className="min-w-0 text-[13px] leading-relaxed">
                  <p className="font-bold">{b.title ?? t.label}</p>
                  <p className="opacity-90"><Inline text={b.text} /></p>
                </div>
              </div>
            );
          }
          case "steps":
            return <Steps key={i} title={b.title} items={b.items} />;
          case "path":
            return <div key={i} className="my-2.5"><PathCrumbs items={b.items} label={b.label} /></div>;
          case "cards":
            return (
              <div key={i} className={cn("my-3 grid grid-cols-1 gap-3 sm:grid-cols-2", b.cols === 3 && "lg:grid-cols-3")}>
                {b.items.map((c) => {
                  const Icon = ICONS[c.icon];
                  return (
                    <div key={c.title} className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-surface-container-low/40 p-4">
                      <span className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center mb-2.5"><Icon className="w-4 h-4" /></span>
                      <p className="text-[13px] font-extrabold text-gray-900">{c.title}</p>
                      <p className="mt-1 text-xs text-gray-600 leading-relaxed"><Inline text={c.text} /></p>
                    </div>
                  );
                })}
              </div>
            );
          case "demo":
            return <DemoView key={i} name={b.name} caption={b.caption} />;
          case "table":
            return (
              <div key={i} className="my-3 overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-container-low text-left">
                      {b.head.map((h) => <th key={h} className="px-3.5 py-2.5 font-bold text-gray-700 whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, n) => (
                      <tr key={n} className="border-t border-gray-50 align-top">
                        {r.map((c, j) => <td key={j} className="px-3.5 py-2.5 text-gray-700 leading-relaxed"><Inline text={c} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "tabs":
            return <Tabs key={i} tabs={b.tabs} />;
          case "accordion":
            return <Accordion key={i} items={b.items} />;
        }
      })}
    </>
  );
}
