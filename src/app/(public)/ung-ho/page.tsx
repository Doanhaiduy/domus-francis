import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Heart } from "lucide-react";
import QRCode from "qrcode";
import { getDonationInfo } from "@/server/modules/public-site";
import { OG_DEFAULT_IMAGES } from "@/lib/public-site";
import { getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { buildVietQrPayload, canBuildVietQr } from "@/lib/vietqr";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { CopyField } from "@/components/public/CopyField";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const title = `Ủng hộ — ${org.houseName}`;
  const description = `Đồng hành cùng ${org.houseName}: mọi đóng góp đều giúp duy trì mái nhà chung cho các bạn sinh viên.`;
  return { metadataBase: new URL(siteOrigin()), title, description, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES } };
}

export default async function DonatePage() {
  const [site, donation] = await Promise.all([getSiteInfo(), publicDb((tx) => getDonationInfo(tx))]);
  if (!donation.enabled || !donation.account) notFound();
  const a = donation.account;

  // QR tĩnh (không kèm số tiền): người ủng hộ tự nhập số tiền trong ứng dụng ngân hàng.
  let qr: string | null = null;
  if (canBuildVietQr(a.bankBin, a.accountNo)) {
    qr = await QRCode.toDataURL(buildVietQrPayload({ bankBin: a.bankBin!, accountNo: a.accountNo }), { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#111827", light: "#ffffff" } });
  }

  return (
    <>
      <PublicHeader org={site.org} section="ung-ho" donationEnabled />
      <PageHero eyebrow="Ủng hộ" title="Đồng hành cùng mái nhà chung" subtitle="Mỗi đóng góp, dù nhỏ, giúp lưu xá duy trì sinh hoạt và nâng đỡ các bạn sinh viên xa nhà." />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 space-y-8">
        {donation.note && (
          <div className="rounded-3xl bg-white border border-purple-100 p-6 sm:p-8">
            <ArticleMarkdown source={donation.note} />
          </div>
        )}

        <section className="rounded-3xl bg-white border border-purple-100 shadow-sm p-6 sm:p-8 grid gap-8 md:grid-cols-[auto_1fr] items-center" aria-labelledby="bank">
          {qr && (
            <div className="mx-auto text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`Mã QR chuyển khoản tới ${a.accountName || a.accountNo}`} width={240} height={240} className="rounded-2xl border border-purple-100 bg-white p-2" />
              <p className="mt-2 text-xs text-gray-500">Quét bằng ứng dụng ngân hàng bất kỳ</p>
            </div>
          )}
          <div className="space-y-3 min-w-0">
            <h2 id="bank" className="text-xl font-extrabold text-gray-900 inline-flex items-center gap-2"><Heart className="w-5 h-5 text-rose-500" aria-hidden />Thông tin chuyển khoản</h2>
            {a.bankName && <CopyField label="Ngân hàng" value={a.bankName} />}
            <CopyField label="Số tài khoản" value={a.accountNo} mono />
            {a.accountName && <CopyField label="Chủ tài khoản" value={a.accountName} />}
            <p className="text-xs text-gray-500 leading-relaxed">Nội dung chuyển khoản bạn có thể ghi tùy ý (ví dụ: “Ung ho luu xa”). Xin chân thành cảm ơn tấm lòng của bạn.</p>
          </div>
        </section>
      </div>
    </>
  );
}
