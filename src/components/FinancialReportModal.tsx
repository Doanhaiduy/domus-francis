"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, Download } from "lucide-react";
import { formatVND } from "@/lib/utils";
import { useZaloSend } from "@/lib/zalo-client";
import { useApp } from "@/lib/store";
import { Portal } from "@/components/ui/Portal";
import { downloadFinancialReportPdf } from "@/lib/pdf/financial-report";
import { dmy, formatFinanceReportForZalo, vnToday, type FinanceReportText } from "@/lib/finance-format";
import {
  CONTRIBUTION_STATUS_LABEL,
  EXPENSE_STATUS_LABEL,
  type ContributionPlanDto,
  type ContributionRowDto,
  type ExpenseDto,
  type FinanceOverviewDto,
} from "@/lib/types/finance";

interface FinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodLabel: string;
  overview: FinanceOverviewDto | undefined;
  /** Phiếu chi trong kỳ (theo quyền xem của người dùng) */
  expenses: ExpenseDto[];
  /** Kế hoạch thu được báo cáo (quỹ định kỳ / điện nước) + khoản đóng của từng thành viên (null nếu người xem không được xem danh sách) */
  plan: ContributionPlanDto | null;
  rows: ContributionRowDto[] | null;
  /** Người xem thấy toàn bộ phiếu chi (finance.expense.read_all) — nếu không, bảng kê dùng cơ cấu chi tổng hợp */
  canSeeAllExpenses: boolean;
}

/** Nội dung báo cáo (dùng chung cho modal PDF, nút Copy Zalo và tệp .txt của trang Thu Chi). */
export function buildFinanceReport(p: Omit<FinancialReportModalProps, "isOpen" | "onClose">): FinanceReportText & {
  paid: ExpenseDto[];
  contributionRows: { row: ContributionRowDto; cell: ContributionRowDto["cells"][string] }[];
} {
  const o = p.overview;
  const paid = p.canSeeAllExpenses ? p.expenses.filter((e) => e.status === "paid" || e.status === "reversed") : [];
  const contributionRows =
    p.plan && p.rows
      ? p.rows.flatMap((row) => (row.cells[p.plan!.id] ? [{ row, cell: row.cells[p.plan!.id] }] : []))
      : [];
  const unpaid =
    p.plan && p.rows && o?.access.contributionsAll
      ? contributionRows
          .filter((x) => x.cell.status === "unpaid" || x.cell.status === "partial")
          .map((x) => ({ name: x.row.fullName, room: x.row.room, amountVnd: x.cell.remainingVnd }))
      : null;
  const stats = p.plan?.stats;
  return {
    periodLabel: p.periodLabel,
    openingVnd: o?.openingVnd ?? 0,
    incomeVnd: o?.incomeVnd ?? 0,
    expenseVnd: o?.expenseVnd ?? 0,
    closingVnd: o?.closingVnd ?? 0,
    duesExpectedVnd: stats?.expectedVnd ?? o?.duesExpectedVnd ?? 0,
    duesCollectedVnd: stats?.collectedVnd ?? o?.duesCollectedVnd ?? 0,
    unpaid,
    unpaidCount: stats && stats.unpaidCount !== null && stats.partialCount !== null ? stats.unpaidCount + stats.partialCount : unpaid?.length ?? null,
    dueDate: p.plan?.dueDate ?? null,
    expenses: paid
      .filter((e) => e.status === "paid")
      .map((e) => ({ date: e.expenseDate, title: e.title, amountVnd: e.amountVnd, payer: e.paidBy?.name ?? null })),
    categories: (o?.expenseByCategory ?? []).map((c) => ({ name: c.name, amountVnd: c.amountVnd })),
    treasurer: o?.signatories.treasurer?.name ?? null,
    paid,
    contributionRows,
  };
}

export default function FinancialReportModal(props: FinancialReportModalProps) {
  const { isOpen, onClose, periodLabel, overview: o, plan } = props;
  const { showToast } = useApp();
  const { canSend: canZaloSend, sending: zaloSending, send: zaloSend } = useZaloSend();
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const report = useMemo(() => buildFinanceReport(props), [props]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fileBase = `Bao_Cao_Thu_Chi_${periodLabel.replace(/[\s,/–]+/g, "_")}`;
  const totalPaid = report.paid.filter((e) => e.status === "paid").reduce((s, e) => s + e.amountVnd, 0);
  const outstanding = Math.max(0, report.duesExpectedVnd - report.duesCollectedVnd);
  const today = vnToday();
  const houseName = o?.org.houseName ?? "Lưu Xá Sinh Viên Phanxicô Assisi";
  const orderName = o?.org.orderName ?? "Dòng Anh Em Hèn Mọn Việt Nam (OFM)";

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadFinancialReportPdf({ periodLabel, report, overview: o, plan, canSeeAllExpenses: props.canSeeAllExpenses });
      showToast("success", "Đã tải file PDF báo cáo thu chi thành công!");
    } catch (err) {
      console.error(err);
      showToast("error", "Đã xảy ra lỗi khi tạo file PDF. Vui lòng thử lại!");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyZalo = async () => {
    await zaloSend(formatFinanceReportForZalo(report), "Đã gửi báo cáo tài chính vào nhóm Zalo.");
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([formatFinanceReportForZalo(report)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileBase}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("success", "Đã tải file văn bản báo cáo thu chi thành công!");
  };

  const paidCount = plan?.stats.paidCount;
  const totalCount = plan?.stats.totalCount;

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-5">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto"
          >
            {/* MODAL ACTION HEADER */}
            <div className="no-print shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-purple-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">📊</div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Báo Cáo Quyết Toán Thu Chi Ngân Quỹ</h3>
                  <p className="text-xs text-gray-500">Kỳ đối soát: {periodLabel} · Xuất bản chính quy (Khổ A4 / Tải PDF)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canZaloSend && (
                  <button
                    onClick={handleCopyZalo}
                    disabled={zaloSending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition active:scale-95 disabled:opacity-60"
                    title="Gửi báo cáo dạng text vào nhóm Zalo bằng bot"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{zaloSending ? "Đang gửi…" : "Gửi nhóm Zalo"}</span>
                  </button>
                )}
                <button
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition active:scale-95"
                  title="Tải văn bản .txt"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải file</span>
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                  title="Tải xuống file PDF"
                >
                  {isExporting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang xuất...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải PDF (A4)</span>
                    </>
                  )}
                </button>
                <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition ml-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE A4 CONTENT */}
            <div ref={printableRef} className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 space-y-6 text-gray-800 printable-area bg-white">
              {/* HEADER */}
              <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-gray-600">{orderName}</p>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 uppercase">{houseName}</h2>
                  <p className="text-xs italic text-gray-600 mt-0.5">Ban Quản Trị Tài Chính &amp; Đời Sống Huynh Đệ</p>
                </div>
                <div className="text-right text-xs">
                  <span className="font-bold text-primary block">MẪU SỐ: LX-TC/{today.slice(0, 4)}</span>
                  <span className="text-[11px] text-gray-500">Lập ngày: {dmy(today)}</span>
                </div>
              </div>

              {/* TITLE */}
              <div className="text-center py-2">
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-gray-900 font-sans">BẢNG ĐỐI SOÁT THU – CHI QUỸ SINH HOẠT CHUNG</h1>
                <p className="text-xs italic text-gray-600 mt-1">
                  (Kỳ đối soát: <b>{periodLabel}</b> · Đơn vị tiền tệ: Việt Nam Đồng (VND))
                </p>
                <p className="text-[11px] text-gray-500 mt-1 font-sans">
                  Số dư đầu kỳ {formatVND(report.openingVnd)} + Thu {formatVND(report.incomeVnd)} − Chi {formatVND(report.expenseVnd)} = Tồn cuối kỳ{" "}
                  <b>{formatVND(report.closingVnd)}</b>
                </p>
              </div>

              {/* SUMMARY FINANCIAL METRICS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans">
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <span className="text-[11px] text-gray-500 font-medium block">Tồn quỹ cuối kỳ</span>
                  <span className="text-base font-extrabold text-primary block mt-1">{formatVND(report.closingVnd)}</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[11px] text-gray-500 font-medium block">Tổng đã thu trong kỳ</span>
                  <span className="text-base font-extrabold text-emerald-700 block mt-1">{formatVND(report.incomeVnd)}</span>
                  {paidCount !== null && paidCount !== undefined && totalCount ? (
                    <span className="text-[10px] text-emerald-600">
                      ({paidCount}/{totalCount} thành viên)
                    </span>
                  ) : null}
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                  <span className="text-[11px] text-gray-500 font-medium block">Tổng đã chi trong kỳ</span>
                  <span className="text-base font-extrabold text-rose-700 block mt-1">{formatVND(report.expenseVnd)}</span>
                  {props.canSeeAllExpenses && <span className="text-[10px] text-rose-600">({report.expenses.length} phiếu chi)</span>}
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-[11px] text-gray-500 font-medium block">Chưa thu / Tồn nợ</span>
                  <span className="text-base font-extrabold text-amber-700 block mt-1">{formatVND(outstanding)}</span>
                  {report.unpaidCount !== null && <span className="text-[10px] text-amber-600">({report.unpaidCount} thành viên)</span>}
                </div>
              </div>

              {/* ITEM 1: EXPENSE TRANSACTIONS */}
              <div className="space-y-2">
                {props.canSeeAllExpenses ? (
                  <>
                    <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
                      I. BẢNG KÊ CHI TIẾT CÁC KHOẢN ĐÃ CHI TRONG KỲ ({report.paid.length} KHOẢN)
                    </h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs font-sans">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold text-[11px]">
                          <tr>
                            <th className="py-2 px-3">STT</th>
                            <th className="py-2 px-3">Số phiếu / Ngày</th>
                            <th className="py-2 px-3">Nội dung chi tiêu</th>
                            <th className="py-2 px-3">Phân loại</th>
                            <th className="py-2 px-3 text-right">Số tiền (đ)</th>
                            <th className="py-2 px-3">Người ứng/chi</th>
                            <th className="py-2 px-3">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[11px]">
                          {report.paid.map((e, idx) => (
                            <tr key={e.id} className="hover:bg-gray-50/50">
                              <td className="py-2 px-3 font-mono">{idx + 1}</td>
                              <td className="py-2 px-3 font-mono">
                                {e.voucherNo}
                                <span className="block text-[10px] text-gray-400">{dmy(e.expenseDate)}</span>
                              </td>
                              <td className="py-2 px-3 font-medium text-gray-900">
                                {e.title}
                                {e.note && <span className="text-gray-400 block text-[10px]">Ghi chú: {e.note}</span>}
                              </td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700">{e.category.name}</span>
                              </td>
                              <td className={`py-2 px-3 text-right font-mono font-bold ${e.status === "reversed" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                {formatVND(e.amountVnd)}
                              </td>
                              <td className="py-2 px-3">{e.paidBy?.name ?? "Quỹ chi trực tiếp"}</td>
                              <td className="py-2 px-3">
                                <span className={e.status === "paid" ? "text-emerald-700 font-semibold" : "text-purple-700 font-semibold"}>{EXPENSE_STATUS_LABEL[e.status]}</span>
                              </td>
                            </tr>
                          ))}
                          {report.paid.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-3 px-3 text-center text-gray-400">
                                Không có khoản chi nào trong kỳ.
                              </td>
                            </tr>
                          )}
                          <tr className="bg-purple-50/40 font-bold text-gray-900 border-t border-gray-200">
                            <td colSpan={4} className="py-2 px-3 text-right">
                              TỔNG CỘNG CÁC PHIẾU ĐÃ CHI (theo ngày chi):
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-primary font-extrabold">{formatVND(totalPaid)}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
                      I. CƠ CẤU CHI TIÊU TRONG KỲ THEO DANH MỤC
                    </h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs font-sans">
                        <tbody className="divide-y divide-gray-100 text-[11px]">
                          {(o?.expenseByCategory ?? []).map((c) => (
                            <tr key={c.code}>
                              <td className="py-2 px-3 font-medium text-gray-900">{c.name}</td>
                              <td className="py-2 px-3 text-gray-500">{c.count} phiếu</td>
                              <td className="py-2 px-3 text-right font-mono font-bold">{formatVND(c.amountVnd)}</td>
                            </tr>
                          ))}
                          {!o?.expenseByCategory.length && (
                            <tr>
                              <td className="py-3 px-3 text-center text-gray-400">Không có khoản chi nào trong kỳ.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] italic text-gray-500 font-sans">Bảng kê chi tiết từng phiếu chi do Thủ quỹ/người quản lý lập và lưu trữ.</p>
                  </>
                )}
              </div>

              {/* ITEM 2: MEMBER CONTRIBUTIONS */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider bg-gray-100 px-3 py-1.5 border-l-4 border-primary text-gray-900 font-sans">
                  II. TÌNH HÌNH CÁC KHOẢN THU{plan ? ` – ${plan.name.toUpperCase()}` : ""}
                  {o?.access.contributionsAll && report.contributionRows.length ? ` (${report.contributionRows.length} THÀNH VIÊN)` : ""}
                </h3>
                {!plan && <p className="text-xs text-gray-500 font-sans">Chưa có kế hoạch thu nào (quỹ định kỳ / tiền điện nước).</p>}
                {plan && (
                  <p className="text-[11px] text-gray-600 font-sans">
                    {plan.feeType === "utility" && plan.billTotalVnd !== null && plan.splitCount
                      ? `Tổng hóa đơn ${formatVND(plan.billTotalVnd)} ÷ ${plan.splitCount} người = ${formatVND(plan.amountVnd)} / người`
                      : `Mức đóng ${formatVND(plan.amountVnd)} / thành viên${plan.feeType === "periodic_dues" ? " / kỳ" : ""}`}{" "}
                    · Hạn nộp {dmy(plan.dueDate)} · Đã thu {formatVND(report.duesCollectedVnd)} /{" "}
                    {formatVND(report.duesExpectedVnd)}
                    {report.duesExpectedVnd > 0 ? ` (${Math.round((report.duesCollectedVnd / report.duesExpectedVnd) * 100)}%)` : ""}
                  </p>
                )}
                {plan && o?.access.contributionsAll ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans">
                    {report.contributionRows.map(({ row, cell }) => {
                      const done = cell.status === "paid" || cell.status === "waived";
                      const last = cell.payments[cell.payments.length - 1];
                      return (
                        <div
                          key={row.memberId}
                          className={`p-2.5 rounded-lg border flex items-center justify-between ${
                            done ? "bg-emerald-50/50 border-emerald-200 text-emerald-900" : "bg-rose-50/50 border-rose-200 text-rose-900"
                          }`}
                        >
                          <div>
                            <span className="font-bold">{row.fullName}</span>
                            {row.room && <span className="text-[11px] text-gray-500 ml-1.5">({row.room})</span>}
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold block">{formatVND(cell.status === "waived" ? cell.amountDueVnd : cell.netDueVnd)}</span>
                            <span className="text-[10px] font-semibold">
                              {cell.status === "paid"
                                ? `✓ Đã nộp${last ? ` ${dmy(last.paidOn)}` : ""}`
                                : cell.status === "waived"
                                ? "Được miễn"
                                : cell.status === "partial"
                                ? `Còn thiếu ${formatVND(cell.remainingVnd)}`
                                : `✗ ${CONTRIBUTION_STATUS_LABEL[cell.status]}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : plan ? (
                  <p className="text-[10px] italic text-gray-500 font-sans">Danh sách từng thành viên chỉ hiển thị với Thủ quỹ/người quản lý.</p>
                ) : null}
              </div>

              {/* SIGNATURES */}
              <div className="pt-6 border-t border-gray-200 font-sans">
                <div className="grid grid-cols-2 text-center text-xs">
                  <div>
                    <p className="font-bold text-gray-700 uppercase">NGƯỜI LẬP BIỂU (THỦ QUỸ)</p>
                    <p className="text-[10px] italic text-gray-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
                    <div className="h-16 flex items-end justify-center font-bold text-gray-900">{o?.signatories.treasurer?.name ?? "………………………"}</div>
                  </div>
                  <div>
                    <p className="font-bold text-gray-700 uppercase">DUYỆT CHI (TRƯỞNG LƯU XÁ)</p>
                    <p className="text-[10px] italic text-gray-400 mt-0.5">(Ký và xác nhận đối soát)</p>
                    <div className="h-16 flex items-end justify-center font-bold text-gray-900">{o?.signatories.houseHead?.name ?? "………………………"}</div>
                  </div>
                </div>
                <div className="text-right text-[10px] text-gray-400 border-t border-gray-100 pt-2 mt-4">
                  Biên bản được tự động kết xuất từ sổ quỹ hệ thống quản lý tài chính Lưu Xá Phanxicô vào lúc{" "}
                  {new Date().toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} ngày {dmy(today)}.
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="no-print shrink-0 p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Báo cáo sẵn sàng để chia sẻ cho huynh đệ đoàn hoặc lưu trữ kế toán.</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-100 transition">
                  Đóng
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  className="px-4 py-2 rounded-xl bg-primary text-white font-bold hover:bg-[#4d2dbf] shadow-md shadow-primary/20 transition flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
                >
                  {isExporting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang xuất PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Tải PDF (A4)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
