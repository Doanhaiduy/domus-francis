"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { CustomInput } from "@/components/ui/FormControls";
import { ZoomableImage } from "@/components/ui/ZoomableImage";
import { DONATION_PRESETS } from "@/lib/public-site";
import { buildVietQrPayload, qrDataUrl } from "@/lib/vietqr";
import { cn, formatVND } from "@/lib/utils";

/** Sự kiện báo số tiền vừa chọn ở mã QR ⇒ biểu mẫu "Báo đã ủng hộ" điền sẵn (nếu người xem chưa tự gõ). */
export const DONATION_AMOUNT_EVENT = "luuxa:donation-amount";

const MAX_VND = 1_000_000_000;
const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);
const grouped = (s: string) => (s ? Number(s).toLocaleString("vi-VN") : "");

/**
 * Mã VietQR nhận ủng hộ: mặc định là QR tĩnh có sẵn NỘI DUNG chuyển khoản (máy chủ vẽ sẵn — hiện được cả khi tắt JavaScript); chọn
 * nhanh / tự nhập số tiền ⇒ vẽ lại QR có số tiền ngay trên trình duyệt (không gọi dịch vụ ngoài). Bấm ảnh để phóng to, có nút lưu ảnh.
 */
export function DonationQr({ bankBin, accountNo, accountName, content, defaultQr }: { bankBin: string; accountNo: string; accountName: string; content: string; defaultQr: string }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [raw, setRaw] = useState("");
  const [qr, setQr] = useState(defaultQr);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    if (!amount) {
      setQr(defaultQr);
      return;
    }
    qrDataUrl(buildVietQrPayload({ bankBin, accountNo, amountVnd: amount, content }), 360)
      .then((url) => n === seq.current && setQr(url))
      .catch(() => n === seq.current && setQr(defaultQr));
  }, [amount, bankBin, accountNo, content, defaultQr]);

  const pick = (v: number | null) => {
    setAmount(v);
    if (v) window.dispatchEvent(new CustomEvent(DONATION_AMOUNT_EVENT, { detail: v }));
  };
  const onCustom = (text: string) => {
    const d = digits(text);
    setRaw(d);
    const v = Number(d);
    pick(v >= 1000 && v <= MAX_VND ? v : null);
  };

  const chip = (active: boolean) =>
    cn(
      "px-3.5 py-2 rounded-xl text-xs font-bold border transition active:scale-95",
      active ? "bg-primary text-white border-primary shadow-sm shadow-primary/20" : "bg-white text-gray-700 border-purple-200 hover:border-purple-300 hover:text-primary",
    );

  return (
    <div className="mx-auto w-full max-w-[280px] text-center">
      <ZoomableImage
        src={qr}
        alt={`Mã QR chuyển khoản ủng hộ tới ${accountName || accountNo}${amount ? `, số tiền ${formatVND(amount)}` : ""}`}
        width={240}
        height={240}
        className="mx-auto w-60 h-60 rounded-2xl border border-purple-100 bg-[#ffffff] p-2"
      />
      <p className="mt-2 text-xs text-gray-500 leading-relaxed" aria-live="polite">
        {amount ? (
          <>
            QR kèm số tiền <b className="text-gray-900">{formatVND(amount)}</b> — ứng dụng ngân hàng tự điền sẵn.
          </>
        ) : (
          "Quét bằng ứng dụng ngân hàng bất kỳ — nội dung chuyển khoản đã điền sẵn."
        )}
      </p>

      <div className="mt-4" role="group" aria-label="Chọn nhanh số tiền">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">Chọn nhanh số tiền</p>
        <div className="flex flex-wrap justify-center gap-2">
          {DONATION_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={!custom && amount === v}
              onClick={() => {
                setCustom(false);
                setRaw("");
                pick(amount === v && !custom ? null : v);
              }}
              className={chip(!custom && amount === v)}
            >
              {v >= 1_000_000 ? `${v / 1_000_000} triệu` : `${v / 1000}k`}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => {
              setCustom((c) => !c);
              if (custom) pick(null);
              else onCustom(raw);
            }}
            className={chip(custom)}
          >
            Số khác
          </button>
        </div>
        {custom && (
          <div className="mt-3 text-left">
            <CustomInput
              label="Số tiền (đồng)"
              inputMode="numeric"
              autoComplete="off"
              value={grouped(raw)}
              onChange={(e) => onCustom(e.target.value)}
              placeholder="VD: 300.000"
              rightSuffix="đ"
              hint={raw && Number(raw) < 1000 ? "Tối thiểu 1.000đ" : undefined}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {amount && (
            <button
              type="button"
              onClick={() => {
                setCustom(false);
                setRaw("");
                pick(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-primary"
            >
              <X className="w-3.5 h-3.5" aria-hidden /> Bỏ số tiền
            </button>
          )}
          <a href={qr} download={amount ? `ung-ho-${amount}.png` : "ung-ho-luu-xa.png"} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            <Download className="w-3.5 h-3.5" aria-hidden /> Lưu ảnh mã QR
          </a>
        </div>
      </div>
    </div>
  );
}
