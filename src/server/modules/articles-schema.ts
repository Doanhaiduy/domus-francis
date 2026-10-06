import "server-only";
import { z } from "zod";
import { zText, zUuid } from "../http";
import { ARTICLE_CATEGORIES } from "@/lib/types/articles";

const categories = ARTICLE_CATEGORIES.map((c) => c.code) as [string, ...string[]];

const slug = z
  .string()
  .trim()
  .min(3, "Đường dẫn tối thiểu 3 ký tự.")
  .max(120, "Đường dẫn tối đa 120 ký tự.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.");

export const ArticleSchema = z.object({
  title: zText(3, 200, "Tiêu đề"),
  slug,
  summary: z.string().trim().max(400, "Tóm tắt tối đa 400 ký tự.").nullable().optional(),
  content: z.string().max(60000, "Nội dung tối đa 60.000 ký tự."),
  category: z.enum(categories, { message: "Chuyên mục không hợp lệ." }),
  coverFileId: zUuid.nullable().optional(),
  byline: z.string().trim().max(120, "Người viết tối đa 120 ký tự.").nullable().optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(["draft", "published"]),
  tags: z.array(z.string().trim().max(30)).max(12).optional(),
  publishedAt: z.string().datetime({ offset: true, message: "Thời điểm đăng không hợp lệ." }).nullable().optional(),
});

export const ArticlePatchSchema = ArticleSchema.partial();
