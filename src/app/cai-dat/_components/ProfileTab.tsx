"use client";

import React, { useEffect, useState } from "react";
import { User, Lock, Church, GraduationCap, Save, RotateCcw, AlertCircle, CheckCircle2, Camera, Loader2 } from "lucide-react";
import { CustomInput, CustomSelect, CustomToggle, uploadFile } from "@/components/ui/FormControls";
import { ProfileSkeleton } from "./TabSkeletons";
import { JoinedMonthYear, MajorSelect, StudyYears } from "@/components/members/StudyFields";
import { AppearanceCard } from "./AppearanceCard";
import { AddressPicker, HometownPicker } from "@/components/ui/GeoPicker";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage, fileUrl } from "@/lib/api";
import { cohortLabel } from "@/lib/types/members";
import { membersApi, refreshPeople, useLookups, useMemberDetail } from "@/lib/data/members";
import { consentsApi, useMyConsents } from "@/lib/data/consents";

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
  const { consents } = useMyConsents(!!memberId);
  const [consentBusy, setConsentBusy] = useState(false);
  // Chưa tải xong trạng thái đồng ý ⇒ coi như chưa đồng ý (không gửi dữ liệu Công giáo, tránh lỗi)
  const catholicOk = !!consents?.catholic_profile;

  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const canManageMembers = can("member.update");
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
      enrollmentYear: member.enrollmentYear ?? null,
      expectedGraduationYear: member.expectedGraduationYear ?? null,
      joinedOn: member.joinedOn ?? "",
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

  if (isLoading || !member) return <ProfileSkeleton />;

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
      enrollmentYear: f.enrollmentYear ?? null,
      expectedGraduationYear: f.expectedGraduationYear ?? null,
      studentCode: f.studentCode || null,
      studentStatus: f.studentStatus || "studying",
    };

    if (canManageMembers && f.joinedOn) body.joinedOn = f.joinedOn;
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

    if (member.canViewCatholic && catholicOk) {
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

  const toggleConsent = async (purpose: "catholic_profile" | "catholic_share_leadership", granted: boolean) => {
    setConsentBusy(true);
    try {
      await consentsApi.set(purpose, granted);
      showToast("success", granted ? "Đã ghi nhận đồng ý của bạn." : "Đã rút đồng ý.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setConsentBusy(false);
    }
  };

  const avatar = fileUrl(f.avatarFileId || member.avatarFileId, "thumb");

  // Bấm vào ảnh đại diện → chọn ảnh → tải lên và lưu ngay (giống Facebook / Zalo), không cần bấm "Lưu"
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("warning", "Chỉ chọn ảnh JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("warning", "Ảnh quá lớn (tối đa 10MB).");
      return;
    }
    setAvatarBusy(true);
    try {
      const up = await uploadFile(file, "avatars");
      await membersApi.update(member.id, { avatarFileId: up.id });
      setF((p) => ({ ...p, avatarFileId: up.id }));
      await mutate();
      await refreshPeople();
      showToast("success", "Đã cập nhật ảnh đại diện.");
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 1. PROFILE HERO HEADER */}
      <div className="bg-gradient-to-r from-purple-50 via-purple-50/40 to-transparent p-5 sm:p-6 rounded-3xl border border-purple-100/80 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            title="Đổi ảnh đại diện"
            aria-label="Đổi ảnh đại diện"
            className="group relative block w-24 h-24 rounded-full overflow-hidden shadow-sm ring-4 ring-white focus:outline-none focus-visible:ring-primary disabled:cursor-wait"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full bg-purple-600 text-white flex items-center justify-center text-3xl font-bold">
                {f.displayName?.[0] || f.fullName?.[0] || "U"}
              </span>
            )}
            <span
              className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${
                avatarBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              {avatarBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
            </span>
          </button>
          <span className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-primary pointer-events-none">
            <Camera className="w-4 h-4" />
          </span>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarPick} />
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
            {cohortLabel(member) ? ` · ${cohortLabel(member)}` : ""}
          </p>

          <p className="text-[11px] text-gray-400 pt-1">
            Bấm vào ảnh để đổi ảnh đại diện. Mọi thành viên đều có thể tự cập nhật thông tin cá nhân, quê quán, số điện thoại cha mẹ và giáo xứ tại đây.
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

      <AppearanceCard />

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
              <MajorSelect value={f.major ?? ""} onChange={set("major")} />
              <CustomInput label="Khóa" value={f.academicYear ?? ""} onChange={set("academicYear")} placeholder="VD: K66" />
            </div>

            <StudyYears
              enrollmentYear={f.enrollmentYear}
              graduationYear={f.expectedGraduationYear}
              onChange={(v) => setF((p: any) => ({ ...p, ...v }))}
            />

            {canManageMembers ? (
              <JoinedMonthYear value={f.joinedOn ?? ""} onChange={set("joinedOn")} />
            ) : (
              member.joinedOn && <p className="text-xs text-gray-500">Vào nhà lưu xá: <b className="text-gray-800">{`${member.joinedOn.slice(5, 7)}/${member.joinedOn.slice(0, 4)}`}</b> (do Ban điều hành cập nhật)</p>
            )}

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

          {!catholicOk ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex flex-col gap-2.5">
              <p className="leading-relaxed">
                Tên Thánh, giáo xứ, giáo phận và Bí tích là <b>dữ liệu nhạy cảm về tôn giáo</b>. Hệ thống chỉ lưu khi chính bạn đồng ý; bạn có thể rút đồng ý bất cứ lúc nào.
                Chưa đồng ý thì các ô dưới đây bị khóa và các phần khác của hồ sơ vẫn lưu bình thường.
              </p>
              <button
                type="button"
                onClick={() => toggleConsent("catholic_profile", true)}
                disabled={consentBusy || !consents}
                className="self-start px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white font-bold disabled:opacity-60 transition active:scale-95"
              >
                {consentBusy ? "Đang lưu…" : "Đồng ý lưu hồ sơ Công giáo"}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <CustomToggle
                checked={!!consents?.catholic_share_leadership}
                onChange={(v) => toggleConsent("catholic_share_leadership", v)}
                disabled={consentBusy}
                label="Cho Ban điều hành xem hồ sơ Công giáo"
                description="Để phục vụ sinh hoạt phụng vụ (Trưởng nhà, Trưởng ban Phụng vụ)."
              />
              <button type="button" onClick={() => toggleConsent("catholic_profile", false)} disabled={consentBusy} className="text-[11px] font-semibold text-gray-400 hover:text-rose-600 transition">
                Rút đồng ý lưu hồ sơ Công giáo
              </button>
            </div>
          )}

          <div className={`space-y-3 ${catholicOk ? "" : "opacity-60 pointer-events-none select-none"}`} aria-disabled={!catholicOk}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput label="Tên Thánh (Bổn mạng)" value={f.holyName ?? ""} onChange={set("holyName")} placeholder="VD: Phêrô, Giuse, Maria..." disabled={!catholicOk} />
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
