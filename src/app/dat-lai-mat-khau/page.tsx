"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { AppFooter } from "@/components/AppFooter";
import { ThemeToggle } from "@/lib/theme";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Mật khẩu phải có ít nhất 8 ký tự.");
    if (password !== again) return setError("Hai lần nhập mật khẩu không giống nhau.");
    setBusy(true);
    try {
      await api.post("/api/v1/auth/reset", { token, password });
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

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-gray-600">Liên kết không hợp lệ. Hãy yêu cầu đặt lại mật khẩu mới.</p>
        <Link href="/quen-mat-khau" className="text-sm font-bold text-primary hover:underline">Yêu cầu liên kết mới</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="text-center space-y-4" role="status">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <p className="text-sm text-gray-600 leading-relaxed">Đã đặt mật khẩu mới. Mọi thiết bị đang đăng nhập đã bị đăng xuất — hãy đăng nhập lại.</p>
        <Link href="/dang-nhap" className="inline-flex px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition">Đăng nhập</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-gray-500 text-center leading-relaxed">Mật khẩu mới ít nhất 8 ký tự, có cả chữ và số.</p>
      {error && (
        <div role="alert" className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
          {/hết hạn|không hợp lệ/i.test(error) && <Link href="/quen-mat-khau" className="font-bold underline ml-1 shrink-0">Gửi lại</Link>}
        </div>
      )}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Mật khẩu mới"
          aria-label="Mật khẩu mới"
          autoFocus
          className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <input
        type={show ? "text" : "password"}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        aria-label="Nhập lại mật khẩu mới"
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
      />
      <button type="submit" disabled={busy} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Đặt mật khẩu mới
      </button>
    </form>
  );
}

export default function DatLaiMatKhauPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 border border-purple-100 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12)]">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white mx-auto mb-5 shadow-lg shadow-purple-300/60">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 text-center mb-4">Đặt mật khẩu mới</h1>
        <Suspense fallback={<div className="shimmer-box h-32 rounded-2xl" />}>
          <ResetForm />
        </Suspense>
      </div>
      <AppFooter variant="minimal" className="mt-3" />
    </div>
  );
}
