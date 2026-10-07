import { api } from "@/server/http";
import { DonationRecordSchema, listDonations, recordDonation } from "@/server/modules/donations";
import type { DonationStatus } from "@/lib/types/donations";

const STATUSES = new Set(["pledged", "pending", "confirmed", "rejected", "cancelled", "open"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Danh sách khoản ủng hộ + tổng hợp. Thành viên chỉ thấy khoản của mình (RLS); người có finance.contribution.record (Thủ quỹ, Trưởng nhà, Admin) thấy tất cả.
 * Lọc: ?from= &to= (ngày ủng hộ) &status= (pledged|pending|confirmed|rejected|cancelled|open) &q= &mine=1
 */
export const GET = api({}, (ctx) => {
  const p = ctx.query;
  const from = p.get("from");
  const to = p.get("to");
  const status = p.get("status") ?? "";
  return ctx.db((tx) =>
    listDonations(tx, {
      from: from && YMD.test(from) ? from : undefined,
      to: to && YMD.test(to) ? to : undefined,
      status: STATUSES.has(status) ? (status as DonationStatus | "open") : "",
      q: (p.get("q") ?? "").slice(0, 80),
      mine: p.get("mine") === "1",
    })
  );
});

/** Thủ quỹ / Trưởng nhà / Admin ghi nhận khoản ủng hộ (đã nhận ⇒ vào sổ quỹ ngay; mới hứa ⇒ chờ nhận). */
export const POST = api({}, async (ctx) => {
  const b = await ctx.body(DonationRecordSchema);
  const id = await ctx.db((tx) => recordDonation(tx, b));
  return Response.json({ id }, { status: 201 });
});
