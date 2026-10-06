"use client";

// Thẻ "Giao dịch ngân hàng" (Thu chi → Tổng quan, Thủ quỹ): tiền chuyển vào tài khoản lưu xá được dịch vụ SePay/Casso báo về tự động;
// hệ thống gợi ý khoản phải thu khớp (tên + mã kế hoạch + số tiền), Thủ quỹ bấm xác nhận để ghi phiếu thu.
import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, Check, ChevronDown, EyeOff, Plug, Undo2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { bankLinesApi, refreshFinance, useBankLines } from "@/lib/data/finance";
import type { BankLineDto, BankSuggestionDto } from "@/lib/types/bank";
import { formatVND } from "@/lib/utils";
import { dmy } from "@/lib/finance-format";
import { CustomInput } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

const CONF_LABEL = { high: "Khớp cao", medium: "Có thể", low: "Tham khảo" } as const;
const CONF_STYLE = { high: "bg-emerald-100 text-emerald-800", medium: "bg-amber-100 text-amber-800", low: "bg-gray-100 text-gray-600" } as const;

export default function BankLinesCard() {
  const { can } = useSession();
  const allowed = can("finance.reconcile");
  const { data, isLoading } = useBankLines(allowed);
  const [showDone, setShowDone] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  if (!allowed || (isLoading && !data) || !data) return null;

  const open = data.lines.filter((l) => l.status === "unmatched");
  const done = data.lines.filter((l) => l.status !== "unmatched");
  // Chưa bật webhook và chưa có dòng nào ⇒ chỉ hiện gợi ý kết nối gọn
  if (!data.webhookEnabled && !data.lines.length) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-dashed border-purple-200 flex items-center gap-3">
        <Plug className="w-5 h-5 text-purple-400 shrink-0" />
        <div className="text-xs text-gray-600 flex-1 min-w-0">
          <b className="text-gray-900">Nhận tiền chuyển khoản tự động.</b> Kết nối SePay hoặc Casso để mỗi giao dịch vào tài khoản hiện ở đây kèm gợi ý ghi thu.
        </div>
        <button onClick={() => setShowSetup((v) => !v)} className="text-xs font-bold text-primary hover:underline shrink-0">Cách kết nối</button>
        {showSetup && <div className="basis-full"><SetupGuide /></div>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center"><Banknote className="w-5 h-5" /></div>
          <div>
            <h2 className="text-base font-bold text-gray-900 leading-tight">Giao dịch ngân hàng</h2>
            <p className="text-[11px] text-gray-500">{open.length ? `${open.length} giao dịch chờ ghi thu` : "Không có giao dịch nào chờ xử lý"}</p>
          </div>
        </div>
        <button onClick={() => setShowSetup((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-primary"><Plug className="w-3.5 h-3.5" />{data.webhookEnabled ? "Đã kết nối" : "Chưa kết nối"}</button>
      </div>
      {showSetup && <SetupGuide enabled={data.webhookEnabled} />}

      {open.length > 0 && <ul className="space-y-3">{open.map((l) => <LineRow key={l.id} line={l} canConfirm={data.canConfirm} />)}</ul>}

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary">
            <ChevronDown className={cn("w-4 h-4 transition-transform", showDone && "rotate-180")} /> Đã xử lý gần đây ({done.length})
          </button>
          {showDone && <ul className="mt-2 space-y-2">{done.map((l) => <LineRow key={l.id} line={l} canConfirm={data.canConfirm} />)}</ul>}
        </div>
      )}
    </div>
  );
}

function SetupGuide({ enabled }: { enabled?: boolean }) {
  const [origin, setOrigin] = useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="rounded-xl bg-purple-50/60 border border-purple-100 p-3.5 text-[11px] text-gray-700 leading-relaxed space-y-1.5">
      <p><b>Kết nối dịch vụ báo biến động số dư (SePay hoặc Casso):</b></p>
      <ol className="list-decimal pl-4 space-y-1">
        <li>Quản trị hệ thống đặt biến <code className="px-1 rounded bg-white">BANK_WEBHOOK_SECRET</code> (chuỗi bí mật ≥ 16 ký tự) trên máy chủ{enabled === false ? " — hiện CHƯA đặt" : enabled ? " — đã đặt ✓" : ""}.</li>
        <li>Ở SePay/Casso, tạo webhook tới <code className="px-1 rounded bg-white break-all">{origin}/api/v1/public/bank-webhook</code>, kiểu xác thực “API Key” (SePay) / “secure-token” (Casso) với đúng chuỗi bí mật trên.</li>
        <li>Mỗi giao dịch tiền vào sẽ hiện ở đây. Hệ thống chỉ <b>gợi ý</b> — bạn bấm xác nhận thì mới ghi phiếu thu.</li>
      </ol>
    </div>
  );
}

function LineRow({ line, canConfirm }: { line: BankLineDto; canConfirm: boolean }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [reason, setReason] = useState("");
  const out = line.direction === "out";
  const open = line.status === "unmatched";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refreshFinance();
      showToast("success", ok);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = (s: BankSuggestionDto) => run(() => bankLinesApi.confirm(line.id, s.contributionId), `Đã ghi thu ${formatVND(line.amountVnd)} cho ${s.memberName}.`);

  return (
    <li className={cn("rounded-xl border p-3.5 space-y-2.5", open ? "border-sky-200 bg-sky-50/30" : "border-gray-100 bg-gray-50/50", busy && "opacity-60 pointer-events-none")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex gap-2.5">
          <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", out ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-700")}>{out ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}</span>
          <div className="min-w-0">
            <p className={cn("text-sm font-extrabold", out ? "text-rose-600" : "text-emerald-700")}>{out ? "-" : "+"}{formatVND(line.amountVnd)}</p>
            <p className="text-xs text-gray-700 break-words">{line.description || "Không có nội dung"}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{dmy(line.txnDate)}{line.reference ? ` · ${line.reference}` : ""}{line.status === "matched" ? " · đã ghi thu" : line.status === "ignored" ? ` · đã bỏ qua: ${line.ignoreReason ?? ""}` : ""}</p>
          </div>
        </div>
        {line.status === "ignored" && canConfirm && (
          <button onClick={() => run(() => bankLinesApi.restore(line.id), "Đã khôi phục giao dịch.")} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline shrink-0"><Undo2 className="w-3.5 h-3.5" />Khôi phục</button>
        )}
      </div>

      {open && !out && (
        <div className="space-y-2">
          {line.suggestions.length > 0 ? (
            line.suggestions.map((s) => (
              <div key={s.contributionId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-purple-100 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <span className={cn("mr-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold", CONF_STYLE[s.confidence])}>{CONF_LABEL[s.confidence]}</span>
                  <b className="text-gray-900">{s.memberName}</b> · {s.planName} <span className="text-gray-500">(còn {formatVND(s.remainingVnd)})</span>
                  {line.amountVnd > s.remainingVnd && <span className="block text-[11px] text-rose-600">Giao dịch lớn hơn số còn phải đóng — ghi thu thủ công ở bảng quỹ.</span>}
                  {line.amountVnd < s.remainingVnd && <span className="block text-[11px] text-amber-700">Giao dịch nhỏ hơn số còn phải đóng — sẽ ghi thu một phần.</span>}
                </div>
                {canConfirm && line.amountVnd <= s.remainingVnd && (
                  <button onClick={() => confirm(s)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition active:scale-95"><Check className="w-3.5 h-3.5" />Ghi thu</button>
                )}
              </div>
            ))
          ) : (
            <p className="text-[11px] text-gray-500">Chưa tìm thấy khoản phải thu khớp (tên người nộp không có trong nội dung chuyển khoản). Có thể ghi thu thủ công ở bảng quỹ, hoặc bỏ qua nếu không phải tiền quỹ.</p>
          )}
          {ignoring ? (
            <div className="flex items-end gap-2">
              <div className="flex-1"><CustomInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do bỏ qua (VD: tiền ủng hộ, không phải quỹ)" maxLength={300} aria-label="Lý do bỏ qua" /></div>
              <button disabled={reason.trim().length < 5} onClick={() => run(() => bankLinesApi.ignore(line.id, reason), "Đã bỏ qua giao dịch.")} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-[11px] font-bold disabled:opacity-40">Bỏ qua</button>
              <button onClick={() => { setIgnoring(false); setReason(""); }} className="px-2 py-2 text-[11px] font-bold text-gray-500">Hủy</button>
            </div>
          ) : (
            <button onClick={() => setIgnoring(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800"><EyeOff className="w-3.5 h-3.5" />Không phải tiền quỹ — bỏ qua</button>
          )}
        </div>
      )}
      {open && out && (
        <button onClick={() => run(() => bankLinesApi.ignore(line.id, "Giao dịch tiền ra — ghi nhận ở phiếu chi"), "Đã ẩn giao dịch.")} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800"><EyeOff className="w-3.5 h-3.5" />Tiền ra — ẩn (ghi nhận ở phiếu chi)</button>
      )}
    </li>
  );
}
