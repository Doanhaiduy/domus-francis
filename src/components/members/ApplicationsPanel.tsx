"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Mail, Phone, GraduationCap, Clock, Inbox } from "lucide-react";
import { CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { membersApi, refreshPeople, useApplications } from "@/lib/data/members";

/** Đơn đăng ký chờ duyệt (application.review): duyệt kèm xếp phòng, hoặc từ chối có lý do. */
export default function ApplicationsPanel() {
  const { showToast, rooms, members } = useApp();
  const [showAll, setShowAll] = useState(false);
  const { applications, isLoading, mutate } = useApplications(true, showAll);
  const [roomFor, setRoomFor] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const roomOptions = useMemo(() => {
    const occ: Record<string, number> = {};
    for (const m of members) occ[m.room] = (occ[m.room] ?? 0) + 1;
    return [
      { value: "", label: "Chưa xếp phòng" },
      ...rooms
        .filter((r) => r.type === "bedroom" && r.status === "active" && (occ[r.id] ?? 0) < r.capacity)
        .map((r) => ({ value: r.id, label: `${r.name} (${occ[r.id] ?? 0}/${r.capacity})` })),
    ];
  }, [rooms, members]);

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      await Promise.all([mutate(), refreshPeople()]);
      showToast("success", msg);
      setRejecting(null);
      setNote("");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const STATUS: Record<string, string> = { submitted: "Mới gửi", under_review: "Đang xem xét", approved: "Đã duyệt", rejected: "Đã từ chối", withdrawn: "Đã rút" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Người đăng ký tài khoản sẽ được tạo hồ sơ thành viên và kích hoạt ngay khi bạn duyệt.</p>
        <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-primary" />
          Hiện cả đơn đã xử lý
        </label>
      </div>
      {isLoading && <div className="text-xs text-gray-400 p-6 text-center">Đang tải…</div>}
      {!isLoading && applications.length === 0 && (
        <div className="bg-white rounded-3xl p-10 border border-purple-50 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
          <Inbox className="w-8 h-8 text-gray-300" />
          Không có đơn nào đang chờ duyệt.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {applications.map((a) => {
          const pending = a.status === "submitted" || a.status === "under_review";
          return (
            <div key={a.id} className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{a.fullName}</h3>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {new Date(a.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${pending ? "bg-amber-100 text-amber-800" : a.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                  {STATUS[a.status] ?? a.status}
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                {a.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /> {a.email}</div>}
                {a.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {a.phone}</div>}
                {a.universityName && <div className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-gray-400" /> {a.universityName}</div>}
              </div>
              {a.message && <p className="text-xs text-gray-700 bg-gray-50 rounded-xl p-3 italic">“{a.message}”</p>}
              {a.reviewNote && <p className="text-[11px] text-gray-500">Ghi chú duyệt: {a.reviewNote}</p>}
              {pending && rejecting !== a.id && (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1">
                  <div className="flex-1">
                    <CustomSelect label="Xếp vào phòng" value={roomFor[a.id] ?? ""} onChange={(v) => setRoomFor((p) => ({ ...p, [a.id]: v }))} options={roomOptions} />
                  </div>
                  <button
                    disabled={busy === a.id}
                    onClick={() => act(a.id, () => membersApi.approveApplication(a.id, null, roomFor[a.id] || null), `Đã duyệt đơn của ${a.fullName}.`)}
                    className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Duyệt
                  </button>
                  <button
                    onClick={() => setRejecting(a.id)}
                    className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>
                </div>
              )}
              {rejecting === a.id && (
                <div className="space-y-2 pt-1">
                  <CustomInput label="Lý do từ chối (người đăng ký sẽ thấy)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tối thiểu 5 ký tự" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRejecting(null)} className="px-3 py-2 rounded-xl border text-xs font-bold">Hủy</button>
                    <button
                      disabled={busy === a.id || note.trim().length < 5}
                      onClick={() => act(a.id, () => membersApi.rejectApplication(a.id, note.trim()), `Đã từ chối đơn của ${a.fullName}.`)}
                      className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
                    >
                      Xác nhận từ chối
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
