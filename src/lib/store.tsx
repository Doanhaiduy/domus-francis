"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  Member,
  Expense,
  Contribution,
  Announcement,
  MaintenanceIssue,
  ForumThread,
  PrayerIntention,
  CalendarEvent,
  Floor,
  Room,
  RoomType,
  INITIAL_MEMBERS,
  INITIAL_CONTRIBUTIONS,
  INITIAL_EXPENSES,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_ISSUES,
  INITIAL_FORUM_THREADS,
  INITIAL_PRAYERS,
  INITIAL_EVENTS,
  INITIAL_FLOORS,
  INITIAL_ROOMS,
  CategoryItem,
  INITIAL_CATEGORIES,
  MomentAlbum,
  MomentPhoto,
  INITIAL_MOMENTS,
  EventPoll,
  EventCheckInRecord,
  AcademicRecord,
  INITIAL_ACADEMIC_RECORDS,
  CleaningDuty,
  INITIAL_CLEANING_DUTIES,
} from "./mockData";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
}

interface AppContextType {
  // Members & Auth
  currentRole: string;
  setCurrentRole: (role: string) => void;
  members: Member[];
  addMember: (member: Omit<Member, "id" | "avatarText" | "joined">) => void;
  
  // House / Floorplan
  floors: Floor[];
  rooms: Room[];
  addRoom: (room: Room) => void;
  updateRoom: (roomId: string, updates: Partial<Room>) => void;
  deleteRoom: (roomId: string) => void;
  addFloor: (floor: Floor) => void;
  updateFloor: (floorId: number, updates: Partial<Floor>) => void;
  deleteFloor: (floorId: number) => void;
  moveMemberToRoom: (memberId: string, targetRoomId: string) => void;
  removeMemberFromRoom: (memberId: string) => void;
  
  // Events & Calendar Check-in & Polls
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, "id">) => void;
  checkInEvent: (eventId: string, memberName: string, note?: string) => void;
  voteEventPoll: (eventId: string, pollId: string, optionId: string, memberName: string) => void;
  createEventPoll: (eventId: string, question: string, options: string[]) => void;

  // Academic Records (Quản lý học tập & điểm số)
  academicRecords: AcademicRecord[];
  addAcademicRecord: (record: Omit<AcademicRecord, "id" | "updatedAt">) => void;
  updateAcademicRecord: (id: string, updates: Partial<AcademicRecord>) => void;
  deleteAcademicRecord: (id: string) => void;

  // Cleaning Duty & House Sanitation (Phân công dọn vệ sinh & Trực nhật)
  cleaningDuties: CleaningDuty[];
  checkInCleaningDuty: (dutyId: string, memberName: string, note?: string, evidenceUrl?: string) => void;
  reviewCleaningDuty: (dutyId: string, status: "approved" | "rejected", reviewerName: string, reviewNote?: string) => void;
  swapCleaningDuty: (dutyId: string, fromMember: string, toMember: string, reason: string) => void;
  addCleaningDuty: (duty: Omit<CleaningDuty, "id">) => void;
  
  // Finance
  fundBalance: number;
  expenses: Expense[];
  contributions: Contribution[];
  addExpense: (expense: Omit<Expense, "id" | "date" | "status">) => void;
  toggleContribution: (memberId: string) => void;
  
  // Kitchen & Meals
  mealAttendance: Record<string, { lunch: boolean; dinner: boolean }>;
  toggleMeal: (memberId: string, meal: "lunch" | "dinner") => void;
  registerAllMeals: (memberId?: string) => void;
  
  // Announcements
  announcements: Announcement[];
  addAnnouncement: (announcement: Omit<Announcement, "id" | "date" | "isPinned" | "isUnread">) => void;
  togglePinAnnouncement: (id: string) => void;
  markAllAnnouncementsRead: () => void;
  markAnnouncementRead: (id: string) => void;
  
  // Maintenance Issues
  issues: MaintenanceIssue[];
  addIssue: (issue: Omit<MaintenanceIssue, "id" | "date" | "status">) => void;
  updateIssueStatus: (id: string, status: MaintenanceIssue["status"]) => void;
  
  // Forum
  threads: ForumThread[];
  addThread: (thread: Omit<ForumThread, "id" | "date" | "repliesCount" | "likesCount" | "isPinned" | "replies">) => void;
  addReply: (threadId: string, content: string) => void;
  toggleLikeThread: (threadId: string) => void;
  
  // Liturgy
  prayers: PrayerIntention[];
  addPrayer: (text: string, isAnonymous?: boolean) => void;
  togglePraying: (id: string) => void;

  // Laundry Slots
  laundryBookings: Record<string, string>; // "day-slot" -> memberName
  bookLaundry: (day: number, slot: number, memberName: string) => void;
  cancelLaundry: (day: number, slot: number) => void;
  
  // Modals & Dialogs
  activeModal: string | null;
  openModal: (modalName: string) => void;
  closeModal: () => void;
  
  // Mobile Navigation Drawer
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;

  // Command Palette
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // Skeleton Loading Simulation
  isLoadingSkeleton: boolean;
  setIsLoadingSkeleton: (loading: boolean) => void;
  simulateLoading: (durationMs?: number) => void;

  // Toast notifications
  toasts: ToastMessage[];
  showToast: (type: ToastMessage["type"], message: string) => void;
  removeToast: (id: string) => void;

  // Categories & Configuration
  categories: CategoryItem[];
  addCategory: (category: Omit<CategoryItem, "id">) => void;
  updateCategory: (id: string, updates: Partial<CategoryItem>) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryStatus: (id: string) => void;

  // Moments & Memory Gallery
  moments: MomentAlbum[];
  addMomentAlbum: (album: Omit<MomentAlbum, "id" | "likesCount" | "isLiked">) => void;
  toggleLikeMoment: (albumId: string) => void;
  addPhotoToMoment: (albumId: string, photo: Omit<MomentPhoto, "id" | "likesCount">) => void;
  deleteMomentAlbum: (albumId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoadingSkeleton, setIsLoadingSkeleton] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const toggleMobileMenu = () => setMobileMenuOpen((prev) => !prev);
  const [currentRole, setCurrentRole] = useState<string>("Phó nhà");
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [academicRecords, setAcademicRecords] = useState<AcademicRecord[]>(INITIAL_ACADEMIC_RECORDS);
  const [cleaningDuties, setCleaningDuties] = useState<CleaningDuty[]>(INITIAL_CLEANING_DUTIES);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const toggleCommandPalette = () => setIsCommandPaletteOpen((prev) => !prev);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [contributions, setContributions] = useState<Contribution[]>(INITIAL_CONTRIBUTIONS);
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [issues, setIssues] = useState<MaintenanceIssue[]>(INITIAL_ISSUES);
  const [threads, setThreads] = useState<ForumThread[]>(INITIAL_FORUM_THREADS);
  const [prayers, setPrayers] = useState<PrayerIntention[]>(INITIAL_PRAYERS);

  // House / Floorplan state
  const [floors, setFloors] = useState<Floor[]>(INITIAL_FLOORS);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);

  const addRoom = (room: Room) => {
    setRooms((prev) => [...prev, room]);
    showToast("success", `Đã thêm ${room.name} vào sơ đồ nhà!`);
  };

  const updateRoom = (roomId: string, updates: Partial<Room>) => {
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...updates } : r)));
    showToast("success", `Đã cập nhật thông tin phòng ${roomId}!`);
  };

  const deleteRoom = (roomId: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.room === roomId ? { ...m, room: "Chưa xếp phòng" } : m))
    );
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    showToast("warning", `Đã xóa phòng ${roomId} khỏi sơ đồ.`);
  };

  const addFloor = (floor: Floor) => {
    setFloors((prev) => [...prev, floor]);
    showToast("success", `Đã thêm ${floor.name} vào sơ đồ!`);
  };

  const updateFloor = (floorId: number, updates: Partial<Floor>) => {
    setFloors((prev) => prev.map((f) => (f.id === floorId ? { ...f, ...updates } : f)));
    showToast("success", `Đã cập nhật thông tin tầng!`);
  };

  const deleteFloor = (floorId: number) => {
    const roomsOnFloor = rooms.filter((r) => r.floor === floorId);
    if (roomsOnFloor.length > 0) {
      const roomIds = roomsOnFloor.map((r) => r.id);
      setMembers((prev) =>
        prev.map((m) => (roomIds.includes(m.room) ? { ...m, room: "Chưa xếp phòng" } : m))
      );
      setRooms((prev) => prev.filter((r) => r.floor !== floorId));
    }
    setFloors((prev) => prev.filter((f) => f.id !== floorId));
    showToast("warning", `Đã xóa tầng và các phòng liên quan.`);
  };

  const moveMemberToRoom = (memberId: string, targetRoomId: string) => {
    const member = members.find((m) => m.id === memberId);
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    if (!member) return;

    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, room: targetRoomId } : m))
    );
    setContributions((prev) =>
      prev.map((c) => (c.memberId === memberId ? { ...c, room: targetRoomId } : c))
    );
    showToast(
      "success",
      `Đã chuyển bạn ${member.fullName} sang ${targetRoom ? targetRoom.name : targetRoomId} thành công!`
    );
  };

  const removeMemberFromRoom = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, room: "Chưa xếp phòng" } : m))
    );
    showToast("info", `Đã hủy xếp phòng cho bạn ${member.fullName}.`);
  };

  // Initial meal attendance: 10/12 registered
  const [mealAttendance, setMealAttendance] = useState<Record<string, { lunch: boolean; dinner: boolean }>>(() => {
    const initial: Record<string, { lunch: boolean; dinner: boolean }> = {};
    INITIAL_MEMBERS.forEach((m, idx) => {
      initial[m.id] = {
        lunch: idx !== 2 && idx !== 6,
        dinner: idx !== 4,
      };
    });
    return initial;
  });

  // Laundry slots: "day(0-6)-slot(0-6)"
  const [laundryBookings, setLaundryBookings] = useState<Record<string, string>>({
    "3-4": "Minh Tuấn (Lịch của bạn)",
    "3-5": "Đình Khôi (P.102)",
    "4-2": "Văn Đức",
  });

  // Modals and Toasts
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastMessage["type"], message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openModal = (name: string) => setActiveModal(name);
  const closeModal = () => setActiveModal(null);

  // Fund calculation
  const totalCollected = contributions.filter((c) => c.status === "Đã đóng").reduce((sum, c) => sum + c.amount, 0);
  const octExpensesSpent = expenses
    .filter((e) => e.status === "Đã duyệt" && (e.date.includes("10/2026") || e.date.endsWith("/10/2026")))
    .reduce((sum, e) => sum + e.amount, 0);
  const fundBalance = 8680000 + (totalCollected - 8 * 350000) - (octExpensesSpent - 2870000);

  const addExpense = (expense: Omit<Expense, "id" | "date" | "status">) => {
    const newExp: Expense = {
      ...expense,
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toLocaleDateString("vi-VN"),
      status: "Đã duyệt",
    };
    setExpenses((prev) => [newExp, ...prev]);
    showToast("success", `Đã ghi nhận khoản chi ${expense.amount.toLocaleString("vi-VN")}đ`);
  };

  const toggleContribution = (memberId: string) => {
    setContributions((prev) =>
      prev.map((c) => {
        if (c.memberId === memberId) {
          const nextStatus = c.status === "Đã đóng" ? "Chưa đóng" : "Đã đóng";
          showToast(
            nextStatus === "Đã đóng" ? "success" : "info",
            `${nextStatus === "Đã đóng" ? "Đã ghi nhận đóng quỹ" : "Đã chuyển sang chưa đóng"} cho ${c.name}`
          );
          return {
            ...c,
            status: nextStatus,
            paidDate: nextStatus === "Đã đóng" ? new Date().toLocaleDateString("vi-VN") : undefined,
          };
        }
        return c;
      })
    );
  };

  const toggleMeal = (memberId: string, meal: "lunch" | "dinner") => {
    setMealAttendance((prev) => {
      const current = prev[memberId] || { lunch: false, dinner: false };
      const updated = { ...current, [meal]: !current[meal] };
      const member = members.find((m) => m.id === memberId);
      showToast(
        "info",
        `Đã cập nhật ${meal === "lunch" ? "bữa trưa" : "bữa tối"}: ${updated[meal] ? "Ăn" : "Nghỉ"} (${member?.name})`
      );
      return { ...prev, [memberId]: updated };
    });
  };

  const registerAllMeals = (memberId?: string) => {
    setMealAttendance((prev) => {
      if (memberId) {
        return { ...prev, [memberId]: { lunch: true, dinner: true } };
      }
      const updated: Record<string, { lunch: boolean; dinner: boolean }> = {};
      members.forEach((m) => {
        updated[m.id] = { lunch: true, dinner: true };
      });
      return updated;
    });
    showToast("success", "Đã lưu đăng ký ăn trưa & tối cho toàn thể anh em thành công!");
  };

  const addAnnouncement = (ann: Omit<Announcement, "id" | "date" | "isPinned" | "isUnread">) => {
    const newAnn: Announcement = {
      ...ann,
      id: Math.random().toString(36).substring(2, 9),
      date: `Hôm nay · ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`,
      isPinned: false,
      isUnread: true,
    };
    setAnnouncements((prev) => [newAnn, ...prev]);
    showToast("success", "Đã đăng thông báo mới cho toàn nhà!");
  };

  const togglePinAnnouncement = (id: string) => {
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isPinned: !a.isPinned } : a))
    );
  };

  const markAllAnnouncementsRead = () => {
    setAnnouncements((prev) => prev.map((a) => ({ ...a, isUnread: false })));
    showToast("info", "Đã đánh dấu tất cả thông báo là đã đọc.");
  };

  const markAnnouncementRead = (id: string) => {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, isUnread: false } : a)));
  };

  const addMember = (m: Omit<Member, "id" | "avatarText" | "joined">) => {
    const parts = m.fullName.trim().split(" ");
    const avatarText = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : m.fullName.slice(0, 2).toUpperCase();
    const newMember: Member = {
      ...m,
      id: Math.random().toString(36).substring(2, 9),
      name: parts[parts.length - 1] || m.fullName,
      joined: new Date().toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" }),
      avatarText,
    };
    setMembers((prev) => [...prev, newMember]);
    showToast("success", `Đã thêm thành viên ${m.fullName} (${m.room}) vào danh bạ.`);
  };

  const addEvent = (evt: Omit<CalendarEvent, "id">) => {
    const newEvt: CalendarEvent = {
      ...evt,
      id: `evt-${Math.random().toString(36).substring(2, 7)}`,
    };
    setEvents((prev) => [newEvt, ...prev]);
    showToast("success", `Đã tạo sự kiện "${evt.title}".`);
  };

  const checkInEvent = (eventId: string, memberName: string, note?: string) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        const checkIns = evt.checkIns || [];
        const existingIdx = checkIns.findIndex((c) => c.memberName === memberName);
        const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        const memberObj = members.find((m) => m.fullName === memberName);
        const room = memberObj?.room || "Lưu Xá";

        let updatedCheckIns: EventCheckInRecord[];
        if (existingIdx >= 0) {
          updatedCheckIns = [...checkIns];
          updatedCheckIns[existingIdx] = {
            ...updatedCheckIns[existingIdx],
            checkedInAt: nowTime,
            status: "present",
            note: note || updatedCheckIns[existingIdx].note,
          };
        } else {
          updatedCheckIns = [
            ...checkIns,
            {
              memberId: memberObj?.id || `m-${Date.now()}`,
              memberName,
              room,
              checkedInAt: nowTime,
              status: "present",
              note,
            },
          ];
        }
        return { ...evt, hasCheckIn: true, checkIns: updatedCheckIns };
      })
    );
    showToast("success", `Điểm danh thành công: ${memberName} đã có mặt!`);
  };

  const voteEventPoll = (eventId: string, pollId: string, optionId: string, memberName: string) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId || !evt.poll) return evt;
        const poll = evt.poll;
        const updatedOptions = poll.options.map((opt) => {
          const filteredVotes = opt.votes.filter((v) => v !== memberName);
          if (opt.id === optionId) {
            return { ...opt, votes: [...filteredVotes, memberName] };
          }
          return { ...opt, votes: filteredVotes };
        });
        return { ...evt, poll: { ...poll, options: updatedOptions } };
      })
    );
    showToast("success", `Đã ghi nhận biểu quyết của ${memberName}!`);
  };

  const createEventPoll = (eventId: string, question: string, optionTexts: string[]) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        const newPoll: EventPoll = {
          id: `poll-${Date.now()}`,
          question,
          options: optionTexts.map((txt, idx) => ({
            id: `opt-${Date.now()}-${idx}`,
            text: txt,
            votes: [],
          })),
          createdAt: new Date().toLocaleDateString("vi-VN"),
        };
        return { ...evt, poll: newPoll };
      })
    );
    showToast("success", `Đã tạo cuộc biểu quyết mới cho sự kiện!`);
  };

  const addAcademicRecord = (rec: Omit<AcademicRecord, "id" | "updatedAt">) => {
    const newRec: AcademicRecord = {
      ...rec,
      id: `acad-${Date.now()}`,
      updatedAt: new Date().toLocaleDateString("vi-VN"),
    };
    setAcademicRecords((prev) => [newRec, ...prev]);
    showToast("success", `Đã cập nhật bảng điểm của sinh viên ${rec.memberName}!`);
  };

  const updateAcademicRecord = (id: string, updates: Partial<AcademicRecord>) => {
    setAcademicRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates, updatedAt: new Date().toLocaleDateString("vi-VN") } : r))
    );
    showToast("success", "Đã cập nhật hồ sơ điểm số thành công!");
  };

  const deleteAcademicRecord = (id: string) => {
    setAcademicRecords((prev) => prev.filter((r) => r.id !== id));
    showToast("info", "Đã xóa bản ghi điểm số.");
  };

  const checkInCleaningDuty = (dutyId: string, memberName: string, note?: string, evidenceUrl?: string) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setCleaningDuties((prev) =>
      prev.map((d) => {
        if (d.id === dutyId) {
          return {
            ...d,
            status: "submitted",
            checkInTime: timeStr,
            checkInBy: memberName,
            checkInNote: note || "Đã hoàn thành ca trực vệ sinh sạch sẽ.",
            evidencePhoto: evidenceUrl || d.evidencePhoto || "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
          };
        }
        return d;
      })
    );
    showToast("success", `Đã check-in hoàn thành ca trực vệ sinh! Ban quản lý sẽ nghiệm thu.`);
  };

  const reviewCleaningDuty = (dutyId: string, status: "approved" | "rejected", reviewerName: string, reviewNote?: string) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setCleaningDuties((prev) =>
      prev.map((d) => {
        if (d.id === dutyId) {
          return {
            ...d,
            status,
            reviewerName,
            reviewNote: reviewNote || (status === "approved" ? "Nghiệm thu đạt chuẩn." : "Cần dọn dẹp lại kỹ hơn."),
            reviewedAt: timeStr,
          };
        }
        return d;
      })
    );
    showToast(status === "approved" ? "success" : "warning", `Nghiệm thu ca trực: ${status === "approved" ? "Đạt chuẩn vệ sinh" : "Yêu cầu dọn dẹp lại"}`);
  };

  const swapCleaningDuty = (dutyId: string, fromMember: string, toMember: string, reason: string) => {
    setCleaningDuties((prev) =>
      prev.map((d) => {
        if (d.id === dutyId) {
          const updatedMembers = d.assignedMembers.map((m) => (m === fromMember ? toMember : m));
          return {
            ...d,
            assignedMembers: updatedMembers,
            checkInNote: `Đã đổi ca từ ${fromMember} sang ${toMember} (Lý do: ${reason})`,
          };
        }
        return d;
      })
    );
    showToast("info", `Đã ghi nhận đổi ca trực nhật sang cho ${toMember}!`);
  };

  const addCleaningDuty = (duty: Omit<CleaningDuty, "id">) => {
    const newDuty: CleaningDuty = {
      ...duty,
      id: `duty-${Date.now().toString(36)}`,
    };
    setCleaningDuties((prev) => [newDuty, ...prev]);
    showToast("success", `Đã thêm phân công trực nhật: ${newDuty.area}`);
  };

  const addIssue = (iss: Omit<MaintenanceIssue, "id" | "date" | "status">) => {
    const newIssue: MaintenanceIssue = {
      ...iss,
      id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
      date: "Vừa xong",
      status: "Mới tiếp nhận",
    };
    setIssues((prev) => [newIssue, ...prev]);
    showToast("warning", `Đã gửi báo hỏng [${newIssue.id}]. Đội hậu cần sẽ xử lý sớm.`);
  };

  const updateIssueStatus = (id: string, status: MaintenanceIssue["status"]) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
    );
    showToast("success", `Cập nhật trạng thái sự cố: ${status}`);
  };

  const addThread = (t: Omit<ForumThread, "id" | "date" | "repliesCount" | "likesCount" | "isPinned" | "replies">) => {
    const newThread: ForumThread = {
      ...t,
      id: Math.random().toString(36).substring(2, 9),
      date: "Vừa xong",
      repliesCount: 0,
      likesCount: 0,
      isPinned: false,
      replies: [],
    };
    setThreads((prev) => [newThread, ...prev]);
    showToast("success", "Đã tạo chủ đề thảo luận mới trên diễn đàn!");
  };

  const addReply = (threadId: string, content: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          const newReply = {
            id: Math.random().toString(36).substring(2, 9),
            author: "Minh Tuấn (Bạn)",
            content,
            time: "Vừa xong",
          };
          return {
            ...t,
            repliesCount: t.repliesCount + 1,
            replies: [...t.replies, newReply],
          };
        }
        return t;
      })
    );
    showToast("success", "Đã gửi phản hồi của bạn.");
  };

  const toggleLikeThread = (threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, likesCount: t.likesCount + 1 } : t))
    );
  };

  const addPrayer = (text: string, isAnonymous: boolean = false) => {
    const newPrayer: PrayerIntention = {
      id: Math.random().toString(36).substring(2, 9),
      text,
      author: isAnonymous ? "Ẩn danh" : "Minh Tuấn",
      date: "Hôm nay",
      prayingCount: 1,
      hasPrayed: true,
    };
    setPrayers((prev) => [newPrayer, ...prev]);
    showToast("success", "Đã gửi ý cầu nguyện hiệp thông cùng cả nhà 🙏");
  };

  const togglePraying = (id: string) => {
    setPrayers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const hasPrayed = !p.hasPrayed;
          return {
            ...p,
            hasPrayed,
            prayingCount: hasPrayed ? p.prayingCount + 1 : Math.max(0, p.prayingCount - 1),
          };
        }
        return p;
      })
    );
  };

  const bookLaundry = (day: number, slot: number, memberName: string) => {
    const key = `${day}-${slot}`;
    setLaundryBookings((prev) => ({ ...prev, [key]: memberName }));
    showToast("success", `Đã đặt ca giặt thành công!`);
  };

  const cancelLaundry = (day: number, slot: number) => {
    const key = `${day}-${slot}`;
    setLaundryBookings((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    showToast("info", "Đã hủy ca giặt.");
  };

  // Categories Management State & Handlers
  const [categories, setCategories] = useState<CategoryItem[]>(INITIAL_CATEGORIES);

  const addCategory = (categoryData: Omit<CategoryItem, "id">) => {
    const newCat: CategoryItem = {
      ...categoryData,
      id: `cat-${Date.now()}`,
    };
    setCategories((prev) => [newCat, ...prev]);
    showToast("success", `Đã thêm danh mục "${newCat.name}" thành công!`);
  };

  const updateCategory = (id: string, updates: Partial<CategoryItem>) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    showToast("success", "Đã cập nhật danh mục thành công!");
  };

  const deleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    showToast("warning", "Đã xóa danh mục khỏi hệ thống.");
  };

  const toggleCategoryStatus = (id: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const next = !c.isActive;
          showToast("info", `${next ? "Đã kích hoạt" : "Đã tạm ẩn"} danh mục "${c.name}".`);
          return { ...c, isActive: next };
        }
        return c;
      })
    );
  };

  // Moments & Memory Gallery State & Handlers
  const [moments, setMoments] = useState<MomentAlbum[]>(INITIAL_MOMENTS);

  const addMomentAlbum = (albumData: Omit<MomentAlbum, "id" | "likesCount" | "isLiked">) => {
    const newAlbum: MomentAlbum = {
      ...albumData,
      id: `alb-${Date.now()}`,
      likesCount: 0,
      isLiked: false,
    };
    setMoments((prev) => [newAlbum, ...prev]);
    showToast("success", `Đã tạo album khoảnh khắc "${newAlbum.title}"!`);
  };

  const toggleLikeMoment = (albumId: string) => {
    setMoments((prev) =>
      prev.map((alb) => {
        if (alb.id === albumId) {
          const isLiked = !alb.isLiked;
          return {
            ...alb,
            isLiked,
            likesCount: isLiked ? alb.likesCount + 1 : Math.max(0, alb.likesCount - 1),
          };
        }
        return alb;
      })
    );
  };

  const addPhotoToMoment = (albumId: string, photoData: Omit<MomentPhoto, "id" | "likesCount">) => {
    const newPhoto: MomentPhoto = {
      ...photoData,
      id: `p-${Date.now()}`,
      likesCount: 0,
    };
    setMoments((prev) =>
      prev.map((alb) => {
        if (alb.id === albumId) {
          return {
            ...alb,
            photos: [newPhoto, ...alb.photos],
          };
        }
        return alb;
      })
    );
    showToast("success", "Đã thêm ảnh mới vào album!");
  };

  const deleteMomentAlbum = (albumId: string) => {
    setMoments((prev) => prev.filter((a) => a.id !== albumId));
    showToast("warning", "Đã xóa album khoảnh khắc.");
  };

  return (
    <AppContext.Provider
      value={{
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        toggleCategoryStatus,
        moments,
        addMomentAlbum,
        toggleLikeMoment,
        addPhotoToMoment,
        deleteMomentAlbum,
        currentRole,
        setCurrentRole,
        members,
        addMember,
        floors,
        rooms,
        addRoom,
        updateRoom,
        deleteRoom,
        addFloor,
        updateFloor,
        deleteFloor,
        moveMemberToRoom,
        removeMemberFromRoom,
        events,
        addEvent,
        checkInEvent,
        voteEventPoll,
        createEventPoll,
        academicRecords,
        addAcademicRecord,
        updateAcademicRecord,
        deleteAcademicRecord,
        cleaningDuties,
        checkInCleaningDuty,
        reviewCleaningDuty,
        swapCleaningDuty,
        addCleaningDuty,
        fundBalance,
        expenses,
        contributions,
        addExpense,
        toggleContribution,
        mealAttendance,
        toggleMeal,
        registerAllMeals,
        announcements,
        addAnnouncement,
        togglePinAnnouncement,
        markAllAnnouncementsRead,
        markAnnouncementRead,
        issues,
        addIssue,
        updateIssueStatus,
        threads,
        addThread,
        addReply,
        toggleLikeThread,
        prayers,
        addPrayer,
        togglePraying,
        laundryBookings,
        bookLaundry,
        cancelLaundry,
        activeModal,
        openModal,
        closeModal,
        mobileMenuOpen,
        setMobileMenuOpen,
        toggleMobileMenu,
        isCommandPaletteOpen,
        setCommandPaletteOpen: setIsCommandPaletteOpen,
        toggleCommandPalette,
        isLoadingSkeleton,
        setIsLoadingSkeleton,
        simulateLoading: (durationMs = 5000) => {
          setIsLoadingSkeleton((prev) => {
            if (prev) {
              showToast("info", "Đã tắt chế độ Skeleton mô phỏng.");
              return false;
            }
            showToast("info", `Đang mô phỏng Skeleton Loading (${durationMs / 1000}s)...`);
            setTimeout(() => {
              setIsLoadingSkeleton(false);
              showToast("success", "Đã tải xong dữ liệu cộng đoàn!");
            }, durationMs);
            return true;
          });
        },
        toasts,
        showToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
