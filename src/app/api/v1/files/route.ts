import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { storeUpload, BUCKETS, type Bucket } from "@/server/storage";

export const runtime = "nodejs";

/**
 * POST multipart/form-data { file, bucket, exifDate? } → tệp đã xử lý (ready).
 * Trình duyệt thu nhỏ + nén ảnh trước khi gửi nên EXIF gốc bị canvas xóa; `exifDate` ("YYYY:MM:DD HH:MM:SS") là ngày chụp đã đọc ra trước đó.
 * Phản hồi có Server-Timing (read, db_insert, process, storage, db_finalize, total) để biết chậm ở bước nào (xem ở tab Network của trình duyệt).
 */
export const POST = api({}, async (ctx) => {
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw new ApiError(400, "BAD_FORM", "Yêu cầu tải lên không hợp lệ.");
  }
  const file = form.get("file");
  const bucket = String(form.get("bucket") ?? "");
  const exifDate = form.get("exifDate");
  if (!(file instanceof File)) throw new ApiError(400, "NO_FILE", "Chưa chọn tệp.");
  if (!BUCKETS.includes(bucket as Bucket)) throw new ApiError(400, "BAD_BUCKET", "Loại tệp không hợp lệ.");
  const { timings, ...stored } = await storeUpload(ctx, file, bucket as Bucket, { exifDate: typeof exifDate === "string" ? exifDate : null });
  return Response.json(stored, { headers: { "server-timing": Object.entries(timings).map(([k, v]) => `${k};dur=${v}`).join(", ") } });
});
