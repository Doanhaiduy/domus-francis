"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, FileSpreadsheet, FileText, HandHeart, Loader2, Search, Users, Wallet, Wrench } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { useMemberReport } from "@/lib/data/member-report";
import type { MemberReportDto, MemberReportKind, MemberReportRow, MemberReportScope } from "@/lib/types/member-report";
import { CustomSelect } from "@/components/ui/FormControls";
import { formatVND, cn } from "@/lib/utils";
import { vnToday } from "@/lib/vn-time";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dash = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const KINDS: { value: MemberReportKind; label: string }[] = [
  { value: "month", label: "Theo tháng" },
  { value: "quarter", label: "Theo quý" },
  { value: "year", label: "Theo năm" },
];

type SortKey = "name" | "absent" | "leave" | "discipline" | "owed" | "merit";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Tên A → Z" },
  { value: "absent", label: "Vắng nhiều nhất" },
  { value: "leave", label: "Xin phép nhiều nhất" },
  { value: "discipline", label: "Vi phạm nhiều nhất" },
  { value: "owed", label: "Nợ quỹ nhiều nhất" },
  { value: "merit", label: "Điểm thi đua cao nhất" },
];
const sortVal: Record<Exclude<SortKey, "name">, (m: MemberReportRow) => number> = {
  absent: (m) => (m.attendance?.absent ?? 0) * 1000 + (m.attendance?.excused ?? 0),
  leave: (m) => m.leave?.total ?? 0,
  discipline: (m) => m.discipline?.count ?? 0,
  owed: (m) => m.finance?.owedVnd ?? 0,
  merit: (m) => m.merit?.points ?? 0,
};

/** Tổng kết theo tháng/quý/năm: `scope="all"` = cả nhà + từng thành viên (cần report.read); `scope="me"` = của chính mình. Xuất Excel/PDF. */
export function MemberReportPanel({ scope }: { scope: MemberReportScope }) {
  const { showToast } = useApp();
  const today = useMemo(() => vnToday(), []);
  const [kind, setKind] = useState<MemberReportKind>("month");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [quarter, setQuarter] = useState(Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const { report, error, isLoading } = useMemberReport({ kind, year, month, quarter, scope });

  const years = useMemo(() => {
    const y = Number(today.slice(0, 4));
    return Array.from({ length: 6 }, (_, i) => ({ value: String(y - i), label: String(y - i) }));
  }, [today]);

  const members = useMemo(() => {
    const list = (report?.members ?? []).filter((m) => !q.trim() || `${m.fullName} ${m.name} ${m.room ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
    if (sort === "name") return list;
    const f = sortVal[sort];
    return [...list].sort((a, b) => f(b) - f(a) || a.name.localeCompare(b.name, "vi"));
  }, [report, q, sort]);

  const download = async (type: "xlsx" | "pdf") => {
    if (!report) return;
    setBusy(type);
    try {
      if (type === "xlsx") await (await import("@/lib/export/member-report-xlsx")).downloadMemberReportXlsx(report);
      else await (await import("@/lib/pdf/member-report")).downloadMemberReportPdf(report);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36"><CustomSelect<MemberReportKind> label="Kỳ tổng kết" value={kind} onChange={setKind} options={KINDS} /></div>
          <div className="w-28"><CustomSelect label="Năm" value={String(year)} onChange={(v) => setYear(Number(v))} options={years} /></div>
          {kind === "month" && <div className="w-32"><CustomSelect label="Tháng" value={String(month)} onChange={(v) => setMonth(Number(v))} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Tháng ${i + 1}` }))} /></div>}
          {kind === "quarter" && <div className="w-28"><CustomSelect label="Quý" value={String(quarter)} onChange={(v) => setQuarter(Number(v))} options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: `Quý ${x}` }))} /></div>}
          {report && <p className="text-xs text-gray-500 pb-2.5">{report.label}: {dmy(report.from)} – {dmy(report.to)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download("xlsx")} disabled={!report || !!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold transition disabled:opacity-50">
            {busy === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Tải Excel
          </button>
          <button type="button" onClick={() => download("pdf")} disabled={!report || !!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50">
            {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Tải PDF
          </button>
        </div>
      </div>

      {error && !report && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading && !report ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer-box h-28 rounded-2xl" />)}</div>
      ) : report ? (
        scope === "me" ? <PersonalView r={report} /> : (
          <>
            <HouseSummary r={report} />
            <MembersTable r={report} members={members} q={q} setQ={setQ} sort={sort} setSort={setSort} />
          </>
        )
      ) : null}
    </div>
  );
}

function Tile({ icon: Icon, title, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-purple-50 shadow-xs">
      <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold", tone)}><Icon className="w-3.5 h-3.5" />{title}</span>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}
const Line = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 text-xs"><span className="text-gray-500">{k}</span><b className="text-gray-900 text-right">{v}</b></div>
);

function HouseSummary({ r }: { r: MemberReportDto }) {
  const t = r.house_totals;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile icon={CalendarDays} title="Sự kiện & chuyên cần" tone="bg-sky-50 text-sky-700">
        <Line k="Số sự kiện" v={`${t.events.total} (${t.events.completed} đã diễn ra)`} />
        <Line k="Hành hương" v={t.events.pilgrimages} />
        <Line k="Lần chuỗi" v={t.events.rosary} />
        {t.attendance && <Line k="Tỉ lệ có mặt" v={pct(t.attendance.ratePct)} />}
        {t.attendance && <Line k="Vắng không phép / có phép" v={`${t.attendance.absent} / ${t.attendance.excused}`} />}
      </Tile>
      <Tile icon={Users} title="Xin phép & trực nhật" tone="bg-amber-50 text-amber-700">
        {t.leave ? (
          <>
            <Line k="Đơn xin phép" v={`${t.leave.total} (${t.leave.approved} duyệt)`} />
            <Line k="Về muộn / Ngủ ngoài" v={`${t.leave.lateReturn} / ${t.leave.overnightOut}`} />
          </>
        ) : <p className="text-[11px] text-gray-400">Không có quyền xem đơn xin phép.</p>}
        {t.duty && <Line k="Lượt trực vệ sinh" v={`${t.duty.weeks} · TB ${dash(t.duty.avgScore)}/10`} />}
        {t.merit && <Line k="Điểm thi đua (tổng)" v={t.merit.points > 0 ? `+${t.merit.points}` : t.merit.points} />}
      </Tile>
      <Tile icon={AlertTriangle} title="Vi phạm & kỷ luật" tone="bg-rose-50 text-rose-700">
        {t.discipline ? (
          <>
            <Line k="Ghi nhận" v={`${t.discipline.count} (${t.discipline.people} người)`} />
            <Line k="Đang xử lý / quá hạn" v={`${t.discipline.active} / ${t.discipline.overdue}`} />
            <Line k="Phạt: chuỗi · lễ · trực" v={`${t.discipline.rosary} · ${t.discipline.mass} · ${t.discipline.duty}`} />
          </>
        ) : <p className="text-[11px] text-gray-400">Chỉ Trưởng nhà/Admin xem được mục này.</p>}
      </Tile>
      <Tile icon={Wallet} title="Đóng quỹ & ủng hộ" tone="bg-emerald-50 text-emerald-700">
        {t.finance ? (
          <>
            <Line k="Đã đóng / phải thu" v={`${formatVND(t.finance.paidVnd)} / ${formatVND(t.finance.dueVnd)}`} />
            <Line k="Còn nợ" v={formatVND(t.finance.owedVnd)} />
          </>
        ) : <p className="text-[11px] text-gray-400">Không có quyền xem ma trận đóng quỹ.</p>}
        {t.donations && <Line k="Ủng hộ đã nhận" v={`${formatVND(t.donations.totalVnd)} · ${t.donations.donors} người`} />}
        {t.donations && t.donations.pendingCount > 0 && <Line k="Ủng hộ chờ xác nhận" v={t.donations.pendingCount} />}
      </Tile>
      {t.events.byCategory.length > 0 && (
        <div className="sm:col-span-2 xl:col-span-4 bg-white rounded-2xl p-4 border border-purple-50 shadow-xs">
          <p className="text-[11px] font-bold text-gray-500 mb-2">Sự kiện theo loại</p>
          <div className="flex flex-wrap gap-2">
            {t.events.byCategory.map((c) => <span key={c.code} className="px-3 py-1 rounded-full bg-surface-container-low text-xs font-semibold text-gray-700">{c.name} <b className="text-primary">{c.count}</b></span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function MembersTable({ r, members, q, setQ, sort, setSort }: { r: MemberReportDto; members: MemberReportRow[]; q: string; setQ: (v: string) => void; sort: SortKey; setSort: (v: SortKey) => void }) {
  const s = r.sections;
  return (
    <div className="bg-white rounded-3xl border border-purple-50 shadow-xs overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-100">
        <h3 className="text-sm font-extrabold text-gray-900 mr-auto flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Từng thành viên ({members.length})</h3>
        <label className="relative w-56">
          <span className="sr-only">Tìm thành viên</span>
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên, phòng…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-medium focus:outline-none focus:border-primary" />
        </label>
        <div className="w-52"><CustomSelect<SortKey> value={sort} onChange={setSort} options={SORTS} /></div>
      </div>
      <div className="overflow-x-auto custom-scroll">
        <table className="w-full text-left text-xs min-w-[900px]">
          <thead className="bg-surface-container-low/70 text-gray-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3 sticky left-0 bg-surface-container-low z-10">Thành viên</th>
              {s.attendance && <th className="py-2.5 px-3">Điểm danh<br /><span className="normal-case font-medium">có mặt · trễ · vắng · phép</span></th>}
              {s.leave && <th className="py-2.5 px-3">Xin phép<br /><span className="normal-case font-medium">tổng · về muộn · ngủ ngoài</span></th>}
              {s.duty && <th className="py-2.5 px-3">Trực nhật<br /><span className="normal-case font-medium">tuần · điểm TB</span></th>}
              {s.merit && <th className="py-2.5 px-3 text-right">Thi đua</th>}
              {s.discipline && <th className="py-2.5 px-3">Vi phạm<br /><span className="normal-case font-medium">số · hình phạt</span></th>}
              {s.finance && <th className="py-2.5 px-3 text-right">Còn nợ quỹ</th>}
              {s.donations && <th className="py-2.5 px-3 text-right">Ủng hộ</th>}
              {s.academic && <th className="py-2.5 px-3 text-center">GPA</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => (
              <tr key={m.memberId} className="hover:bg-purple-50/30">
                <td className="py-2.5 px-3 sticky left-0 bg-white font-bold text-gray-900 whitespace-nowrap">{m.name}{m.room ? <span className="ml-1.5 text-[10px] font-bold text-gray-400">P.{m.room}</span> : null}</td>
                {s.attendance && <td className="py-2.5 px-3 whitespace-nowrap">{m.attendance ? <>{m.attendance.present} · {m.attendance.late} · <b className={m.attendance.absent ? "text-rose-600" : undefined}>{m.attendance.absent}</b> · {m.attendance.excused} <span className="text-gray-400">({pct(m.attendance.ratePct)})</span></> : "—"}</td>}
                {s.leave && <td className="py-2.5 px-3 whitespace-nowrap">{m.leave ? <><b>{m.leave.total}</b> · {m.leave.lateReturn} · {m.leave.overnightOut}</> : "—"}</td>}
                {s.duty && <td className="py-2.5 px-3 whitespace-nowrap">{m.duty ? <>{m.duty.weeks} · {dash(m.duty.avgScore)}</> : "—"}</td>}
                {s.merit && <td className="py-2.5 px-3 text-right font-semibold">{m.merit ? (m.merit.points > 0 ? `+${m.merit.points}` : m.merit.points) : "—"}</td>}
                {s.discipline && <td className="py-2.5 px-3">{m.discipline ? (m.discipline.count ? <span className={m.discipline.overdue ? "text-rose-700 font-semibold" : undefined}><b>{m.discipline.count}</b>{m.discipline.rosary ? ` · ${m.discipline.rosary} chuỗi` : ""}{m.discipline.mass ? ` · ${m.discipline.mass} ngày lễ` : ""}{m.discipline.duty ? ` · ${m.discipline.duty} ca trực` : ""}{m.discipline.other ? ` · ${m.discipline.other} khác` : ""}</span> : "0") : "—"}</td>}
                {s.finance && <td className="py-2.5 px-3 text-right whitespace-nowrap">{m.finance && m.finance.owedVnd ? <b className={m.finance.overdueVnd ? "text-rose-700" : "text-amber-700"}>{formatVND(m.finance.owedVnd)}</b> : "—"}</td>}
                {s.donations && <td className="py-2.5 px-3 text-right whitespace-nowrap">{m.donations && m.donations.totalVnd ? <b className="text-primary">{formatVND(m.donations.totalVnd)}</b> : "—"}</td>}
                {s.academic && <td className="py-2.5 px-3 text-center">{m.academic?.gpa4 != null ? m.academic.gpa4.toFixed(2) : "—"}</td>}
              </tr>
            ))}
            {!members.length && <tr><td colSpan={9} className="py-10 text-center text-gray-400">Không có thành viên nào khớp.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-gray-400 border-t border-gray-100">
        Cột nào không hiện nghĩa là bạn chưa có quyền xem mục đó. Điểm học tập (GPA) chỉ có với thành viên đã đồng ý chia sẻ bảng điểm cho người quản lý. Tải Excel để có thêm trang chi tiết vi phạm và ủng hộ.
      </p>
    </div>
  );
}

function PersonalView({ r }: { r: MemberReportDto }) {
  const m = r.members[0];
  if (!m) return <p className="text-sm text-gray-500">Chưa có số liệu cho kỳ này.</p>;
  const e = r.house_totals.events;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-purple-50 shadow-xs text-sm text-gray-600">
        Trong {r.label.toLowerCase()}, nhà có <b className="text-gray-900">{e.total}</b> sự kiện{e.pilgrimages ? ` (${e.pilgrimages} cuộc hành hương)` : ""}{e.rosary ? `, ${e.rosary} buổi lần chuỗi` : ""}. Dưới đây là số liệu của <b className="text-gray-900">riêng bạn</b>.
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {m.attendance && (
          <Tile icon={CalendarDays} title="Điểm danh" tone="bg-sky-50 text-sky-700">
            <Line k="Có mặt" v={m.attendance.present} /><Line k="Đi trễ" v={m.attendance.late} /><Line k="Vắng có phép" v={m.attendance.excused} /><Line k="Vắng không phép" v={m.attendance.absent} /><Line k="Tỉ lệ có mặt" v={pct(m.attendance.ratePct)} />
          </Tile>
        )}
        {m.leave && (
          <Tile icon={Users} title="Xin phép" tone="bg-amber-50 text-amber-700">
            <Line k="Tổng đơn" v={m.leave.total} /><Line k="Đã duyệt" v={m.leave.approved} /><Line k="Về muộn" v={m.leave.lateReturn} /><Line k="Ngủ ngoài" v={m.leave.overnightOut} /><Line k="Tạm vắng nhiều ngày" v={m.leave.longLeave} />
          </Tile>
        )}
        {m.duty && (
          <Tile icon={Wrench} title="Trực nhật & thi đua" tone="bg-emerald-50 text-emerald-700">
            <Line k="Số tuần trực sân" v={m.duty.weeks} /><Line k="Điểm trung bình" v={`${dash(m.duty.avgScore)}/10`} />
            {m.merit && <Line k="Điểm thi đua" v={m.merit.points > 0 ? `+${m.merit.points}` : m.merit.points} />}
          </Tile>
        )}
        {m.discipline && (
          <Tile icon={AlertTriangle} title="Vi phạm & kỷ luật" tone="bg-rose-50 text-rose-700">
            <Line k="Số lần được ghi nhận" v={m.discipline.count} /><Line k="Đang chấp hành / chờ" v={m.discipline.active} /><Line k="Đã hoàn thành" v={m.discipline.completed} />
            <Line k="Phạt: chuỗi · lễ · trực" v={`${m.discipline.rosary} · ${m.discipline.mass} · ${m.discipline.duty}`} />
          </Tile>
        )}
        {m.finance && (
          <Tile icon={Wallet} title="Đóng quỹ" tone="bg-indigo-50 text-indigo-700">
            <Line k="Phải đóng" v={formatVND(m.finance.dueVnd)} /><Line k="Đã đóng" v={formatVND(m.finance.paidVnd)} /><Line k="Còn nợ" v={formatVND(m.finance.owedVnd)} />
          </Tile>
        )}
        {(m.donations || m.academic) && (
          <Tile icon={HandHeart} title="Ủng hộ & học tập" tone="bg-orange-50 text-orange-700">
            {m.donations && <Line k="Số lần ủng hộ quỹ" v={`${m.donations.count} · ${formatVND(m.donations.totalVnd)}`} />}
            {m.academic ? <Line k={`GPA ${m.academic.semester}`} v={`${dash(m.academic.gpa10)} (hệ 10) · ${dash(m.academic.gpa4)} (hệ 4)`} /> : <Line k="GPA học kỳ" v="Chưa có" />}
          </Tile>
        )}
      </div>
    </div>
  );
}
