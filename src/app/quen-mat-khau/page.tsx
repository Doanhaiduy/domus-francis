"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { AppFooter } from "@/components/AppFooter";
import { ThemeToggle } from "@/lib/theme";

export default function QuenMatKhauPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (identifier.trim().length < 3) {
      setError("Nhập email hoặc số điện thoại đã đăng ký.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/auth/forgot", { identifier: identifier.trim() });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CSRF") {
        window.location.reload();
        return;
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 border border-purple-100 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12)]">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white mx-auto mb-5 shadow-lg shadow-purple-300/60">
          <Mail className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 text-center">Quên mật khẩu?</h1>

        {done ? (
          <div className="mt-5 space-y-4 text-center" role="status">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm text-gray-600 leading-relaxed">
              Nếu tài khoản tồn tại và có email, chúng tôi đã gửi liên kết đặt lại mật khẩu (hiệu lực <b>30 phút</b>). Kiểm tra cả hộp thư rác nhé.
            </p>
            <Link href="/dang-nhap" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Về trang đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-xs text-gray-500 text-center leading-relaxed">Nhập email hoặc số điện thoại của tài khoản. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu tới email đã đăng ký.</p>
            {error && (
              <div role="alert" className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="ten@gmail.com hoặc 09xx xxx xxx"
              autoComplete="username"
              autoFocus
              aria-label="Email hoặc số điện thoại"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            />
            <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Gửi liên kết đặt lại
            </button>
            <p className="text-center">
              <Link href="/dang-nhap" className="text-xs font-semibold text-gray-400 hover:text-gray-700">← Quay lại đăng nhập</Link>
            </p>
          </form>
        )}
      </div>
      <AppFooter variant="minimal" className="mt-3" />
    </div>
  );
}
