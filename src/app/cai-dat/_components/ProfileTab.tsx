"use client";

import React, { useEffect, useState } from "react";
import { User, Lock, Church, GraduationCap, Save, RotateCcw, AlertCircle, CheckCircle2, ShieldCheck, Mail, Phone, MapPin, Sparkles } from "lucide-react";
import { CustomInput, CustomSelect, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";
import { AddressPicker, HometownPicker } from "@/components/ui/GeoPicker";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage, fileUrl } from "@/lib/api";
import { membersApi, refreshPeople, useLookups, useMemberDetail } from "@/lib/data/members";

const SACRAMENTS = ["Rửa tội", "Thánh thể", "Thêm sức", "Hòa giải"];
const splitParent = (s?: string) => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s ?? "");
  return m ? { name: m[1], phone: m[2] } : { name: s ?? "", phone: "" };
};

export default function ProfileTab() {
  const { showToast } = useApp();
  const { session, can } = useSession();
  const memberId = session?.member?.id;
  const { member, isLoading, mutate } = useMemberDetail(memberId);
  const lookups = useLookups();

  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const canManageDues = can("member.update") || can("finance.contribution.plan.manage") || can("finance.settings.write");

  const resetForm = React.useCallback(() => {
    if (!member) return;
    const father = splitParent(member.fatherName);
    const mother = splitParent(member.motherName);
    setF({
      fullName: member.fullName,
      displayName: member.name,
      gender: member.gender ?? "Nam",
      phone: member.phone,
      email: member.email ?? "",
      hidePhone: member.hidePhone,
      avatarFileId: member.avatarFileId ?? "",
      birthDate: member.birthDateIso ?? "",
      hometown: member.hometown ?? "",
      homeAddress: member.homeAddress ?? "",
      nationalId: "",
      fatherName: father.name,
      fatherPhone: father.phone.startsWith("•") ? "" : father.phone,
      motherName: mother.name,
      motherPhone: mother.phone.startsWith("•") ? "" : mother.phone,
      holyName: member.holyName ?? "",
      dioceseId: member.dioceseId ?? "",
      parish: member.parish ?? "",
      pastor: member.pastor ?? "",
      sacraments: member.sacraments ?? [],
      universityId: member.universityId ?? "",
      major: member.major ?? "",
      academicYear: member.academicYear ?? "",
      studentCode: member.studentCode ?? "",
      studentStatus: member.studentStatus ?? "studying",
      customDuesVnd: member.customDuesVnd ?? "",
    });
    setError(null);
    setIsSaved(false);
  }, [member]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  if (!memberId) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-purple-50 shadow-xs text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-900">Chưa liên kết hồ sơ thành viên</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          Tài khoản này chưa được gắn với hồ sơ thành viên cụ thể trong lưu xá. Vui lòng liên hệ Admin hoặc Trưởng nhà để kích hoạt hồ sơ.
        </p>
      </div>
    );
  }

  if (isLoading || !member) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-purple-50 shadow-xs text-center text-sm text-gray-400">
        Đang tải thông tin hồ sơ của bạn…
      </div>
    );
  }

  const set = (k: string) => (v: any) => {
    setIsSaved(false);
    setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setError(null);
    setBusy(true);

    const body: Record<string, unknown> = {
      fullName: f.fullName,
      displayName: f.displayName,
      gender: f.gender,
      phone: f.phone || null,
      email: f.email || null,
      hidePhone: !!f.hidePhone,
      avatarFileId: f.avatarFileId || null,
      universityId: f.universityId || null,
      major: f.major || null,
      academicYear: f.academicYear || null,
      studentCode: f.studentCode || null,
      studentStatus: f.studentStatus || "studying",
    };

    if (canManageDues && f.customDuesVnd !== undefined) {
      body.customDuesVnd = f.customDuesVnd !== "" && f.customDuesVnd !== null ? Number(f.customDuesVnd) : null;
    }

    if (member.canEditPrivate) {
      Object.assign(body, {
        birthDate: f.birthDate || null,
        hometown: f.hometown || null,
        homeAddress: f.homeAddress || null,
        fatherName: f.fatherName || null,
        fatherPhone: f.fatherPhone || null,
        motherName: f.motherName || null,
        motherPhone: f.motherPhone || null,
      });
      if (f.nationalId) body.nationalId = f.nationalId;
    }

    if (member.canViewCatholic) {
      Object.assign(body, {
        holyName: f.holyName || null,
        dioceseId: f.dioceseId || null,
        parish: f.parish || null,
        pastor: f.pastor || null,
        sacraments: f.sacraments,
      });
    }

    try {
      await membersApi.update(member.id, body);
      await mutate();
      await refreshPeople();
      setIsSaved(true);
      showToast("success", "Đã cập nhật hồ sơ cá nhân thành công.");
    } catch (e) {
      setError(errorMessage(e));
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const avatar = fileUrl(f.avatarFileId || member.avatarFileId, "thumb");

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 1. PROFILE HERO HEADER */}
      <div className="bg-gradient-to-r from-purple-50 via-purple-50/40 to-transparent p-5 sm:p-6 rounded-3xl border border-purple-100/80 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative group shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-sm ring-4 ring-white" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-purple-600 text-white flex items-center justify-center text-2xl font-bold shadow-sm ring-4 ring-white">
              {f.displayName?.[0] || f.fullName?.[0] || "U"}
            </div>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-bold text-gray-900">{f.fullName || member.fullName}</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-fixed text-on-primary-fixed">
              {session?.roleLabel ?? "Thành viên"}
            </span>
            {member.roomName && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                Phòng {member.roomName}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500">
            {member.holyName ? `Tên Thánh: ${member.holyName} · ` : ""}
            {member.university || "Chưa cập nhật trường"}
            {member.academicYear ? ` · ${member.academicYear}` : ""}
          </p>

          <p className="text-[11px] text-gray-400 pt-1">
            Mọi thành viên đều có thể tự cập nhật thông tin cá nhân, ảnh đại diện, quê quán, số điện thoại cha mẹ và giáo xứ tại đây.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={resetForm}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục</span>
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-container shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{busy ? "Đang lưu…" : "Lưu thay đổi"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isSaved && !error && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Thông tin hồ sơ đã được lưu thành công.</span>
        </div>
      )}

      {/* 2. MAIN FORMS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: THÔNG TIN CƠ BẢN & LIÊN HỆ */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Thông tin cơ bản &amp; Liên hệ</h3>
              <p className="text-[11px] text-gray-400">Tên hiển thị, số điện thoại và email cá nhân</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Họ và tên" value={f.fullName ?? ""} onChange={set("fullName")} required />
              <CustomInput label="Tên gọi / Biệt danh" value={f.displayName ?? ""} onChange={set("displayName")} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Số điện thoại" value={f.phone ?? ""} onChange={set("phone")} placeholder="0901234567" />
              <CustomInput label="Email liên hệ" type="email" value={f.email ?? ""} onChange={set("email")} placeholder="ban@gmail.com" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <CustomSelect
                label="Giới tính"
                value={f.gender ?? "Nam"}
                onChange={set("gender")}
                options={[
                  { value: "Nam", label: "Nam" },
                  { value: "Nữ", label: "Nữ" },
                ]}
              />
              <div className="pb-1">
                <CustomToggle
                  checked={!!f.hidePhone}
                  onChange={set("hidePhone")}
                  label="Ẩn SĐT với thành viên khác"
                />
              </div>
            </div>

            <div className="pt-2">
              <ImageUploadDropzone
                label="Ảnh đại diện đại biểu"
                bucket="avatars"
                value={f.avatarFileId ?? ""}
                onChange={set("avatarFileId")}
              />
            </div>
          </div>
        </div>

        {/* CARD 2: HỌC VỤ & TÌNH TRẠNG SINH VIÊN */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Học vụ &amp; Tình trạng</h3>
              <p className="text-[11px] text-gray-400">Trường đại học, ngành học, khóa và tình trạng học tập</p>
            </div>
          </div>

          <div className="space-y-3">
            <CustomSelect
              label="Tình trạng học tập"
              value={f.studentStatus ?? "studying"}
              onChange={set("studentStatus")}
              options={[
                { value: "studying", label: "Đang học (Sinh viên)" },
                { value: "graduated", label: "Đã tốt nghiệp (Ra trường / Đi làm)" },
                { value: "suspended", label: "Bảo lưu" },
                { value: "dropped_out", label: "Thôi học" },
              ]}
            />

            <CustomSelect
              label="Trường đại học / Cao đẳng"
              value={f.universityId ?? ""}
              onChange={set("universityId")}
              options={[
                { value: "", label: "— Chọn trường —" },
                ...lookups.universities.map((u) => ({ value: u.id, label: u.name })),
              ]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Ngành học" value={f.major ?? ""} onChange={set("major")} placeholder="VD: Công nghệ thông tin" />
              <CustomInput label="Khóa học" value={f.academicYear ?? ""} onChange={set("academicYear")} placeholder="VD: K66 (2021 – 2026)" />
            </div>

            <CustomInput label="Mã sinh viên" value={f.studentCode ?? ""} onChange={set("studentCode")} placeholder="VD: 20210001" />

            {canManageDues && (
              <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 space-y-1">
                <CustomInput
                  label="Định mức quỹ kỳ riêng (VNĐ)"
                  value={f.customDuesVnd ? Number(f.customDuesVnd).toLocaleString("vi-VN") : ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    set("customDuesVnd")(val ? Number(val) : null);
                  }}
                  placeholder={`Tự động: ${f.studentStatus === "graduated" ? "500.000 đ (Đã ra trường)" : "300.000 đ (Sinh viên)"}`}
                />
                <span className="text-[10px] text-gray-500 block">
                  Chỉ cán bộ có quyền mới chỉnh sửa ô này. Để trống = áp dụng định mức tự động.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CARD 3: THÔNG TIN RIÊNG TƯ & QUÊ QUÁN */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Thông tin riêng tư &amp; Quê quán</h3>
              <p className="text-[11px] text-gray-400">Chỉ chính chủ và Ban điều hành xem được</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Ngày sinh" type="date" value={f.birthDate ?? ""} onChange={set("birthDate")} />
              <CustomInput
                label={`Số CCCD / CMND ${member.identityCard ? `(${member.identityCard})` : ""}`}
                value={f.nationalId ?? ""}
                onChange={set("nationalId")}
                placeholder="Để trống nếu không đổi"
              />
            </div>

            <HometownPicker value={f.hometown ?? ""} onChange={set("hometown")} />

            <AddressPicker label="Địa chỉ thường trú" value={f.homeAddress ?? ""} onChange={set("homeAddress")} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <CustomInput label="Họ tên cha" value={f.fatherName ?? ""} onChange={set("fatherName")} placeholder="Họ tên cha" />
              <CustomInput label="SĐT cha" value={f.fatherPhone ?? ""} onChange={set("fatherPhone")} placeholder="Để trống nếu không đổi" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Họ tên mẹ" value={f.motherName ?? ""} onChange={set("motherName")} placeholder="Họ tên mẹ" />
              <CustomInput label="SĐT mẹ" value={f.motherPhone ?? ""} onChange={set("motherPhone")} placeholder="Để trống nếu không đổi" />
            </div>
          </div>
        </div>

        {/* CARD 4: HỒ SƠ CÔNG GIÁO */}
        <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
              <Church className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Hồ sơ Công giáo &amp; Bí tích</h3>
              <p className="text-[11px] text-gray-400">Tên Thánh bổn mạng, Giáo xứ, Giáo phận và các Bí tích</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Tên Thánh (Bổn mạng)" value={f.holyName ?? ""} onChange={set("holyName")} placeholder="VD: Phêrô, Giuse, Maria..." />
              <CustomSelect
                label="Giáo phận"
                value={f.dioceseId ?? ""}
                onChange={set("dioceseId")}
                options={[
                  { value: "", label: "— Chọn giáo phận —" },
                  ...lookups.dioceses.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Giáo xứ gốc" value={f.parish ?? ""} onChange={set("parish")} placeholder="VD: Giáo xứ Tân Triều" />
              <CustomInput label="Linh mục quản xứ" value={f.pastor ?? ""} onChange={set("pastor")} placeholder="VD: Cha Giuse Nguyễn Văn A" />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-gray-700">Các Bí tích đã lãnh nhận</label>
              <div className="flex flex-wrap gap-2">
                {SACRAMENTS.map((s) => {
                  const on = (f.sacraments ?? []).includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        set("sacraments")(
                          on ? f.sacraments.filter((x: string) => x !== s) : [...(f.sacraments ?? []), s]
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        on
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={resetForm}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 transition"
        >
          Hủy thay đổi
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{busy ? "Đang lưu…" : "Lưu hồ sơ cá nhân"}</span>
        </button>
      </div>
    </form>
  );
}
