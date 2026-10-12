import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Heart, MessageCircleHeart, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { getDonationInfo, getDonationTransparency } from "@/server/modules/public-site";
import { DONATION_TRANSFER_CONTENT, OG_DEFAULT_IMAGES, SITE_KIND } from "@/lib/public-site";
import { getSiteInfo, publicDb } from "@/server/public";
import { buildVietQrPayload, canBuildVietQr } from "@/lib/vietqr";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { CopyField } from "@/components/public/CopyField";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { DonationQr } from "@/components/public/DonationQr";
import { DonationReportForm } from "@/components/public/DonationReportForm";
import { TransparencyBlock } from "@/components/public/TransparencyBlock";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const description = `Đồng hành cùng ${org.houseName} — ${SITE_KIND}: mọi đóng góp đều giúp duy trì mái nhà chung cho các bạn sinh viên.`;
  return {
    title: `Ủng hộ ${SITE_KIND}`,
    description,
    alternates: { canonical: "/ung-ho" },
    openGraph: { title: `Ủng hộ — ${org.houseName}`, description, url: "/ung-ho", type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
  };
}

export default async function DonatePage({ searchParams }: { searchParams: { nam?: string } }) {
  const year = Number.parseInt(searchParams.nam ?? "", 10);
  const [site, donation, transparency] = await Promise.all([
    getSiteInfo(),
    publicDb((tx) => getDonationInfo(tx)),
    publicDb((tx) => getDonationTransparency(tx, Number.isFinite(year) ? year : null)).catch(() => ({ enabled: false as const })),
  ]);
  if (!donation.enabled || !donation.account) notFound();
  const a = donation.account;

  // QR tĩnh có sẵn NỘI DUNG chuyển khoản (Thủ quỹ nhận ra ngay khoản ủng hộ trong sao kê); người xem chọn số tiền ⇒ QR có số tiền (vẽ trên trình duyệt).
  const qrReady = canBuildVietQr(a.bankBin, a.accountNo);
  const qr = qrReady
    ? await QRCode.toDataURL(buildVietQrPayload({ bankBin: a.bankBin!, accountNo: a.accountNo, content: DONATION_TRANSFER_CONTENT }), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 360,
        color: { dark: "#111827", light: "#ffffff" },
      })
    : null;

  return (
    <>
      <PublicHeader org={site.org} section="ung-ho" donationEnabled />
      <PageHero eyebrow="Ủng hộ" title="Đồng hành cùng mái nhà chung" subtitle="Mỗi đóng góp, dù nhỏ, giúp lưu xá duy trì sinh hoạt và nâng đỡ các bạn sinh viên xa nhà." />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 space-y-10">
        {donation.note && (
          <div className="rounded-3xl bg-white border border-purple-100 p-6 sm:p-8">
            <ArticleMarkdown source={donation.note} />
          </div>
        )}

        <section className="rounded-3xl bg-white border border-purple-100 shadow-sm p-6 sm:p-8 grid gap-8 md:grid-cols-[auto_1fr] items-start" aria-labelledby="bank">
          {qr && <DonationQr bankBin={a.bankBin!} accountNo={a.accountNo} accountName={a.accountName} content={DONATION_TRANSFER_CONTENT} defaultQr={qr} />}
          <div className="space-y-3 min-w-0">
            <h2 id="bank" className="text-xl font-extrabold text-gray-900 inline-flex items-center gap-2"><Heart className="w-5 h-5 text-rose-500" aria-hidden />Thông tin chuyển khoản</h2>
            {a.bankName && <CopyField label="Ngân hàng" value={a.bankName} />}
            <CopyField label="Số tài khoản" value={a.accountNo} mono />
            {a.accountName && <CopyField label="Chủ tài khoản" value={a.accountName} />}
            <CopyField label="Nội dung chuyển khoản" value={DONATION_TRANSFER_CONTENT} mono />
            <p className="text-xs text-gray-500 leading-relaxed">
              Giữ nguyên nội dung <b className="text-gray-700">{DONATION_TRANSFER_CONTENT}</b> (mã QR đã điền sẵn) để Thủ quỹ nhận ra khoản ủng hộ khi đối chiếu sao kê. Xin chân thành cảm ơn tấm lòng của bạn.
            </p>
          </div>
        </section>

        <section id="bao-ung-ho" className="grid gap-6 md:grid-cols-[1fr_1.35fr] items-start scroll-mt-28" aria-labelledby="bao-title">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">Sau khi chuyển khoản</p>
              <h2 id="bao-title" className="mt-1 text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Báo cho nhà biết bạn đã ủng hộ</h2>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">Không bắt buộc, nhưng giúp Thủ quỹ đối chiếu nhanh và gửi lời cảm ơn đến bạn.</p>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-3"><BadgeCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden /><span>Thủ quỹ đối chiếu với sao kê ngân hàng rồi mới ghi vào quỹ chung — khoản bạn báo chưa được tính khi chưa đối chiếu.</span></li>
              <li className="flex gap-3"><ShieldCheck className="w-5 h-5 text-primary shrink-0" aria-hidden /><span>Bạn có thể ủng hộ ẩn danh; thông tin liên hệ là tùy chọn và chỉ người giữ sổ quỹ xem.</span></li>
              <li className="flex gap-3"><MessageCircleHeart className="w-5 h-5 text-rose-500 shrink-0" aria-hidden /><span>Lời chúc hay ý cầu nguyện bạn gửi kèm được ghi lại cùng khoản ủng hộ để người quản lý đọc được.</span></li>
            </ul>
          </div>
          <div className="rounded-3xl bg-white border border-purple-100 shadow-sm p-6 sm:p-7">
            <DonationReportForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
          </div>
        </section>

        {transparency.enabled && <TransparencyBlock data={transparency} />}
      </div>
    </>
  );
}
