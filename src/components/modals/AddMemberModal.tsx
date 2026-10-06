"use client";

import { JoinedMonthYear } from "@/components/members/StudyFields";
import React, { useMemo, useState } from "react";
import { Users, X, KeyRound, Copy, CheckCircle2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople } from "@/lib/data/members";
import { CustomInput, CustomSelect, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";

export default function AddMemberModal() {
  const { closeModal, showToast, rooms, members } = useApp();
  const { can } = useSession();
  const canAssignRole = can("auth.role.assign");
  const canCreateAccount = can(["auth.user.manage", "application.review"]);

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"Nam" | "Nữ">("Nam");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [room, setRoom] = useState("");
  const [role, setRole] = useState("Thành viên");
  const [avatar, setAvatar] = useState("");
  const [joinedOn, setJoinedOn] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [createAccount, setCreateAccount] = useState(canCreateAccount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  // Phòng ngủ còn chỗ (sức chứa − số người đang ở)
  const roomOptions = useMemo(() => {
    const occ: Record<string, number> = {};
    for (const m of members) occ[m.room] = (occ[m.room] ?? 0) + 1;
    return [
      { value: "", label: "Chưa xếp phòng" },
      ...rooms
        .filter((r) => r.type === "bedroom" && r.status === "active")
        .map((r) => ({
          value: r.id,
          label: `${r.name} (Tầng ${r.floor} · ${occ[r.id] ?? 0}/${r.capacity} chỗ)`,
          disabled: (occ[r.id] ?? 0) >= r.capacity,
        }))
        .filter((o) => !o.disabled)
        .map(({ value, label }) => ({ value, label })),
    ];
  }, [rooms, members]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (createAccount && !email.trim()) return setError("Nhập email để cấp tài khoản đăng nhập.");
    setBusy(true);
    try {
      const r = await membersApi.create({
        fullName: fullName.trim(),
        gender,
        phone: phone.trim() || null,
        email: email.trim() || null,
        roomCode: room || null,
        avatarFileId: avatar || null,
        joinedOn,
        role,
        createAccount,
      });
      await refreshPeople();
      if (r.account) {
        setCreated({ name: fullName.trim(), email: r.account.email, password: r.account.temporaryPassword });
      } else {
        showToast("success", `Đã thêm thành viên ${fullName.trim()}${room ? ` (${room})` : ""} vào danh bạ.`);
        closeModal();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Đã thêm {created.name}</h3>
            <p className="text-xs text-gray-500">Tài khoản đăng nhập đã được tạo. Mật khẩu tạm chỉ hiển thị một lần.</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-sm space-y-1.5">
          <div>
            Đăng nhập: <b>{created.email}</b>
          </div>
          <div className="flex items-center gap-2">
            Mật khẩu tạm: <code className="px-2 py-0.5 rounded bg-white border font-mono font-bold text-primary">{created.password}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(`${created.email} / ${created.password}`);
                showToast("success", "Đã sao chép thông tin đăng nhập.");
              }}
              className="p-1 rounded-lg hover:bg-purple-50 text-gray-500"
              title="Sao chép"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 flex items-start gap-1.5 pt-1">
            <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Thành viên sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên. Hãy gửi trực tiếp, không đăng lên nhóm chung.
          </p>
        </div>
        <div className="flex justify-end">
          <button onClick={closeModal} className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold">
            Xong
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-purple-100 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] overflow-hidden">
      <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Thêm Thành Viên Mới</h3>
            <p className="text-xs text-gray-500">Tạo hồ sơ trực tiếp (không qua đơn đăng ký)</p>
          </div>
        </div>
        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <CustomInput label="Họ và tên đầy đủ *" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ví dụ: Nguyễn Văn Hoàng" />

          <div className="grid grid-cols-2 gap-3">
            <CustomSelect label="Phòng lưu trú" value={room} onChange={setRoom} options={roomOptions} />
            <CustomSelect
              label="Giới tính"
              value={gender}
              onChange={(v) => setGender(v as "Nam" | "Nữ")}
              options={[
                { value: "Nam", label: "Nam" },
                { value: "Nữ", label: "Nữ" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CustomInput label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" />
            <CustomInput label={createAccount ? "Email (đăng nhập) *" : "Email"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
          </div>

          {canCreateAccount && (
            <div className="p-3 rounded-2xl border border-purple-100 bg-purple-50/40 space-y-3">
              <CustomToggle
                checked={createAccount}
                onChange={setCreateAccount}
                label="Cấp tài khoản đăng nhập"
                description="Tạo tài khoản với mật khẩu tạm; thành viên đổi mật khẩu khi đăng nhập lần đầu."
              />
              {createAccount && canAssignRole && (
                <CustomSelect
                  label="Vai trò"
                  value={role}
                  onChange={setRole}
                  options={["Thành viên", "Thủ quỹ", "Trưởng nhà", "Admin"].map((v) => ({ value: v, label: v }))}
                />
              )}
            </div>
          )}

          <JoinedMonthYear value={joinedOn} onChange={setJoinedOn} />

          <ImageUploadDropzone label="Ảnh đại diện (tùy chọn)" bucket="avatars" value={avatar} onChange={setAvatar} />

          {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="p-4 px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
          <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={busy || !fullName.trim()}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60"
          >
            {busy ? "Đang lưu…" : "Lưu thành viên"}
          </button>
        </div>
      </form>
    </div>
  );
}
