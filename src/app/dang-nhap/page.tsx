"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2, Check, Info, Compass, MessageCircleQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { AppFooter } from "@/components/AppFooter";
import { ThemeToggle } from "@/lib/theme";
import { LEGAL_PATHS, LEGAL_VERSION } from "@/content/legal";
import { cn } from "@/lib/utils";

/** Tính năng xác thực đang bật (GET /api/v1/auth/capabilities): ẩn/hiện "Quên mật khẩu", tab "Đăng ký tài khoản". */
interface AuthCapabilities {
  passwordReset: boolean;
  registrationOpen: boolean;
}

export default function DangNhapPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Tài khoản bật xác thực 2 bước: mật khẩu đúng thì chuyển sang nhập mã (token trung gian sống 5 phút)
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // Tick "Tin cậy thiết bị này 30 ngày": đăng nhập lại trên thiết bị này trong 30 ngày không hỏi mã 2FA
  const [trustDevice, setTrustDevice] = useState(false);
  // Đăng ký: BẮT BUỘC tick đồng ý Điều khoản sử dụng + Chính sách bảo mật (máy chủ lưu phiên bản + thời điểm làm bằng chứng)
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [caps, setCaps] = useState<AuthCapabilities>({ passwordReset: true, registrationOpen: true });
  const [forgotHint, setForgotHint] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<AuthCapabilities>("/api/v1/auth/capabilities")
      .then((c) => {
        if (!alive) return;
        setCaps({ passwordReset: c.passwordReset !== false, registrationOpen: c.registrationOpen !== false });
        if (c.registrationOpen === false) setIsSignUp(false);
      })
      .catch(() => {
        /* giữ mặc định — máy chủ vẫn tự chặn khi đăng ký đang đóng */
      });
    return () => {
      alive = false;
    };
  }, []);

  const nextPath = () => {
    if (typeof window === "undefined") return "/";
    const n = new URLSearchParams(window.location.search).get("next") || "/";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const identifier = email.trim();
    if (!identifier || !password) {
      setError(isSignUp ? "Vui lòng nhập đầy đủ email và mật khẩu." : "Vui lòng nhập email/số điện thoại và mật khẩu.");
      return;
    }
    if (isSignUp && !fullName.trim()) {
      setError("Vui lòng nhập họ và tên của bạn.");
      return;
    }
    if (isSignUp && !acceptTerms) {
      setError("Vui lòng đọc và tick ô đồng ý Điều khoản sử dụng và Chính sách bảo mật trước khi tạo tài khoản.");
      return;
    }

    startTransition(async () => {
      try {
        if (isSignUp) {
          await api.post("/api/v1/auth/register", {
            fullName: fullName.trim(),
            email: identifier,
            phone: phone.trim() || null,
            password,
            universityName: university.trim() || null,
            message: message.trim() || null,
            acceptTerms: true,
          });
          router.replace("/cho-phe-duyet");
        } else {
          const r = await api.post<{ pending?: boolean; mfaRequired?: boolean; mfaToken?: string }>("/api/v1/auth/login", { identifier, password });
          if (r.mfaRequired && r.mfaToken) {
            setMfaToken(r.mfaToken);
            setMfaCode("");
            return;
          }
          router.replace(r.pending ? "/cho-phe-duyet" : nextPath());
        }
        router.refresh();
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "CSRF") {
          // Cookie bảo vệ CSRF chưa có (mở trang từ cache) — tải lại để nhận cookie mới
          window.location.reload();
          return;
        }
        if (err instanceof ApiClientError && err.code === "REGISTRATION_CLOSED") {
          // Người quản lý vừa đóng đăng ký ⇒ ẩn tab đăng ký, chỉ đường "Đăng ký tìm hiểu"
          setCaps((c) => ({ ...c, registrationOpen: false }));
          setIsSignUp(false);
        }
        setError(errorMessage(err));
      }
    });
  };

  const handleMfa = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mfaCode.trim().length < 6) {
      setError("Nhập mã 6 số trong ứng dụng, hoặc một mã khôi phục.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await api.post<{ pending: boolean }>("/api/v1/auth/mfa/verify", { mfaToken, code: mfaCode.trim(), trustDevice });
        router.replace(r.pending ? "/cho-phe-duyet" : nextPath());
        router.refresh();
      } catch (err) {
        const expired = err instanceof ApiClientError && err.code === "MFA_EXPIRED";
        if (expired) {
          setMfaToken(null);
          setPassword("");
        }
        setError(errorMessage(err));
      }
    });
  };

  if (mfaToken) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 relative">
        <ThemeToggle className="absolute top-4 right-4" />
        <form onSubmit={handleMfa} className="w-full max-w-[420px] bg-white rounded-3xl p-8 border border-purple-100 shadow-[0_20px_60px_-15px_rgba(95,58,221,0.12)] flex flex-col gap-5">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-purple-300/60">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900">Xác thực 2 bước</h1>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">Nhập mã 6 số trong ứng dụng Authenticator trên điện thoại của bạn. Mất điện thoại? Dùng một mã khôi phục (dạng <span className="font-mono">abcde-12345</span>).</p>
          </div>
          {error && (
            <div role="alert" className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <input
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            aria-label="Mã xác thực"
            placeholder="123456"
            maxLength={20}
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-center text-xl tracking-[0.35em] font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-3 cursor-pointer select-none hover:border-purple-200 transition">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#5f3add]"
            />
            <span className="text-xs leading-relaxed">
              <b className="text-gray-900">Tin cậy thiết bị này trong 30 ngày</b>
              <span className="block text-gray-500 mt-0.5">Trong 30 ngày, đăng nhập lại trên thiết bị này sẽ không hỏi mã nữa. Chỉ chọn trên điện thoại / máy tính của riêng bạn, đừng chọn ở máy dùng chung.</span>
            </span>
          </label>
          <button type="submit" disabled={isPending} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#5f3add] to-[#7857f8] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {isPending ? "Đang kiểm tra…" : (<>Xác nhận <ArrowRight className="w-4 h-4" /></>)}
          </button>
          <button type="button" onClick={() => { setMfaToken(null); setMfaCode(""); setTrustDevice(false); setError(null); }} className="text-xs font-semibold text-gray-400 hover:text-gray-700">← Quay lại đăng nhập</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
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
        <Link href="/gioi-thieu" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-primary hover:underline">
          <Compass className="w-3.5 h-3.5" aria-hidden /> Tìm hiểu về lưu xá
        </Link>

        {/* TAB SWITCHER — ẩn tab đăng ký khi người quản lý đóng đăng ký (Cài đặt → Cấu hình chung) */}
        {caps.registrationOpen ? (
          <div className="w-full mt-5 grid grid-cols-2 bg-gray-100 p-1 rounded-2xl text-xs font-bold" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
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
              role="tab"
              aria-selected={isSignUp}
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
        ) : (
          <div className="w-full mt-5" />
        )}

        {/* HAI CON ĐƯỜNG: tạo tài khoản (đã được nhà nhận) vs. đăng ký tìm hiểu (người mới muốn hỏi) */}
        {isSignUp && (
          <div className="w-full mt-4 flex items-start gap-2.5 text-left rounded-2xl border border-purple-100 bg-purple-50/70 p-3.5 text-[11px] leading-relaxed text-gray-700">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p>
                <b className="text-gray-900">Tạo tài khoản</b> dành cho bạn <b>đã được nhà nhận vào ở</b> (hoặc được người quản lý hướng dẫn đăng ký). Tài khoản dùng được sau khi
                người quản lý duyệt.
              </p>
              <p>
                <b className="text-gray-900">Mới muốn tìm hiểu, hỏi chỗ ở?</b> Không cần tài khoản — gửi{" "}
                <Link href="/lien-he" className="font-bold text-primary hover:underline">
                  Đăng ký tìm hiểu
                </Link>
                , người quản lý sẽ liên lạc với bạn.
              </p>
            </div>
          </div>
        )}

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
              {isSignUp ? "Email *" : "Email hoặc số điện thoại *"}
            </label>
            <input
              id="email"
              type={isSignUp ? "email" : "text"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isSignUp ? "ten@gmail.com" : "ten@gmail.com hoặc 09xx xxx xxx"}
              autoComplete={isSignUp ? "email" : "username"}
              disabled={isPending}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-600 mb-1.5">
              Mật khẩu *
            </label>
            {!isSignUp && (
              <div className="text-right -mt-6 mb-1.5 relative z-10 h-4">
                {caps.passwordReset ? (
                  <Link href="/quen-mat-khau" className="text-[11px] font-semibold text-primary hover:underline">
                    Quên mật khẩu?
                  </Link>
                ) : (
                  // Chưa bật gửi email (RESEND_API_KEY) ⇒ không có đặt lại qua email: chỉ đường liên hệ người quản lý cấp mật khẩu tạm
                  <button type="button" onClick={() => setForgotHint((v) => !v)} aria-expanded={forgotHint} className="text-[11px] font-semibold text-primary hover:underline">
                    Quên mật khẩu?
                  </button>
                )}
              </div>
            )}
            {!isSignUp && forgotHint && !caps.passwordReset && (
              <p className="mb-2 text-[11px] leading-relaxed text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Hãy liên hệ Trưởng nhà hoặc Admin để được cấp <b>mật khẩu tạm</b> — đăng nhập bằng mật khẩu tạm xong, ứng dụng sẽ yêu cầu bạn đặt mật khẩu mới.
              </p>
            )}
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
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <>
              <p className="text-[11px] text-gray-400 -mt-1">Tối thiểu 8 ký tự, có cả chữ và số.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="phone" className="block text-xs font-semibold text-gray-600 mb-1.5">Số điện thoại</label>
                  <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" disabled={isPending}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60" />
                </div>
                <div>
                  <label htmlFor="university" className="block text-xs font-semibold text-gray-600 mb-1.5">Trường đang học</label>
                  <input id="university" type="text" value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="VD: ĐH Nha Trang" disabled={isPending}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60" />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-xs font-semibold text-gray-600 mb-1.5">Lời nhắn cho người quản lý</label>
                <textarea id="message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Giới thiệu ngắn: giáo xứ, năm học, nguyện vọng…" disabled={isPending}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition disabled:opacity-60 resize-none" />
              </div>
              {/* Đồng ý BẮT BUỘC (máy chủ từ chối nếu thiếu — 400 TERMS_REQUIRED) */}
              <div className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", acceptTerms ? "border-purple-200 bg-purple-50/60" : "border-gray-200 bg-white")}>
                <button
                  type="button"
                  role="checkbox"
                  id="accept-terms"
                  aria-checked={acceptTerms}
                  aria-labelledby="accept-terms-label"
                  onClick={() => {
                    setAcceptTerms((v) => !v);
                    setError(null);
                  }}
                  disabled={isPending}
                  className={cn(
                    "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
                    acceptTerms ? "bg-primary border-primary text-white" : "bg-white border-gray-300",
                  )}
                >
                  {acceptTerms && <Check className="w-3.5 h-3.5" aria-hidden />}
                </button>
                <p id="accept-terms-label" className="text-[11px] leading-relaxed text-gray-700">
                  <span className="cursor-pointer" onClick={() => !isPending && setAcceptTerms((v) => !v)}>
                    Tôi đã đọc và đồng ý{" "}
                  </span>
                  <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">
                    Điều khoản sử dụng
                  </a>{" "}
                  và{" "}
                  <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">
                    Chính sách bảo mật
                  </a>{" "}
                  <span className="text-gray-400">(phiên bản {LEGAL_VERSION})</span>
                  <span className="text-rose-500"> *</span>
                </p>
              </div>
              <p className="text-[11px] text-gray-500 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                Sau khi đăng ký, tài khoản cần người quản lý duyệt trước khi sử dụng đầy đủ chức năng.
              </p>
            </>
          )}

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

        {/* Đăng ký tài khoản đang đóng ⇒ chỉ đường cho người mới */}
        {!caps.registrationOpen && (
          <div className="w-full mt-5 flex items-start gap-2.5 text-left rounded-2xl border border-purple-100 bg-purple-50/70 p-3.5 text-[11px] leading-relaxed text-gray-700">
            <MessageCircleQuestion className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1.5">
              <p>
                <b className="text-gray-900">Bạn mới muốn vào ở lưu xá?</b> Hiện nhà chưa mở đăng ký tài khoản trực tuyến. Hãy gửi{" "}
                <Link href="/lien-he" className="font-bold text-primary hover:underline">
                  Đăng ký tìm hiểu
                </Link>{" "}
                — người quản lý sẽ liên lạc và hướng dẫn bạn.
              </p>
              <p>
                Đã được nhà nhận vào ở? Người quản lý sẽ cấp tài khoản cho bạn.{" "}
                <Link href="/gioi-thieu" className="font-semibold text-primary hover:underline">
                  Tìm hiểu về lưu xá
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* NOTICE FOOTER */}
        <div className="mt-8 pt-6 border-t border-gray-100 w-full">
          {!isSignUp && (
            <p className="mb-3 text-center text-[11px] leading-relaxed text-gray-500">
              Bằng việc đăng nhập, bạn đồng ý với{" "}
              <Link href={LEGAL_PATHS.terms} target="_blank" className="font-semibold text-primary hover:underline">Điều khoản sử dụng</Link> và{" "}
              <Link href={LEGAL_PATHS.privacy} target="_blank" className="font-semibold text-primary hover:underline">Chính sách bảo mật</Link>.
            </p>
          )}
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bảo mật nội bộ · Lưu Xá Phanxicô Assisi</span>
          </div>
        </div>
      </div>
      <AppFooter variant="minimal" className="mt-3" />
    </div>
  );
}
