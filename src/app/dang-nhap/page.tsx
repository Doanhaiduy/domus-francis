"use client";

import React, { useState, useTransition } from "react";
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function DangNhapPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    if (isSignUp && !fullName.trim()) {
      setError("Vui lòng nhập họ và tên của bạn.");
      return;
    }

    if (cleanPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();

      if (isSignUp) {
        // Luồng Đăng ký
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpError) {
          setError(`Đăng ký thất bại: ${signUpError.message}`);
          return;
        }

        if (data.session) {
          // Tự động đăng nhập thành công
          router.push("/");
          router.refresh();
        } else {
          setSuccessMsg("Tài khoản đã tạo thành công! Bạn có thể chuyển sang tab Đăng nhập ngay.");
          setIsSignUp(false);
        }
      } else {
        // Luồng Đăng nhập
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (authError) {
          if (authError.message.includes("Invalid login credentials")) {
            setError("Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
          } else if (authError.message.includes("Email not confirmed")) {
            setError("Email chưa được xác nhận. Vui lòng kiểm tra hộp thư của bạn.");
          } else {
            setError(`Đăng nhập thất bại: ${authError.message}`);
          }
          return;
        }

        router.push("/");
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f4ff] flex items-center justify-center p-4">
      {/* FLOATING AUTH WINDOW */}
      <div className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12),0_4px_20px_rgba(0,0,0,0.03)] border border-purple-100 flex flex-col items-center text-center relative overflow-hidden">
        {/* Top Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-200/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-indigo-200/50 rounded-full blur-3xl pointer-events-none" />

        {/* LOGO ICON */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white font-extrabold text-3xl shadow-lg shadow-purple-300/60 mb-5">
          ✝
        </div>

        {/* BRAND TITLE */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Lưu Xá Phanxicô
        </h1>
        <p className="text-xs font-bold text-primary bg-purple-100 px-3 py-1 rounded-full mt-2 inline-block">
          Cộng đoàn sinh viên công giáo
        </p>

        {/* TAB SWITCHER */}
        <div className="w-full mt-6 grid grid-cols-2 bg-gray-100 p-1 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
            }}
            className={`py-2 rounded-xl transition ${
              !isSignUp ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
            }}
            className={`py-2 rounded-xl transition ${
              isSignUp ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Đăng ký tài khoản
          </button>
        </div>

        {/* SUCCESS MESSAGE */}
        {successMsg && (
          <div className="w-full mt-4 flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 text-left">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* AUTH FORM */}
        <form onSubmit={handleSubmit} className="w-full mt-4 space-y-3 text-left">
          {/* Full Name (Sign Up only) */}
          {isSignUp && (
            <div>
              <label htmlFor="fullName" className="block text-xs font-semibold text-gray-600 mb-1.5">
                Họ và tên *
              </label>
              <div className="relative">
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Trần Văn Đức"
                  disabled={isPending}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-600 mb-1.5">
              Email *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@gmail.com"
              autoComplete="email"
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-600 mb-1.5">
              Mật khẩu *
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                disabled={isPending}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-purple-300/40 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isSignUp ? "Đang tạo tài khoản..." : "Đang đăng nhập..."}
              </span>
            ) : (
              <>
                {isSignUp ? "Tạo tài khoản" : "Đăng nhập"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* NOTICE FOOTER */}
        <div className="mt-8 pt-6 border-t border-gray-100 w-full">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bảo mật nội bộ · Lưu Xá Phanxicô Assisi</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            © 2026 Lưu Xá Phanxicô Assisi • Pax et Bonum
          </p>
        </div>
      </div>
    </div>
  );
}
