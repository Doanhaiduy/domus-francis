// DTO "Luật nhà" (nội quy lưu xá) — dùng chung client/server.

export interface HouseRuleItemDto {
  /** Giờ / khung giờ áp dụng, vd. "22:30", "05:30–06:00", "Chúa nhật 8:00" (tùy chọn) */
  time: string | null;
  text: string;
}

export interface HouseRuleSectionDto {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  items: HouseRuleItemDto[];
  sortOrder: number;
  isActive: boolean;
  updatedAt: string; // ISO
  updatedByName: string | null;
}

export interface HouseRulesDto {
  sections: HouseRuleSectionDto[];
  canManage: boolean;
  /** Lần sửa gần nhất của bất kỳ mục nào */
  updatedAt: string | null;
  houseName: string | null;
}

export interface HouseRuleInput {
  title: string;
  icon?: string | null;
  description?: string | null;
  items: HouseRuleItemDto[];
  isActive?: boolean;
}

/** Mẫu gợi ý để Trưởng nhà chỉnh lại cho đúng thực tế của nhà (KHÔNG tự lưu). */
export const HOUSE_RULE_TEMPLATES: HouseRuleInput[] = [
  {
    title: "Giờ giấc sinh hoạt",
    icon: "⏰",
    description: "Lịch sinh hoạt chung hằng ngày của cả nhà.",
    items: [
      { time: "05:30", text: "Thức dậy, vệ sinh cá nhân" },
      { time: "06:00", text: "Kinh sáng / Thánh lễ (nếu có)" },
      { time: "19:30", text: "Giờ Kinh Tối chung tại nguyện đường" },
      { time: "22:30", text: "Tắt đèn, giữ yên lặng để mọi người nghỉ ngơi" },
      { time: "23:00", text: "Đóng cổng — về trễ phải báo trước cho Trưởng nhà" },
    ],
  },
  {
    title: "Vệ sinh & trật tự chung",
    icon: "🧹",
    description: null,
    items: [
      { time: null, text: "Giữ gìn phòng ở, nhà bếp, nhà vệ sinh sạch sẽ; đổ rác đúng giờ, đúng nơi." },
      { time: null, text: "Mỗi tuần 2 bạn trực vệ sinh sân nhà theo lịch của Trưởng nhà." },
      { time: null, text: "Tắt đèn, quạt, điều hòa khi ra khỏi phòng." },
    ],
  },
  {
    title: "Khách & ra vào",
    icon: "🚪",
    description: null,
    items: [
      { time: null, text: "Báo trước cho Trưởng nhà khi có khách đến thăm hoặc ở lại qua đêm." },
      { time: "21:00", text: "Khách ra về trước giờ này" },
      { time: null, text: "Về quê / vắng mặt dài ngày phải báo trước." },
    ],
  },
  {
    title: "Tài chính chung",
    icon: "💳",
    description: null,
    items: [
      { time: null, text: "Đóng quỹ và tiền điện nước đúng hạn theo thông báo của Thủ quỹ." },
      { time: null, text: "Chi tiêu chung phải có đề nghị và được duyệt theo quy trình." },
    ],
  },
];
