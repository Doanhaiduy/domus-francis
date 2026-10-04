-- ============================================================
-- SCHEMA MVP: HỆ THỐNG QUẢN LÝ LƯU XÁ PHANXICÔ
-- Phiên bản: 1.1 (Cập nhật thứ tự phụ thuộc chuẩn PostgreSQL)
-- Quy mô: ~12-20 thành viên nội bộ
-- Roles: admin | truong_nha | thu_quy | member
-- ============================================================

-- Bật extension pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. BẢNG NHÀ & PHÒNG (ROOMS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  id          TEXT PRIMARY KEY,        -- 'P.1', 'P.2', ...
  name        TEXT NOT NULL,
  floor       INTEGER NOT NULL DEFAULT 1,
  type        TEXT NOT NULL DEFAULT 'bedroom'
              CHECK (type IN ('bedroom','common','chapel','kitchen','storage','laundry','other')),
  capacity    INTEGER DEFAULT 0,
  amenities   TEXT[] DEFAULT '{}',
  status      TEXT DEFAULT 'active'
              CHECK (status IN ('active','maintenance','reserved')),
  description TEXT,
  area_m2     INTEGER,
  -- Tọa độ canvas (cho sơ đồ nhà)
  pos_x       INTEGER,
  pos_y       INTEGER,
  pos_w       INTEGER,
  pos_h       INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. HỒ SƠ THÀNH VIÊN (PROFILES) - TẠO TRƯỚC CÁC HÀM TRUY VẤN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  nick_name     TEXT,
  holy_name     TEXT,                  -- Tên thánh: Phanxicô, Giuse, Phaolô...
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'truong_nha', 'thu_quy', 'member')),
  room_id       TEXT REFERENCES public.rooms(id) ON DELETE SET NULL,
  joined_date   DATE,
  duty          TEXT,                  -- Trách vụ trong lưu xá
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  -- Thông tin cá nhân
  birth_date    DATE,
  gender        TEXT CHECK (gender IN ('Nam', 'Nữ')),
  id_card       TEXT,                  -- CCCD/CMND
  hometown      TEXT,
  home_address  TEXT,
  -- Học tập
  university    TEXT,
  major         TEXT,
  academic_year TEXT,                  -- Khóa/Niên khóa: 'K66 (2021-2026)'
  student_code  TEXT,
  -- Công giáo
  diocese       TEXT,                  -- Giáo phận
  parish        TEXT,                  -- Giáo xứ
  pastor        TEXT,                  -- Linh mục quản xứ
  sacraments    TEXT[] DEFAULT '{}',   -- Bí tích đã lãnh nhận
  -- Gia đình
  parent_phone  TEXT,
  father_name   TEXT,
  mother_name   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Tự động tạo hồ sơ profile khi có user đăng ký/tạo trong auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. HELPER FUNCTIONS (ĐÃ CÓ BẢNG PROFILES, KHÔNG BỊ LỖI 42P01)
-- ============================================================

-- Lấy vai trò của người dùng hiện tại
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Kiểm tra có phải ban điều hành không (truong_nha hoặc admin)
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'truong_nha') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Kiểm tra có phải ban quản lý tài chính không (thu_quy, truong_nha hoặc admin)
CREATE OR REPLACE FUNCTION public.is_finance_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'truong_nha', 'thu_quy') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Chặn người dùng tự nâng role của mình
CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT (is_manager()) THEN
    RAISE EXCEPTION 'Chỉ Trưởng nhà hoặc Admin mới có quyền thay đổi vai trò tài khoản.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_self_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_self_change();

-- ============================================================
-- 4. TÀI CHÍNH
-- ============================================================

-- Phiếu thu / chi (Thủ quỹ ghi, Trưởng nhà duyệt)
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount        BIGINT NOT NULL CHECK (amount > 0),  -- VND, đơn vị đồng
  category      TEXT NOT NULL,
  -- categories chi: 'Thực phẩm' | 'Điện nước' | 'Vệ sinh' | 'Sửa chữa' | 'Phụng vụ' | 'Khác'
  -- categories thu: 'Quỹ tháng' | 'Đóng góp' | 'Khác'
  description   TEXT NOT NULL,
  txn_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- người ứng tiền (với phiếu chi)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  reject_reason TEXT,
  note          TEXT,
  receipt_url   TEXT,                  -- ảnh hóa đơn lưu trên Storage
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Ma trận đóng quỹ (Mức quỹ: 600.000 đ / 6 tháng)
-- 1 bản ghi = 1 kỳ đóng quỹ của 1 thành viên
-- period_label: '2026-S1' (01/01-30/06), '2026-S2' (01/07-31/12)
CREATE TABLE IF NOT EXISTS public.contributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_label  TEXT NOT NULL,          -- '2026-S1', '2026-S2', '2027-S1', ...
  period_start  DATE NOT NULL,          -- ngày đầu kỳ
  period_end    DATE NOT NULL,          -- ngày cuối kỳ
  amount        BIGINT NOT NULL DEFAULT 600000,  -- 600k / kỳ 6 tháng
  status        TEXT NOT NULL DEFAULT 'unpaid'
                CHECK (status IN ('paid', 'unpaid', 'waived')),
  paid_date     DATE,
  waive_reason  TEXT,
  note          TEXT,
  updated_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, period_label)
);

-- ============================================================
-- 5. TRỰC NHẬT & VỆ SINH
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cleaning_duties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_assigned   DATE NOT NULL,
  area            TEXT NOT NULL,       -- 'Sân trước', 'Cầu thang', 'WC', ...
  area_icon       TEXT DEFAULT '🧹',
  shift           TEXT NOT NULL
                  CHECK (shift IN ('Ca Sáng (06:30)', 'Ca Chiều (17:30)', 'Ca Tối (21:00)')),
  assigned_room   TEXT REFERENCES public.rooms(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
  -- Check-in
  checked_in_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_in_at   TIMESTAMPTZ,
  check_in_note   TEXT,
  evidence_url    TEXT,               -- ảnh minh chứng
  -- Nghiệm thu (Trưởng nhà / Admin duyệt)
  reviewed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Phân công thành viên trong ca trực (1 ca có thể nhiều bạn)
CREATE TABLE IF NOT EXISTS public.duty_members (
  duty_id   UUID NOT NULL REFERENCES public.cleaning_duties(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (duty_id, member_id)
);

-- ============================================================
-- 6. SỰ KIỆN & ĐIỂM DANH
-- ============================================================

CREATE TABLE IF NOT EXISTS public.events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Sinh hoạt'
               CHECK (category IN ('Phụng vụ','Họp nhà','Bổn mạng','Dã ngoại','Sinh hoạt')),
  event_date   DATE NOT NULL,
  time_start   TEXT,                  -- '08:30 sáng'
  location     TEXT,
  organizer    TEXT,
  description  TEXT,
  has_checkin  BOOLEAN DEFAULT false,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Điểm danh (Trưởng nhà / Admin bấm tên)
CREATE TABLE IF NOT EXISTS public.event_attendances (
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'present'
             CHECK (status IN ('present','late','absent')),
  note       TEXT,
  marked_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);

-- ============================================================
-- 7. THÔNG BÁO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Chung'
              CHECK (category IN ('Quan trọng','Sự kiện','Chung')),
  is_pinned   BOOLEAN DEFAULT false,
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Theo dõi đã đọc thông báo
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (announcement_id, member_id)
);

-- ============================================================
-- 8. BÁO HỎNG CƠ SỞ VẬT CHẤT
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maintenance_issues (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  location     TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'in_progress', 'done')),
  reported_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  photo_url    TEXT,
  assignee     TEXT,
  cost         BIGINT,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS issues_updated_at ON public.maintenance_issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON public.maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 9. DIỄN ĐÀN & GÓP Ý
-- ============================================================

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Góp ý chung'
              CHECK (category IN ('Đi chơi','Bếp & Thực đơn','Góp ý chung','Học tập','Giải trí')),
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_pinned   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS) - BẢO MẬT PHÂN QUYỀN
-- ============================================================

ALTER TABLE public.rooms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_duties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_issues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies        ENABLE ROW LEVEL SECURITY;

-- ---- ROOMS ----
DROP POLICY IF EXISTS "Mọi thành viên xem được phòng" ON public.rooms;
CREATE POLICY "Mọi thành viên xem được phòng"
  ON public.rooms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Chỉ manager sửa phòng" ON public.rooms;
CREATE POLICY "Chỉ manager sửa phòng"
  ON public.rooms FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ---- PROFILES ----
DROP POLICY IF EXISTS "Mọi thành viên xem profiles" ON public.profiles;
CREATE POLICY "Mọi thành viên xem profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Chính chủ hoặc manager sửa thông tin" ON public.profiles;
CREATE POLICY "Chính chủ hoặc manager sửa thông tin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_manager());

DROP POLICY IF EXISTS "Manager hoặc chính chủ tạo profile" ON public.profiles;
CREATE POLICY "Manager hoặc chính chủ tạo profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (is_manager() OR id = auth.uid());

-- ---- TRANSACTIONS ----
DROP POLICY IF EXISTS "Mọi thành viên xem thu-chi" ON public.transactions;
CREATE POLICY "Mọi thành viên xem thu-chi"
  ON public.transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Thủ quỹ/manager tạo phiếu chi" ON public.transactions;
CREATE POLICY "Thủ quỹ/manager tạo phiếu chi"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (is_finance_manager());

DROP POLICY IF EXISTS "Trưởng nhà/admin duyệt phiếu chi" ON public.transactions;
CREATE POLICY "Trưởng nhà/admin duyệt phiếu chi"
  ON public.transactions FOR UPDATE TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ---- CONTRIBUTIONS ----
DROP POLICY IF EXISTS "Mọi thành viên xem đóng quỹ" ON public.contributions;
CREATE POLICY "Mọi thành viên xem đóng quỹ"
  ON public.contributions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Thủ quỹ/manager quản lý đóng quỹ" ON public.contributions;
CREATE POLICY "Thủ quỹ/manager quản lý đóng quỹ"
  ON public.contributions FOR ALL TO authenticated
  USING (is_finance_manager()) WITH CHECK (is_finance_manager());

-- ---- CLEANING DUTIES ----
DROP POLICY IF EXISTS "Mọi thành viên xem trực nhật" ON public.cleaning_duties;
CREATE POLICY "Mọi thành viên xem trực nhật"
  ON public.cleaning_duties FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manager tạo/sửa ca trực" ON public.cleaning_duties;
CREATE POLICY "Manager tạo/sửa ca trực"
  ON public.cleaning_duties FOR INSERT TO authenticated
  WITH CHECK (is_manager());

DROP POLICY IF EXISTS "Thành viên check-in ca của mình, manager duyệt tất cả" ON public.cleaning_duties;
CREATE POLICY "Thành viên check-in ca của mình, manager duyệt tất cả"
  ON public.cleaning_duties FOR UPDATE TO authenticated
  USING (
    is_manager()
    OR EXISTS (
      SELECT 1 FROM public.duty_members
      WHERE duty_id = id AND member_id = auth.uid()
    )
  );

-- ---- DUTY_MEMBERS ----
DROP POLICY IF EXISTS "Mọi thành viên xem duty_members" ON public.duty_members;
CREATE POLICY "Mọi thành viên xem duty_members"
  ON public.duty_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manager quản lý duty_members" ON public.duty_members;
CREATE POLICY "Manager quản lý duty_members"
  ON public.duty_members FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ---- EVENTS ----
DROP POLICY IF EXISTS "Mọi thành viên xem sự kiện" ON public.events;
CREATE POLICY "Mọi thành viên xem sự kiện"
  ON public.events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manager tạo/sửa sự kiện" ON public.events;
CREATE POLICY "Manager tạo/sửa sự kiện"
  ON public.events FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ---- EVENT_ATTENDANCES ----
DROP POLICY IF EXISTS "Mọi thành viên xem điểm danh" ON public.event_attendances;
CREATE POLICY "Mọi thành viên xem điểm danh"
  ON public.event_attendances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manager điểm danh" ON public.event_attendances;
CREATE POLICY "Manager điểm danh"
  ON public.event_attendances FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ---- ANNOUNCEMENTS ----
DROP POLICY IF EXISTS "Mọi thành viên xem thông báo" ON public.announcements;
CREATE POLICY "Mọi thành viên xem thông báo"
  ON public.announcements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manager đăng thông báo" ON public.announcements;
CREATE POLICY "Manager đăng thông báo"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (is_manager());

DROP POLICY IF EXISTS "Tác giả hoặc manager sửa/xóa thông báo" ON public.announcements;
CREATE POLICY "Tác giả hoặc manager sửa/xóa thông báo"
  ON public.announcements FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR is_manager());

DROP POLICY IF EXISTS "Manager xóa thông báo" ON public.announcements;
CREATE POLICY "Manager xóa thông báo"
  ON public.announcements FOR DELETE TO authenticated
  USING (is_manager());

-- ---- ANNOUNCEMENT_READS ----
DROP POLICY IF EXISTS "Xem reads của chính mình" ON public.announcement_reads;
CREATE POLICY "Xem reads của chính mình"
  ON public.announcement_reads FOR SELECT TO authenticated
  USING (member_id = auth.uid());

DROP POLICY IF EXISTS "Đánh dấu đã đọc cho chính mình" ON public.announcement_reads;
CREATE POLICY "Đánh dấu đã đọc cho chính mình"
  ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (member_id = auth.uid());

-- ---- MAINTENANCE_ISSUES ----
DROP POLICY IF EXISTS "Mọi thành viên xem báo hỏng" ON public.maintenance_issues;
CREATE POLICY "Mọi thành viên xem báo hỏng"
  ON public.maintenance_issues FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Mọi thành viên báo hỏng mới" ON public.maintenance_issues;
CREATE POLICY "Mọi thành viên báo hỏng mới"
  ON public.maintenance_issues FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS "Manager cập nhật trạng thái" ON public.maintenance_issues;
CREATE POLICY "Manager cập nhật trạng thái"
  ON public.maintenance_issues FOR UPDATE TO authenticated
  USING (is_manager());

-- ---- FORUM ----
DROP POLICY IF EXISTS "Mọi thành viên xem diễn đàn" ON public.forum_threads;
CREATE POLICY "Mọi thành viên xem diễn đàn"
  ON public.forum_threads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Mọi thành viên đăng bài" ON public.forum_threads;
CREATE POLICY "Mọi thành viên đăng bài"
  ON public.forum_threads FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Tác giả hoặc manager sửa/xóa bài" ON public.forum_threads;
CREATE POLICY "Tác giả hoặc manager sửa/xóa bài"
  ON public.forum_threads FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR is_manager());

DROP POLICY IF EXISTS "Manager xóa bài" ON public.forum_threads;
CREATE POLICY "Manager xóa bài"
  ON public.forum_threads FOR DELETE TO authenticated
  USING (is_manager());

DROP POLICY IF EXISTS "Mọi thành viên xem replies" ON public.forum_replies;
CREATE POLICY "Mọi thành viên xem replies"
  ON public.forum_replies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Mọi thành viên trả lời" ON public.forum_replies;
CREATE POLICY "Mọi thành viên trả lời"
  ON public.forum_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Tác giả hoặc manager xóa reply" ON public.forum_replies;
CREATE POLICY "Tác giả hoặc manager xóa reply"
  ON public.forum_replies FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR is_manager());

-- ============================================================
-- 11. KHỞI TẠO DỮ LIỆU PHÒNG & TẦNG MẪU (ROOMS)
-- ============================================================

INSERT INTO public.rooms (id, name, floor, type, capacity, amenities, status, area_m2, pos_x, pos_y, pos_w, pos_h, description) VALUES
  ('P.1',    'Phòng 1',                            1, 'bedroom', 2, ARRAY['Điều hòa','Quạt trần','Bàn học đôi','Tủ quần áo gỗ'], 'active', 20, 167, 67,  76,  131, 'Phòng tầng 1 phía sau, yên tĩnh và thoáng mát.'),
  ('P.2',    'Phòng 2',                            1, 'bedroom', 3, ARRAY['Điều hòa','NVS & Tắm khép kín','Quạt trần','Bàn học cá nhân'], 'active', 28, 243, 67,  133, 131, 'Phòng tầng 1 rộng rãi, có phòng tắm khép kín.'),
  ('P.3',    'Phòng 3',                            1, 'bedroom', 3, ARRAY['Điều hòa','Quạt trần','Bàn học','Cửa sổ 2 mặt'], 'active', 25, 376, 108, 96,  165, 'Phòng tầng 1 góc trước, 2 cửa sổ đón gió.'),
  ('P.4',    'Phòng 4',                            2, 'bedroom', 3, ARRAY['Điều hòa','Quạt trần','Bàn học cá nhân','Tủ quần áo'], 'active', 22, 167, 67,  100, 131, 'Phòng tầng 2 yên tĩnh.'),
  ('P.5',    'Phòng 5',                            2, 'bedroom', 2, ARRAY['Điều hòa','Quạt trần','Bàn học','Cửa sổ ban công'], 'active', 20, 267, 67,  76,  131, 'Phòng tầng 2 có ban công nhỏ.'),
  ('P.SANH1','Sảnh Chung T1',                      1, 'common',  0, ARRAY['Bàn thờ chung','Cửa chính','Bảng thông báo'], 'active', 32, 167, 198, 209, 51,  'Không gian sinh hoạt chính tầng trệt, đọc kinh tối ngày thường.'),
  ('P.SANH2','Sảnh Nguyện T2 (Đọc kinh Chúa Nhật)',2, 'chapel',  0, ARRAY['Bàn thờ','Ghế dài','Đàn organ','Tượng Mẹ'], 'active', 35, 167, 198, 209, 51,  'Nguyện đường tầng 2, họp nhà và phụng vụ Chúa Nhật.'),
  ('P.XE',   'Nhà Để Xe',                          1, 'storage', 0, ARRAY['Sức chứa 20 xe máy','Bình cứu hỏa'], 'active', 22, 107, 99,  60,  150, 'Nhà để xe tầng trệt.'),
  ('P.WC_T1','Khu Vệ Sinh T1 & Phòng Tắm',        1, 'other',   0, ARRAY['2 Buồng tắm','2 WC','Lavabo'], 'active', 12, NULL, NULL, NULL, NULL, 'Khu vệ sinh tầng 1.'),
  ('P.WC_T2','Khu Vệ Sinh T2',                     2, 'other',   0, ARRAY['2 Buồng tắm','2 WC'], 'active', 10, NULL, NULL, NULL, NULL, 'Khu vệ sinh tầng 2.')
ON CONFLICT (id) DO NOTHING;
