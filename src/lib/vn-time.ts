// Giờ Việt Nam (UTC+7, không có giờ mùa hè): chuyển qua lại giữa ISO và (ngày, giờ) theo múi giờ lưu xá.
const VN_OFFSET_MS = 7 * 3600_000;

export const toVnParts = (iso: string): { date: string; time: string } => {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};

export const fromVnParts = (date: string, time: string): string => new Date(`${date}T${time}:00+07:00`).toISOString();

/** Ngày hôm nay (YYYY-MM-DD) theo giờ VN, lệch `days` ngày. */
export const vnToday = (days = 0): string => new Date(Date.now() + VN_OFFSET_MS + days * 86400_000).toISOString().slice(0, 10);

/** Danh sách giờ cách nhau 30 phút (từ `fromHour` đến hết `toHour`:30) cho CustomSelect. */
export const halfHourOptions = (fromHour = 0, toHour = 23) =>
  Array.from({ length: (toHour - fromHour + 1) * 2 }, (_, i) => {
    const m = fromHour * 60 + i * 30;
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { value: t, label: t };
  });
