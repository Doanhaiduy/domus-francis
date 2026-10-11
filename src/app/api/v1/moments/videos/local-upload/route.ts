import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { api } from "@/server/http";
import { ApiError, forbidden } from "@/server/errors";
import { ensureLocalDir, localPath, verifyUploadTicket } from "@/server/video";

export const runtime = "nodejs";

/** Chỉ cho môi trường phát triển (nơi lưu trữ local): nhận thân video thô theo vé tải, ghi vào .local/storage. Có kiểm dung lượng khi nhận. */
export const PUT = api({}, async (ctx) => {
  if (!ctx.userId) throw forbidden("Cần đăng nhập.");
  const t = await verifyUploadTicket(ctx.query.get("ticket") ?? "", ctx.userId);
  if (t.provider !== "local") throw new ApiError(400, "BAD_TICKET", "Vé tải không dành cho nơi lưu trữ này.");
  if (!ctx.req.body) throw new ApiError(400, "EMPTY_FILE", "Thiếu nội dung video.");
  await ensureLocalDir(t.key);
  const out = createWriteStream(localPath(t.key));
  let n = 0;
  const input = Readable.fromWeb(ctx.req.body as unknown as NodeWebStream<Uint8Array>);
  input.on("data", (c: Buffer) => {
    n += c.length;
    if (n > t.max) input.destroy(new ApiError(413, "FILE_TOO_LARGE", "Dung lượng video vượt giới hạn."));
  });
  try {
    await pipeline(input, out);
  } catch (e) {
    await rm(localPath(t.key), { force: true });
    throw e;
  }
  return { ok: true, size: n };
});
