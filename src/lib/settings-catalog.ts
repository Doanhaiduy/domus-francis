// Tên hiển thị + lời giải thích dễ hiểu cho từng khóa cấu hình (bảng settings).
// Khóa kỹ thuật (vd "privacy.left_member_retention_days") và mô tả trong DB viết cho người phát triển — màn hình Cài đặt,
// thông báo lỗi và hộp xác nhận dùng danh mục này để không lộ tên khóa / tên hàm / mã nghiệp vụ cho người dùng.
// Thêm khóa mới: thêm một dòng vào nhóm tương ứng (giữ thứ tự chữ cái theo khóa).

export interface SettingCatalogEntry {
  /** Tên ngắn gọn hiển thị cạnh ô nhập */
  label: string;
  /** Giải thích bằng lời thường (không tên bảng/hàm/mã) */
  help?: string;
  /** Nhóm hiển thị (mặc định: phần đầu của khóa) */
  group?: string;
}

export const SETTING_CATALOG: Record<string, SettingCatalogEntry> = {
  // --- Trợ lý AI ---
  "ai.monthly_budget_default_vnd": {
    label: "Ngân sách AI mặc định mỗi tháng",
    help: "Số tiền tối đa được dùng cho trợ lý AI trong một tháng. Đầu mỗi tháng hệ thống tự đặt hạn mức bằng giá trị này; hết ngân sách thì AI tạm ngừng.",
  },

  // --- Bảo mật đăng nhập ---
  "auth.access_token_ttl_seconds": {
    label: "Thời hạn phiên làm việc ngắn",
    help: "Sau khoảng thời gian này trình duyệt tự gia hạn phiên đăng nhập ở nền (mặc định 15 phút).",
  },
  "auth.lockout_minutes": {
    label: "Thời gian khóa tạm sau khi nhập sai mật khẩu",
    help: "Tài khoản bị khóa tạm trong số phút này khi nhập sai mật khẩu quá số lần cho phép.",
  },
  "auth.max_failed_logins": {
    label: "Số lần nhập sai mật khẩu tối đa",
    help: "Nhập sai liên tiếp quá số lần này thì tài khoản bị khóa tạm.",
  },
  "auth.mfa_required_roles": {
    label: "Vai trò bắt buộc xác thực hai lớp",
    help: "Người giữ các vai trò được chọn nên bật xác thực hai lớp khi đăng nhập.",
  },
  "auth.refresh_token_ttl_days": {
    label: "Thời gian ghi nhớ đăng nhập",
    help: "Số ngày tối đa một thiết bị được giữ đăng nhập; quá hạn phải đăng nhập lại.",
  },

  // --- Trực nhật & Vệ sinh ---
  "duty.appeal.window_hours": {
    label: "Thời hạn khiếu nại kết quả nghiệm thu",
    help: "Số giờ người trực được gửi khiếu nại, tính từ lúc có kết quả nghiệm thu ca trực.",
  },
  "duty.checkin.late_after_minutes": {
    label: "Check-in muộn sau khi hết ca",
    help: "Check-in sau khi hết ca quá số phút này thì ca được ghi là làm muộn.",
  },
  "duty.checkin.window_after_minutes": {
    label: "Hạn chót check-in sau khi hết ca",
    help: "Quá số phút này sau giờ kết thúc ca thì không check-in được nữa.",
  },
  "duty.checkin.window_before_minutes": {
    label: "Được check-in sớm trước giờ ca",
    help: "Cho phép check-in sớm hơn giờ bắt đầu ca tối đa bao nhiêu phút.",
  },
  "duty.evidence.dedupe_days": {
    label: "Phát hiện ảnh minh chứng dùng lại",
    help: "So ảnh mới với ảnh check-in trong số ngày gần đây để phát hiện ảnh chụp lại / dùng lại.",
  },
  "duty.evidence.max_age_minutes": {
    label: "Ảnh minh chứng phải chụp trong vòng",
    help: "Ảnh phải được chụp trong khoảng số phút này trước lúc check-in.",
  },
  "duty.evidence.phash_max_distance": {
    label: "Độ nhạy nhận diện ảnh trùng",
    help: "Số càng nhỏ thì chỉ ảnh gần như giống hệt mới bị coi là trùng; số càng lớn càng bắt cả ảnh na ná.",
  },
  "duty.evidence.require_exif": {
    label: "Bắt buộc ảnh có thời điểm chụp",
    help: "Chỉ nhận ảnh chụp trực tiếp bằng camera hoặc ảnh còn thông tin thời điểm chụp.",
  },
  "duty.missed_after_hours": {
    label: "Tự ghi bỏ ca sau khi hết ca",
    help: "Ca chưa check-in quá số giờ này sau giờ kết thúc thì tự động ghi là bỏ ca.",
  },
  "duty.rework.window_hours": {
    label: "Thời hạn làm lại ca trực",
    help: "Khi bị yêu cầu làm lại, người trực có số giờ này (tính từ lúc nghiệm thu) để check-in lại; quá hạn ca bị ghi là bỏ ca.",
  },
  "duty.swap.min_notice_hours": {
    label: "Xin đổi ca trước ít nhất",
    help: "Phải gửi đơn đổi ca trước giờ bắt đầu ca ít nhất số giờ này.",
  },
  "duty.swap.request_ttl_hours": {
    label: "Đơn đổi ca tự hết hạn sau",
    help: "Đơn đổi ca chưa được xử lý sẽ tự hết hạn sau số giờ này.",
  },

  // --- Sự kiện & Điểm danh ---
  "event.attendance.late_grace_minutes": {
    label: "Thời gian ân hạn đi muộn",
    help: "Đến sau giờ bắt đầu trong số phút này vẫn tính là có mặt đúng giờ; quá thì ghi đi muộn.",
  },
  "event.attendance.open_minutes_before": {
    label: "Mở điểm danh trước giờ bắt đầu",
    help: "Áp dụng cho sự kiện không đặt giờ mở điểm danh riêng.",
  },

  // --- Hậu cần ---
  "facility.sla_hours.critical": { label: "Thời hạn xử lý sự cố Khẩn cấp", help: "Số giờ tối đa để xử lý sự cố mức Khẩn cấp." },
  "facility.sla_hours.high": { label: "Thời hạn xử lý sự cố Gấp", help: "Số giờ tối đa để xử lý sự cố mức Gấp (trong ngày)." },
  "facility.sla_hours.low": { label: "Thời hạn xử lý sự cố mức Thấp", help: "Số giờ tối đa để xử lý sự cố mức Thấp (mặc định 7 ngày)." },
  "facility.sla_hours.medium": { label: "Thời hạn xử lý sự cố Trung bình", help: "Số giờ tối đa để xử lý sự cố mức Trung bình." },

  // --- Bật / tắt phân hệ ---
  "feature.ai.enabled": {
    label: "Bật trợ lý AI",
    help: "Công tắc tổng cho mọi tính năng AI; từng tác vụ còn có công tắc riêng ở tab Trợ lý AI.",
  },
  "feature.meals.enabled": {
    label: "Bật phân hệ Bếp & Cơm",
    help: "Cho phép anh em đăng ký suất ăn. Tắt khi Ban điều hành tạm hoãn việc nấu chung.",
  },

  // --- Tài chính ---
  "finance.dues_bank_account": {
    label: "Tài khoản nhận quỹ (cũ)",
    help: "Số tài khoản • Ngân hàng • Chủ tài khoản hiển thị cho thành viên. Nay được thay bằng thẻ “Tài khoản nhận quỹ” ở trang Thu chi.",
  },
  "finance.dues_cycle_amount_vnd": {
    label: "Mức quỹ mỗi kỳ — sinh viên đang học",
    help: "Số tiền mỗi thành viên đang đi học đóng cho một kỳ quỹ.",
  },
  "finance.dues_cycle_due_day": { label: "Hạn nộp quỹ kỳ", help: "Ngày trong tháng đầu kỳ phải nộp quỹ (1–28)." },
  "finance.dues_cycle_graduated_amount_vnd": {
    label: "Mức quỹ mỗi kỳ — đã tốt nghiệp / ra trường",
    help: "Số tiền mỗi thành viên đã ra trường đi làm đóng cho một kỳ quỹ.",
  },
  "finance.dues_cycle_months": { label: "Số tháng mỗi kỳ quỹ", help: "Mặc định 6 tháng — mỗi năm đóng 2 lần." },
  "finance.dues_cycle_start_month": {
    label: "Tháng bắt đầu kỳ quỹ đầu tiên",
    help: "VD: 1 ⇒ các kỳ T1–T6, T7–T12; 9 ⇒ các kỳ T9–T2, T3–T8.",
  },
  "finance.dues_due_day": { label: "Hạn nộp quỹ tháng (cũ)", help: "Ngày hạn nộp quỹ hằng tháng theo cách thu cũ." },
  "finance.expense.cross_signer_mode": {
    label: "Duyệt chéo khi người lập là Trưởng nhà / Thủ quỹ",
    help: "Khi Trưởng nhà hoặc Thủ quỹ là người lập / người ứng tiền, chỉ cần chữ ký của người còn lại.",
  },
  "finance.expense.dual_approval_min_vnd": { label: "Phiếu chi từ mức này cần 2 chữ ký", help: "Trưởng nhà và Thủ quỹ cùng duyệt." },
  "finance.expense.receipt_required_min_vnd": {
    label: "Bắt buộc ảnh hóa đơn từ mức",
    help: "Phiếu chi từ mức này phải kèm ảnh hóa đơn (hoặc nêu lý do không có).",
  },
  "finance.expense.treasurer_solo_approve_max_vnd": {
    label: "Thủ quỹ được tự duyệt phiếu chi đến mức",
    help: "Chi lặt vặt đến mức này Thủ quỹ duyệt một mình; trên mức đó phiếu một chữ ký phải do Trưởng nhà duyệt.",
  },
  "finance.monthly_dues_vnd": { label: "Mức quỹ hằng tháng (cũ)", help: "Mức quỹ sinh hoạt hằng tháng theo cách thu cũ." },
  "finance.period.close_requires_reconciliation": {
    label: "Bắt buộc đối soát sao kê trước khi chốt sổ tháng",
    help: "Áp dụng cho quỹ gửi ngân hàng.",
  },
  "finance.receiving_account": {
    label: "Tài khoản nhận quỹ",
    help: "Ngân hàng, số tài khoản, chủ tài khoản và mã QR để anh em chuyển khoản. Thủ quỹ sửa ở trang Thu chi.",
  },
  "finance.reminder.days_before_due": { label: "Nhắc đóng quỹ trước hạn", help: "Gửi lời nhắc trước hạn nộp số ngày này." },
  "finance.reminder.overdue_every_days": { label: "Chu kỳ nhắc khi quá hạn", help: "Quá hạn mà chưa nộp thì cứ sau số ngày này nhắc lại." },
  "finance.transparency.show_debtor_names": {
    label: "Công khai danh sách người chưa đóng quỹ",
    help: "Bật thì mọi thành viên thấy tên người chưa đóng; tắt thì chỉ Thủ quỹ / Ban điều hành thấy, thành viên chỉ thấy số liệu tổng.",
  },
  "finance.utility_due_day": { label: "Hạn nộp tiền điện nước", help: "Ngày trong tháng sau tháng hóa đơn phải nộp (1–28)." },

  // --- Zalo ---
  "integration.zalo.group_chat_id": {
    label: "Mã nhóm Zalo (chat_id)",
    help: "Mã cuộc trò chuyện của nhóm Zalo chung nhận tin tự động. Dùng nút “Dò nhóm” để lấy.",
  },
  "integration.zalo.group_enabled": { label: "Gửi tin tự động vào nhóm Zalo" },
  "integration.zalo.group_events": { label: "Các loại tin gửi vào nhóm Zalo" },
  "integration.zalo.templates": { label: "Mẫu tin nhắn gửi nhóm Zalo" },

  // --- Đặt lịch giặt ---
  "laundry.cancel_min_minutes": { label: "Tự hủy lượt giặt trước giờ ít nhất", help: "Chỉ được tự hủy lượt trước giờ bắt đầu ít nhất số phút này." },
  "laundry.max_days_ahead": { label: "Đặt lượt giặt trước tối đa", help: "Số ngày tối đa được đặt trước." },
  "laundry.max_per_week": { label: "Số lượt giặt tối đa mỗi tuần", help: "Áp dụng cho mỗi người." },
  "laundry.noshow_cancel_minutes": {
    label: "Tự hủy lượt nếu không đến",
    help: "Không xác nhận có mặt sau giờ bắt đầu số phút này thì lượt tự hủy để nhường người khác.",
  },
  "laundry.slots": { label: "Các khung giờ giặt trong ngày", help: "Nhập dạng 06:00-08:00, 08:00-10:00…" },

  // --- Phụng vụ ---
  "liturgy.checkin_grace_days": {
    label: "Được check-in đi lễ muộn tối đa",
    help: "Số ngày sau ngày lễ anh em vẫn còn check-in được (vd. quên bấm trong ngày).",
  },
  "liturgy.checkin_reminder_time": {
    label: "Giờ nhắc người chưa check-in đi lễ",
    help: "Vào giờ này của ngày lễ bắt buộc, ai chưa check-in sẽ nhận một thông báo nhắc.",
  },
  "liturgy.checkin_solemnity": {
    label: "Bắt buộc check-in đi lễ trọng và lễ Bổn mạng",
    help: "Lễ trọng và lễ Bổn mạng không rơi vào Chúa Nhật: anh em check-in kèm ảnh minh chứng; rơi vào Chúa Nhật thì không cần ảnh.",
  },
  "liturgy.checkin_sunday": { label: "Check-in đi lễ Chúa Nhật", help: "Anh em xác nhận đã dự Thánh lễ Chúa Nhật (không cần ảnh minh chứng)." },
  "liturgy.night_prayer_time": { label: "Giờ Kinh Tối chung hằng ngày", help: "Giờ mặc định khi lập lịch Kinh Tối lặp lại." },
  "liturgy.notify_day_before": { label: "Nhắc lại vào hôm trước ngày lễ", help: "Gửi thêm một thông báo vào hôm trước lễ trọng, lễ Bổn mạng, ngày đặc biệt." },
  "liturgy.notify_days_before": {
    label: "Báo trước lễ trọng / ngày đặc biệt",
    help: "Số ngày báo trước cho anh em khi sắp đến lễ trọng, Tết, lễ Bổn mạng hoặc ngày đặc biệt của nhà (0 = không báo trước).",
  },

  // --- Bếp & Cơm ---
  "meal.dinner_cutoff_time": { label: "Giờ chốt suất cơm tối" },
  "meal.lunch_cutoff_time": { label: "Giờ chốt suất cơm trưa" },
  "meal.price_per_serving_vnd": { label: "Giá tham chiếu một suất cơm" },

  // --- Thông tin cộng đoàn ---
  "org.address": { label: "Địa chỉ cộng đoàn lưu xá" },
  "org.chaplain_name": { label: "Cha linh hướng", help: "Tên Cha linh hướng ký trên sơ yếu lý lịch." },
  "org.contact_phone": { label: "Hotline công khai của lưu xá", help: "Không dùng số điện thoại cá nhân." },
  "org.house_name": { label: "Tên lưu xá chính thức" },
  "org.motto": { label: "Khẩu hiệu cộng đoàn" },
  "org.order_name": { label: "Tỉnh Dòng", help: "In trên sơ yếu lý lịch." },
  "org.patron_feast": { label: "Ngày lễ Bổn mạng", help: "Ngày / tháng lễ Bổn mạng của nhà." },
  "org.patron_name": { label: "Vị thánh Bổn mạng", help: "Tên vị thánh hoặc mầu nhiệm Bổn mạng của nhà, hiện nổi bật trên lịch vào ngày Bổn mạng." },

  // --- Quyền riêng tư ---
  "privacy.left_member_retention_days": {
    label: "Thời gian giữ dữ liệu cá nhân sau khi rời lưu xá",
    help: "Quá số ngày này kể từ ngày rời nhà, thông tin cá nhân nhạy cảm của người đã rời được tự động ẩn danh. Cựu thành viên (đã ra trường, vẫn giữ liên lạc) không bị ẩn danh.",
  },

  // --- Điểm danh QR ---
  "qr.default_geofence_radius_m": {
    label: "Bán kính định vị khi điểm danh",
    help: "Khi bật kiểm tra vị trí, người điểm danh phải ở trong bán kính này (mét) quanh lưu xá.",
  },
  "qr.rotation_seconds": { label: "Mã QR điểm danh tự đổi sau", help: "Mã đổi liên tục để chống chụp màn hình gửi người khác (khuyến nghị 30–60 giây)." },

  // --- Giao diện ---
  "ui.disabled_modules": { label: "Phân hệ đang tạm ẩn", help: "Sửa ở tab Phân hệ." },

  // --- Lưu trữ tệp ---
  "upload.max_image_bytes": { label: "Dung lượng tối đa mỗi ảnh tải lên", help: "Tối đa 20 MB." },
  "upload.monthly_quota_bytes": { label: "Hạn mức tải lên mỗi người mỗi tháng" },
  "upload.orphan_ttl_hours": {
    label: "Dọn tệp tải lên bị bỏ dở sau",
    help: "Tệp đã tải lên nhưng không được dùng (vd. đóng biểu mẫu giữa chừng) sẽ bị xóa sau số giờ này.",
  },
  "upload.presign_ttl_seconds": { label: "Thời hạn của một lượt tải tệp lên", help: "Liên kết tải lên hết hạn sau số giây này." },
};

/** Bỏ thuật ngữ kỹ thuật khỏi mô tả lưu trong DB (dùng khi khóa chưa có trong danh mục). */
export function cleanSettingDescription(d: string | null | undefined): string {
  if (!d) return "";
  return d
    .replace(/\[(GIẢ ĐỊNH|ĐỀ XUẤT|đề xuất)\]\s*/gi, "")
    .replace(/\s*\((?:[^()]*\b(?:BR|E|D)-[A-Z0-9-]+[^()]*)\)/g, "") // (BR-DUTY-26), (E-012)…
    .replace(/\b(?:BR|E|D)-[A-Z]*-?\d+\b/g, "")
    .replace(/\s*\((?:status|FE|BE)[^()]*\)/gi, "")
    .replace(/\b(?:app|public)\.[a-z_][a-z0-9_]*(?:\(\))?/gi, "hệ thống")
    .replace(/\bjob\b/gi, "tác vụ tự động")
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, "") // tên bảng/cột snake_case
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

/** Tên hiển thị của khóa cấu hình — không bao giờ trả về khóa kỹ thuật cho người dùng. */
export function settingLabel(key: string, fallbackDescription?: string | null): string {
  const e = SETTING_CATALOG[key];
  if (e) return e.label;
  const d = cleanSettingDescription(fallbackDescription);
  if (d) {
    const first = d.split(/[.;(]/)[0].trim();
    return first.length > 90 ? `${first.slice(0, 87)}…` : first;
  }
  return "Cấu hình hệ thống";
}

/** Lời giải thích của khóa (danh mục, hoặc mô tả trong DB đã làm sạch). */
export function settingHelp(key: string, fallbackDescription?: string | null): string {
  const e = SETTING_CATALOG[key];
  if (e) return e.help ?? "";
  const d = cleanSettingDescription(fallbackDescription);
  // Khóa chưa có trong danh mục: tên đã lấy từ câu đầu của mô tả ⇒ chỉ hiện phần còn lại (tránh lặp hai dòng giống nhau)
  const label = settingLabel(key, fallbackDescription);
  if (!label.endsWith("…") && d.startsWith(label)) return d.slice(label.length).replace(/^[\s.;:,–—-]+/, "").trim();
  return d;
}
