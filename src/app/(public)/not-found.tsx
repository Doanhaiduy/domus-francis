import React from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { getSiteInfo } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";

export default async function PublicNotFound() {
  const { org, donationEnabled } = await getSiteInfo();
  return (
    <>
      <PublicHeader org={org} donationEnabled={donationEnabled} />
      <div className="max-w-xl mx-auto w-full px-4 py-24 text-center">
        <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden />
        <h1 className="text-2xl font-extrabold text-gray-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-gray-600">Trang này không tồn tại, đã được gỡ hoặc đường dẫn bị sai.</p>
        <Link href="/tin-tuc" className="mt-6 inline-flex px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition active:scale-95">
          Về bản tin
        </Link>
      </div>
    </>
  );
}
