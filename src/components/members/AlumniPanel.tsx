"use client";

import React, { useMemo, useState } from "react";
import { Briefcase, Download, Loader2, Mail, MapPin, Pencil, Phone, Search, UsersRound, X } from "lucide-react";
import { Portal } from "@/components/ui/Portal";
import { CustomInput, CustomTextarea, CustomToggle } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { alumniApi, useAlumni } from "@/lib/data/alumni";
import type { AlumniDto } from "@/lib/types/alumni";
import { cn } from "@/lib/utils";

type Filter = "alumni" | "left" | "all";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

async function exportExcel(items: AlumniDto[]) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const head = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#EDE9FE", align: "center" as const });
  const rows = [
    ["Họ và tên", "Trạng thái", "Ngày rời / ra trường", "Năm ra trường", "Trường", "Ngành", "Nghề nghiệp", "Nơi làm việc", "Thành phố", "Số điện thoại", "Email", "Còn giữ liên lạc"].map(head),
    ...items.map((a) =>
      [
        a.fullName,
        a.status === "alumni" ? "Cựu thành viên" : "Đã rời",
        dmy(a.leftOn),
        a.graduationYear ? String(a.graduationYear) : "",
        a.university ?? "",
        a.major ?? "",
        a.occupation ?? "",
        a.workplace ?? "",
        a.city ?? "",
        a.phone,
        a.email ?? "",
        a.keepsContact ? "Có" : "Chưa",
      ].map((v) => ({ value: v, type: String }))
    ),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)([{ data: rows, sheet: "Cuu thanh vien", columns: [26, 16, 18, 14, 28, 24, 24, 28, 18, 16, 28, 16].map((width) => ({ width })) }]).toFile("Cuu_thanh_vien.xlsx");
}

/** Mạng lưới cựu thành viên: danh sách người đã ra trường / rời lưu xá + nghề nghiệp, nơi làm việc, thành phố. */
export default function AlumniPanel() {
  const { items, canManage, isLoading } = useAlumni();
  const [filter, setFilter] = useState<Filter>("alumni");
  const [q, setQ] = useState("");
  const [onlyContact, setOnlyContact] = useState(false);
  const [editing, setEditing] = useState<AlumniDto | null>(null);

  const shown = useMemo(() => {
    const k = fold(q.trim());
    return items.filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        (!onlyContact || a.keepsContact) &&
        (!k || [a.fullName, a.name, a.occupation, a.workplace, a.city, a.university, a.major].some((v) => v && fold(v).includes(k)))
    );
  }, [items, filter, q, onlyContact]);
  const counts = { alumni: items.filter((a) => a.status === "alumni").length, left: items.filter((a) => a.status === "left").length };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, nghề nghiệp, nơi làm việc, thành phố…"
            aria-label="Tìm cựu thành viên"
            className="w-full lg:w-80 pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {(
            [
              ["alumni", `Cựu thành viên (${counts.alumni})`],
              ["left", `Đã rời (${counts.left})`],
              ["all", "Tất cả"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0", filter === k ? "bg-primary text-white shadow-xs" : "bg-surface-container-low text-gray-700 hover:bg-purple-100")}>
              {label}
            </button>
          ))}
          <button onClick={() => setOnlyContact((v) => !v)} aria-pressed={onlyContact} className={cn("px-3.5 py-1.5 rounded-xl font-bold text-xs transition shrink-0 border", onlyContact ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>
            Còn giữ liên lạc
          </button>
        </div>
        {canManage && shown.length > 0 && (
          <button onClick={() => void exportExcel(shown)} className="lg:ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-200 bg-white text-primary text-xs font-bold hover:bg-purple-50 transition">
            <Download className="w-4 h-4" /> Xuất Excel ({shown.length})
          </button>
        )}
      </div>

      {isLoading && !items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer-box h-36 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-white p-12 text-center">
          <UsersRound className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-900">{items.length ? "Không có cựu thành viên nào khớp" : "Chưa có cựu thành viên"}</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{items.length ? "Thử bỏ bớt bộ lọc." : "Khi một thành viên ra trường hoặc rời lưu xá (Hồ sơ → Trạng thái), họ sẽ xuất hiện ở đây."}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id} className="bg-white border border-purple-100 rounded-2xl p-4 flex flex-col gap-2.5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-11 h-11 rounded-full bg-purple-100 text-primary font-extrabold flex items-center justify-center shrink-0">{a.name.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}</span>
                  )}
                  <div className="min-w-0">
                    <p className="font-extrabold text-gray-900 truncate">{a.fullName}</p>
                    <p className="text-[11px] text-gray-500">
                      {a.status === "alumni" ? "Cựu thành viên" : "Đã rời lưu xá"} · {dmy(a.leftOn)}
                      {a.graduationYear ? ` · K.${a.graduationYear}` : ""}
                    </p>
                  </div>
                </div>
                {a.canEdit && (
                  <button onClick={() => setEditing(a)} aria-label={`Sửa hồ sơ cựu ${a.fullName}`} title="Sửa hồ sơ cựu" className="p-1.5 rounded-lg text-gray-400 hover:bg-purple-50 hover:text-primary transition">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
              {(a.university || a.major) && <p className="text-xs text-gray-600">{[a.university, a.major].filter(Boolean).join(" · ")}</p>}
              <ul className="space-y-1 text-xs text-gray-700">
                {(a.occupation || a.workplace) && (
                  <li className="flex gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    {[a.occupation, a.workplace].filter(Boolean).join(" — ")}
                  </li>
                )}
                {a.city && (
                  <li className="flex gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    {a.city}
                  </li>
                )}
                {a.phone && (
                  <li className="flex gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="hover:text-primary">{a.phone}</a>
                  </li>
                )}
                {a.email && (
                  <li className="flex gap-1.5 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <a href={`mailto:${a.email}`} className="hover:text-primary truncate">{a.email}</a>
                  </li>
                )}
              </ul>
              {a.note && <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">{a.note}</p>}
              <div className="mt-auto pt-1">
                {a.keepsContact ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wider">Còn giữ liên lạc</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-extrabold uppercase tracking-wider">Chưa rõ</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <AlumniEditModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AlumniEditModal({ item, onClose }: { item: AlumniDto; onClose: () => void }) {
  const { showToast } = useApp();
  const [year, setYear] = useState(item.graduationYear ? String(item.graduationYear) : "");
  const [occupation, setOccupation] = useState(item.occupation ?? "");
  const [workplace, setWorkplace] = useState(item.workplace ?? "");
  const [city, setCity] = useState(item.city ?? "");
  const [keeps, setKeeps] = useState(item.keepsContact);
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1980 || y > 2100)) return showToast("error", "Năm ra trường không hợp lệ (1980–2100).");
    setBusy(true);
    try {
      await alumniApi.save(item.id, { graduationYear: y, occupation: occupation.trim() || null, workplace: workplace.trim() || null, city: city.trim() || null, keepsContact: keeps, note: note.trim() || null });
      showToast("success", "Đã lưu hồ sơ cựu.");
      onClose();
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div onClick={() => !busy && onClose()} className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-fadeIn">
        <div role="dialog" aria-modal="true" aria-label="Hồ sơ cựu thành viên" onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] shadow-2xl border border-gray-100 flex flex-col animate-scaleIn">
          <div className="flex items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-gray-900">Hồ sơ cựu: {item.fullName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Giúp anh em giữ liên lạc và giới thiệu việc làm, thực tập cho các em.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-4 overflow-y-auto custom-scroll space-y-3.5">
            <CustomInput label="Năm ra trường" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="VD: 2025" />
            <CustomInput label="Nghề nghiệp / vị trí" value={occupation} onChange={(e) => setOccupation(e.target.value)} maxLength={120} placeholder="VD: Kỹ sư phần mềm" />
            <CustomInput label="Nơi làm việc" value={workplace} onChange={(e) => setWorkplace(e.target.value)} maxLength={200} placeholder="VD: Công ty ABC" />
            <CustomInput label="Thành phố đang sống" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} placeholder="VD: TP. Hồ Chí Minh" />
            <CustomTextarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="VD: Sẵn lòng hướng dẫn thực tập, hay về dự lễ bổn mạng." />
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <CustomToggle checked={keeps} onChange={setKeeps} label="Còn giữ liên lạc & đồng ý chia sẻ" description="Bật khi cựu thành viên đã đồng ý: thông tin nghề nghiệp này hiện cho mọi thành viên trong cộng đoàn xem." />
            </div>
          </div>
          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container transition active:scale-95 disabled:opacity-60">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Lưu
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
