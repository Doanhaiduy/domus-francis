"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Hourglass, RefreshCw, Contact, XCircle, Phone, MapPin, Info, Newspaper, HelpCircle, Mail } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, errorMessage, swrFetcher } from "@/lib/api";
import { AppFooter } from "@/components/AppFooter";
import { ThemeToggle } from "@/lib/theme";
import { mapLinks, telHref } from "@/lib/public-site";
import type { PublicOrgInfo } from "@/lib/types/articles";

/** Trang công khai (không cần đăng nhập) để người đang chờ duyệt tìm hiểu thêm về nhà. */
const PUBLIC_LINKS = [
  { href: "/gioi-thieu", label: "Giới thiệu", icon: Info },
  { href: "/tin-tuc", label: "Tin tức", icon: Newspaper },
  { href: "/hoi-dap", label: "Hỏi đáp", icon: HelpCircle },
  { href: "/lien-he", label: "Liên hệ", icon: Mail },
] as const;

const STATUS_LABEL: Record<string, string> = {
  submitted: "Mới đăng ký",
  under_review: "Đang xem xét",
  rejected: "Chưa được chấp nhận",
  withdrawn: "Đã rút đơn",
  approved: "Đã duyệt",
};

export default function ChoPheDuyetPage() {
  const router = useRouter();
  const { showToast } = useApp();
  const { session, refreshSession, logout } = useSession();
  const [checking, setChecking] = useState(false);
  // Thông tin liên hệ công khai của nhà (tên, hotline, địa chỉ) — không cần quyền thành viên
  const { data: org } = useSWR<PublicOrgInfo>("/api/v1/public/org", swrFetcher, { revalidateOnFocus: false, dedupingInterval: 600_000, shouldRetryOnError: false });
  const app = session?.application;
  const rejected = app?.status === "rejected";
  const name = app?.fullName ?? session?.user.email ?? "";
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();

  const recheck = async () => {
    setChecking(true);
    try {
      // Làm mới phiên để server tính lại trạng thái duyệt (cờ "chờ duyệt" nằm trong access token)
      const r = await api.post<{ pending: boolean }>("/api/v1/auth/refresh");
      if (!r.pending) {
        showToast("success", "Tài khoản đã được duyệt. Chào mừng bạn về nhà!");
        router.replace("/");
        router.refresh();
        return;
      }
      await refreshSession();
      showToast("info", "Đơn của bạn vẫn đang chờ người quản lý xem xét.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-[480px] bg-white rounded-3xl p-6 sm:p-10 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12),0_4px_20px_rgba(0,0,0,0.03)] border border-purple-100 flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-200/50 rounded-full blur-3xl pointer-events-none" />

        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-3xl shadow-xs mb-5 border ${
            rejected ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"
          }`}
        >
          {rejected ? <XCircle className="w-8 h-8" /> : <Hourglass className="w-8 h-8 animate-pulse" />}
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 ${
            rejected ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {!rejected && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
          {rejected ? "Đơn chưa được chấp nhận" : "Đang chờ phê duyệt quyền thành viên"}
        </span>

        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          {rejected ? "Rất tiếc, đơn của bạn chưa được duyệt" : "Chào bạn! Tài khoản đang được xác minh"}
        </h1>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          {rejected
            ? "Người quản lý đã xem xét đơn đăng ký của bạn. Bạn có thể liên hệ trực tiếp để biết thêm chi tiết."
            : "Đơn đăng ký của bạn đã được tiếp nhận. Để đảm bảo an ninh nội bộ, người quản lý cần duyệt tài khoản trước khi bạn truy cập các tính năng của nhà."}
        </p>

        <div className="w-full mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3.5 text-left">
          <div className="w-11 h-11 rounded-full bg-purple-100 text-primary flex items-center justify-center font-bold text-sm shrink-0">
            {initials || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs text-gray-900 truncate">{name}</div>
            <div className="text-[11px] text-gray-400 truncate">{app?.email ?? session?.user.email}</div>
            {app?.createdAt && (
              <div className="text-[10px] text-gray-400">Nộp đơn: {new Date(app.createdAt).toLocaleString("vi-VN")}</div>
            )}
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-gray-200 text-gray-700 text-[10px] font-semibold shrink-0">
            {STATUS_LABEL[app?.status ?? "submitted"] ?? app?.status}
          </span>
        </div>

        {rejected && app?.reviewNote && (
          <div className="w-full mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-left text-xs text-rose-900">
            <b>Ghi chú của người quản lý:</b> {app.reviewNote}
          </div>
        )}

        <div className="w-full mt-4 p-4 rounded-2xl bg-purple-50/70 border border-purple-100 text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-900 mb-1.5">
            <Contact className="w-4 h-4 text-primary" aria-hidden />
            <span>Liên hệ để được duyệt nhanh hơn:</span>
          </div>
          <p className="text-xs text-purple-900/80 leading-relaxed">
            Vui lòng liên hệ trực tiếp <b>Trưởng nhà</b>{org?.houseName ? <> của {org.houseName}</> : null} để được kích hoạt. Sau khi được duyệt, bấm <b>Kiểm tra lại</b>.
          </p>
          {(org?.phone || org?.address) && (
            <ul className="mt-3 flex flex-col gap-2">
              {org?.phone && (
                <li>
                  <a href={telHref(org.phone)} className="flex items-center gap-2.5 rounded-xl bg-white border border-purple-100 px-3 py-2.5 hover:border-purple-300 transition">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] text-gray-500">Hotline của nhà</span>
                      <span className="block text-sm font-extrabold text-gray-900 tabular-nums">{org.phone}</span>
                    </span>
                  </a>
                </li>
              )}
              {org?.address && (
                <li>
                  <a href={mapLinks(org.address).google} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl bg-white border border-purple-100 px-3 py-2.5 hover:border-purple-300 transition">
                    <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] text-gray-500">Địa chỉ (mở bản đồ)</span>
                      <span className="block text-xs font-semibold text-gray-900 leading-snug">{org.address}</span>
                    </span>
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="w-full mt-4 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Trong lúc chờ, tìm hiểu thêm về nhà</p>
          <div className="grid grid-cols-2 gap-2">
            {PUBLIC_LINKS.map((l) => {
              const Icon = l.icon;
              return (
                <Link key={l.href} href={l.href} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 hover:border-purple-200 hover:text-primary transition">
                  <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="w-full mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => logout()}
            className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs transition text-center"
          >
            Đăng xuất
          </button>
          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white hover:bg-primary-container font-bold text-xs shadow-md shadow-primary/20 transition text-center flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>Kiểm tra lại</span>
          </button>
        </div>

      </div>
      <AppFooter variant="minimal" className="mt-3" />
    </div>
  );
}
