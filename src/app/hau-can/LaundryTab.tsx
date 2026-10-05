"use client";
// Tab "Lịch máy giặt": lưới tuần theo từng máy (khung giờ từ settings laundry.slots), đặt/hủy lượt của mình,
// bắt đầu/giặt xong; trùng lịch ⇒ 409 từ DB (EXCLUDE ex_laundry_bookings__no_overlap), hạn mức tuần BR-LAU-03.
import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { laundryApi, refreshLaundry } from "@/lib/data/duty";
import { WEEKDAYS_SHORT, addDays, dm, isoDow, mondayOf } from "@/lib/duty-format";
import type { LaundryBookingDto, LaundryWeekDto } from "@/lib/types/duty";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function LaundryTab({
  data,
  loading,
  onWeekChange,
}: {
  data: LaundryWeekDto | undefined;
  loading: boolean;
  onWeekChange: (week: string | null) => void;
}) {
  const { showToast } = useApp();
  const { can } = useSession();
  const [machineId, setMachineId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<LaundryBookingDto | null>(null);
  useEffect(() => {
    if (data && (!machineId || !data.machines.some((m) => m.id === machineId))) setMachineId(data.machines[0]?.id ?? "");
  }, [data, machineId]);

  if (!data) {
    return (
      <div className="bg-white rounded-3xl p-10 border border-purple-50 shadow-xs flex items-center justify-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải lịch máy giặt…
      </div>
    );
  }
  const machine = data.machines.find((m) => m.id === machineId) ?? data.machines[0];
  const thisWeek = mondayOf(data.today);
  const isThisWeek = data.weekStart <= data.today;
  const lastDay = addDays(data.today, data.maxDaysAhead);
  const now = Date.now();
  const canBook = can("laundry.book");
  const countOf = (date: string) => data.myWeekCounts[mondayOf(date)] ?? 0;
  const weeksShown = [...new Set(data.days.map(mondayOf))];

  const slotTimes = (date: string, idx: number) => {
    const [s, e] = data.slots[idx];
    return { start: new Date(`${date}T${s}:00+07:00`).getTime(), end: new Date(`${date}T${e}:00+07:00`).getTime() };
  };
  const tooFar = (date: string) => date > addDays(data.today, data.maxDaysAhead);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string, type: "success" | "info" = "success") => {
    setBusy(key);
    try {
      await fn();
      showToast(type, ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
      await refreshLaundry();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Đặt lịch máy giặt (Sân thượng & khu giặt phơi)</h2>
          <p className="text-xs text-gray-500">
            Mỗi ca 2 tiếng · tối đa {data.maxPerWeek} lượt/người/tuần · hủy trước giờ giặt {data.cancelMinMinutes} phút. Bấm ô trống để đặt ca, bấm ca của bạn để hủy.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {data.machines.map((m) => (
            <button
              key={m.id}
              onClick={() => setMachineId(m.id)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                m.id === machine?.id ? "bg-primary text-white" : "bg-purple-100 text-primary hover:bg-purple-200"
              } ${m.status !== "active" ? "opacity-60" : ""}`}
              title={m.status !== "active" ? "Máy đang bảo trì" : undefined}
            >
              {m.name}
              {m.capacityKg && !/kg/i.test(m.name) ? ` ${m.capacityKg}kg` : ""}
              {m.status !== "active" ? " (bảo trì)" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onWeekChange(addDays(data.weekStart, -7) < data.today ? null : addDays(data.weekStart, -7))}
            disabled={isThisWeek}
            className="p-1.5 rounded-lg bg-surface-container-low text-gray-600 hover:bg-purple-100 disabled:opacity-40"
            title="Tuần trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-gray-800">
            {dm(data.weekStart)} – {dm(addDays(data.weekStart, 6))} {isThisWeek && <span className="text-primary">(7 ngày tới)</span>}
          </span>
          <button
            onClick={() => onWeekChange(addDays(data.weekStart, 7))}
            disabled={addDays(data.weekStart, 7) > lastDay}
            className="p-1.5 rounded-lg bg-surface-container-low text-gray-600 hover:bg-purple-100 disabled:opacity-40"
            title="Tuần sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
        <span className="text-[11px] font-bold text-gray-500">
          Lượt của bạn:{" "}
          {weeksShown.map((w, i) => (
            <span key={w} className={countOf(w) >= data.maxPerWeek ? "text-rose-600" : ""}>
              {i > 0 ? " · " : ""}
              {w === thisWeek ? "tuần này" : `tuần ${dm(w)}`} {countOf(w)}/{data.maxPerWeek}
            </span>
          ))}
        </span>
      </div>

      {machine?.status !== "active" && (
        <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Máy này đang bảo trì — vui lòng chọn máy khác.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-2.5 text-left text-xs font-bold text-gray-400">Khung giờ</th>
              {data.days.map((d) => (
                <th key={d} className={`py-2.5 px-2 font-bold ${d === data.today ? "text-primary bg-purple-50/50 rounded-t-lg" : ""}`}>
                  {WEEKDAYS_SHORT[isoDow(d)]} <span className="font-medium text-[10px]">{dm(d)}</span> {d === data.today && "(Nay)"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.slots.map((slot, sIdx) => (
              <tr key={slot.join("-")}>
                <td className="py-3 text-left font-mono text-[11px] text-gray-500 pr-3 whitespace-nowrap">
                  {slot[0]} – {slot[1]}
                </td>
                {data.days.map((d) => {
                  const b = data.bookings.find((x) => x.machineId === machine?.id && x.date === d && x.slotIndex === sIdx);
                  const { start, end } = slotTimes(d, sIdx);
                  const past = end <= now;
                  const started = start < now - 15 * 60e3;
                  const key = `${d}-${sIdx}`;
                  const cellBg = d === data.today ? "bg-purple-50/30" : "";
                  if (b) {
                    const canStart = b.isMine && b.status === "booked" && now >= start - 10 * 60e3 && now < end;
                    const washing = b.isMine && b.status === "checked_in";
                    return (
                      <td key={d} className={`p-1.5 ${cellBg}`}>
                        <button
                          disabled={busy === key || (past && !washing)}
                          onClick={() => {
                            if (!b.isMine) return showToast("warning", `Ca này đã được đặt bởi ${b.member.fullName}`);
                            if (washing) return act(key, () => laundryApi.complete(b.id), "Đã ghi nhận giặt xong — cảm ơn bạn!");
                            if (canStart) return act(key, () => laundryApi.checkin(b.id), "Đã bắt đầu lượt giặt.");
                            if (b.status === "booked") return setConfirmCancel(b);
                          }}
                          className={`w-full py-2 px-1 rounded-xl text-[10px] font-bold transition truncate ${
                            b.isMine
                              ? past && !washing
                                ? "bg-purple-200 text-purple-800 cursor-default"
                                : washing
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : canStart
                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                : "bg-primary text-white shadow-2xs hover:bg-rose-600"
                              : past
                              ? "bg-gray-50 text-gray-400 cursor-default"
                              : "bg-surface-container-low text-gray-600 cursor-not-allowed"
                          }`}
                          title={b.isMine ? (washing ? "Bấm khi giặt xong" : canStart ? "Bấm khi bắt đầu giặt" : "Bấm để hủy ca") : `Đã đặt bởi ${b.member.fullName}`}
                        >
                          {busy === key ? (
                            <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                          ) : b.isMine ? (
                            washing ? "Đang giặt · Xong" : canStart ? "Bắt đầu giặt" : past ? (b.status === "completed" ? "Của bạn ✓" : "Của bạn") : "Của bạn (Hủy)"
                          ) : (
                            b.member.name
                          )}
                        </button>
                      </td>
                    );
                  }
                  const disabled = past || started || tooFar(d) || !canBook || machine?.status !== "active";
                  return (
                    <td key={d} className={`p-1.5 ${cellBg}`}>
                      {disabled ? (
                        <div className="w-full py-2 px-1 rounded-xl text-[10px] text-gray-300 border border-dashed border-gray-100">—</div>
                      ) : (
                        <button
                          disabled={busy === key}
                          onClick={() =>
                            countOf(d) >= data.maxPerWeek
                              ? showToast("warning", `Bạn đã dùng hết ${data.maxPerWeek} lượt giặt của tuần có ngày ${dm(d)}.`)
                              : act(key, () => laundryApi.book(machine!.id, d, sIdx), `Đã đặt ${machine!.name} ${slot[0]}–${slot[1]} ${WEEKDAYS_SHORT[isoDow(d)]} ${dm(d)}.`)
                          }
                          className="w-full py-2 px-1 rounded-xl text-[10px] text-gray-400 hover:text-primary hover:bg-purple-100/70 border border-dashed border-gray-200 transition"
                        >
                          {busy === key ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "+ Trống"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => {
          const b = confirmCancel;
          setConfirmCancel(null);
          if (b) act(`${b.date}-${b.slotIndex}`, () => laundryApi.cancel(b.id), "Đã hủy lượt giặt.", "info");
        }}
        title="Hủy lượt giặt?"
        message={confirmCancel ? `Hủy lượt ${data.slots[confirmCancel.slotIndex]?.join("–") ?? ""} ngày ${dm(confirmCancel.date)} trên ${machine?.name ?? "máy giặt"}?` : ""}
        confirmText="Hủy lượt"
        cancelText="Giữ lại"
        variant="warning"
      />
    </div>
  );
}
