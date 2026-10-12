// Chuyển mục của "Việc của tôi hôm nay" thành DTO đầy đủ mà các hộp thoại sẵn có cần (CheckInModal cần EventDto, ExtendDialog cần
// LeaveRequestDto) — hộp thoại chỉ đọc vài trường, các trường còn lại điền giá trị trung tính.
import type { EventDto } from "@/lib/types/events";
import type { LeaveRequestDto } from "@/lib/types/leave";
import type { MyTodayEventRef, MyTodayLeave } from "@/lib/types/me-today";

export function eventDtoFor(e: MyTodayEventRef): EventDto {
  return {
    id: e.id,
    title: e.title,
    categoryId: "",
    categoryCode: "",
    category: "",
    categoryColor: "",
    status: "scheduled",
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    dateIso: e.dateIso,
    date: e.date,
    time: e.startHm,
    startHm: e.startHm,
    endHm: e.endHm,
    endDateIso: e.dateIso,
    location: e.location,
    organizer: "",
    organizerText: null,
    organizers: [],
    description: null,
    hasCheckIn: true,
    cancelReason: null,
    stats: { going: 0, maybe: 0, notGoing: 0, present: 0, late: 0, absent: 0, excused: 0, expected: null },
    myRsvp: "none",
    myAttendance: null,
    canEdit: false,
    canRecord: false,
    polls: [],
    series: null,
  };
}

export function leaveDtoFor(l: MyTodayLeave, me: { id: string; name: string }): LeaveRequestDto {
  return {
    id: l.leaveId,
    memberId: me.id,
    memberName: me.name,
    kind: l.leaveKind,
    eventId: null,
    eventTitle: l.eventTitle,
    startsAt: l.startsAt,
    endsAt: l.endsAt,
    reason: "",
    destination: null,
    contactPhone: null,
    status: l.status,
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: l.startsAt,
    isMine: true,
    doorMemberId: null,
    doorMemberName: l.doorMemberName,
    extensions: [],
    effectiveEndsAt: l.effectiveEndsAt,
    canExtend: l.canExtend,
    canEdit: false,
  };
}
