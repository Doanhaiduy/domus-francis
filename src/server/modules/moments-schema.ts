import "server-only";
import { z } from "zod";
import { zDate, zUuid } from "../http";

const tags = z.array(z.string().trim().max(40, "Mỗi hashtag tối đa 40 ký tự.")).max(20, "Tối đa 20 hashtag.");
const caption = z.string().trim().max(500, "Chú thích tối đa 500 ký tự.").nullable().optional();

export const CreateAlbumSchema = z.object({
  title: z.string().trim().min(3, "Tiêu đề album tối thiểu 3 ký tự.").max(200, "Tiêu đề album tối đa 200 ký tự."),
  description: z.string().trim().max(4000, "Mô tả tối đa 4000 ký tự.").nullable().optional(),
  categoryId: zUuid,
  takenOn: zDate,
  location: z.string().trim().max(300, "Địa điểm tối đa 300 ký tự.").nullable().optional(),
  tags: tags.optional(),
  participantIds: z.array(zUuid).max(100).optional(),
  coverFileId: z.string({ error: "Vui lòng tải lên ảnh bìa album." }).uuid("Vui lòng tải lên ảnh bìa album."),
  photoFileIds: z.array(zUuid).max(60, "Tối đa 60 ảnh mỗi lần.").optional(),
});
export type CreateAlbumInput = z.infer<typeof CreateAlbumSchema>;

export const UpdateAlbumSchema = z.object({
  title: z.string().trim().min(3, "Tiêu đề album tối thiểu 3 ký tự.").max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  categoryId: zUuid.optional(),
  takenOn: zDate.optional(),
  location: z.string().trim().max(300).nullable().optional(),
  tags: tags.optional(),
  participantIds: z.array(zUuid).max(100).optional(),
  coverFileId: zUuid.nullable().optional(),
  /** Chỉ người kiểm duyệt (album.moderate) — trigger BR-COM-06 chặn người khác */
  isFeatured: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
export type UpdateAlbumInput = z.infer<typeof UpdateAlbumSchema>;

export const AddPhotosSchema = z.object({
  photos: z
    .array(z.object({ fileId: zUuid, caption }))
    .min(1, "Chưa chọn ảnh nào.")
    .max(60, "Tối đa 60 ảnh mỗi lần."),
});

export const UpdatePhotoSchema = z.object({
  caption,
  hidden: z.boolean().optional(),
});

export const TagResponseSchema = z.object({
  status: z.enum(["accepted", "declined"]),
});
