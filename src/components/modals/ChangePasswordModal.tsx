"use client";

import React, { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, errorMessage } from "@/lib/api";
import { CustomInput } from "@/components/ui/FormControls";

export default function ChangePasswordModal() {
  const { closeModal, showToast } = useApp();
  const { session, refreshSession } = useSession();
  const forced = !!session?.user.mustChangePassword;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("Mật khẩu nhập lại không khớp.");
    setBusy(true);
    try {
      await api.post("/api/v1/auth/password", { currentPassword: current, newPassword: next });
      await refreshSession();
      showToast("success", "Đã đổi mật khẩu. Các phiên đăng nhập trên thiết bị khác đã bị đăng xuất.");
      closeModal();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Đổi mật khẩu</h3>
            <p className="text-xs text-gray-500">
              {forced ? "Bạn đang dùng mật khẩu tạm — hãy đặt mật khẩu mới để tiếp tục." : "Tối thiểu 8 ký tự, có cả chữ và số."}
            </p>
          </div>
        </div>
        {!forced && (
          <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="p-6 space-y-4">
        <CustomInput label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <CustomInput label="Mật khẩu mới" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        <CustomInput label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
      </div>
      <div className="p-4 px-6 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/70">
        {!forced && (
          <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Hủy
          </button>
        )}
        <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60">
          {busy ? "Đang lưu…" : "Đổi mật khẩu"}
        </button>
      </div>
    </form>
  );
}
