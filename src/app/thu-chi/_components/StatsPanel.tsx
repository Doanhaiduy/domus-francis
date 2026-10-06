"use client";

// Thống kê thu chi theo THÁNG / QUÝ / NĂM + xuất Excel (.xlsx) và PDF để lưu trữ, báo cáo cho cộng đoàn.
// Số liệu lấy trực tiếp từ sổ quỹ (app.fn_finance_summary) — cùng nguồn với trang Tổng quan nên luôn khớp.
import React, { useMemo, useRef, useState } from "react";
import { FileDown, FileSpreadsheet, TrendingDown, TrendingUp, Wallet, PiggyBank } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { useFinanceStats } from "@/lib/data/finance";
import { downloadStatsPdf } from "@/lib/pdf/stats";
import type { FinanceStatsDto, StatsGranularity } from "@/lib/types/finance";
import { CustomSelect } from "@/components/ui/FormControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { ExpenseDonutChart, FinancialBarChart } from "@/components/ui/Charts";

const GRAN: { value: StatsGranularity; label: string; unit: string }[] = [
  { value: "month", label: "Theo tháng", unit: "tháng" },
  { value: "quarter", label: "Theo quý", unit: "quý" },
  { value: "year", label: "Theo năm", unit: "năm" },
];
const COUNTS: Record<StatsGranularity, number[]> = { month: [6, 12, 24], quarter: [4, 8, 12], year: [3, 5, 6] };
const DEFAULT_COUNT: Record<StatsGranularity, number> = { month: 12, quarter: 8, year: 4 };

const num = (n: number) => n.toLocaleString("vi-VN");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Đang tải thống kê">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-purple-50 space-y-2">
            <Skeleton className="w-24 h-3.5" />
            <Skeleton className="w-32 h-7" />
          </div>
        ))}
      </div>
      <Skeleton className="w-full h-72 rounded-3xl" />
      <Skeleton className="w-full h-64 rounded-3xl" />
    </div>
  );
}

async function exportExcel(stats: FinanceStatsDto, title: string) {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  const head = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#EDE9FE", align: "center" as const });
  const money = (v: number, bold = false) => ({ value: v, type: Number, format: "#,##0", ...(bold ? { fontWeight: "bold" as const } : {}) });
  const g = stats.granularity;

  const summary: unknown[][] = [
    [{ value: `${stats.houseName ?? "Lưu Xá Phanxicô"} — ${title}`, fontWeight: "bold", fontSize: 14 }],
    [{ value: `Xuất lúc ${new Date(stats.generatedAt).toLocaleString("vi-VN")}` }],
    [],
    [head("Kỳ"), head("Từ ngày"), head("Đến ngày"), head("Số dư đầu kỳ"), head("Tổng thu"), head("Tổng chi"), head("Chênh lệch"), head("Số dư cuối kỳ"), head("Phải thu quỹ"), head("Đã thu quỹ"), head("Tỷ lệ thu (%)")],
    ...stats.periods.map((p) => [
      { value: p.label },
      { value: dmy(p.from) },
      { value: dmy(p.to) },
      money(p.openingVnd),
      money(p.incomeVnd),
      money(p.expenseVnd),
      money(p.netVnd),
      money(p.closingVnd),
      money(p.duesExpectedVnd),
      money(p.duesCollectedVnd),
      p.collectionRatePct === null ? { value: "" } : { value: p.collectionRatePct, type: Number, format: "0.0" },
    ]),
    [
      { value: "TỔNG CỘNG", fontWeight: "bold" },
      { value: "" },
      { value: "" },
      money(stats.totals.openingVnd, true),
      money(stats.totals.incomeVnd, true),
      money(stats.totals.expenseVnd, true),
      money(stats.totals.netVnd, true),
      money(stats.totals.closingVnd, true),
    ],
  ];

  const cats = new Map<string, string>();
  for (const p of stats.periods) for (const c of p.expenseByCategory) cats.set(c.code, c.name);
  const catCodes = [...cats.keys()];
  const expense: unknown[][] = [
    [head("Hạng mục chi"), ...stats.periods.map((p) => head(p.label)), head("Tổng")],
    ...catCodes.map((code) => {
      const per = stats.periods.map((p) => p.expenseByCategory.find((c) => c.code === code)?.amountVnd ?? 0);
      return [{ value: cats.get(code) ?? code }, ...per.map((v) => money(v)), money(per.reduce((a, b) => a + b, 0), true)];
    }),
    [{ value: "TỔNG CHI", fontWeight: "bold" }, ...stats.periods.map((p) => money(p.expenseVnd, true)), money(stats.totals.expenseVnd, true)],
  ];

  const sheets: { data: unknown[][]; sheet: string; columns: { width: number }[] }[] = [
    { data: summary, sheet: "Tong hop", columns: [{ width: 18 }, { width: 12 }, { width: 12 }, ...Array.from({ length: 8 }, () => ({ width: 16 }))] },
    { data: expense, sheet: "Chi theo hang muc", columns: [{ width: 28 }, ...stats.periods.map(() => ({ width: 15 })), { width: 16 }] },
  ];
  if (stats.incomeByType) {
    const types = new Map<string, string>();
    for (const p of stats.periods) for (const t of p.incomeByType ?? []) types.set(t.type, t.label);
    const keys = [...types.keys()];
    sheets.push({
      data: [
        [head("Loại khoản thu"), ...stats.periods.map((p) => head(p.label)), head("Tổng")],
        ...keys.map((k) => {
          const per = stats.periods.map((p) => p.incomeByType?.find((t) => t.type === k)?.amountVnd ?? 0);
          return [{ value: types.get(k) ?? k }, ...per.map((v) => money(v)), money(per.reduce((a, b) => a + b, 0), true)];
        }),
        [{ value: "TỔNG THU", fontWeight: "bold" }, ...stats.periods.map((p) => money(p.incomeVnd, true)), money(stats.totals.incomeVnd, true)],
      ],
      sheet: "Thu theo loai khoan",
      columns: [{ width: 34 }, ...stats.periods.map(() => ({ width: 15 })), { width: 16 }],
    });
  }
  const first = stats.periods[0];
  const last = stats.periods[stats.periods.length - 1];
  const file = `Thong_ke_thu_chi_${g === "month" ? "thang" : g === "quarter" ? "quy" : "nam"}_${slug(first.label)}_den_${slug(last.label)}.xlsx`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeExcelFile as any)(sheets).toFile(file);
}

export default function StatsPanel() {
  const { showToast } = useApp();
  const [granularity, setGranularity] = useState<StatsGranularity>("month");
  const [count, setCount] = useState<number>(DEFAULT_COUNT.month);
  const { stats, error, isLoading } = useFinanceStats(granularity, count);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const unit = GRAN.find((g) => g.value === granularity)!.unit;
  const title = stats ? `Thống kê thu chi ${GRAN.find((g) => g.value === granularity)!.label.toLowerCase()} · ${stats.periods[0].label} – ${stats.periods[stats.periods.length - 1].label}` : "Thống kê thu chi";

  const chart = useMemo(() => (stats?.periods ?? []).map((p) => ({ label: granularity === "month" ? `T${Number(p.key.slice(5, 7))}/${p.key.slice(2, 4)}` : granularity === "quarter" ? p.label.replace("Quý ", "Q") : p.key, thu: p.incomeVnd, chi: p.expenseVnd })), [stats, granularity]);
  const donut = useMemo(() => (stats?.expenseByCategory ?? []).filter((c) => c.amountVnd > 0).map((c) => ({ label: c.name, value: c.amountVnd, color: c.color })), [stats]);

  const onExcel = async () => {
    if (!stats || busy) return;
    setBusy("xlsx");
    try {
      await exportExcel(stats, title);
      showToast("success", "Đã tải file Excel thống kê.");
    } catch (e) {
      showToast("error", `Không xuất được Excel: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };
  const onPdf = async () => {
    if (!stats || busy) return;
    setBusy("pdf");
    try {
      await downloadStatsPdf(stats);
      showToast("success", "Đã tải file PDF thống kê.");
    } catch (e) {
      console.error(e);
      showToast("error", "Không thể xuất PDF. Vui lòng thử lại!");
    } finally {
      setBusy(null);
    }
  };

  const changeGran = (g: StatsGranularity) => {
    setGranularity(g);
    setCount(DEFAULT_COUNT[g]);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-50 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Thống kê thu chi</h2>
          <p className="text-xs text-gray-500">So sánh thu – chi theo từng {unit}; xuất file để lưu trữ và báo cáo cho cộng đoàn</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
            {GRAN.map((g) => (
              <button key={g.value} onClick={() => changeGran(g.value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${granularity === g.value ? "bg-white text-primary shadow-xs" : "text-gray-500 hover:text-gray-900"}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="w-40">
            <CustomSelect<number> value={count} onChange={setCount} options={COUNTS[granularity].map((n) => ({ value: n, label: `${n} ${unit} gần nhất` }))} />
          </div>
          <button onClick={onExcel} disabled={!stats || !!busy} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition active:scale-95 disabled:opacity-50">
            <FileSpreadsheet className="w-4 h-4" /> {busy === "xlsx" ? "Đang xuất..." : "Xuất Excel"}
          </button>
          <button onClick={onPdf} disabled={!stats || !!busy} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition active:scale-95 disabled:opacity-50">
            <FileDown className="w-4 h-4 text-primary" /> {busy === "pdf" ? "Đang xuất..." : "Xuất PDF"}
          </button>
        </div>
      </div>

      {error && !stats && <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">Không tải được thống kê: {errorMessage(error)}</div>}
      {isLoading && !stats && <StatsSkeleton />}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <TrendingUp className="w-4 h-4" />, label: "Tổng thu", value: stats.totals.incomeVnd, tone: "text-emerald-700 bg-emerald-50" },
              { icon: <TrendingDown className="w-4 h-4" />, label: "Tổng chi", value: stats.totals.expenseVnd, tone: "text-rose-700 bg-rose-50" },
              { icon: <PiggyBank className="w-4 h-4" />, label: "Chênh lệch (thu − chi)", value: stats.totals.netVnd, tone: stats.totals.netVnd >= 0 ? "text-primary bg-purple-50" : "text-rose-700 bg-rose-50", signed: true },
              { icon: <Wallet className="w-4 h-4" />, label: "Số dư cuối kỳ", value: stats.totals.closingVnd, tone: "text-gray-800 bg-gray-100" },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl p-4 border border-purple-50 shadow-xs">
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold ${c.tone}`}>
                  {c.icon} {c.label}
                </div>
                <div className="mt-2 text-lg sm:text-xl font-extrabold text-gray-900 tabular-nums">
                  {c.signed && c.value > 0 ? "+" : ""}
                  {formatVND(c.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs">
              <FinancialBarChart data={chart} height={240} title={`Thu – chi theo ${unit}`} subtitle={`${stats.periods.length} ${unit} gần nhất`} />
            </div>
            <div className="lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-3">
              {donut.length > 0 ? (
                <ExpenseDonutChart data={donut} size={150} title="Cơ cấu chi theo hạng mục" subtitle="Tổng các kỳ đang xem" />
              ) : (
                <p className="text-xs text-gray-400 py-10 text-center">Chưa có khoản chi nào trong các kỳ này.</p>
              )}
              {stats.incomeByType && stats.incomeByType.length > 0 && (
                <div className="pt-3 border-t border-gray-100 space-y-1.5">
                  <h4 className="text-xs font-bold text-gray-800">Thu theo loại khoản</h4>
                  {stats.incomeByType.map((t) => (
                    <div key={t.type} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{t.label}</span>
                      <b className="text-gray-900 tabular-nums">{formatVND(t.amountVnd)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs overflow-x-auto">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Bảng số liệu chi tiết</h3>
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[10px] uppercase text-gray-400 font-bold border-b border-gray-100">
                  <th className="pb-2 pr-3">Kỳ</th>
                  <th className="pb-2 px-2 text-right">Đầu kỳ</th>
                  <th className="pb-2 px-2 text-right">Thu</th>
                  <th className="pb-2 px-2 text-right">Chi</th>
                  <th className="pb-2 px-2 text-right">Chênh lệch</th>
                  <th className="pb-2 px-2 text-right">Cuối kỳ</th>
                  <th className="pb-2 pl-2 text-right">Tỷ lệ thu quỹ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...stats.periods].reverse().map((p) => (
                  <tr key={p.key} className="hover:bg-purple-50/40">
                    <td className="py-2.5 pr-3 font-bold text-gray-900">{p.label}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-gray-500">{num(p.openingVnd)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-emerald-700 font-semibold">{num(p.incomeVnd)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-rose-700 font-semibold">{num(p.expenseVnd)}</td>
                    <td className={`py-2.5 px-2 text-right tabular-nums font-bold ${p.netVnd >= 0 ? "text-gray-900" : "text-rose-700"}`}>
                      {p.netVnd > 0 ? "+" : ""}
                      {num(p.netVnd)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-bold text-gray-900">{num(p.closingVnd)}</td>
                    <td className="py-2.5 pl-2 text-right tabular-nums text-gray-600">{p.collectionRatePct === null ? "—" : `${p.collectionRatePct}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-extrabold text-gray-900">
                  <td className="pt-3 pr-3">Tổng cộng</td>
                  <td className="pt-3 px-2 text-right tabular-nums">{num(stats.totals.openingVnd)}</td>
                  <td className="pt-3 px-2 text-right tabular-nums text-emerald-700">{num(stats.totals.incomeVnd)}</td>
                  <td className="pt-3 px-2 text-right tabular-nums text-rose-700">{num(stats.totals.expenseVnd)}</td>
                  <td className="pt-3 px-2 text-right tabular-nums">{num(stats.totals.netVnd)}</td>
                  <td className="pt-3 px-2 text-right tabular-nums">{num(stats.totals.closingVnd)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-[11px] text-gray-400">
              Thu/chi là số thuần (đã trừ bút toán đảo); chuyển quỹ nội bộ không tính là thu hay chi. Nguồn: sổ quỹ.
              {stats.totals.adjustmentVnd !== 0 && <> Số dư cuối − đầu còn gồm {formatVND(stats.totals.adjustmentVnd)} “số dư đầu kỳ” nhập tay giữa các kỳ (không phải thu/chi).</>}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
