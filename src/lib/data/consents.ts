"use client";
// Đồng ý (consents) của chính mình: hồ sơ Công giáo, cho người quản lý xem hồ sơ Công giáo.
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";

export const CONSENTS_KEY = "/api/v1/consents";
export const SELF_CONSENT_PURPOSES = [
  "catholic_profile",
  "catholic_share_leadership",
  "academic_share_leadership",
  "academic_share_tutoring",
  "academic_public_ranking",
  "photo_tagging",
  "channel_messaging",
] as const;
export type SelfConsentPurpose = (typeof SELF_CONSENT_PURPOSES)[number];

/** Tên + giải thích ngắn từng đồng ý (khớp consent_purposes) để hiện ở Cài đặt → Bảo mật. */
export const CONSENT_INFO: Record<SelfConsentPurpose, { title: string; text: string }> = {
  catholic_profile: { title: "Lưu hồ sơ Công giáo", text: "Tên Thánh, giáo xứ, giáo phận, Bí tích (dữ liệu nhạy cảm về tôn giáo)." },
  catholic_share_leadership: { title: "Cho người quản lý xem hồ sơ Công giáo", text: "Trưởng nhà, Trưởng ban Phụng vụ xem để phục vụ sinh hoạt phụng vụ." },
  academic_share_leadership: { title: "Chia sẻ bảng điểm cho người quản lý", text: "Để người quản lý xem điểm chi tiết, hỗ trợ học tập và xét học bổng." },
  academic_share_tutoring: { title: "Chia sẻ nhu cầu học tập cho người kèm", text: "Người được ghép cặp phụ đạo biết môn bạn cần hỗ trợ." },
  academic_public_ranking: { title: "Tham gia thống kê học tập nội bộ", text: "Điểm tổng hợp của bạn nằm trong thống kê ẩn danh (nhóm từ 3 người)." },
  photo_tagging: { title: "Cho gắn thẻ tên vào ảnh", text: "Thành viên khác có thể gắn thẻ tên bạn trong album Khoảnh khắc." },
  channel_messaging: { title: "Nhận thông báo qua Zalo/Telegram/SMS", text: "Cho phép gửi thông báo qua kênh nhắn tin bên thứ ba đã liên kết." },
};
export type MyConsents = Record<SelfConsentPurpose, boolean>;

export function useMyConsents(enabled = true) {
  const { data, isLoading, mutate } = useSWR<MyConsents>(enabled ? CONSENTS_KEY : null, swrFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  return { consents: data, isLoading, mutate };
}

export const consentsApi = {
  set: async (purpose: SelfConsentPurpose, granted: boolean) => {
    const r = await api.put<{ purpose: SelfConsentPurpose; consented: boolean }>(CONSENTS_KEY, { purpose, granted });
    await globalMutate(CONSENTS_KEY);
    return r;
  },
};
