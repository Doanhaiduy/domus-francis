"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Pin,
  Heart,
  MessageCircle,
  Plus,
  Send,
  Search,
  Lock,
  Unlock,
  EyeOff,
  Eye,
  Trash2,
  Pencil,
  Flag,
  ShieldCheck,
  MessagesSquare,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import type { ForumPostDto } from "@/lib/types/community";
import { forumApi, refreshForum, useForum, useForumPost } from "@/lib/data/community";
import { categoryIcon, formatRelative } from "@/lib/community-format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CustomInput, CustomSelect, CustomTextarea } from "@/components/ui/FormControls";
import { ReasonDialog } from "./_parts/ReasonDialog";
import DienDanLoading from "./loading";

type Target = { kind: "post" | "comment"; id: string; title: string };

export default function DienDanPage() {
  return (
    <Suspense fallback={<DienDanLoading />}>
      <DienDanContent />
    </Suspense>
  );
}

function DienDanContent() {
  const { openModal, showToast, isLoadingSkeleton } = useApp();
  const deepId = useSearchParams().get("id");
  const { can } = useSession();
  const canModerate = can("forum.moderate");
  const canPost = can("forum.post");
  const { data, isLoading, mutate } = useForum();

  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [replyInput, setReplyInput] = useState("");
  const [filterCat, setFilterCat] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [reportTarget, setReportTarget] = useState<Target | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null);
  const likePending = useRef(new Set<string>());

  const posts = useMemo(() => data?.posts ?? [], [data]);
  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts
      .filter((t) => filterCat === "Tất cả" || t.category === filterCat)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) || t.author.fullName.toLowerCase().includes(q));
  }, [posts, filterCat, searchQuery]);

  const selectedThread = posts.find((t) => t.id === selectedThreadId) || filteredThreads[0] || posts[0];
  const { post: detail, mutate: mutateDetail } = useForumPost(selectedThread?.id);

  // Mở đúng chủ đề khi đi tới từ hộp thư (/dien-dan?id=…)
  useEffect(() => {
    if (deepId) setSelectedThreadId(deepId);
  }, [deepId]);
  useEffect(() => {
    setEditing(false);
    setReplyInput("");
  }, [selectedThread?.id]);

  if (isLoadingSkeleton || (isLoading && !data)) {
    return <DienDanLoading />;
  }

  const stats = data?.stats;
  const categories = data?.categories ?? [];

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await Promise.all([refreshForum(), mutateDetail()]);
      if (ok) showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleLike = async (t: ForumPostDto) => {
    if (likePending.current.has(t.id)) return;
    likePending.current.add(t.id);
    const optimistic = (p: ForumPostDto) =>
      p.id === t.id ? { ...p, liked: !t.liked, reactionsCount: Math.max(0, t.reactionsCount + (t.liked ? -1 : 1)) } : p;
    mutate((d) => d && { ...d, posts: d.posts.map(optimistic) }, { revalidate: false });
    try {
      const r = await forumApi.like(t.id, !t.liked);
      mutate((d) => d && { ...d, posts: d.posts.map((p) => (p.id === t.id ? { ...p, liked: r.liked, reactionsCount: r.reactionsCount } : p)) }, { revalidate: false });
      mutateDetail();
    } catch (e) {
      mutate();
      showToast("error", errorMessage(e));
    } finally {
      likePending.current.delete(t.id);
    }
  };

  const startEdit = () => {
    if (!selectedThread) return;
    setEditTitle(selectedThread.title);
    setEditContent(selectedThread.content);
    setEditCategory(selectedThread.categoryId);
    setEditing(true);
  };

  const view = detail && detail.id === selectedThread?.id ? detail : selectedThread;
  const comments = detail && detail.id === selectedThread?.id ? detail.comments : [];

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">Diễn Đàn</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              {stats?.totalPosts ?? posts.length} chủ đề sôi nổi
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Chia sẻ, thảo luận và giao lưu đời sống cộng đoàn Lưu Xá Phanxicô</p>
        </div>

        {canPost && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openModal("createThread")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-bold text-xs shadow-md shadow-primary/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo chủ đề mới</span>
            </button>
          </div>
        )}
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Tổng chủ đề trao đổi</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              {stats?.totalPosts ?? 0} <span className="text-sm font-semibold text-gray-400">bài viết</span>
            </div>
            <span className="text-[11px] text-primary font-bold mt-1 inline-block">+{stats?.newThisWeek ?? 0} tuần này</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold">💬</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 font-medium">Bình luận &amp; Thảo luận</span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              {stats?.totalComments ?? 0} <span className="text-sm font-semibold text-gray-400">lượt</span>
            </div>
            <span className="text-[11px] text-secondary font-bold mt-1 inline-block">
              {stats?.responseRate ?? 0}% chủ đề có phản hồi · +{stats?.commentsThisWeek ?? 0} tuần này
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-secondary flex items-center justify-center font-bold">👥</div>
        </div>

        <div
          onClick={() => stats?.hot && setSelectedThreadId(stats.hot.id)}
          className={`bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex items-center justify-between gap-3 ${stats?.hot ? "cursor-pointer hover:border-amber-200" : ""}`}
        >
          <div className="min-w-0">
            <span className="text-xs text-gray-500 font-medium">Chủ đề hot</span>
            <div className="text-lg font-bold text-gray-900 mt-1 line-clamp-1">{stats?.hot?.title ?? "Chưa có chủ đề"}</div>
            {stats?.hot && (
              <span className="text-[11px] text-amber-700 font-bold mt-1 inline-block">
                {stats.hot.participants} thành viên tham gia · {stats.hot.interactions} lượt tương tác
              </span>
            )}
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
            {stats?.hot ? categoryIcon(posts.find((p) => p.id === stats.hot!.id)?.categoryCode ?? "") : "🔥"}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm chủ đề, nội dung..."
            className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["Tất cả", ...categories.map((c) => c.label)].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0 ${
                filterCat === cat ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 2 COLUMNS: THREAD LIST (7 COLS) & DETAIL VIEW (5 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* THREAD LIST (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {filteredThreads.map((t) => {
            const isSelected = t.id === selectedThread?.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                className={`p-5 rounded-3xl cursor-pointer transition border ${
                  isSelected
                    ? "bg-purple-50/70 border-primary shadow-xs"
                    : t.isPinned
                    ? "bg-purple-50/30 border-purple-200"
                    : "bg-white hover:bg-surface-container-low border-purple-50 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded-md">
                        <Pin className="w-3 h-3" /> ĐÃ GHIM
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">{t.category}</span>
                    {t.status === "locked" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                        <Lock className="w-3 h-3" /> Đã khóa
                      </span>
                    )}
                    {t.status === "hidden" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                        <EyeOff className="w-3 h-3" /> Đã ẩn
                      </span>
                    )}
                    {!!t.openReports && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                        <Flag className="w-3 h-3" /> {t.openReports} báo cáo
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{formatRelative(t.createdAt)}</span>
                </div>

                <h3 className="text-sm font-bold text-gray-900 hover:text-primary transition-colors">{t.title}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{t.content}</p>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-purple-50/60 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {t.author.initials}
                    </div>
                    <span className="font-bold text-gray-900 truncate">{t.author.fullName}</span>
                    <span className="text-[11px] text-gray-400 truncate hidden sm:inline">· {t.author.role}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 text-primary font-bold">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{t.commentsCount}</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canPost) toggleLike(t);
                      }}
                      title={t.liked ? "Bỏ thích" : "Thích"}
                      className="flex items-center gap-1 text-rose-600 hover:scale-110 transition-transform font-bold"
                    >
                      <Heart className={`w-3.5 h-3.5 ${t.liked ? "fill-rose-500" : "fill-rose-50"}`} />
                      <span>{t.reactionsCount}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredThreads.length === 0 && (
            <div className="bg-white rounded-3xl p-10 border border-purple-50 text-center text-xs text-gray-400">
              <MessagesSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              {posts.length === 0 ? "Chưa có chủ đề nào — hãy mở đầu cuộc trò chuyện!" : "Không có chủ đề phù hợp bộ lọc."}
            </div>
          )}
        </div>

        {/* THREAD DETAIL & QUICK REPLY (5 COLS) */}
        {view && (
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="px-2.5 py-1 bg-purple-100 text-primary text-xs font-bold rounded-lg">{view.category}</span>
              <span className="text-xs text-gray-400">
                {formatRelative(view.createdAt)}
              </span>
            </div>

            {/* Hành động: tác giả / người kiểm duyệt / thành viên */}
            <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold -mt-1">
              {view.canEdit && !editing && (
                <button onClick={startEdit} className="flex items-center gap-1 text-gray-600 hover:text-primary">
                  <Pencil className="w-3.5 h-3.5" /> Sửa
                </button>
              )}
              {canModerate && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => run(() => forumApi.update(view.id, { isPinned: !view.isPinned }), view.isPinned ? "Đã bỏ ghim chủ đề." : "Đã ghim chủ đề.")}
                    className="flex items-center gap-1 text-gray-600 hover:text-primary disabled:opacity-50"
                  >
                    <Pin className="w-3.5 h-3.5" /> {view.isPinned ? "Bỏ ghim" : "Ghim"}
                  </button>
                  {view.status !== "hidden" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => forumApi.update(view.id, { status: view.status === "locked" ? "published" : "locked" }),
                          view.status === "locked" ? "Đã mở khóa bình luận." : "Đã khóa bình luận chủ đề."
                        )
                      }
                      className="flex items-center gap-1 text-gray-600 hover:text-primary disabled:opacity-50"
                    >
                      {view.status === "locked" ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {view.status === "locked" ? "Mở khóa" : "Khóa"}
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => forumApi.update(view.id, { status: view.status === "hidden" ? "published" : "hidden" }),
                        view.status === "hidden" ? "Đã hiện lại chủ đề." : "Đã ẩn chủ đề khỏi diễn đàn."
                      )
                    }
                    className="flex items-center gap-1 text-gray-600 hover:text-rose-600 disabled:opacity-50"
                  >
                    {view.status === "hidden" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {view.status === "hidden" ? "Hiện" : "Ẩn"}
                  </button>
                  {!!view.openReports && (
                    <button
                      disabled={busy}
                      onClick={() => run(() => forumApi.resolveReports(view.id, "dismissed"), "Đã đóng báo cáo — nội dung không vi phạm.")}
                      className="flex items-center gap-1 text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Bỏ qua {view.openReports} báo cáo
                    </button>
                  )}
                </>
              )}
              {view.canDelete && (
                <button
                  onClick={() => setDeleteTarget({ kind: "post", id: view.id, title: view.title })}
                  className="flex items-center gap-1 text-gray-600 hover:text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              )}
              {!view.isMine && (
                <button
                  disabled={view.myReported}
                  onClick={() => setReportTarget({ kind: "post", id: view.id, title: view.title })}
                  className="flex items-center gap-1 text-gray-400 hover:text-amber-700 disabled:opacity-60 ml-auto"
                >
                  <Flag className="w-3.5 h-3.5" /> {view.myReported ? "Đã báo cáo" : "Báo cáo"}
                </button>
              )}
            </div>

            {editing ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await run(
                    () => forumApi.update(view.id, { title: editTitle, content: editContent, categoryId: editCategory }),
                    "Đã lưu chỉnh sửa chủ đề."
                  );
                  if (ok) setEditing(false);
                }}
                className="space-y-3"
              >
                <CustomInput label="Tiêu đề" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} minLength={3} maxLength={200} required />
                <CustomSelect
                  label="Chuyên mục"
                  value={editCategory}
                  onChange={setEditCategory}
                  options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.label}` }))}
                />
                <CustomTextarea label="Nội dung" value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} maxLength={10000} required />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
                    Hủy
                  </button>
                  <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
                    Lưu
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div>
                  <h2 className="text-base font-bold text-gray-900 leading-snug">{view.title}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">{view.author.initials}</div>
                    <div>
                      <div className="text-xs font-bold text-gray-900">{view.author.fullName}</div>
                      <div className="text-[10px] text-gray-400">
                        {view.author.role}
                        {view.author.room ? ` · ${view.author.room}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => canPost && toggleLike(view)}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-100 text-rose-600 text-xs font-bold hover:bg-rose-50"
                    >
                      <Heart className={`w-3.5 h-3.5 ${view.liked ? "fill-rose-500" : ""}`} />
                      <span>{view.reactionsCount}</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-700 leading-relaxed bg-surface-container-low/60 p-3.5 rounded-2xl whitespace-pre-line">{view.content}</p>
              </>
            )}

            {/* REPLIES LIST */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-900">
                <span>Phản hồi ({comments.filter((c) => c.status !== "hidden").length || view.commentsCount})</span>
              </div>

              {comments.length > 0 ? (
                comments.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-2xl border text-xs ${r.status === "hidden" ? "bg-rose-50/40 border-rose-100" : "bg-surface-container-low/40 border-purple-50"}`}
                  >
                    <div className="flex items-center justify-between font-bold text-gray-900 mb-1 gap-2">
                      <span className="text-primary truncate">
                        {r.author.fullName}
                        {r.author.role !== "Thành viên" ? <span className="text-gray-400 font-normal"> ({r.author.role})</span> : null}
                      </span>
                      <span className="text-[10px] text-gray-400 font-normal shrink-0">
                        {formatRelative(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-gray-700 whitespace-pre-line">{r.content}</p>
                    {r.status === "hidden" && <p className="text-[10px] text-rose-600 italic mt-1">Bình luận đã bị ẩn bởi người kiểm duyệt.</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-gray-400">
                      {!!r.openReports && <span className="text-amber-700">{r.openReports} báo cáo</span>}
                      {canModerate && (
                        <button
                          onClick={() =>
                            run(
                              () => forumApi.updateComment(r.id, { status: r.status === "hidden" ? "published" : "hidden" }),
                              r.status === "hidden" ? "Đã hiện lại bình luận." : "Đã ẩn bình luận."
                            )
                          }
                          className="hover:text-rose-600"
                        >
                          {r.status === "hidden" ? "Hiện" : "Ẩn"}
                        </button>
                      )}
                      {r.canDelete && (
                        <button onClick={() => setDeleteTarget({ kind: "comment", id: r.id, title: r.content.slice(0, 60) })} className="hover:text-rose-600">
                          Xóa
                        </button>
                      )}
                      {!r.isMine && (
                        <button
                          disabled={r.myReported}
                          onClick={() => setReportTarget({ kind: "comment", id: r.id, title: r.content.slice(0, 60) })}
                          className="hover:text-amber-700 disabled:opacity-60"
                        >
                          {r.myReported ? "Đã báo cáo" : "Báo cáo"}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400 italic text-center py-2">Chưa có bình luận nào. Hãy là người đầu tiên trả lời!</div>
              )}
            </div>

            {/* QUICK REPLY BOX */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const text = replyInput.trim();
                if (!text || busy) return;
                const ok = await run(() => forumApi.comment(view.id, text));
                if (ok) setReplyInput("");
              }}
              className="pt-3 border-t border-gray-100 flex items-center gap-2"
            >
              <input
                type="text"
                value={replyInput}
                maxLength={3000}
                disabled={view.status !== "published" || !canPost}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder={view.status === "published" ? "Viết câu trả lời của bạn..." : "Chủ đề đã khóa bình luận"}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-container-low text-xs border border-transparent focus:border-primary focus:bg-white outline-none transition disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !replyInput.trim() || view.status !== "published"}
                className="p-2.5 rounded-xl bg-primary hover:bg-primary-container text-white transition shadow-xs disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      <ReasonDialog
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title={reportTarget?.kind === "post" ? "Báo cáo chủ đề vi phạm" : "Báo cáo bình luận vi phạm"}
        description={
          <>
            <b>{reportTarget?.title}</b>
            <br />
            Người quản lý sẽ xem xét và xử lý. Danh tính người báo cáo chỉ người kiểm duyệt thấy.
          </>
        }
        placeholder="Nội dung này vi phạm nội quy như thế nào?"
        confirmText="Gửi báo cáo"
        onConfirm={async (reason) => {
          const t = reportTarget!;
          try {
            await (t.kind === "post" ? forumApi.report(t.id, reason) : forumApi.reportComment(t.id, reason));
            await Promise.all([refreshForum(), mutateDetail()]);
            showToast("success", "Đã gửi báo cáo tới người quản lý. Cảm ơn bạn!");
          } catch (e) {
            showToast("error", errorMessage(e));
            throw e;
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const t = deleteTarget;
          if (!t) return;
          if (t.kind === "post") run(() => forumApi.remove(t.id), "Đã xóa chủ đề.").then((ok) => ok && setSelectedThreadId(""));
          else run(() => forumApi.removeComment(t.id), "Đã xóa bình luận.");
        }}
        title={deleteTarget?.kind === "post" ? "Xóa chủ đề này?" : "Xóa bình luận này?"}
        message={
          <>
            <b>{deleteTarget?.title}</b> sẽ không còn hiển thị trên diễn đàn.
          </>
        }
        confirmText="Xóa"
      />
    </div>
  );
}
