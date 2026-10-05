-- =====================================================================
-- KHỐI 4.3 — BẢNG DỮ LIỆU (8/9): CỘNG ĐOÀN — KHOẢNH KHẮC, THÔNG BÁO, DIỄN ĐÀN, CẦU NGUYỆN, GIẶT, BẾP, NỘI QUY, ĐƠN XIN VÀO
-- Khác FE: lượt đọc/tim/hiệp ý là THEO TỪNG NGƯỜI (FE dùng cờ dùng chung isUnread/hasPrayed/likesCount);
-- ẩn danh ý cầu nguyện là thật (tác giả tách bảng riêng); đặt lịch giặt chống trùng bằng exclusion constraint.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Khoảnh khắc & album
-- ---------------------------------------------------------------------
CREATE TABLE albums (
  id                 uuid            PRIMARY KEY DEFAULT app.uuid_v7(),
  title              text            NOT NULL,
  description        text,
  category_id        uuid            NOT NULL,
  category_kind      category_kind_t NOT NULL DEFAULT 'album',
  event_id           uuid            REFERENCES events(id) ON DELETE SET NULL,
  taken_on           date            NOT NULL,
  location_text      text,
  cover_file_id      uuid            REFERENCES storage_files(id) ON DELETE SET NULL,
  author_member_id   uuid            NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  is_featured        boolean         NOT NULL DEFAULT false,
  tags               text[]          NOT NULL DEFAULT '{}',
  visibility         text            NOT NULL DEFAULT 'community',
  status             content_status_t NOT NULL DEFAULT 'published',
  likes_count        integer         NOT NULL DEFAULT 0,
  photos_count       integer         NOT NULL DEFAULT 0,
  created_at         timestamptz     NOT NULL DEFAULT now(),
  updated_at         timestamptz     NOT NULL DEFAULT now(),
  version            integer         NOT NULL DEFAULT 1,
  deleted_at         timestamptz,
  CONSTRAINT fk_albums__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_albums__category_kind CHECK (category_kind = 'album'),
  CONSTRAINT ck_albums__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_albums__visibility CHECK (visibility IN ('community', 'leadership', 'private')),
  CONSTRAINT ck_albums__counts CHECK (likes_count >= 0 AND photos_count >= 0),
  CONSTRAINT ck_albums__tags CHECK (cardinality(tags) <= 20)
);
COMMENT ON TABLE albums IS 'Album khoảnh khắc. author_member_id lấy từ phiên đăng nhập (FE cài cứng "Minh Tuấn"/"Phó nhà"). likes_count/photos_count là bộ đếm phi chuẩn hóa do trigger app.tg_adjust_counter() duy trì. Năm/tháng suy ra từ taken_on. Xóa mềm.';

CREATE TABLE album_photos (
  id                     uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  album_id               uuid             NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  file_id                uuid             NOT NULL REFERENCES storage_files(id) ON DELETE RESTRICT,
  caption                text,
  uploaded_by_member_id  uuid             NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  taken_at               timestamptz,
  sort_order             integer          NOT NULL DEFAULT 0,
  status                 content_status_t NOT NULL DEFAULT 'published',
  likes_count            integer          NOT NULL DEFAULT 0,
  created_at             timestamptz      NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  CONSTRAINT ux_album_photos__file UNIQUE (file_id),
  CONSTRAINT ck_album_photos__likes CHECK (likes_count >= 0),
  CONSTRAINT ck_album_photos__caption CHECK (caption IS NULL OR char_length(caption) <= 500)
);
COMMENT ON TABLE album_photos IS 'Ảnh trong album: mỗi ảnh một storage_files (bucket moments). ON DELETE CASCADE theo album (xóa cứng album ít khi xảy ra: dùng xóa mềm).';

CREATE TABLE album_member_tags (
  album_id             uuid        NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  member_id            uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  tagged_by_member_id  uuid        REFERENCES members(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'pending',
  responded_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, member_id),
  CONSTRAINT ck_album_member_tags__status CHECK (status IN ('pending', 'accepted', 'declined'))
);
COMMENT ON TABLE album_member_tags IS 'Gắn thẻ thành viên vào album (FE: participants là mảng tên). Thẻ ở trạng thái pending cho đến khi người được gắn thẻ chấp nhận (hoặc đã đồng ý photo_tagging); người bị gắn thẻ luôn có quyền gỡ (declined).';

CREATE TABLE album_likes (
  album_id    uuid        NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, member_id)
);
COMMENT ON TABLE album_likes IS 'Tim cấp album, theo từng thành viên (khóa chính ngăn thả tim lặp).';

CREATE TABLE photo_likes (
  photo_id    uuid        NOT NULL REFERENCES album_photos(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, member_id)
);
COMMENT ON TABLE photo_likes IS 'Tim cấp ảnh, theo từng thành viên.';

-- ---------------------------------------------------------------------
-- Thông báo
-- ---------------------------------------------------------------------
CREATE TABLE announcements (
  id                 uuid              PRIMARY KEY DEFAULT app.uuid_v7(),
  title              text              NOT NULL,
  content            text              NOT NULL,
  category_id        uuid              NOT NULL,
  category_kind      category_kind_t   NOT NULL DEFAULT 'announcement',
  author_member_id   uuid              NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  event_id           uuid              REFERENCES events(id) ON DELETE SET NULL,
  status             announce_status_t NOT NULL DEFAULT 'published',
  is_pinned          boolean           NOT NULL DEFAULT false,
  pinned_until       timestamptz,
  requires_ack       boolean           NOT NULL DEFAULT false,
  ack_deadline       timestamptz,
  published_at       timestamptz,
  expires_at         timestamptz,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  updated_at         timestamptz       NOT NULL DEFAULT now(),
  version            integer           NOT NULL DEFAULT 1,
  deleted_at         timestamptz,
  CONSTRAINT fk_announcements__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_announcements__category_kind CHECK (category_kind = 'announcement'),
  CONSTRAINT ck_announcements__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_announcements__content CHECK (char_length(btrim(content)) BETWEEN 1 AND 20000),
  CONSTRAINT ck_announcements__published CHECK (status = 'draft' OR published_at IS NOT NULL),
  CONSTRAINT ck_announcements__ack CHECK (NOT requires_ack OR ack_deadline IS NOT NULL OR status = 'draft'),
  CONSTRAINT ck_announcements__expiry CHECK (expires_at IS NULL OR published_at IS NULL OR expires_at > published_at)
);
COMMENT ON TABLE announcements IS 'Thông báo. preview suy ra từ content ở API (FE lưu riêng). Đối tượng nhận = announcement_targets (không có dòng = toàn thể). requires_ack: thông báo quan trọng cần "xác nhận đã đọc" (announcement_reads.acknowledged_at). Tệp đính kèm = media_attachments(announcement). event_id liên kết sự kiện để nút "Tôi sẽ có mặt" ghi RSVP thật.';

CREATE TABLE announcement_targets (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  announcement_id  uuid        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  role_id          uuid        REFERENCES roles(id) ON DELETE CASCADE,
  floor_id         uuid        REFERENCES floors(id) ON DELETE CASCADE,
  room_id          uuid        REFERENCES rooms(id) ON DELETE CASCADE,
  member_id        uuid        REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT ck_announcement_targets__one CHECK (num_nonnulls(role_id, floor_id, room_id, member_id) = 1)
);
COMMENT ON TABLE announcement_targets IS 'Nhóm đối tượng nhận thông báo: theo vai trò, tầng, phòng hoặc từng thành viên. Không có dòng nào = gửi toàn thể thành viên đang ở.';

CREATE TABLE announcement_reads (
  announcement_id  uuid        NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  read_at          timestamptz NOT NULL DEFAULT now(),
  acknowledged_at  timestamptz,
  PRIMARY KEY (announcement_id, member_id),
  CONSTRAINT ck_announcement_reads__ack CHECK (acknowledged_at IS NULL OR acknowledged_at >= read_at)
);
COMMENT ON TABLE announcement_reads IS 'Đã đọc/đã xác nhận THEO TỪNG NGƯỜI (thay cho cờ isUnread dùng chung). Số liệu "x/y thành viên đã nhận" = COUNT(reads)/COUNT(thành viên mục tiêu), không còn chuỗi cứng "12/12".';

-- ---------------------------------------------------------------------
-- Diễn đàn & kiểm duyệt
-- ---------------------------------------------------------------------
CREATE TABLE forum_posts (
  id                uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  title             text             NOT NULL,
  content           text             NOT NULL,
  category_id       uuid             NOT NULL,
  category_kind     category_kind_t  NOT NULL DEFAULT 'forum',
  author_member_id  uuid             NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  is_pinned         boolean          NOT NULL DEFAULT false,
  status            content_status_t NOT NULL DEFAULT 'published',
  comments_count    integer          NOT NULL DEFAULT 0,
  reactions_count   integer          NOT NULL DEFAULT 0,
  last_activity_at  timestamptz      NOT NULL DEFAULT now(),
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  version           integer          NOT NULL DEFAULT 1,
  deleted_at        timestamptz,
  CONSTRAINT fk_forum_posts__category FOREIGN KEY (category_id, category_kind) REFERENCES categories (id, kind) ON DELETE RESTRICT,
  CONSTRAINT ck_forum_posts__category_kind CHECK (category_kind = 'forum'),
  CONSTRAINT ck_forum_posts__title CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT ck_forum_posts__content CHECK (char_length(btrim(content)) BETWEEN 1 AND 10000),
  CONSTRAINT ck_forum_posts__counts CHECK (comments_count >= 0 AND reactions_count >= 0)
);
COMMENT ON TABLE forum_posts IS 'Bài diễn đàn. author lấy từ phiên đăng nhập. comments_count/reactions_count do trigger duy trì. status=locked chặn bình luận mới; hidden do kiểm duyệt.';

CREATE TABLE forum_comments (
  id                uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  post_id           uuid             NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  parent_id         uuid             REFERENCES forum_comments(id) ON DELETE CASCADE,
  author_member_id  uuid             NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  content           text             NOT NULL,
  status            content_status_t NOT NULL DEFAULT 'published',
  reactions_count   integer          NOT NULL DEFAULT 0,
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT ck_forum_comments__content CHECK (char_length(btrim(content)) BETWEEN 1 AND 3000),
  CONSTRAINT ck_forum_comments__reactions CHECK (reactions_count >= 0)
);
COMMENT ON TABLE forum_comments IS 'Bình luận (hỗ trợ trả lời lồng tối đa 1 cấp — trigger kiểm tra parent cùng bài và parent không phải bình luận con).';

CREATE TABLE forum_reactions (
  id          uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  post_id     uuid        REFERENCES forum_posts(id) ON DELETE CASCADE,
  comment_id  uuid        REFERENCES forum_comments(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind        text        NOT NULL DEFAULT 'heart',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_forum_reactions__target CHECK (num_nonnulls(post_id, comment_id) = 1),
  CONSTRAINT ck_forum_reactions__kind CHECK (kind IN ('heart', 'thumbs_up', 'pray'))
);
COMMENT ON TABLE forum_reactions IS 'Thả cảm xúc cho bài hoặc bình luận, theo từng thành viên (FE toggleLikeThread chỉ +1 không theo người). Duy nhất theo (đối tượng, người, loại) bằng partial unique index.';

CREATE TABLE content_reports (
  id                   uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  entity_type          text        NOT NULL,
  entity_id            uuid        NOT NULL,
  reporter_member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reason               text        NOT NULL,
  status               text        NOT NULL DEFAULT 'open',
  handled_by           uuid        REFERENCES users(id) ON DELETE SET NULL,
  handled_at           timestamptz,
  resolution_note      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_content_reports__once UNIQUE (entity_type, entity_id, reporter_member_id),
  CONSTRAINT ck_content_reports__entity CHECK (entity_type IN ('forum_post', 'forum_comment', 'prayer_intention', 'album', 'album_photo')),
  CONSTRAINT ck_content_reports__status CHECK (status IN ('open', 'actioned', 'dismissed')),
  CONSTRAINT ck_content_reports__reason CHECK (app.has_text(reason, 5)),
  CONSTRAINT ck_content_reports__handled CHECK ((status = 'open') = (handled_at IS NULL))
);
COMMENT ON TABLE content_reports IS 'Báo cáo vi phạm nội dung (diễn đàn, ý cầu nguyện, album/ảnh). Điểm vào duy nhất để Ban điều hành xem tác giả của ý cầu nguyện ẩn danh (có ghi nhật ký) và để kiểm duyệt.';

-- ---------------------------------------------------------------------
-- Ý chỉ cầu nguyện (ẩn danh thật)
-- ---------------------------------------------------------------------
CREATE TABLE prayer_intentions (
  id                uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  content           text             NOT NULL,
  is_anonymous      boolean          NOT NULL DEFAULT false,
  author_member_id  uuid             REFERENCES members(id) ON DELETE SET NULL,
  status            text             NOT NULL DEFAULT 'open',
  visibility        content_status_t NOT NULL DEFAULT 'published',
  prayer_count      integer          NOT NULL DEFAULT 0,
  expires_at        timestamptz      NOT NULL DEFAULT (now() + interval '30 days'),
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT ck_prayer_intentions__content CHECK (char_length(btrim(content)) BETWEEN 5 AND 1000),
  CONSTRAINT ck_prayer_intentions__status CHECK (status IN ('open', 'answered', 'closed')),
  CONSTRAINT ck_prayer_intentions__anon CHECK (NOT is_anonymous OR author_member_id IS NULL),
  CONSTRAINT ck_prayer_intentions__public_author CHECK (is_anonymous OR author_member_id IS NOT NULL),
  CONSTRAINT ck_prayer_intentions__count CHECK (prayer_count >= 0)
);
COMMENT ON TABLE prayer_intentions IS
  'Ý chỉ cầu nguyện. Ẩn danh THẬT: khi is_anonymous=true cột author_member_id luôn NULL (CHECK ck_prayer_intentions__anon) — danh tính chỉ nằm ở prayer_intention_authors (RLS chặt, chỉ chính chủ). Khi gọi dịch vụ AI chỉ gửi content, không bao giờ gửi danh tính. prayer_count là bộ đếm của prayer_responses.';

CREATE TABLE prayer_intention_authors (
  intention_id      uuid        PRIMARY KEY REFERENCES prayer_intentions(id) ON DELETE CASCADE,
  author_member_id  uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE prayer_intention_authors IS 'Tác giả thật của ý chỉ ẩn danh, phục vụ quyền xóa/sửa của chính chủ và xử lý vi phạm. Chỉ chính chủ đọc được; Trưởng nhà chỉ xem qua app.fn_reveal_prayer_author() (bắt buộc lý do, ghi audit READ_SENSITIVE).';

CREATE TABLE prayer_responses (
  intention_id  uuid        NOT NULL REFERENCES prayer_intentions(id) ON DELETE CASCADE,
  member_id     uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  responded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intention_id, member_id)
);
COMMENT ON TABLE prayer_responses IS 'Lượt "hiệp ý cầu nguyện" theo từng người (FE hasPrayed/prayingCount là cờ chung). Bỏ hiệp ý = xóa dòng.';

-- ---------------------------------------------------------------------
-- Đặt lịch giặt
-- ---------------------------------------------------------------------
CREATE TABLE laundry_machines (
  id            uuid         PRIMARY KEY DEFAULT app.uuid_v7(),
  code          text         NOT NULL,
  name          text         NOT NULL,
  brand         text,
  capacity_kg   numeric(4,1),
  room_id       uuid         REFERENCES rooms(id) ON DELETE SET NULL,
  status        text         NOT NULL DEFAULT 'active',
  sort_order    integer      NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ux_laundry_machines__code UNIQUE (code),
  CONSTRAINT ck_laundry_machines__code CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_laundry_machines__status CHECK (status IN ('active', 'maintenance', 'retired')),
  CONSTRAINT ck_laundry_machines__capacity CHECK (capacity_kg IS NULL OR capacity_kg > 0)
);
COMMENT ON TABLE laundry_machines IS 'Máy giặt (FE chỉ có chip "Aqua 9kg & Electrolux", không có mã máy trong dữ liệu đặt lịch).';

CREATE TABLE laundry_bookings (
  id                 uuid             PRIMARY KEY DEFAULT app.uuid_v7(),
  machine_id         uuid             NOT NULL REFERENCES laundry_machines(id) ON DELETE RESTRICT,
  member_id          uuid             NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  starts_at          timestamptz      NOT NULL,
  ends_at            timestamptz      NOT NULL,
  during             tstzrange        GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status             laundry_status_t NOT NULL DEFAULT 'booked',
  checked_in_at      timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  client_request_id  uuid,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT ck_laundry_bookings__range CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '4 hours'),
  CONSTRAINT ck_laundry_bookings__cancel CHECK ((status IN ('cancelled', 'no_show')) = (cancelled_at IS NOT NULL)),
  CONSTRAINT ex_laundry_bookings__no_overlap EXCLUDE USING gist (machine_id WITH =, during WITH &&) WHERE (status IN ('booked', 'checked_in'))
);
COMMENT ON TABLE laundry_bookings IS 'Lượt đặt máy giặt. EXCLUDE USING gist (machine_id, during) loại trừ đặt trùng ngay tại DB — hai người bấm cùng lúc thì một người nhận lỗi 23P01 (race condition của FE bị ghi đè lặng lẽ không còn). Khung giờ, hạn mức lượt/tuần, thời hạn đặt trước, tự hủy khi không đến: trigger trg_laundry_bookings__rules + app.fn_expire_laundry_noshows().';

CREATE TABLE laundry_waitlist (
  id            uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  machine_id    uuid        REFERENCES laundry_machines(id) ON DELETE CASCADE,
  member_id     uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text        NOT NULL DEFAULT 'waiting',
  offered_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_laundry_waitlist__member_slot UNIQUE (member_id, starts_at),
  CONSTRAINT ck_laundry_waitlist__range CHECK (ends_at > starts_at),
  CONSTRAINT ck_laundry_waitlist__status CHECK (status IN ('waiting', 'offered', 'fulfilled', 'expired'))
);
COMMENT ON TABLE laundry_waitlist IS 'Danh sách chờ khi khung giờ đã kín; khi có lượt hủy/no_show, worker đề nghị cho người chờ sớm nhất (offered) rồi chuyển fulfilled khi họ xác nhận. machine_id NULL = máy nào cũng được.';

-- ---------------------------------------------------------------------
-- Bếp & Cơm (FE: tạm hoãn — feature flag settings.feature.meals.enabled)
-- ---------------------------------------------------------------------
CREATE TABLE meal_menus (
  id                     uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  menu_date              date        NOT NULL,
  meal_type              meal_type_t NOT NULL,
  title                  text,
  dishes                 text[]      NOT NULL DEFAULT '{}',
  cost_per_serving_vnd   bigint,
  cutoff_at              timestamptz NOT NULL,
  status                 text        NOT NULL DEFAULT 'draft',
  approved_by            uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_by             uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_meal_menus__date_type UNIQUE (menu_date, meal_type),
  CONSTRAINT ck_meal_menus__status CHECK (status IN ('draft', 'open', 'closed', 'served', 'cancelled')),
  CONSTRAINT ck_meal_menus__cost CHECK (cost_per_serving_vnd IS NULL OR cost_per_serving_vnd >= 0),
  CONSTRAINT ck_meal_menus__dishes CHECK (cardinality(dishes) <= 20)
);
COMMENT ON TABLE meal_menus IS 'Thực đơn theo ngày × bữa (thay cho WEEKLY_MENUS cài cứng ở FE). cutoff_at = hạn chốt suất (FE ghi trưa 9:00, tối 15:00 trong chuỗi mô tả). Phân hệ đang TẠM HOÃN theo quyết định Ban điều hành: bảng vẫn có để dữ liệu không mất khi bật lại.';

CREATE TABLE meal_menu_cooks (
  menu_id     uuid        NOT NULL REFERENCES meal_menus(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  role_label  text        NOT NULL DEFAULT 'lead',
  PRIMARY KEY (menu_id, member_id),
  CONSTRAINT ck_meal_menu_cooks__role CHECK (role_label IN ('lead', 'assistant', 'shopper'))
);
COMMENT ON TABLE meal_menu_cooks IS 'Cặp trực bếp/đi chợ của một bữa (FE: "Đình Khôi (Chính) · Minh Tuấn (Phụ)" cài cứng).';

CREATE TABLE meal_registrations (
  id             uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  menu_id        uuid        NOT NULL REFERENCES meal_menus(id) ON DELETE CASCADE,
  member_id      uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  will_eat       boolean     NOT NULL DEFAULT true,
  guests         smallint    NOT NULL DEFAULT 0,
  note           text,
  registered_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_meal_registrations__menu_member UNIQUE (menu_id, member_id),
  CONSTRAINT ck_meal_registrations__guests CHECK (guests BETWEEN 0 AND 10)
);
COMMENT ON TABLE meal_registrations IS 'Đăng ký ăn theo ngày × bữa (FE chỉ có cờ lunch/dinner của "hôm nay", không lịch sử, không giờ chốt, không khách). Sau cutoff_at chỉ người có quyền meal.manage sửa được (trigger).';

CREATE TABLE pantry_items (
  id                  uuid          PRIMARY KEY DEFAULT app.uuid_v7(),
  name                text          NOT NULL,
  unit                text          NOT NULL,
  qty_on_hand         numeric(10,2) NOT NULL DEFAULT 0,
  par_level           numeric(10,2) NOT NULL DEFAULT 0,
  icon                text,
  last_restocked_on   date,
  is_active           boolean       NOT NULL DEFAULT true,
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_pantry_items__qty CHECK (qty_on_hand >= 0 AND par_level >= 0),
  CONSTRAINT ck_pantry_items__name CHECK (char_length(btrim(name)) BETWEEN 2 AND 100)
);
COMMENT ON TABLE pantry_items IS 'Kho gia vị/thực phẩm (FE pantryItems chỉ đọc). Trạng thái Đầy đủ/Sắp hết/Cần mua gấp suy ra từ qty_on_hand so với par_level (view v_pantry_status).';

-- ---------------------------------------------------------------------
-- Nội quy / tài liệu cần xác nhận đã đọc
-- ---------------------------------------------------------------------
CREATE TABLE policy_documents (
  id               uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  slug             text        NOT NULL,
  title            text        NOT NULL,
  version          integer     NOT NULL DEFAULT 1,
  doc_kind         text        NOT NULL DEFAULT 'house_rules',
  content_md       text        NOT NULL,
  effective_from   date        NOT NULL DEFAULT app.local_today(),
  is_current       boolean     NOT NULL DEFAULT false,
  requires_ack     boolean     NOT NULL DEFAULT true,
  published_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_policy_documents__slug_version UNIQUE (slug, version),
  CONSTRAINT ck_policy_documents__slug CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
  CONSTRAINT ck_policy_documents__kind CHECK (doc_kind IN ('house_rules', 'faq', 'procedure', 'privacy_notice', 'consent_text')),
  CONSTRAINT ck_policy_documents__version CHECK (version >= 1),
  CONSTRAINT ck_policy_documents__content CHECK (char_length(content_md) BETWEEN 10 AND 200000)
);
COMMENT ON TABLE policy_documents IS 'Nội quy, quy trình, FAQ, thông báo quyền riêng tư theo phiên bản. Là kho tri thức cho trợ lý hỏi đáp (RAG) và nguồn cho xác nhận đã đọc. Mỗi slug có tối đa một phiên bản is_current (partial unique index).';

CREATE TABLE policy_acknowledgements (
  policy_id        uuid        NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  ip               inet,
  PRIMARY KEY (policy_id, member_id)
);
COMMENT ON TABLE policy_acknowledgements IS 'Thành viên xác nhận đã đọc một phiên bản nội quy (bằng chứng khi có tranh chấp). Phiên bản mới ⇒ yêu cầu xác nhận lại.';

-- ---------------------------------------------------------------------
-- Đơn xin vào lưu xá / tài khoản chờ phê duyệt (trang /cho-phe-duyet)
-- ---------------------------------------------------------------------
CREATE TABLE member_applications (
  id                   uuid                PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id              uuid                REFERENCES users(id) ON DELETE SET NULL,
  full_name            text                NOT NULL,
  email                citext,
  phone_e164           text,
  university_name      text,
  message              text,
  referrer_member_id   uuid                REFERENCES members(id) ON DELETE SET NULL,
  status               application_status_t NOT NULL DEFAULT 'submitted',
  reviewed_by          uuid                REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_note          text,
  resulting_member_id  uuid                REFERENCES members(id) ON DELETE SET NULL,
  created_at           timestamptz         NOT NULL DEFAULT now(),
  updated_at           timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT ck_member_applications__name CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT ck_member_applications__contact CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
  CONSTRAINT ck_member_applications__phone CHECK (app.is_e164(phone_e164)),
  CONSTRAINT ck_member_applications__reviewed CHECK ((status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
  CONSTRAINT ck_member_applications__approved CHECK (status <> 'approved' OR resulting_member_id IS NOT NULL),
  CONSTRAINT ck_member_applications__reject_note CHECK (status <> 'rejected' OR app.has_text(review_note, 5))
);
COMMENT ON TABLE member_applications IS 'Đơn xin vào lưu xá/đăng ký tài khoản chờ Ban điều hành phê duyệt (FE: trang tĩnh /cho-phe-duyet, nút "Kiểm tra lại" vào thẳng app). Duyệt ⇒ tạo member + gán vai trò member (app.fn_approve_member_application). Tài khoản chưa duyệt chỉ có quyền xem trạng thái đơn của mình.';

CREATE TABLE user_identities (
  id                uuid        PRIMARY KEY DEFAULT app.uuid_v7(),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text        NOT NULL,
  provider_user_id  text        NOT NULL,
  provider_email    citext,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  CONSTRAINT ux_user_identities__provider_subject UNIQUE (provider, provider_user_id),
  CONSTRAINT ux_user_identities__user_provider UNIQUE (user_id, provider),
  CONSTRAINT ck_user_identities__provider CHECK (provider IN ('google'))
);
COMMENT ON TABLE user_identities IS 'Liên kết đăng nhập ngoài (Google) — [ĐỀ XUẤT, SHOULD]. FE hiện hàm ý đăng nhập Google nhưng không có xác thực thật. Tài khoản mới qua Google luôn ở trạng thái pending cho đến khi đơn được duyệt.';
