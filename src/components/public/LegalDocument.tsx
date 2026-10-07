import React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, Info, ListTree, MapPin, Phone, ShieldCheck, ScrollText, TriangleAlert } from "lucide-react";
import { LEGAL_PATHS, LEGAL_UPDATED, LEGAL_VERSION, type LegalBlock, type LegalDoc } from "@/content/legal";
import type { PublicOrgInfo } from "@/lib/types/articles";
import { cn } from "@/lib/utils";
import { PublicHeader } from "./PublicHeader";
import { PageHero } from "./PageHero";
import { ArticleMarkdown } from "./ArticleMarkdown";
import { PrintButton } from "./PrintButton";

// Trang văn bản pháp lý công khai (Chính sách bảo mật, Điều khoản sử dụng): đầu trang tím + chip phiên bản, mục lục cố định bên trái,
// hộp "Tóm tắt nhanh", các mục đánh số, bảng (thành thẻ trên điện thoại), thẻ liên hệ lấy từ thông tin lưu xá. Server Component.

const SAFE_HREF = /^(\/(?!\/)|https:\/\/|mailto:|tel:)/i;

/** Ô bảng: hỗ trợ **đậm**, `mã`, [chữ](liên kết). */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `i${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-bold text-gray-900">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="px-1.5 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono break-all">{t.slice(1, -1)}</code>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const href = mm[2].trim();
      out.push(
        SAFE_HREF.test(href) ? (
          <a key={k} href={href} className="text-primary font-semibold underline underline-offset-4 decoration-primary/40 hover:decoration-primary" {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {mm[1]}
          </a>
        ) : (
          mm[1]
        )
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function LegalTable({ head, rows, widths }: { head: string[]; rows: string[][]; widths?: string[] }) {
  return (
    <>
      {/* Máy tính / máy tính bảng: bảng */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-purple-100 bg-white">
        <table className="w-full text-[13.5px] leading-relaxed text-left">
          <thead className="bg-purple-50 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={cn("px-4 py-3", widths?.[i])}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-50">
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                {r.map((c, j) => (
                  <td key={j} className="px-4 py-3 text-gray-700">{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Điện thoại: mỗi dòng thành một thẻ */}
      <div className="sm:hidden space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl border border-purple-100 bg-white p-4 space-y-2.5">
            <p className="text-sm font-bold text-gray-900 leading-snug">{inline(r[0])}</p>
            {r.slice(1).map((c, j) => (
              <div key={j}>
                <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-gray-400">{head[j + 1]}</p>
                <p className="text-sm text-gray-700 leading-relaxed mt-0.5">{inline(c)}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function ContactCard({ org }: { org: PublicOrgInfo }) {
  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-5 sm:p-6 not-prose">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Đầu mối tiếp nhận</p>
      <p className="mt-1 text-base font-extrabold text-gray-900">{org.houseName}</p>
      <p className="text-sm text-gray-500">Người quản lý lưu xá</p>
      <ul className="mt-4 space-y-3 text-sm text-gray-700">
        {org.address && (
          <li className="flex gap-2.5">
            <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
            <span>{org.address}</span>
          </li>
        )}
        {org.phone && (
          <li className="flex gap-2.5">
            <Phone className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
            <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="font-bold text-gray-900 hover:text-primary">{org.phone}</a>
          </li>
        )}
      </ul>
      <Link href="/lien-he" className="no-print mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
        Gửi yêu cầu qua biểu mẫu <ArrowRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  );
}

function Block({ b, org }: { b: LegalBlock; org: PublicOrgInfo }) {
  switch (b.t) {
    case "md":
      return <ArticleMarkdown source={b.text} size="legal" />;
    case "table":
      return <LegalTable head={b.head} rows={b.rows} widths={b.widths} />;
    case "callout": {
      const warn = b.tone === "warn";
      const Icon = warn ? TriangleAlert : Info;
      return (
        <div role="note" className={cn("flex gap-3 rounded-2xl border p-4", warn ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-purple-50 border-purple-100 text-gray-700")}>
          <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", warn ? "text-amber-600" : "text-primary")} aria-hidden />
          <div className="min-w-0">
            {b.title && <p className="font-bold text-gray-900 mb-0.5">{b.title}</p>}
            <ArticleMarkdown source={b.text} size="legal" className="[&>p]:my-0" />
          </div>
        </div>
      );
    }
    case "contact":
      return <ContactCard org={org} />;
  }
}

const OTHER: Record<"privacy" | "terms", { href: string; title: string; blurb: string }> = {
  privacy: { href: LEGAL_PATHS.terms, title: "Điều khoản sử dụng", blurb: "Quy tắc khi dùng trang web và ứng dụng: tài khoản, quỹ chung, nội dung, trách nhiệm." },
  terms: { href: LEGAL_PATHS.privacy, title: "Chính sách bảo mật", blurb: "Dữ liệu nào được thu thập, dùng vào việc gì, bảo vệ ra sao và quyền của bạn." },
};

export function LegalDocument({ doc, org, donationEnabled, current }: { doc: LegalDoc; org: PublicOrgInfo; donationEnabled?: boolean; current: "privacy" | "terms" }) {
  const other = OTHER[current];
  const toc = (
    <ol className="space-y-0.5 text-sm">
      {doc.sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="flex gap-2.5 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-purple-50 hover:text-primary transition">
            <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
            <span className="font-medium leading-snug">{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <PublicHeader org={org} donationEnabled={donationEnabled} />
      <PageHero eyebrow="Pháp lý" title={doc.title} subtitle={doc.subtitle}>
        <ul className="mt-6 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Thông tin văn bản">
          <li className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><FileText className="w-3.5 h-3.5" aria-hidden />Phiên bản {LEGAL_VERSION}</li>
          <li className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><CalendarDays className="w-3.5 h-3.5" aria-hidden />Cập nhật {LEGAL_UPDATED}</li>
          <li className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1"><ShieldCheck className="w-3.5 h-3.5" aria-hidden />Có hiệu lực từ {LEGAL_UPDATED}</li>
        </ul>
      </PageHero>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14 items-start print:block">
        <aside className="no-print mb-8 lg:mb-0 lg:sticky lg:top-24 space-y-4">
          {/* Điện thoại: mục lục thu gọn */}
          <details className="lg:hidden rounded-2xl border border-purple-100 bg-white p-1 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900">
              <ListTree className="w-4 h-4 text-primary" aria-hidden /> Mục lục
            </summary>
            <nav aria-label="Mục lục" className="px-1 pb-2">{toc}</nav>
          </details>
          {/* Máy tính: mục lục cố định bên trái */}
          <nav aria-label="Mục lục" className="hidden lg:block max-h-[calc(100vh-14rem)] overflow-y-auto pr-1 custom-scroll">
            <p className="px-2.5 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Mục lục</p>
            {toc}
          </nav>
          <div className="flex flex-col gap-2.5">
            <PrintButton className="w-full lg:w-auto" />
            <Link href={other.href} className="group rounded-2xl border border-purple-100 bg-white p-3.5 hover:border-purple-300 transition">
              <span className="flex items-center gap-2 text-sm font-bold text-gray-900 group-hover:text-primary">
                <ScrollText className="w-4 h-4 text-primary" aria-hidden /> {other.title}
                <ArrowRight className="w-4 h-4 ml-auto text-gray-400 group-hover:text-primary" aria-hidden />
              </span>
              <span className="mt-1 block text-xs text-gray-500 leading-relaxed">{other.blurb}</span>
            </Link>
          </div>
        </aside>

        <article className="min-w-0">
          <section aria-labelledby="tom-tat" className="rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white p-5 sm:p-7">
            <h2 id="tom-tat" className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
              <ShieldCheck className="w-5 h-5 text-primary" aria-hidden /> Tóm tắt nhanh
            </h2>
            <p className="mt-1 text-xs text-gray-500">Những ý chính bằng lời dễ hiểu. Nội dung đầy đủ và có giá trị áp dụng là các mục bên dưới.</p>
            <ul className="mt-4 space-y-2.5">
              {doc.summary.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-gray-700">
                  <CheckCircle2 className="w-[18px] h-[18px] text-primary shrink-0 mt-[3px]" aria-hidden />
                  <span>{inline(s)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-10 space-y-12">
            {doc.sections.map((s, i) => (
              <section key={s.id} aria-labelledby={s.id} className="scroll-mt-28 break-inside-avoid-page">
                <h2 id={s.id} className="flex items-baseline gap-3 text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 leading-snug">
                  <span className="text-primary/70 tabular-nums">{i + 1}.</span>
                  <span>{s.title}</span>
                </h2>
                <div className="mt-4 space-y-4">
                  {s.blocks.map((b, j) => (
                    <Block key={j} b={b} org={org} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-purple-100 pt-5 text-xs text-gray-400">
            {org.houseName} · Phiên bản {LEGAL_VERSION} · Cập nhật lần cuối {LEGAL_UPDATED}.
          </p>
        </article>
      </div>
    </>
  );
}
