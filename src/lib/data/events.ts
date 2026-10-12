"use client";
// Hook dữ liệu + thao tác phân hệ Lịch & Sự kiện (SWR — tự làm mới khi quay lại tab và sau mỗi thao tác ghi)
import useSWR, { mutate as globalMutate } from "swr";
import { api, swrFetcher } from "../api";
import type {
  AttendanceReportDto,
  AttendanceRosterDto,
  CalendarFeedCreatedDto,
  CalendarFeedListDto,
  CheckInResultDto,
  DayDutyDto,
  EventCategoryDto,
  EventDto,
  EventSeriesDto,
  EventSeriesListDto,
  EventSeriesSaveResultDto,
  EventsMonthDto,
  PollDto,
  RsvpStatus,
  UpcomingEventDto,
} from "../types/events";

export const EVENTS_KEY = "/api/v1/events";
export const POLLS_KEY = "/api/v1/polls";

const pad = (n: number) => String(n).padStart(2, "0");

/** Sự kiện của một tháng (month: 0–11, theo giờ VN) kèm danh mục sự kiện. */
export function useMonthEvents(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(last)}`;
  const { data, error, isLoading, mutate } = useSWR<EventsMonthDto>(`${EVENTS_KEY}?from=${from}&to=${to}`, swrFetcher, {
    keepPreviousData: true,
  });
  return { events: data?.events ?? [], categories: data?.categories ?? [], error, isLoading: isLoading && !data, mutate };
}

export function useEventCategories() {
  const { data } = useSWR<EventCategoryDto[]>(`${EVENTS_KEY}/categories`, swrFetcher, { revalidateOnFocus: false });
  return data ?? [];
}

export function useUpcomingEvents(limit = 5) {
  const { data, error, isLoading } = useSWR<UpcomingEventDto[]>(`${EVENTS_KEY}/upcoming?limit=${limit}`, swrFetcher);
  return { events: data ?? [], error, isLoading };
}

export function usePolls() {
  const { data, error, isLoading, mutate } = useSWR<PollDto[]>(POLLS_KEY, swrFetcher, { keepPreviousData: true });
  return { polls: data ?? [], error, isLoading: isLoading && !data, mutate };
}

export function useAttendanceRoster(eventId: string | null, enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<AttendanceRosterDto>(
    enabled && eventId ? `${EVENTS_KEY}/${eventId}/attendance` : null,
    swrFetcher
  );
  return { roster: data, error, isLoading, mutate };
}

/** Tuần trực vệ sinh sân nhà chứa ngày đang xem (null khi đang tải lần đầu). */
export function useDayDuties(dateIso: string) {
  const { data, isLoading } = useSWR<DayDutyDto>(`${EVENTS_KEY}/duties?date=${dateIso}`, swrFetcher, { keepPreviousData: true });
  return { duty: data ?? null, isLoading: isLoading && !data };
}

export const SERIES_KEY = `${EVENTS_KEY}/series`;
export const FEED_KEY = "/api/v1/me/calendar-feed";

/** Danh sách sự kiện định kỳ (chỉ tải khi cần — ví dụ khi mở hộp thoại). */
export function useEventSeries(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<EventSeriesListDto>(enabled ? SERIES_KEY : null, swrFetcher, { keepPreviousData: true });
  return { list: data, error, isLoading: isLoading && !data, mutate };
}

/** Các đường dẫn lịch cá nhân đang dùng (Đồng bộ lịch). */
export function useCalendarFeeds(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<CalendarFeedListDto>(enabled ? FEED_KEY : null, swrFetcher);
  return { feeds: data, error, isLoading: isLoading && !data, mutate };
}

/** Làm mới mọi dữ liệu sự kiện/biểu quyết (lịch tháng, sắp tới, điểm danh, biểu quyết, chuỗi định kỳ). */
export const refreshEvents = () =>
  globalMutate((key) => typeof key === "string" && (key.startsWith(EVENTS_KEY) || key.startsWith(POLLS_KEY)));

export interface EventPayload {
  title: string;
  date: string;
  time: string;
  endTime?: string | null;
  categoryCode: string;
  location?: string | null;
  organizerText?: string | null;
  organizerIds?: string[];
  description?: string | null;
  hasCheckIn?: boolean;
  poll?: PollPayload | null;
  /** Báo cả nhà khi tạo mới */
  notifyApp?: boolean;
  notifyZalo?: boolean;
}

export interface PollPayload {
  eventId?: string | null;
  question: string;
  description?: string | null;
  options: string[];
  isMultiSelect?: boolean;
  maxChoices?: number;
  isAnonymous?: boolean;
  closesAt?: string | null;
}

export const eventsApi = {
  create: (b: EventPayload) => api.post<EventDto>(EVENTS_KEY, b),
  update: (id: string, b: Partial<EventPayload>) => api.patch<EventDto>(`${EVENTS_KEY}/${id}`, b),
  cancel: (id: string, reason: string) => api.post<EventDto>(`${EVENTS_KEY}/${id}/cancel`, { reason }),
  remove: (id: string) => api.del(`${EVENTS_KEY}/${id}`),
  rsvp: (id: string, rsvp: RsvpStatus) => api.post<EventDto>(`${EVENTS_KEY}/${id}/rsvp`, { rsvp }),
  mark: (id: string, memberId: string, status: "present" | "late" | "absent", note?: string | null) =>
    api.post<AttendanceRosterDto>(`${EVENTS_KEY}/${id}/attendance`, { memberId, status, note: note ?? null }),
  closeAttendance: (id: string) =>
    api.post<{ result: { absent_created: number; excused_created: number; merit_entries: number }; roster: AttendanceRosterDto }>(
      `${EVENTS_KEY}/${id}/attendance/close`
    ),
  /** Tự điểm danh bằng ảnh: fileId là mã ảnh đã tải lên (bucket "attachments"). */
  checkIn: (b: { eventId: string; fileId: string }) => api.post<CheckInResultDto>(`${EVENTS_KEY}/checkin`, b),
  /** Danh sách điểm danh đầy đủ của một sự kiện (để xuất Excel) */
  roster: (id: string) => api.get<AttendanceRosterDto>(`${EVENTS_KEY}/${id}/attendance`),
  /** Bảng điểm danh thành viên × sự kiện trong khoảng ngày (xuất Excel) */
  attendanceReport: (from: string, to: string) => api.get<AttendanceReportDto>(`${EVENTS_KEY}/attendance-report?from=${from}&to=${to}`),
  /** Đường dẫn tải .ics của một sự kiện (mở bằng thẻ <a download>) */
  icsUrl: (id: string) => `${EVENTS_KEY}/${id}/ics`,
};

// ---------------------------------------------------------------------
// Sự kiện định kỳ
// ---------------------------------------------------------------------
export interface SeriesPayload {
  title: string;
  time: string;
  endTime?: string | null;
  categoryCode: string;
  location?: string | null;
  organizerText?: string | null;
  organizerIds?: string[];
  description?: string | null;
  hasCheckIn?: boolean;
  weekdays: number[];
  intervalWeeks?: number;
  startsOn: string;
  untilDate?: string | null;
  count?: number | null;
  notifyApp?: boolean;
  notifyZalo?: boolean;
}

export type SeriesPatchPayload = Partial<Omit<SeriesPayload, "startsOn" | "notifyApp" | "notifyZalo">> & {
  fromDate?: string;
  isActive?: true;
  noEnd?: boolean;
};

export const seriesApi = {
  create: (b: SeriesPayload) => api.post<EventSeriesSaveResultDto & { zalo: { sent: boolean; reason?: string } | null }>(SERIES_KEY, b),
  get: (id: string) => api.get<EventSeriesDto>(`${SERIES_KEY}/${id}`),
  update: (id: string, b: SeriesPatchPayload) => api.patch<EventSeriesSaveResultDto>(`${SERIES_KEY}/${id}`, b),
  skip: (id: string, b: { date: string; reason?: string | null; notify?: boolean }) => api.post<EventSeriesDto>(`${SERIES_KEY}/${id}/skip`, b),
  restore: (id: string, date: string) => api.post<EventSeriesDto>(`${SERIES_KEY}/${id}/restore`, { date }),
  stop: (id: string, b: { fromDate?: string; reason?: string | null; notify?: boolean }) =>
    api.post<EventSeriesDto & { removed: number }>(`${SERIES_KEY}/${id}/stop`, b),
};

// ---------------------------------------------------------------------
// Đồng bộ lịch (đường dẫn .ics cá nhân)
// ---------------------------------------------------------------------
export const calendarFeedApi = {
  create: (label?: string | null) => api.post<CalendarFeedCreatedDto>(FEED_KEY, { label: label ?? null }),
  revoke: (id: string) => api.del<CalendarFeedListDto>(`${FEED_KEY}/${id}`),
};

export const pollsApi = {
  create: (b: PollPayload) => api.post<PollDto>(POLLS_KEY, b),
  vote: (id: string, optionIds: string[]) => api.post<PollDto>(`${POLLS_KEY}/${id}/vote`, { optionIds }),
  close: (id: string) => api.post<PollDto>(`${POLLS_KEY}/${id}/close`),
  remove: (id: string) => api.del(`${POLLS_KEY}/${id}`),
};
