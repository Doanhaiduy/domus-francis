"use client";

import React from "react";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { MfaCard, btnGhost, btnPrimary } from "./MfaCard";

/** Trạng thái cần chặn: mật khẩu tạm chưa đổi, hoặc vai trò bắt buộc 2FA mà chưa bật. */
export function useSecurityGate(): "password" | "mfa" | null {
  const { session } = useSession();
  if (!session?.member) return null;
  if (session.user.mustChangePassword) return "password";
  if (session.mfa.required && !session.mfa.enabled) return "mfa";
  return null;
}

/**
 * Màn hình chặn thay cho toàn bộ ứng dụng khi tài khoản đang dùng mật khẩu tạm hoặc vai trò bắt buộc 2FA mà chưa bật.
 * Khớp với việc chặn ở API (src/server/http.ts — mọi API trừ /api/v1/auth/* trả 403 PASSWORD_CHANGE_REQUIRED / MFA_REQUIRED).
 */
export function SecurityGate({ kind }: { kind: "password" | "mfa" }) {
  const { openModal } = useApp();
  const { session, logout } = useSession();
  const name = session?.member?.displayName ?? session?.member?.fullName ?? "bạn";

  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-4 py-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            {kind === "password" ? <KeyRound className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-extrabold text-gray-900">
            {kind === "password" ? "Đặt mật khẩu mới trước khi tiếp tục" : "Bật xác thực 2 bước trước khi tiếp tục"}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-lg mx-auto">
            {kind === "password"
              ? `Chào ${name}! Bạn đang đăng nhập bằng mật khẩu tạm do người quản lý cấp. Hãy đặt mật khẩu của riêng bạn (tối thiểu 8 ký tự, có cả chữ và số).`
              : `Chào ${name}! Vai trò của bạn (${session?.roleLabel ?? "quản lý"}) giữ tiền quỹ và dữ liệu cá nhân của cả nhà nên bắt buộc thêm lớp bảo vệ: mỗi lần đăng nhập cần mã 6 số từ ứng dụng trên điện thoại. Mất khoảng 2 phút.`}
          </p>
        </div>

        {kind === "password" ? (
          <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col items-center gap-3">
            <button type="button" onClick={() => openModal("changePassword")} className={btnPrimary}>
              <KeyRound className="w-3.5 h-3.5" /> Đặt mật khẩu mới
            </button>
          </div>
        ) : (
          <MfaCard gateMode />
        )}

        <div className="flex justify-center">
          <button type="button" onClick={() => void logout()} className={btnGhost}>
            <LogOut className="w-3.5 h-3.5" /> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
