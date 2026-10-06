import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { withTx, type Tx } from "./db";
import { publicOrgInfo } from "./modules/articles";
import { getDonationInfo } from "./modules/public-site";

/** Truy vấn dưới vai trò luuxa_app KHÔNG có người dùng — chỉ thấy những gì RLS cho phép người chưa đăng nhập (bài đã đăng). */
export function publicDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTx({ userId: null }, "luuxa_app", fn);
}

/** Thông tin cộng đoàn dùng chung cho đầu/chân trang công khai (một lần mỗi request). */
export const getOrgInfo = cache(() => publicDb((tx) => publicOrgInfo(tx)));

/** Gốc URL của site (https://tên-miền) suy từ request — dùng cho thẻ chia sẻ Open Graph / liên kết tuyệt đối. */
export function siteOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Thông tin chung cho khung trang công khai: giới thiệu cộng đoàn + có bật trang Ủng hộ không (một lần mỗi request). */
export const getSiteInfo = cache(async () => {
  const [org, donationEnabled] = await Promise.all([getOrgInfo(), publicDb((tx) => getDonationInfo(tx)).then((d) => d.enabled).catch(() => false)]);
  return { org, donationEnabled };
});
