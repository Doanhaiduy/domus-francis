"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useSession } from "./session";
import type { Member, Room, Floor } from "./types/members";
import { useMembers, useHouse, houseApi, refreshPeople } from "./data/members";
import { errorMessage } from "./api";

// Trạng thái dùng chung toàn ứng dụng: thành viên + sơ đồ nhà (dữ liệu thật từ API), modal, toast, Ctrl+K.
// Dữ liệu từng phân hệ (thu chi, trực nhật, sự kiện…) nằm ở src/lib/data/<phân hệ>.ts.

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
}

interface AppContextType {
  /** Nhãn vai trò chính (đọc từ DB) — chỉ để hiển thị; kiểm quyền dùng useSession().can() */
  currentRole: string;
  members: Member[];
  refreshMembers: () => Promise<unknown>;

  floors: Floor[];
  rooms: Room[];
  addRoom: (room: Room) => Promise<boolean>;
  updateRoom: (roomId: string, updates: Partial<Room>) => Promise<boolean>;
  deleteRoom: (roomId: string) => Promise<boolean>;
  addFloor: (floor: Partial<Floor> & { name: string }) => Promise<boolean>;
  updateFloor: (floorId: number, updates: Partial<Floor>) => Promise<boolean>;
  deleteFloor: (floorId: number) => Promise<boolean>;
  moveMemberToRoom: (memberId: string, targetRoomId: string) => Promise<boolean>;
  removeMemberFromRoom: (memberId: string) => Promise<boolean>;

  activeModal: string | null;
  openModal: (modalName: string) => void;
  closeModal: () => void;

  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;

  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  isLoadingSkeleton: boolean;
  setIsLoadingSkeleton: (loading: boolean) => void;
  simulateLoading: (durationMs?: number) => void;

  toasts: ToastMessage[];
  showToast: (type: ToastMessage["type"], message: string) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useSession();
  const currentRole = session?.roleLabel ?? "Thành viên";
  // Chỉ tải dữ liệu khi đã đăng nhập VÀ đã được duyệt (có hồ sơ thành viên)
  const dataReady = !!session?.member;

  const [isLoadingSkeleton, setIsLoadingSkeleton] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const showToast = (type: ToastMessage["type"], message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 4000);
  };

  const { members } = useMembers({ enabled: dataReady });
  const { floors, rooms, mutate: mutateHouse } = useHouse(dataReady);

  /** Chạy một thao tác API: báo thành công/lỗi bằng toast, làm mới dữ liệu liên quan; trả về true nếu thành công. */
  const runHouseOp = async (op: () => Promise<unknown>, okMsg: string, okType: ToastMessage["type"] = "success") => {
    try {
      await op();
      await refreshPeople();
      showToast(okType, okMsg);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    }
  };

  const addRoom = (room: Room) => runHouseOp(() => houseApi.createRoom(room), `Đã thêm ${room.name} vào sơ đồ nhà!`);
  const updateRoom = (roomId: string, updates: Partial<Room>) => {
    const layoutOnly = Object.keys(updates).every((k) => ["x", "y", "w", "h"].includes(k));
    return runHouseOp(() => houseApi.updateRoom(roomId, updates), layoutOnly ? `Đã lưu vị trí phòng ${roomId}.` : `Đã cập nhật thông tin phòng ${roomId}!`);
  };
  const deleteRoom = (roomId: string) => runHouseOp(() => houseApi.deleteRoom(roomId), `Đã xóa phòng ${roomId} khỏi sơ đồ.`, "warning");
  const addFloor = (floor: Partial<Floor> & { name: string }) =>
    runHouseOp(() => houseApi.createFloor({ name: floor.name, code: floor.code, description: floor.description, level: floor.id }), `Đã thêm ${floor.name} vào sơ đồ!`);
  const updateFloor = (floorId: number, updates: Partial<Floor>) =>
    runHouseOp(() => houseApi.updateFloor(floorId, { name: updates.name, code: updates.code, description: updates.description }), "Đã cập nhật thông tin tầng!");
  const deleteFloor = (floorId: number) => runHouseOp(() => houseApi.deleteFloor(floorId), "Đã xóa tầng và các phòng trống của tầng.", "warning");

  const moveMemberToRoom = async (memberId: string, targetRoomId: string) => {
    const member = members.find((m) => m.id === memberId);
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    if (member && member.room === targetRoomId) {
      showToast("info", `${member.fullName} đã ở sẵn trong ${targetRoom?.name || targetRoomId}.`);
      return false;
    }
    return runHouseOp(
      () => houseApi.assign(memberId, targetRoomId),
      `Đã chuyển ${member?.fullName ?? "thành viên"} sang ${targetRoom ? targetRoom.name : targetRoomId} thành công!`
    );
  };

  const removeMemberFromRoom = async (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    return runHouseOp(() => houseApi.unassign(memberId), `Đã hủy xếp phòng cho ${member?.fullName ?? "thành viên"}.`, "info");
  };
  void mutateHouse;

  return (
    <AppContext.Provider
      value={{
        currentRole,
        members,
        refreshMembers: refreshPeople,
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
        activeModal,
        openModal: (name) => setActiveModal(name),
        closeModal: () => setActiveModal(null),
        mobileMenuOpen,
        setMobileMenuOpen,
        toggleMobileMenu: () => setMobileMenuOpen((p) => !p),
        isCommandPaletteOpen,
        setCommandPaletteOpen: setIsCommandPaletteOpen,
        toggleCommandPalette: () => setIsCommandPaletteOpen((p) => !p),
        isLoadingSkeleton,
        setIsLoadingSkeleton,
        simulateLoading: (durationMs = 1500) => {
          setIsLoadingSkeleton(true);
          setTimeout(() => setIsLoadingSkeleton(false), durationMs);
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
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp phải nằm trong <AppProvider>");
  return ctx;
};
