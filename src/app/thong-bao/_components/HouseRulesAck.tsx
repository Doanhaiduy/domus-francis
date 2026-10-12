"use client";

// Xác nhận "Tôi đã đọc Luật nhà phiên bản …" (mọi thành viên) + danh sách ai đã / chưa xác nhận, nhắc người chưa xác nhận (người có
// house.rules.manage) — GET/POST /api/v1/house-rules/ack (db/app/1052). Phiên bản = dấu vân tay nội dung các mục đang hiển thị: luật nhà
// đổi nội dung ⇒ cần xác nhận lại.
import React, { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, ChevronDown, Loader2, ScrollText, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage, fileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { houseRulesAckApi, useHouseRulesAck } from "@/lib/data/house-rules-ack";
import { rulesVersionLabel, type HouseRulesAckDto } from "@/lib/types/house-rules-ack";
import { Skeleton } from "@/components/ui/Skeleton";

export const ACK_ANCHOR = "xac-nhan-luat-nha";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** Nhãn nhỏ trên dải tiêu đề Luật nhà: đã / chưa xác nhận phiên bản hiện hành (bấm ⇒ cuộn tới khung xác nhận). */
export function AckStatusPill({ ack }: { ack: HouseRulesAckDto | undefined }) {
  if (!ack?.current) return null;
  const done = !!ack.mine.ackedAt;
  return (
    <a
      href={`#${ACK_ANCHOR}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(ACK_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold transition",
        done ? "bg-[#ffffff26] text-[#ffffff]" : "bg-amber-400 text-[#451a03] shadow-sm hover:bg-[#fcd34d]"
      )}
    >
      {done ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> : <TriangleAlert className="w-3.5 h-3.5" aria-hidden />}
      {done ? "Bạn đã xác nhận đọc" : "Bạn chưa xác nhận đọc"}
    </a>
  );
}

/** Khung xác nhận ở cuối Luật nhà. */
export function AckBox() {
  const { showToast } = useApp();
  const { ack, isLoading, mutate } = useHouseRulesAck();
  const [busy, setBusy] = useState(false);

  // Mở từ liên kết …#xac-nhan-luat-nha (thẻ Việc của tôi, danh sách Bắt đầu, thông báo nhắc) ⇒ cuộn tới khi đã tải xong
  useEffect(() => {
    if (!ack || typeof window === "undefined" || window.location.hash !== `#${ACK_ANCHOR}`) return;
    const t = setTimeout(() => document.getElementById(ACK_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    return () => clearTimeout(t);
  }, [ack]);

  if (isLoading && !ack) return <Skeleton className="w-full h-28 rounded-3xl" />;
  if (!ack?.current) return null;
  const cur = ack.current;
  const label = rulesVersionLabel(cur.updatedAt);
  const acked = ack.mine.ackedAt;
  const changedSince = !acked && !!ack.mine.lastAckedAt;

  const confirm = async () => {
    setBusy(true);
    try {
      await houseRulesAckApi.acknowledge(cur.version);
      showToast("success", "Cảm ơn bạn đã đọc và cùng gìn giữ Luật nhà!");
    } catch (e) {
      showToast("error", errorMessage(e));
      void mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id={ACK_ANCHOR}
      aria-labelledby="ack-title"
      className={cn(
        "scroll-mt-24 rounded-3xl border p-5 sm:p-6",
        acked ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-xs"
      )}
    >
      <div className="flex items-start gap-3.5">
        <span className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", acked ? "bg-emerald-600 text-white" : "bg-amber-500 text-white")}>
          {acked ? <ShieldCheck className="w-5 h-5" aria-hidden /> : <ScrollText className="w-5 h-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="ack-title" className={cn("text-base font-extrabold", acked ? "text-emerald-900" : "text-gray-900")}>
            {acked ? "Bạn đã xác nhận đọc Luật nhà" : changedSince ? "Luật nhà đã thay đổi — mời bạn đọc và xác nhận lại" : "Xác nhận đã đọc Luật nhà"}
          </h2>
          <p className={cn("text-xs mt-1 leading-relaxed", acked ? "text-emerald-800" : "text-gray-600")}>
            {acked ? (
              <>
                Phiên bản cập nhật <b>{label}</b> · xác nhận lúc {stamp(acked)}. Khi luật nhà thay đổi, ứng dụng sẽ mời bạn đọc và xác nhận lại.
              </>
            ) : (
              <>
                Phiên bản cập nhật <b>{label}</b> · {cur.sections} mục, {cur.clauses} điều khoản.
                {changedSince && ack.mine.lastVersionUpdatedAt ? <> Lần trước bạn xác nhận bản ngày {rulesVersionLabel(ack.mine.lastVersionUpdatedAt)}.</> : null} Bấm xác nhận
                nghĩa là bạn đã đọc kỹ và cùng anh em gìn giữ Luật nhà.
              </>
            )}
          </p>
          {!acked && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="mt-3.5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-extrabold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle2 className="w-4 h-4" aria-hidden />}
              Tôi đã đọc phiên bản {label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Người quản lý: ai đã / chưa xác nhận phiên bản hiện hành + nhắc người chưa xác nhận. */
export function AckRoster() {
  const { showToast } = useApp();
  const { ack } = useHouseRulesAck();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [open, setOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const members = useMemo(() => ack?.members ?? [], [ack]);
  if (!ack?.canManage || !ack.current || !ack.summary) return null;
  const pending = members.filter((m) => !m.ackedAt);
  const done = members.filter((m) => m.ackedAt);
  const list = tab === "pending" ? pending : done;
  const pct = ack.summary.total ? Math.round((ack.summary.acked / ack.summary.total) * 100) : 0;

  const remind = async () => {
    setReminding(true);
    try {
      const r = await houseRulesAckApi.remind();
      showToast("success", r.reminded ? `Đã nhắc ${r.reminded} anh em chưa xác nhận.` : "Mọi người đã xác nhận phiên bản này — không cần nhắc.");
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setReminding(false);
    }
  };

  return (
    <section aria-labelledby="ack-roster-title" className="bg-white rounded-3xl border border-purple-50 shadow-xs p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="ack-roster-title" className="text-base font-extrabold text-gray-900">
              Ai đã xác nhận đọc?
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <b className="text-gray-800">
                {ack.summary.acked}/{ack.summary.total}
              </b>{" "}
              anh em đang ở đã xác nhận phiên bản {rulesVersionLabel(ack.current.updatedAt)}.
            </p>
            <div className="h-1.5 mt-2 rounded-full bg-gray-100 overflow-hidden max-w-xs" role="progressbar" aria-label="Tỉ lệ đã xác nhận" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {pending.length > 0 && (
            <button
              type="button"
              onClick={remind}
              disabled={reminding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-60"
            >
              {reminding ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <BellRing className="w-3.5 h-3.5" aria-hidden />} Nhắc {pending.length} người chưa xác nhận
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:border-purple-200 text-gray-700 hover:text-primary text-xs font-bold transition"
          >
            {open ? "Ẩn danh sách" : "Xem danh sách"}
            <ChevronDown className={cn("w-3.5 h-3.5 transition", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4">
          <div role="tablist" aria-label="Lọc theo trạng thái xác nhận" className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
            {(
              [
                ["pending", `Chưa xác nhận (${pending.length})`],
                ["done", `Đã xác nhận (${done.length})`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition", tab === k ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900")}
              >
                {l}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">{tab === "pending" ? "Mọi người đã xác nhận phiên bản này 🎉" : "Chưa có ai xác nhận phiên bản này."}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {list.map((m) => {
                const avatar = fileUrl(m.avatarFileId, "thumb");
                return (
                  <li key={m.memberId} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold flex items-center justify-center shrink-0">{initials(m.name)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">
                        {m.fullName}
                        {m.room ? <span className="text-gray-400 font-medium"> · {m.room}</span> : null}
                      </span>
                      <span className={cn("block text-[11px] truncate", m.ackedAt ? "text-emerald-700" : "text-gray-500")}>
                        {m.ackedAt ? `Đã xác nhận ${stamp(m.ackedAt)}` : m.lastAckedAt ? `Xác nhận bản cũ ${stamp(m.lastAckedAt)}` : "Chưa từng xác nhận"}
                      </span>
                    </span>
                    {m.ackedAt && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
