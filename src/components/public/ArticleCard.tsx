import React from "react";
import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatArticleDate, publicFileUrl } from "@/lib/articles-format";
import { articleCategoryLabel, type ArticleListItem } from "@/lib/types/articles";

const CATEGORY_STYLE: Record<string, { chip: string; cover: string }> = {
  "tuyen-sinh": { chip: "bg-purple-100 text-purple-800", cover: "from-[#5f3add] to-[#7857f8]" },
  "tin-tuc": { chip: "bg-sky-100 text-sky-800", cover: "from-sky-600 to-indigo-600" },
  "hoat-dong": { chip: "bg-emerald-100 text-emerald-800", cover: "from-emerald-600 to-teal-600" },
  "chia-se": { chip: "bg-amber-100 text-amber-800", cover: "from-amber-500 to-orange-600" },
  "thong-bao": { chip: "bg-rose-100 text-rose-800", cover: "from-rose-600 to-pink-600" },
};
export const categoryStyle = (code: string) => CATEGORY_STYLE[code] ?? CATEGORY_STYLE["tin-tuc"];

export function CategoryChip({ code, className }: { code: string; className?: string }) {
  return <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider", categoryStyle(code).chip, className)}>{articleCategoryLabel(code)}</span>;
}

/** Ảnh bìa; chưa có ảnh thì dùng nền gradient theo chuyên mục với chữ thập. */
export function Cover({ article, className, variant = "medium", priority = false }: { article: Pick<ArticleListItem, "coverFileId" | "category" | "title">; className?: string; variant?: "thumb" | "medium"; priority?: boolean }) {
  const src = publicFileUrl(article.coverFileId, variant);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading={priority ? "eager" : "lazy"} className={cn("w-full h-full object-cover", className)} />;
  }
  return (
    <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center text-white/90", categoryStyle(article.category).cover, className)} aria-hidden>
      <span className="text-5xl font-extrabold drop-shadow">✝</span>
    </div>
  );
}

export function ArticleMeta({ article, className }: { article: Pick<ArticleListItem, "publishedAt" | "readMinutes">; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-gray-500", className)}>
      {article.publishedAt && (
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" aria-hidden />{formatArticleDate(article.publishedAt)}</span>
      )}
      <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden />{article.readMinutes} phút đọc</span>
    </div>
  );
}

export function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <Link
      href={`/tin-tuc/${article.slug}`}
      className="group flex flex-col rounded-3xl bg-white border border-purple-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="aspect-[16/10] overflow-hidden bg-gray-100">
        <Cover article={article} variant="medium" className="group-hover:scale-105 transition-transform duration-500" />
      </div>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <CategoryChip code={article.category} className="self-start" />
        <h3 className="text-lg font-extrabold text-gray-900 leading-snug group-hover:text-primary transition-colors line-clamp-3">{article.title}</h3>
        {article.summary && <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{article.summary}</p>}
        <ArticleMeta article={article} className="mt-auto pt-1" />
      </div>
    </Link>
  );
}
