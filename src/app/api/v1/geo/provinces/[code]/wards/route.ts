import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { listWards } from "@/server/geo";

/** Xã/phường của một tỉnh/thành theo địa giới hiện hành (từ 07/2025 không còn cấp huyện). */
export const GET = api({}, async (ctx) => {
  const code = /^\d{1,3}$/.test(ctx.params.code ?? "") ? Number(ctx.params.code) : 0;
  if (!code) throw new ApiError(404, "NOT_FOUND", "Không có tỉnh/thành với mã này.");
  const out = await listWards(code);
  return NextResponse.json(out, { headers: { "cache-control": "private, max-age=3600" } });
});
