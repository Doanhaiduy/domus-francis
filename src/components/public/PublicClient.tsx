"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Link2, LogIn, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

// lucide-react bản mới không còn biểu tượng thương hiệu ⇒ vẽ chữ "f" của Facebook bằng SVG
const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
  </svg>
);

/** Nút "Đăng nhập" / "Vào ứng dụng": hỏi nhẹ /auth/me (không chuyển hướng khi chưa đăng nhập). */
export function PublicAuthButton() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/auth/me", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => alive && setSignedIn(r.ok))
      .catch(() => alive && setSignedIn(false));
    return () => {
      alive = false;
    };
  }, []);
  const inApp = signedIn === true;
  return (
    <Link
      href={inApp ? "/" : "/dang-nhap"}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95"
    >
      {inApp ? <ArrowRight className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
      <span>{inApp ? "Vào ứng dụng" : "Đăng nhập"}</span>
    </Link>
  );
}

/** Đếm +1 lượt xem mỗi bài mỗi phiên trình duyệt. */
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `luuxa-viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // bỏ qua: không có sessionStorage thì vẫn đếm
    }
    fetch(`/api/v1/public/articles/${encodeURIComponent(slug)}/view`, { method: "POST" }).then((r) => r.text()).catch(() => {});
  }, [slug]);
  return null;
}

/** Chia sẻ: sao chép liên kết, Facebook, và hộp chia sẻ của hệ điều hành (Zalo, Messenger… trên điện thoại). */
export function ShareBar({ title, className }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const url = () => window.location.href.split("#")[0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
    } catch {
      const el = document.createElement("textarea");
      el.value = url();
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const btn = "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-100 bg-white text-xs font-bold text-gray-700 hover:text-primary hover:border-purple-300 transition active:scale-95";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mr-1">Chia sẻ</span>
      <button type="button" onClick={copy} className={btn}>
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? "Đã chép liên kết" : "Chép liên kết"}
      </button>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer,width=640,height=560");
        }}
        className={btn}
      >
        <FacebookIcon className="w-3.5 h-3.5" />
        Facebook
      </a>
      {canNativeShare && (
        <button type="button" onClick={() => navigator.share({ title, url: url() }).catch(() => {})} className={btn}>
          <Share2 className="w-3.5 h-3.5" />
          Gửi qua…
        </button>
      )}
    </div>
  );
}
