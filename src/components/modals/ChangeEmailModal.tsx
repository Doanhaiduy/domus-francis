"use client";

import React, { useState } from "react";
import { Mail, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, errorMessage } from "@/lib/api";
import { CustomInput } from "@/components/ui/FormControls";

export default function ChangeEmailModal() {
  const { closeModal, showToast } = useApp();
  const { session, refreshSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ email: string }>("/api/v1/auth/email", { newEmail: email, password });
      await refreshSession();
      showToast("success", `Đã đổi email đăng nhập thành ${r.email}. Lần sau đăng nhập bằng email này.`);
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
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Đổi email đăng nhập</h3>
            <p className="text-xs text-gray-500">Email hiện tại: <b className="text-gray-700">{session?.user.email ?? "—"}</b></p>
          </div>
        </div>
        <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <CustomInput
          label="Email đăng nhập mới"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@gmail.com"
          hint="Gõ cẩn thận: hệ thống không gửi thư xác nhận, từ lần sau bạn đăng nhập bằng đúng email này."
          required
        />
        <CustomInput label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
      </div>
      <div className="p-4 px-6 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/70">
        <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
          Hủy
        </button>
        <button type="submit" disabled={busy || !email.trim() || !password} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60">
          {busy ? "Đang lưu…" : "Đổi email"}
        </button>
      </div>
    </form>
  );
}
