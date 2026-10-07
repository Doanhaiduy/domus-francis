"use client";

// Ghi thu HÀNG LOẠT cho một kế hoạch thu: dùng khi anh em đã đóng quỹ từ trước (vd. trước khi dùng hệ thống) và Thủ quỹ nhập lại một lượt.
// Mỗi người một phiếu thu + một bút toán thu ở sổ quỹ (ngày thu = ngày thực tế). Tất cả hoặc không gì cả; gửi lại không ghi trùng.
import React, { useEffect, useMemo, useState } from "react";
import { Check, ListChecks, Search } from "lucide-react";
import { CustomDatePicker, CustomInput, CustomSelect } from "@/components/ui/FormControls";
import { FundSelect } from "@/components/finance/FundSelect";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { cn, formatVND } from "@/lib/utils";
import { financeApi, newRequestId, refreshFinance, useFinanceOptions } from "@/lib/data/finance";
import { PAYMENT_METHOD_LABEL, type ContributionPlanDto, type ContributionRowDto, type PaymentMethod } from "@/lib/types/finance";
import { btnGhost, btnPrimary, DialogShell, ErrorBox } from "./dialogs";

const toAmount = (s: string) => Number(s.replace(/[^\d]/g, ""));
const DEFAULT_NOTE = "Đóng trước khi dùng hệ thống";
const METHODS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => ({ value: k, label: PAYMENT_METHOD_LABEL[k] }));

export function BulkPayDialog({ plan, rows, onClose }: { plan: ContributionPlanDto; rows: ContributionRowDto[]; onClose: () => void }) {
  const { showToast } = useApp();
  const options = useFinanceOptions();
  const owing = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, cell: r.cells[plan.id] }))
        .filter((x) => x.cell && (x.cell.status === "unpaid" || x.cell.status === "partial") && x.cell.remainingVnd > 0)
        .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName, "vi")),
    [rows, plan.id]
  );
  const [picked, setPicked] = useState<Record<string, string>>({}); // contributionId → số tiền (chuỗi nhập)
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [fundId, setFundId] = useState("");
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => newRequestId());

  useEffect(() => {
    if (!options) return;
    if (!paidOn) setPaidOn(options.today);
    if (!fundId) setFundId((options.funds.find((f) => f.id === plan.fundId) ?? options.funds.find((f) => f.type === "cash") ?? options.funds[0])?.id ?? "");
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return owing;
    return owing.filter(({ row }) => row.fullName.toLowerCase().includes(s) || row.name.toLowerCase().includes(s) || (row.room ?? "").toLowerCase().includes(s));
  }, [owing, search]);

  const toggle = (cid: string, remaining: number) =>
    setPicked((p) => {
      const n = { ...p };
      if (cid in n) delete n[cid];
      else n[cid] = String(remaining);
      return n;
    });
  const allShownPicked = shown.length > 0 && shown.every(({ cell }) => cell.contributionId in picked);
  const toggleAll = () =>
    setPicked((p) => {
      const n = { ...p };
      if (allShownPicked) for (const { cell } of shown) delete n[cell.contributionId];
      else for (const { cell } of shown) if (!(cell.contributionId in n)) n[cell.contributionId] = String(cell.remainingVnd);
      return n;
    });

  const items = owing.filter(({ cell }) => cell.contributionId in picked).map(({ row, cell }) => ({ row, cell, amountVnd: toAmount(picked[cell.contributionId]) }));
  const total = items.reduce((a, x) => a + x.amountVnd, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (items.length === 0) return setError("Hãy tick ít nhất một người đã đóng.");
    const bad = items.find((x) => !(x.amountVnd >= 1) || x.amountVnd > x.cell.remainingVnd);
    if (bad) return setError(`Số tiền của ${bad.row.fullName} phải từ 1đ đến ${formatVND(bad.cell.remainingVnd)} (số còn phải thu).`);
    if (!paidOn) return setError("Chọn ngày đóng thực tế.");
    if (options && paidOn > options.today) return setError("Ngày đóng không được ở tương lai.");
    if (!fundId) return setError("Chưa có túi quỹ để ghi thu.");
    setBusy(true);
    try {
      const r = await financeApi.recordPaymentsBulk({
        fundId,
        method,
        paidOn,
        note: note.trim() || null,
        items: items.map((x) => ({ memberId: x.row.memberId, contributionId: x.cell.contributionId, amountVnd: x.amountVnd })),
        clientRequestId: requestId,
      });
      await refreshFinance();
      showToast("success", `Đã ghi thu ${formatVND(r.totalVnd)} của ${r.count} người.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>
        Hủy
      </button>
      <button type="submit" form="bulk-pay-form" disabled={busy || items.length === 0} className={btnPrimary}>
        {busy ? "Đang ghi…" : items.length ? `Ghi thu ${items.length} người · ${formatVND(total)}` : "Ghi thu"}
      </button>
    </>
  );

  return (
    <DialogShell
      open
      onClose={() => !busy && onClose()}
      icon={<ListChecks className="w-5 h-5" />}
      title="Ghi thu hàng loạt"
      subtitle={`${plan.name} — tick những người đã đóng`}
      footer={footer}
      maxWidth="max-w-2xl"
      z="z-[999]"
    >
      <form id="bulk-pay-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-900">
          Mỗi người được ghi một phiếu thu và <b>cộng vào sổ quỹ</b>. Nếu số dư đầu kỳ bạn đã nhập <b>gồm sẵn</b> các khoản này thì <b>đừng ghi lại ở đây</b> (sẽ bị cộng đôi). Ghi nhầm thì vào chi tiết khoản → hủy phiếu thu.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CustomDatePicker label="Ngày đóng thực tế" format="YYYY-MM-DD" value={paidOn} onChange={(d) => d && setPaidOn(d)} required />
          <CustomSelect<PaymentMethod> label="Hình thức" value={method} onChange={setMethod} options={METHODS} />
        </div>
        <FundSelect label="Nhận vào túi quỹ" value={fundId} onChange={setFundId} funds={options?.funds ?? []} />
        <CustomInput label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} hint={method === "bank_transfer" ? "Chuyển khoản không có mã giao dịch thì hệ thống ghi “Đóng trước khi dùng hệ thống”." : undefined} />

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <p className="text-xs font-extrabold text-gray-700">
              Người chưa đóng ({owing.length}) · đã chọn {items.length}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <CustomInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm tên, phòng…"
                  aria-label="Tìm thành viên"
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <button type="button" onClick={toggleAll} disabled={shown.length === 0} className="text-xs font-bold text-primary hover:underline disabled:opacity-50">
                {allShownPicked ? "Bỏ chọn" : "Chọn tất cả"}
              </button>
            </div>
          </div>
          {owing.length === 0 ? (
            <p className="p-4 rounded-xl bg-gray-50 text-xs text-gray-500 text-center">Không còn ai chưa đóng trong khoản này.</p>
          ) : (
            <ul className="rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-[44vh] overflow-y-auto custom-scroll">
              {shown.map(({ row, cell }) => {
                const on = cell.contributionId in picked;
                return (
                  <li key={cell.contributionId} className={cn("flex items-center gap-3 px-3 py-2", on && "bg-purple-50/60")}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Chọn ${row.fullName}`}
                      onClick={() => toggle(cell.contributionId, cell.remainingVnd)}
                      className={cn("w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition", on ? "bg-primary border-primary text-white" : "bg-white border-gray-300")}
                    >
                      {on && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => toggle(cell.contributionId, cell.remainingVnd)} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{row.fullName}</span>
                      <span className="block text-[11px] text-gray-500 truncate">
                        {row.room ? `Phòng ${row.room} · ` : ""}còn {formatVND(cell.remainingVnd)}
                        {cell.status === "partial" ? " (đã đóng một phần)" : ""}
                      </span>
                    </button>
                    {on && (
                      <div className="w-36 shrink-0">
                        <CustomInput
                          aria-label={`Số tiền ${row.fullName}`}
                          inputMode="numeric"
                          value={picked[cell.contributionId] ? toAmount(picked[cell.contributionId]).toLocaleString("vi-VN") : ""}
                          onChange={(e) => setPicked((p) => ({ ...p, [cell.contributionId]: e.target.value }))}
                          rightSuffix="đ"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="p-4 text-center text-xs text-gray-500">Không có ai khớp “{search}”.</li>}
            </ul>
          )}
        </div>
        <ErrorBox error={error} />
      </form>
    </DialogShell>
  );
}
