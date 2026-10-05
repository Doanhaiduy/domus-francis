import "server-only";
import { z } from "zod";

const coord = z.number().min(0).max(5000).nullable().optional();

export const RoomSchema = z.object({
  id: z.string().trim().min(3).max(14).optional(),
  name: z.string().trim().min(1, "Nhập tên phòng.").max(120).optional(),
  floor: z.number().int().min(-2).max(50).optional(),
  type: z.enum(["bedroom", "common", "chapel", "kitchen", "storage", "laundry", "stairs", "corridor", "other"]).optional(),
  capacity: z.number().int().min(0).max(20).optional(),
  amenities: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  status: z.enum(["active", "maintenance", "reserved"]).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  areaM2: z.number().min(0).max(10000).nullable().optional(),
  x: coord,
  y: coord,
  w: coord,
  h: coord,
});

export const FloorSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên tầng.").max(120),
  code: z.string().trim().max(10).optional(),
  description: z.string().trim().max(500).optional(),
  level: z.number().int().min(-2).max(50).optional(),
});
