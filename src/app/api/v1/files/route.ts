import { api } from "@/server/http";
import { ApiError } from "@/server/errors";
import { storeUpload, BUCKETS, type Bucket } from "@/server/storage";

export const runtime = "nodejs";

/** POST multipart/form-data { file, bucket } → tệp đã xử lý (ready). */
export const POST = api({}, async (ctx) => {
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw new ApiError(400, "BAD_FORM", "Yêu cầu tải lên không hợp lệ.");
  }
  const file = form.get("file");
  const bucket = String(form.get("bucket") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "NO_FILE", "Chưa chọn tệp.");
  if (!BUCKETS.includes(bucket as Bucket)) throw new ApiError(400, "BAD_BUCKET", "Loại tệp không hợp lệ.");
  return storeUpload(ctx, file, bucket as Bucket);
});
