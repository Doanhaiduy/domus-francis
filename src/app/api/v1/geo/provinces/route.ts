import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { listProvinces } from "@/server/geo";

/** Danh sách tỉnh/thành (nguồn provinces.open-api.vn, máy chủ đệm 24 giờ). ?edition=legacy ⇒ 63 tỉnh/thành trước 07/2025 (chọn quê quán theo tên cũ). */
export const GET = api({}, async (ctx) => {
  const out = await listProvinces(ctx.query.get("edition") === "legacy" ? "legacy" : "2025");
  return NextResponse.json(out, { headers: { "cache-control": "private, max-age=3600" } });
});
