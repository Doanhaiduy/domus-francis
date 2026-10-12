"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, Download, FileJson, Loader2, MessageSquareText, Send, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { useLegalConsent } from "@/lib/data/consents";
import { downloadMyData, useDataRequests } from "@/lib/data/data-requests";
import { openSettingsTab } from "@/lib/data/system";
import { LEGAL_PATHS } from "@/content/legal";
import { DataRequestDialog } from "./DataRequestDialog";
import { DsrDueBadge, DsrStatusChip, DsrTypeChip, fmtDateTime } from "./DataRequestBits";

/**
 * Cài đặt → Hồ sơ cá nhân → "Quyền riêng tư & dữ liệu của tôi" (neo #du-lieu-cua-toi):
 * tải dữ liệu của chính mình (JSON), gửi yêu cầu về dữ liệu (xem / sửa / xóa / rút đồng ý / khác — hạn phản hồi 72 giờ),
 * theo dõi các yêu cầu đã gửi + trả lời của người quản lý, xem phiên bản Điều khoản/Chính sách đã đồng ý.
 */
export function MyPrivacyCard() {
  const { showToast } = useApp();
  const { data } = useDataRequests("mine");
  const { status: legal } = useLegalConsent();
  const [exporting, setExporting] = useState(false);
  const [dialog, setDialog] = useState(false);
  const mine = data?.mine ?? [];

  // Mở từ thông báo (/cai-dat?tab=profile#du-lieu-cua-toi) ⇒ cuộn tới thẻ khi đã có dữ liệu
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#du-lieu-cua-toi" || !data) return;
    const t = setTimeout(() => document.getElementById("du-lieu-cua-toi")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [data]);

  const exportNow = async () => {
    setExporting(true);
    try {
      const name = await downloadMyData();
      showToast("success", `Đã tải ${name}. Tệp chứa dữ liệu cá nhân — hãy cất giữ cẩn thận, đừng gửi cho người không cần thiết.`);
    } catch (e) {
      showToast("error", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="du-lieu-cua-toi" aria-labelledby="du-lieu-cua-toi-title" className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-50 shadow-xs space-y-5 scroll-mt-24">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 id="du-lieu-cua-toi-title" className="text-base font-extrabold text-gray-900">
            Quyền riêng tư &amp; dữ liệu của tôi
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Theo Luật Bảo vệ dữ liệu cá nhân, bạn có quyền biết nhà đang lưu gì về mình, nhận bản sao, yêu cầu sửa, xóa, hạn chế xử lý và rút lại sự đồng ý.
          </p>
        </div>
      </div>

      {legal?.accepted && legal.acceptedAt && (
        <p className="flex items-start gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <BadgeCheck className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          <span>
            Bạn đã đồng ý Điều khoản sử dụng &amp; Chính sách bảo mật phiên bản <b>{legal.version}</b> lúc {fmtDateTime(legal.acceptedAt)}.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/70 to-white p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <FileJson className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-gray-900">Tải dữ liệu của tôi</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Một tệp JSON gồm hồ sơ, đồng ý, phòng ở, khoản quỹ, xin phép, điểm danh, trực, học tập, góp ý, thiết bị đăng nhập… của riêng bạn. Số CCCD và SĐT
                phụ huynh chỉ ghi 4 số cuối.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportNow}
            disabled={exporting}
            className="mt-auto self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {exporting ? "Đang chuẩn bị tệp…" : "Tải dữ liệu (.json)"}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <Send className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-gray-900">Gửi yêu cầu về dữ liệu</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                Xem / nhận bản sao, sửa thông tin sai, xóa dữ liệu, rút đồng ý, hạn chế hoặc phản đối xử lý. Người quản lý phản hồi trong 72 giờ.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDialog(true)}
            className="mt-auto self-start inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-primary text-xs font-bold transition active:scale-95"
          >
            <Send className="w-3.5 h-3.5" /> Gửi yêu cầu
          </button>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-gray-700">Yêu cầu của tôi</p>
          <ul className="space-y-2.5">
            {mine.map((r) => (
              <li key={r.id} className={`rounded-2xl border p-3.5 space-y-2 ${r.overdue ? "border-rose-200" : "border-gray-100"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DsrTypeChip type={r.type} />
                  <DsrStatusChip status={r.status} />
                  <DsrDueBadge item={r} />
                  <span className="text-[11px] text-gray-400 ml-auto">Gửi {fmtDateTime(r.receivedAt)}</span>
                </div>
                {r.details && <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line line-clamp-4">{r.details}</p>}
                {r.resolutionNote && (
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-2.5">
                    <p className="text-[11px] font-extrabold text-primary flex items-center gap-1.5">
                      <MessageSquareText className="w-3.5 h-3.5" aria-hidden /> Trả lời{r.handledByName ? ` từ ${r.handledByName}` : ""}
                      {r.completedAt ? ` · ${fmtDateTime(r.completedAt)}` : ""}
                    </p>
                    <p className="text-xs text-gray-800 mt-1 leading-relaxed whitespace-pre-line">{r.resolutionNote}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
        <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          Chính sách bảo mật <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
        </a>
        <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          Điều khoản sử dụng <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
        </a>
        <button type="button" onClick={() => openSettingsTab("security")} className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-primary">
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden /> Bật/tắt các đồng ý (tab Bảo mật)
        </button>
      </div>

      <DataRequestDialog open={dialog} onClose={() => setDialog(false)} />
    </section>
  );
}
