import React from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { getOrgInfo } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";

export default async function PublicNotFound() {
  const org = await getOrgInfo();
  return (
    <>
      <PublicHeader org={org} />
      <div className="max-w-xl mx-auto w-full px-4 py-24 text-center">
        <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden />
        <h1 className="text-2xl font-extrabold text-gray-900">Không tìm thấy bài viết</h1>
        <p className="mt-2 text-gray-600">Bài viết này không tồn tại, đã được gỡ hoặc đường dẫn bị sai.</p>
        <Link href="/tin-tuc" className="mt-6 inline-flex px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition active:scale-95">
          Xem tất cả bài viết
        </Link>
      </div>
    </>
  );
}
