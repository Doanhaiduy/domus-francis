import React from "react";
import Link from "next/link";
import { HandHeart, Receipt, ShieldCheck } from "lucide-react";
import type { DonationTransparency } from "@/lib/types/public-site";
import { cn, formatVND } from "@/lib/utils";

type Data = Extract<DonationTransparency, { enabled: true }>;

const dmy = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d);

/**
 * Khối "Minh bạch" ở trang Ủng hộ (chỉ khi người quản lý bật): tổng tiền ủng hộ đã xác nhận + số lượt, tổng chi theo hạng mục của một năm.
 * Chỉ số tổng — không tên người, không nội dung phiếu. Một chuỗi số liệu (chi theo hạng mục) ⇒ thanh ngang một màu, giá trị ghi bằng chữ
 * cạnh mỗi thanh (đọc được cả khi không phân biệt màu); màu thanh ở giao diện tối sáng hơn một nấc để đạt tương phản ≥ 3:1 với nền thẻ.
 */
export function TransparencyBlock({ data, basePath = "/ung-ho" }: { data: Data; basePath?: string }) {
  const max = Math.max(1, ...data.expenseByCategory.map((c) => c.totalVnd));
  const total = Math.max(1, data.expenseTotalVnd);
  return (
    <section id="minh-bach" aria-labelledby="minh-bach-title" className="scroll-mt-28">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">Minh bạch</p>
          <h2 id="minh-bach-title" className="mt-1 text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Ủng hộ và chi tiêu năm {data.year}</h2>
          <p className="mt-1.5 text-sm text-gray-600 leading-relaxed max-w-2xl">
            Số liệu tổng hợp từ sổ quỹ của nhà{data.asOf ? ` (cập nhật ${dmy(data.asOf)})` : ""}. Không hiển thị tên người ủng hộ.
          </p>
        </div>
        {data.years.length > 1 && (
          <nav className="flex flex-wrap gap-1.5" aria-label="Chọn năm">
            {data.years.map((y) => (
              <Link
                key={y}
                href={`${basePath}?nam=${y}#minh-bach`}
                scroll={false}
                aria-current={y === data.year ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition",
                  y === data.year ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-purple-200 hover:text-primary hover:border-purple-300",
                )}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl bg-white border border-purple-100 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-600">
            <HandHeart className="w-4 h-4 text-rose-500" aria-hidden />
            Ủng hộ đã nhận
          </p>
          <p className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">{formatVND(data.donationTotalVnd)}</p>
          <p className="mt-1 text-xs text-gray-500">{data.donationCount.toLocaleString("vi-VN")} lượt ủng hộ đã được Thủ quỹ xác nhận</p>
        </div>
        <div className="rounded-3xl bg-white border border-purple-100 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-gray-600">
            <Receipt className="w-4 h-4 text-primary" aria-hidden />
            Đã chi cho sinh hoạt chung
          </p>
          <p className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">{formatVND(data.expenseTotalVnd)}</p>
          <p className="mt-1 text-xs text-gray-500">Theo các phiếu chi đã chi trong năm (mọi nguồn quỹ)</p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white border border-purple-100 p-5 sm:p-6">
        <h3 className="text-sm font-extrabold text-gray-900">Chi theo hạng mục</h3>
        {data.expenseByCategory.length ? (
          <ul className="mt-4 space-y-3.5">
            {data.expenseByCategory.map((c) => {
              const pct = Math.round((c.totalVnd / total) * 100);
              return (
                <li key={c.name} title={`${c.name}: ${formatVND(c.totalVnd)} · ${pct}% tổng chi`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-gray-800 min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums font-bold text-gray-900">
                      {formatVND(c.totalVnd)} <span className="font-semibold text-gray-500">· {pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-r-[4px] bg-purple-100" aria-hidden>
                    <div className="h-full rounded-r-[4px] bg-[#5f3add] dark:bg-[#8b6cf6]" style={{ width: `${Math.max(1.5, (c.totalVnd / max) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Chưa có khoản chi nào được ghi trong năm {data.year}.</p>
        )}
        <p className="mt-5 pt-4 border-t border-purple-50 flex gap-2 text-xs text-gray-500 leading-relaxed">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-emerald-600" aria-hidden />
          <span>Mọi khoản thu chi được ghi vào sổ quỹ điện tử của nhà: bút toán đã ghi không sửa, xóa được — sai sót chỉ được điều chỉnh bằng bút toán mới có ghi lý do.</span>
        </p>
      </div>
    </section>
  );
}
