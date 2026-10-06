"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Eye, EyeOff, Globe, Link2, Newspaper, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage, fileUrl } from "@/lib/api";
import { articlesApi, useArticles } from "@/lib/data/articles";
import { formatArticleDate } from "@/lib/articles-format";
import { ARTICLE_CATEGORIES, articleCategoryLabel, type ArticleListItem, type ArticleStatus } from "@/lib/types/articles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryChip } from "@/components/public/ArticleCard";
import { cn } from "@/lib/utils";

type Filter = "all" | ArticleStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "published", label: "Đã đăng" },
  { value: "draft", label: "Bản nháp" },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function ArticlesAdminPage() {
  const { showToast } = useApp();
  const { can, isLoading: sessionLoading } = useSession();
  const allowed = can("article.manage");
  const { articles, isLoading } = useArticles(allowed);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string>("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ArticleListItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(
    () => ({ all: articles.length, published: articles.filter((a) => a.status === "published").length, draft: articles.filter((a) => a.status === "draft").length }),
    [articles]
  );
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return articles.filter((a) => (filter === "all" || a.status === filter) && (!category || a.category === category) && (!q || fold(a.title).includes(q)));
  }, [articles, filter, category, query]);

  const run = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(id);
    try {
      await fn();
      showToast("success", okMsg);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (a: ArticleListItem) => {
    const url = `${window.location.origin}/tin-tuc/${a.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(a.id);
      setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 2000);
      showToast("success", "Đã chép liên kết công khai — dán vào Zalo, Facebook… để chia sẻ.");
    } catch {
      showToast("info", url);
    }
  };

  if (!sessionLoading && !allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center bg-white border border-purple-100 rounded-3xl p-10">
        <Newspaper className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-900">Bạn chưa có quyền quản lý bài viết công khai</p>
        <p className="text-sm text-gray-500 mt-1">Liên hệ Trưởng nhà hoặc Admin để được cấp quyền.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-primary" /> Bài viết công khai
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Viết bài tuyển sinh, tin tức, hoạt động… Bài đã đăng có <b>đường link công khai</b> — ai cũng xem được, không cần đăng nhập.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/tin-tuc" target="_blank" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary transition">
            <ExternalLink className="w-3.5 h-3.5" /> Xem trang công khai
          </Link>
          <Link href="/bai-viet/moi" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95">
            <Plus className="w-4 h-4" /> Viết bài mới
          </Link>
        </div>
      </div>

      {/* BỘ LỌC */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition", filter === f.value ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}
            >
              {f.label} <span className="text-[10px] opacity-70">{counts[f.value]}</span>
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
          aria-label="Lọc theo chuyên mục"
        >
          <option value="">Mọi chuyên mục</option>
          {ARTICLE_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <label className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tiêu đề…"
            className="w-full h-9 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </label>
      </div>

      {/* DANH SÁCH */}
      {isLoading && !articles.length ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-24 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <Newspaper className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{articles.length ? "Không có bài nào khớp bộ lọc" : "Chưa có bài viết nào"}</p>
          {!articles.length && <p className="text-sm text-gray-500 mt-1">Bấm “Viết bài mới” để đăng bài đầu tiên — ví dụ thông tin tuyển sinh cho mùa mới.</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => {
            const cover = fileUrl(a.coverFileId, "thumb");
            const published = a.status === "published";
            return (
              <li key={a.id} className={cn("bg-white border border-purple-100 rounded-2xl p-3.5 flex gap-4 items-center shadow-xs", busy === a.id && "opacity-60 pointer-events-none")}>
                <Link href={`/bai-viet/${a.id}`} className="shrink-0 w-24 h-[68px] sm:w-32 sm:h-[84px] rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Newspaper className="w-6 h-6 text-gray-300" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider", published ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600")}>
                      {published ? "Đã đăng" : "Bản nháp"}
                    </span>
                    <CategoryChip code={a.category} className="!text-[10px] !py-0.5" />
                    {a.isFeatured && <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">★ Nổi bật</span>}
                  </div>
                  <Link href={`/bai-viet/${a.id}`} className="block font-bold text-gray-900 hover:text-primary transition truncate">{a.title}</Link>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {published ? `Đăng ${formatArticleDate(a.publishedAt)} · ${a.views.toLocaleString("vi-VN")} lượt xem` : `Cập nhật ${formatArticleDate(a.updatedAt)}`}
                    {" · "}/tin-tuc/{a.slug}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {published && (
                    <>
                      <IconBtn title="Chép liên kết công khai" onClick={() => copyLink(a)}>
                        {copied === a.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
                      </IconBtn>
                      <a href={`/tin-tuc/${a.slug}`} target="_blank" rel="noreferrer" title="Mở trang công khai" className="p-2 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-primary transition">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </>
                  )}
                  <IconBtn
                    title={a.isFeatured ? "Bỏ nổi bật" : "Đặt làm bài nổi bật (hiện lớn đầu trang)"}
                    onClick={() => run(a.id, () => articlesApi.update(a.id, { isFeatured: !a.isFeatured }), a.isFeatured ? "Đã bỏ nổi bật." : "Đã đặt làm bài nổi bật.")}
                  >
                    <Star className={cn("w-4 h-4", a.isFeatured && "fill-amber-400 text-amber-500")} />
                  </IconBtn>
                  <IconBtn
                    title={published ? "Gỡ xuống (về bản nháp)" : "Đăng công khai"}
                    onClick={() => run(a.id, () => articlesApi.update(a.id, { status: published ? "draft" : "published" }), published ? "Đã gỡ bài khỏi trang công khai." : `Đã đăng bài. Liên kết: /tin-tuc/${a.slug}`)}
                  >
                    {published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </IconBtn>
                  <Link href={`/bai-viet/${a.id}`} title="Sửa bài" className="p-2 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-primary transition">
                    <Pencil className="w-4 h-4" />
                  </Link>
                  <IconBtn title="Xóa bài" onClick={() => setToDelete(a)} danger>
                    <Trash2 className="w-4 h-4" />
                  </IconBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const a = toDelete;
          setToDelete(null);
          if (a) run(a.id, () => articlesApi.remove(a.id), "Đã xóa bài viết.");
        }}
        title="Xóa bài viết?"
        message={
          <>
            Bài “<b>{toDelete?.title}</b>” ({toDelete ? articleCategoryLabel(toDelete.category) : ""}) sẽ biến mất khỏi trang công khai
            {toDelete?.status === "published" ? " — những ai đã có đường link sẽ không mở được nữa" : ""}.
          </>
        }
        confirmText="Xóa bài"
      />
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={cn("p-2 rounded-lg text-gray-500 transition", danger ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-purple-50 hover:text-primary")}>
      {children}
    </button>
  );
}
