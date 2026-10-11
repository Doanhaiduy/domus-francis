-- =====================================================================
-- 1036 — ĐƠN XIN PHÉP: thêm các loại đơn nghỉ dài ngày (về quê, nghỉ Tết, nghỉ hè, nghỉ lễ, khác). Idempotent.
--   Chỉ thêm giá trị enum (giá trị mới chưa dùng được trong cùng giao dịch ⇒ để riêng một file; 1037 trở đi mới dùng).
--   Ràng buộc ck_leave_requests__destination của thiết kế gốc chỉ bắt buộc "nơi đến" cho ngủ ngoài / tạm vắng dài; với các loại mới,
--   ứng dụng tự bắt buộc nơi đến ở form + máy chủ.
-- =====================================================================
ALTER TYPE public.leave_kind_t ADD VALUE IF NOT EXISTS 'home_visit';
ALTER TYPE public.leave_kind_t ADD VALUE IF NOT EXISTS 'tet_break';
ALTER TYPE public.leave_kind_t ADD VALUE IF NOT EXISTS 'summer_break';
ALTER TYPE public.leave_kind_t ADD VALUE IF NOT EXISTS 'holiday_break';
ALTER TYPE public.leave_kind_t ADD VALUE IF NOT EXISTS 'other';
