"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays, FileText, Loader2, Users, Wallet, Wrench } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { useActivityReport } from "@/lib/data/activity-report";
import type { ReportKind } from "@/lib/types/activity-report";
import { CustomSelect } from "@/components/ui/FormControls";
import { MemberReportPanel } from "./_components/MemberReportPanel";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/utils";
import { vnToday } from "@/lib/vn-time";

type Tab = "members" | "me" | "activity";

const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

/** Tab "Báo cáo hoạt động" — số liệu tổng hợp theo quý/năm, xuất PDF gửi Tỉnh Dòng / phụ huynh (cần report.read). */
function ActivityReportTab() {
  const { showToast } = useApp();
  const allowed = true;
  const today = useMemo(() => vnToday(), []);
  const [kind, setKind] = useState<ReportKind>("quarter");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  // Mặc định: quý vừa kết thúc (hoặc quý hiện tại nếu mới vào quý đầu năm chưa có số liệu)
  const [quarter, setQuarter] = useState(Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1);
  const { report, error, isLoading } = useActivityReport(kind, year, quarter, allowed);
  const [busy, setBusy] = useState(false);

  const years = useMemo(() => {
    const y = Number(today.slice(0, 4));
    return Array.from({ length: 6 }, (_, i) => ({ value: String(y - i), label: String(y - i) }));
  }, [today]);

  const download = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const { downloadActivityReportPdf } = await import("@/lib/pdf/activity-report");
      await downloadActivityReportPdf(report);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const m = report?.members;
  const f = report?.finance;
  const e = report?.events;
  const d = report?.duty;

  return (
    <div className="flex flex-col w-full gap-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 max-w-xl">Tổng hợp nhân sự, tài chính, sự kiện và trực nhật theo quý hoặc năm — tải PDF để gửi Tỉnh Dòng, người quản lý hay phụ huynh. Chỉ có số liệu tổng hợp, không có thông tin cá nhân.</p>
        </div>
        <button type="button" onClick={download} disabled={!report || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-container text-xs font-bold shadow-sm shadow-primary/20 transition active:scale-95 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Tải báo cáo PDF
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36"><CustomSelect<ReportKind> label="Kỳ báo cáo" value={kind} onChange={setKind} options={[{ value: "quarter", label: "Theo quý" }, { value: "year", label: "Theo năm" }]} /></div>
        <div className="w-28"><CustomSelect label="Năm" value={String(year)} onChange={(v) => setYear(Number(v))} options={years} /></div>
        {kind === "quarter" && <div className="w-28"><CustomSelect label="Quý" value={String(quarter)} onChange={(v) => setQuarter(Number(v))} options={[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Quý ${q}` }))} /></div>}
        {report && <p className="text-xs text-gray-500 pb-2.5">{report.label}: {report.from.split("-").reverse().join("/")} – {report.to.split("-").reverse().join("/")}</p>}
      </div>

      {error && !report && <p className="text-sm text-rose-600">{errorMessage(error)}</p>}
      {isLoading && !report ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer-box h-40 rounded-2xl" />)}</div>
      ) : (
        report && m && e && d && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card icon={Users} title="Nhân sự" tone="purple">
              <Stat label="Sĩ số cuối kỳ" value={`${m.endCount}`} note={`đầu kỳ ${m.startCount}`} />
              <Row k="Vào nhà trong kỳ" v={m.joined} />
              <Row k="Ra trường / thành cựu" v={m.becameAlumni} />
              <Row k="Rời lưu xá" v={m.left} />
              <Row k="Nam / Nữ" v={`${m.male} / ${m.female}`} />
            </Card>
            <Card icon={Wallet} title="Tài chính" tone="emerald">
              {f ? (
                <>
                  <Stat label="Tồn quỹ cuối kỳ" value={formatVND(f.closingVnd)} note={`đầu kỳ ${formatVND(f.openingVnd)}`} />
                  <Row k="Tổng thu" v={formatVND(f.incomeVnd)} />
                  <Row k="Tổng chi" v={formatVND(f.expenseVnd)} />
                  <Row k="Tỉ lệ thu quỹ định kỳ" v={pct(f.collectionRatePct)} />
                </>
              ) : <p className="text-xs text-gray-500">Số liệu tài chính chỉ hiện với người có quyền xem thống kê quỹ.</p>}
            </Card>
            <Card icon={CalendarDays} title="Sự kiện & chuyên cần" tone="sky">
              <Stat label="Sự kiện trong kỳ" value={`${e.total}`} note={`${e.completed} đã diễn ra · ${e.cancelled} hủy`} />
              <Row k="Tỉ lệ có mặt" v={pct(e.attendance.ratePct)} />
              <Row k="Vắng có phép" v={e.attendance.excused} />
              <Row k="Vắng không phép" v={e.attendance.absent} />
            </Card>
            <Card icon={Wrench} title="Trực nhật & hậu cần" tone="amber">
              <Stat label="Tỉ lệ hoàn thành ca trực" value={pct(d.completionPct)} note={`${d.approved}/${d.assignments} ca được duyệt`} />
              <Row k="Ca trực bỏ lỡ" v={d.missed} />
              <Row k="Báo hỏng mới" v={d.issuesOpened} />
              <Row k="Đã xử lý xong" v={d.issuesDone} />
            </Card>
          </div>
        )
      )}
    </div>
  );
}

const TONE = { purple: "bg-purple-100 text-purple-700", emerald: "bg-emerald-100 text-emerald-700", sky: "bg-sky-100 text-sky-700", amber: "bg-amber-100 text-amber-700" } as const;

function Card({ icon: Icon, title, tone, children }: { icon: React.ComponentType<{ className?: string }>; title: string; tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-purple-100 rounded-2xl p-5 space-y-3 shadow-xs">
      <h2 className="flex items-center gap-2.5 text-sm font-extrabold text-gray-900"><span className={`w-8 h-8 rounded-xl flex items-center justify-center ${TONE[tone]}`}><Icon className="w-4 h-4" /></span>{title}</h2>
      {children}
    </section>
  );
}
const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div>
    <p className="text-[11px] font-bold text-gray-500">{label}</p>
    <p className="text-2xl font-extrabold text-gray-900 leading-tight">{value}</p>
    {note && <p className="text-[11px] text-gray-400">{note}</p>}
  </div>
);
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-2"><span className="text-gray-600">{k}</span><b className="text-gray-900">{v}</b></div>
);

export default function ReportPage() {
  const { session, can, isLoading } = useSession();
  const canAll = can("report.read");
  const hasMember = !!session?.member;
  const [tab, setTab] = useState<Tab | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    ...(canAll ? [{ key: "members" as const, label: "Tổng kết thành viên" }] : []),
    ...(hasMember ? [{ key: "me" as const, label: "Tổng kết của tôi" }] : []),
    ...(canAll ? [{ key: "activity" as const, label: "Báo cáo hoạt động" }] : []),
  ];
  const active = tab && tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  if (!isLoading && !tabs.length) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center bg-white border border-purple-100 rounded-3xl p-10">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-900">Chưa có báo cáo nào dành cho tài khoản này</p>
        <p className="text-sm text-gray-500 mt-1">Tài khoản chưa gắn hồ sơ thành viên và chưa được cấp quyền xem báo cáo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full gap-5 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5"><FileText className="w-6 h-6 text-primary" /> Báo cáo &amp; tổng kết</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          {canAll
            ? "Xem tình hình từng thành viên và cả nhà theo tháng, quý, năm — vắng, xin phép, trực nhật, điểm, vi phạm, đóng quỹ, ủng hộ… — và tải về Excel hoặc PDF."
            : "Tổng kết riêng của bạn theo tháng, quý, năm: điểm danh, xin phép, trực nhật, quỹ… Chỉ mình bạn xem được."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div role="tablist" className="inline-flex flex-wrap p-1 rounded-xl bg-gray-100 gap-1 self-start">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => setTab(t.key)} className={cn("px-3.5 py-1.5 rounded-lg text-xs font-semibold transition", active === t.key ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800")}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!active ? <div className="shimmer-box h-40 rounded-2xl" /> : active === "members" ? <MemberReportPanel scope="all" /> : active === "me" ? <MemberReportPanel scope="me" /> : <ActivityReportTab />}
    </div>
  );
}
