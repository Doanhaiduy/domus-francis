"use client";

import React, { useEffect, useState } from "react";
import { X, UserCog, Lock, Church, GraduationCap } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomInput, CustomSelect, CustomToggle, ImageUploadDropzone } from "@/components/ui/FormControls";
import { AddressPicker, HometownPicker } from "@/components/ui/GeoPicker";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople, useLookups, useMemberDetail } from "@/lib/data/members";

const SACRAMENTS = ["Rửa tội", "Thánh thể", "Thêm sức", "Hòa giải"];
const splitParent = (s?: string) => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s ?? "");
  return m ? { name: m[1], phone: m[2] } : { name: s ?? "", phone: "" };
};

interface Props {
  memberId: string | null;
  onClose: () => void;
}

/** Sửa hồ sơ: chính chủ hoặc cán bộ có quyền. Phần riêng tư / Công giáo chỉ hiện khi được phép (RLS quyết định khi lưu). */
export default function EditMemberModal({ memberId, onClose }: Props) {
  const { showToast } = useApp();
  const { session, can } = useSession();
  const { member } = useMemberDetail(memberId);
  const lookups = useLookups();
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageDues = can("member.update") || can("finance.contribution.plan.manage") || can("finance.settings.write");

  useEffect(() => {
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
  }, [member]);

  if (!memberId) return null;
  const set = (k: string) => (v: any) => setF((p) => ({ ...p, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
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
      await refreshPeople();
      showToast("success", `Đã lưu hồ sơ ${f.fullName}.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const section = (icon: React.ReactNode, title: string, note?: string) => (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-primary">{icon}</span>
      <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wide">{title}</h4>
      {note && <span className="text-[10px] text-gray-400">{note}</span>}
    </div>
  );

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5">
        <div className="flex min-h-full items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Sửa hồ sơ thành viên</h3>
                  <p className="text-xs text-gray-500">{member?.fullName ?? "Đang tải…"}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!member ? (
              <div className="p-10 text-center text-sm text-gray-400">Đang tải hồ sơ…</div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
                {section(<UserCog className="w-4 h-4" />, "Thông tin cơ bản")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomInput label="Họ và tên" value={f.fullName ?? ""} onChange={set("fullName")} />
                  <CustomInput label="Tên gọi" value={f.displayName ?? ""} onChange={set("displayName")} />
                  <CustomInput label="Số điện thoại" value={f.phone ?? ""} onChange={set("phone")} />
                  <CustomInput label="Email liên hệ" type="email" value={f.email ?? ""} onChange={set("email")} />
                  <CustomSelect label="Giới tính" value={f.gender ?? "Nam"} onChange={set("gender")} options={[{ value: "Nam", label: "Nam" }, { value: "Nữ", label: "Nữ" }]} />
                  <div className="flex items-end">
                    <CustomToggle checked={!!f.hidePhone} onChange={set("hidePhone")} label="Ẩn SĐT với thành viên khác" />
                  </div>
                </div>
                <ImageUploadDropzone label="Ảnh đại diện" bucket="avatars" value={f.avatarFileId ?? ""} onChange={set("avatarFileId")} />

                {section(<GraduationCap className="w-4 h-4" />, "Học vụ & Tình trạng sinh viên")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    label="Trường"
                    value={f.universityId ?? ""}
                    onChange={set("universityId")}
                    options={[{ value: "", label: "— Chọn trường —" }, ...lookups.universities.map((u) => ({ value: u.id, label: u.name }))]}
                  />
                  <CustomInput label="Ngành học" value={f.major ?? ""} onChange={set("major")} />
                  <CustomInput label="Khóa (VD: K66 (2021 – 2026))" value={f.academicYear ?? ""} onChange={set("academicYear")} />
                  <CustomInput label="Mã sinh viên" value={f.studentCode ?? ""} onChange={set("studentCode")} />
                  {canManageDues && (
                    <div>
                      <CustomInput
                        label="Định mức quỹ kỳ riêng (VNĐ)"
                        value={f.customDuesVnd ? Number(f.customDuesVnd).toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          set("customDuesVnd")(val ? Number(val) : null);
                        }}
                        placeholder={`Tự động: ${f.studentStatus === "graduated" ? "500.000 đ (Đã ra trường)" : "300.000 đ (Sinh viên)"}`}
                      />
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        Để trống = tự động theo tình trạng (Sinh viên 300k, Đã ra trường 500k).
                      </span>
                    </div>
                  )}
                </div>

                {member.canEditPrivate ? (
                  <>
                    {section(<Lock className="w-4 h-4" />, "Thông tin riêng tư", "(chỉ chính chủ và Ban điều hành xem được)")}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <CustomInput label="Ngày sinh" type="date" value={f.birthDate ?? ""} onChange={set("birthDate")} />
                      <CustomInput
                        label={`Số CCCD ${member.identityCard ? `(hiện: ${member.identityCard})` : ""}`}
                        value={f.nationalId ?? ""}
                        onChange={set("nationalId")}
                        placeholder="Để trống nếu không đổi"
                      />
                      <div className="sm:col-span-2">
                        <HometownPicker value={f.hometown ?? ""} onChange={set("hometown")} />
                      </div>
                      <AddressPicker label="Địa chỉ thường trú" value={f.homeAddress ?? ""} onChange={set("homeAddress")} className="sm:col-span-2" />
                      <CustomInput label="Họ tên cha" value={f.fatherName ?? ""} onChange={set("fatherName")} />
                      <CustomInput label="SĐT cha" value={f.fatherPhone ?? ""} onChange={set("fatherPhone")} placeholder="Để trống nếu không đổi" />
                      <CustomInput label="Họ tên mẹ" value={f.motherName ?? ""} onChange={set("motherName")} />
                      <CustomInput label="SĐT mẹ" value={f.motherPhone ?? ""} onChange={set("motherPhone")} placeholder="Để trống nếu không đổi" />
                    </div>

                    {section(<Church className="w-4 h-4" />, "Hồ sơ Công giáo", "(cần đồng ý lưu dữ liệu tôn giáo)")}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <CustomInput label="Tên Thánh" value={f.holyName ?? ""} onChange={set("holyName")} />
                      <CustomSelect
                        label="Giáo phận"
                        value={f.dioceseId ?? ""}
                        onChange={set("dioceseId")}
                        options={[{ value: "", label: "— Chọn giáo phận —" }, ...lookups.dioceses.map((d) => ({ value: d.id, label: d.name }))]}
                      />
                      <CustomInput label="Giáo xứ" value={f.parish ?? ""} onChange={set("parish")} />
                      <CustomInput label="Linh mục quản xứ" value={f.pastor ?? ""} onChange={set("pastor")} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SACRAMENTS.map((s) => {
                        const on = (f.sacraments ?? []).includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => set("sacraments")(on ? f.sacraments.filter((x: string) => x !== s) : [...(f.sacraments ?? []), s])}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${on ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                    Thông tin riêng tư và hồ sơ Công giáo chỉ chính chủ hoặc Ban điều hành được chỉnh sửa.
                  </p>
                )}

                {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
              </div>
            )}

            <div className="p-4 px-6 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/70">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
                Hủy
              </button>
              <button onClick={save} disabled={busy || !member} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-60">
                {busy ? "Đang lưu…" : "Lưu hồ sơ"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
