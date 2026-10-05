"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Bed,
  Users,
  Plus,
  ArrowRightLeft,
  Settings2,
  CheckCircle2,
  AlertCircle,
  DoorOpen,
  Church,
  UtensilsCrossed,
  Wind,
  Package,
  Sparkles,
  Phone,
  Calendar,
  Layers,
  Edit2,
  Trash2,
  Search,
  Filter,
  Check,
  X,
  UserPlus,
  Home,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { Room, Floor, RoomType, Member } from "@/lib/types/members";
import { CustomSelect, CustomInput, CustomToggle, CustomTextarea, SelectOption } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FloorplanCanvas } from "@/components/FloorplanCanvas";
import { cn } from "@/lib/utils";

const AMENITY_OPTIONS = [
  "Điều hòa",
  "WC khép kín",
  "Ban công thoáng",
  "Bàn học cá nhân",
  "Bàn học đôi",
  "Quạt trần",
  "Tủ quần áo gỗ",
  "Bình nóng lạnh",
  "Cửa sổ đón nắng",
  "Wifi tốc độ cao",
];

const ROOM_TYPE_LABELS: Record<RoomType, { label: string; icon: any; color: string; bg: string }> = {
  bedroom: { label: "Phòng ngủ", icon: Bed, color: "text-purple-700", bg: "bg-purple-50 border-purple-100" },
  common: { label: "Sinh hoạt chung", icon: Users, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
  chapel: { label: "Nhà nguyện", icon: Church, color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-100" },
  kitchen: { label: "Bếp & Ăn", icon: UtensilsCrossed, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
  laundry: { label: "Giặt & Phơi", icon: Wind, color: "text-cyan-700", bg: "bg-cyan-50 border-cyan-100" },
  storage: { label: "Kho & Kỹ thuật", icon: Package, color: "text-gray-700", bg: "bg-gray-100 border-gray-200" },
  stairs: { label: "Cầu thang", icon: ArrowRightLeft, color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-100" },
  corridor: { label: "Hành lang", icon: DoorOpen, color: "text-purple-700", bg: "bg-purple-50 border-purple-100" },
  other: { label: "Tiện ích khác", icon: DoorOpen, color: "text-blue-700", bg: "bg-blue-50 border-blue-100" },
};

export default function SoDoNhaPage() {
  const {
    members,
    floors,
    rooms,
    addRoom,
    updateRoom,
    deleteRoom,
    addFloor,
    deleteFloor,
    moveMemberToRoom,
    removeMemberFromRoom,
    showToast,
  } = useApp();

  // Quyền đọc từ DB (role_permissions): xếp/chuyển phòng vs. sửa cấu trúc nhà (phòng, tầng, tọa độ)
  const { can } = useSession();
  const canManageHouse = can("house.assign");
  const canStructure = can("house.structure.manage");

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filters & Search
  const [viewMode, setViewMode] = useState<"canvas" | "cards">("canvas");
  const [selectedFloor, setSelectedFloor] = useState<number | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "bedroom" | "facility" | "available" | "full">("all");

  // Admin / Builder Mode
  const [isBuilderMode, setIsBuilderMode] = useState(false);

  // Modals
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isAddFloorModalOpen, setIsAddFloorModalOpen] = useState(false);
  
  // Quick Move Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferMemberId, setTransferMemberId] = useState<string>("");
  const [transferTargetRoomId, setTransferTargetRoomId] = useState<string>("");

  // Assign Member to specific room
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignRoomId, setAssignRoomId] = useState<string>("");
  const [assignMemberId, setAssignMemberId] = useState<string>("");

  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Room Form State (Add / Edit)
  const [formRoomFloor, setFormRoomFloor] = useState<number>(1);
  const [formRoomId, setFormRoomId] = useState("");
  const [formRoomName, setFormRoomName] = useState("");
  const [formRoomType, setFormRoomType] = useState<RoomType>("bedroom");
  const [formRoomCapacity, setFormRoomCapacity] = useState<number>(2);
  const [formRoomArea, setFormRoomArea] = useState<number>(24);
  const [formRoomDescription, setFormRoomDescription] = useState("");
  const [formRoomAmenities, setFormRoomAmenities] = useState<string[]>(["Điều hòa", "WC khép kín"]);

  // Floor Form State
  const [formFloorId, setFormFloorId] = useState<number>(4);
  const [formFloorName, setFormFloorName] = useState("");
  const [formFloorCode, setFormFloorCode] = useState("");
  const [formFloorDesc, setFormFloorDesc] = useState("");

  // Derived Metrics
  const bedroomRooms = rooms.filter((r) => r.type === "bedroom");
  const totalBeds = bedroomRooms.reduce((acc, r) => acc + r.capacity, 0);
  
  // Mapping room occupants
  const roomOccupantsMap = useMemo(() => {
    const map: Record<string, Member[]> = {};
    rooms.forEach((r) => {
      map[r.id] = [];
    });
    members.forEach((m) => {
      if (m.room && map[m.room]) {
        map[m.room].push(m);
      }
    });
    return map;
  }, [rooms, members]);

  const totalOccupiedBeds = useMemo(() => {
    let count = 0;
    bedroomRooms.forEach((r) => {
      const occ = roomOccupantsMap[r.id] ? roomOccupantsMap[r.id].length : 0;
      count += occ;
    });
    return count;
  }, [bedroomRooms, roomOccupantsMap]);

  const totalAvailableBeds = Math.max(0, totalBeds - totalOccupiedBeds);
  const occupancyRate = totalBeds > 0 ? Math.round((totalOccupiedBeds / totalBeds) * 100) : 0;

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      // Floor filter
      if (selectedFloor !== "all" && r.floor !== selectedFloor) return false;

      // Type filter
      if (filterType === "bedroom" && r.type !== "bedroom") return false;
      if (filterType === "facility" && r.type === "bedroom") return false;
      
      const occupants = roomOccupantsMap[r.id] || [];
      if (filterType === "available") {
        if (r.type !== "bedroom" || occupants.length >= r.capacity) return false;
      }
      if (filterType === "full") {
        if (r.type !== "bedroom" || occupants.length < r.capacity) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesRoom = r.name.toLowerCase().includes(query) || r.id.toLowerCase().includes(query);
        const matchesOccupant = occupants.some(
          (m) => m.fullName.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
        );
        const matchesAmenity = r.amenities.some((a) => a.toLowerCase().includes(query));
        if (!matchesRoom && !matchesOccupant && !matchesAmenity) return false;
      }

      return true;
    });
  }, [rooms, selectedFloor, filterType, searchTerm, roomOccupantsMap]);

  // Handlers for Add / Edit Room
  const openAddRoomModal = (defaultFloor?: number) => {
    const floorToUse = defaultFloor || (typeof selectedFloor === "number" ? selectedFloor : 1);
    setFormRoomFloor(floorToUse);
    setFormRoomId(`P.${floorToUse}0${rooms.filter((r) => r.floor === floorToUse).length + 1}`);
    setFormRoomName(`Phòng ${floorToUse}0${rooms.filter((r) => r.floor === floorToUse).length + 1}`);
    setFormRoomType("bedroom");
    setFormRoomCapacity(2);
    setFormRoomArea(24);
    setFormRoomDescription("");
    setFormRoomAmenities(["Điều hòa", "WC khép kín", "Bàn học cá nhân"]);
    setIsAddRoomModalOpen(true);
  };

  const openEditRoomModal = (room: Room) => {
    setEditingRoom(room);
    setFormRoomFloor(room.floor);
    setFormRoomId(room.id);
    setFormRoomName(room.name);
    setFormRoomType(room.type);
    setFormRoomCapacity(room.capacity);
    setFormRoomArea(room.areaM2 || 20);
    setFormRoomDescription(room.description || "");
    setFormRoomAmenities(room.amenities || []);
    setIsEditRoomModalOpen(true);
  };

  const handleSaveAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoomId.trim() || !formRoomName.trim()) {
      showToast("error", "Vui lòng nhập mã và tên phòng.");
      return;
    }
    // Check duplicate ID
    if (rooms.some((r) => r.id.toLowerCase() === formRoomId.trim().toLowerCase())) {
      showToast("error", `Mã phòng ${formRoomId} đã tồn tại!`);
      return;
    }

    const newRoom: Room = {
      id: formRoomId.trim(),
      name: formRoomName.trim(),
      floor: formRoomFloor,
      type: formRoomType,
      capacity: formRoomType === "bedroom" ? Number(formRoomCapacity) : 0,
      areaM2: Number(formRoomArea) || 20,
      description: formRoomDescription.trim(),
      amenities: formRoomAmenities,
      status: "active",
    };

    addRoom(newRoom);
    setIsAddRoomModalOpen(false);
  };

  const handleSaveEditRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    updateRoom(editingRoom.id, {
      name: formRoomName.trim(),
      floor: formRoomFloor,
      type: formRoomType,
      capacity: formRoomType === "bedroom" ? Number(formRoomCapacity) : 0,
      areaM2: Number(formRoomArea) || 20,
      description: formRoomDescription.trim(),
      amenities: formRoomAmenities,
    });

    if (selectedRoomForDetail && selectedRoomForDetail.id === editingRoom.id) {
      setSelectedRoomForDetail({
        ...selectedRoomForDetail,
        name: formRoomName.trim(),
        floor: formRoomFloor,
        type: formRoomType,
        capacity: formRoomType === "bedroom" ? Number(formRoomCapacity) : 0,
        areaM2: Number(formRoomArea) || 20,
        description: formRoomDescription.trim(),
        amenities: formRoomAmenities,
      });
    }

    setIsEditRoomModalOpen(false);
    setEditingRoom(null);
  };

  const handleAddRoomWithShape = (roomData: Omit<Room, "id">) => {
    const countOnFloor = rooms.filter((r) => r.floor === roomData.floor).length + 1;
    const newId = `P.${roomData.floor}0${countOnFloor}`;
    addRoom({
      ...roomData,
      id: newId,
    });
  };

  const handleDuplicateRoom = (room: Room) => {
    const countOnFloor = rooms.filter((r) => r.floor === room.floor).length + 1;
    const newId = `P.${room.floor}0${countOnFloor}`;
    addRoom({
      ...room,
      id: newId,
      name: `${room.name} (Bản sao)`,
      x: (room.x || 30) + 30,
      y: (room.y || 30) + 30,
    });
  };

  const toggleAmenity = (amenity: string) => {
    if (formRoomAmenities.includes(amenity)) {
      setFormRoomAmenities(formRoomAmenities.filter((a) => a !== amenity));
    } else {
      setFormRoomAmenities([...formRoomAmenities, amenity]);
    }
  };

  // Floor handlers
  const openAddFloorModal = () => {
    const nextId = floors.length > 0 ? Math.max(...floors.map((f) => f.id)) + 1 : 1;
    setFormFloorId(nextId);
    setFormFloorName(`Tầng ${nextId}`);
    setFormFloorCode(`T${nextId}`);
    setFormFloorDesc("");
    setIsAddFloorModalOpen(true);
  };

  const handleSaveAddFloor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFloorName.trim()) {
      showToast("error", "Vui lòng nhập tên tầng.");
      return;
    }
    const newFloor: Floor = {
      id: formFloorId,
      name: formFloorName.trim(),
      code: formFloorCode.trim() || `T${formFloorId}`,
      description: formFloorDesc.trim() || `Khu vực Tầng ${formFloorId}`,
    };
    addFloor(newFloor);
    setIsAddFloorModalOpen(false);
  };

  // Escape key listener for all modals in so-do-nha
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRoomForDetail) setSelectedRoomForDetail(null);
        if (isTransferModalOpen) setIsTransferModalOpen(false);
        if (isAssignModalOpen) setIsAssignModalOpen(false);
        if (isAddRoomModalOpen || isEditRoomModalOpen) {
          setIsAddRoomModalOpen(false);
          setIsEditRoomModalOpen(false);
          setEditingRoom(null);
        }
        if (isAddFloorModalOpen) setIsAddFloorModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedRoomForDetail,
    isTransferModalOpen,
    isAssignModalOpen,
    isAddRoomModalOpen,
    isEditRoomModalOpen,
    isAddFloorModalOpen,
  ]);

  // Quick Move Member Handler
  const handleOpenTransferModal = (memberId?: string) => {
    if (memberId) {
      setTransferMemberId(memberId);
    } else if (members.length > 0) {
      setTransferMemberId(members[0].id);
    }
    // Pick first available room
    const firstAvail = rooms.find(
      (r) => r.type === "bedroom" && (roomOccupantsMap[r.id] || []).length < r.capacity
    );
    setTransferTargetRoomId(firstAvail ? firstAvail.id : (rooms[0]?.id || ""));
    setIsTransferModalOpen(true);
  };

  const handleConfirmTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMemberId || !transferTargetRoomId) {
      showToast("error", "Vui lòng chọn thành viên và phòng đích.");
      return;
    }
    const targetRoom = rooms.find((r) => r.id === transferTargetRoomId);
    if (targetRoom && targetRoom.type === "bedroom") {
      const currentOccupants = members.filter(
        (m) => m.room === transferTargetRoomId && m.id !== transferMemberId
      );
      if (currentOccupants.length >= targetRoom.capacity) {
        showToast(
          "error",
          `Không thể chuyển! ${targetRoom.name} đã đủ tối đa ${targetRoom.capacity} người (${currentOccupants.map((o) => o.fullName).join(", ")}).`
        );
        return;
      }
    }
    moveMemberToRoom(transferMemberId, transferTargetRoomId);
    setIsTransferModalOpen(false);
  };

  // Assign Member to Room handler
  const handleOpenAssignModal = (roomId: string) => {
    setAssignRoomId(roomId);
    // Find members not in this room
    const candidate = members.find((m) => m.room !== roomId);
    setAssignMemberId(candidate ? candidate.id : (members[0]?.id || ""));
    setIsAssignModalOpen(true);
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignMemberId || !assignRoomId) return;
    const targetRoom = rooms.find((r) => r.id === assignRoomId);
    if (targetRoom && targetRoom.type === "bedroom") {
      const currentOccupants = members.filter(
        (m) => m.room === assignRoomId && m.id !== assignMemberId
      );
      if (currentOccupants.length >= targetRoom.capacity) {
        showToast(
          "error",
          `Không thể thêm! ${targetRoom.name} đã đủ tối đa ${targetRoom.capacity} người (${currentOccupants.map((o) => o.fullName).join(", ")}).`
        );
        return;
      }
    }
    moveMemberToRoom(assignMemberId, assignRoomId);
    setIsAssignModalOpen(false);
  };

  return (
    <div className="flex flex-col w-full gap-6 pb-12">
      {/* 1. HEADER & ACTIONS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-purple-50 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-purple-100/70 text-primary">
              <Building2 className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Sơ Đồ Nhà & Phòng Ở</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-primary border border-purple-200">
              Trực quan 2.0
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Quản lý kiến trúc các tầng, phân bổ chỗ ở sinh viên và điều chuyển phòng linh hoạt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* View Mode Switcher: Canvas vs Cards */}
          <div className="flex items-center p-1 bg-gray-100 rounded-2xl border border-gray-200">
            <button
              onClick={() => setViewMode("canvas")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                viewMode === "canvas"
                  ? "bg-white text-primary shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <span>🗺️ Canva Kéo Thả</span>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                viewMode === "cards"
                  ? "bg-white text-primary shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <span>📋 Danh Sách Thẻ</span>
            </button>
          </div>

          {/* Builder mode toggle (sửa cấu trúc nhà) */}
          {canStructure && (
            <button
              onClick={() => setIsBuilderMode((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 border",
                isBuilderMode ? "bg-amber-400 text-gray-950 border-amber-500" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"
              )}
              title="Bật/tắt chế độ chỉnh sửa phòng & tầng"
            >
              <Settings2 className="w-4 h-4" />
              <span>{isBuilderMode ? "Đang chỉnh sửa sơ đồ" : "Chỉnh sửa sơ đồ"}</span>
            </button>
          )}
          {canStructure && isBuilderMode && (
            <button
              onClick={() => openAddFloorModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs border border-purple-200 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm tầng</span>
            </button>
          )}

          {/* Quick Transfer Button */}
          {canManageHouse && (
            <button
              onClick={() => handleOpenTransferModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white font-bold text-xs shadow-md shadow-purple-200 transition-all active:scale-95"
              title="Chuyển phòng nhanh cho thành viên"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Điều chuyển phòng</span>
            </button>
          )}
        </div>
      </div>

      {/* FIXED FLOORPLAN ARCHITECTURE BANNER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-purple-50/70 border border-purple-200/80 rounded-2xl text-purple-900 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-purple-600 text-white shrink-0 shadow-xs">
            <Building2 className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-xs font-bold text-purple-950">
              Sơ Đồ Mặt Bằng Cố Định (Fixed Architecture)
            </h4>
            <p className="text-[11px] text-purple-700">
              Sơ đồ bố trí cố định chuẩn lưu xá. Bạn có thể <strong>kéo thả trực tiếp thẻ thành viên</strong> từ Khay thành viên vào từng phòng trên bản đồ, hoặc bấm vào phòng để xem danh sách &amp; sắp xếp chỗ ở.
            </p>
          </div>
        </div>
        {canManageHouse && (
          <button
            onClick={() => handleOpenTransferModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition-colors whitespace-nowrap self-stretch sm:self-auto justify-center"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
            <span>Xếp phòng nhanh</span>
          </button>
        )}
      </div>

      {/* 2. STAT KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Rooms */}
        <div className="bg-white p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500">Tổng số phòng</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900">{rooms.length}</span>
              <span className="text-[11px] font-semibold text-gray-400">({bedroomRooms.length} ngủ)</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Total Beds */}
        <div className="bg-white p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500">Tổng chỗ ở</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900">{totalBeds}</span>
              <span className="text-[11px] font-semibold text-gray-400">giường</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Bed className="w-6 h-6" />
          </div>
        </div>

        {/* Occupied */}
        <div className="bg-white p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500">Đang có người ở</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{totalOccupiedBeds}</span>
              <span className="text-[11px] font-bold text-emerald-500">({occupancyRate}%)</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Available Beds */}
        <div className="bg-white p-5 rounded-3xl border border-purple-50 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-500">Chỗ trống sẵn sàng</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">{totalAvailableBeds}</span>
              <span className="text-[11px] font-semibold text-amber-500">chỗ đón mới</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. CONTROLS: FLOOR SELECTOR TABS & SEARCH/FILTERS */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 rounded-3xl border border-purple-50 shadow-xs">
        {/* Floor Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 custom-scroll">
          <button
            onClick={() => setSelectedFloor("all")}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
              selectedFloor === "all"
                ? "bg-primary text-white shadow-sm shadow-purple-200"
                : "bg-gray-50 text-gray-600 hover:bg-purple-50 hover:text-primary"
            )}
          >
            Tất cả các tầng ({rooms.length})
          </button>
          {floors.map((floor) => {
            const count = rooms.filter((r) => r.floor === floor.id).length;
            const isSelected = selectedFloor === floor.id;
            return (
              <button
                key={floor.id}
                onClick={() => setSelectedFloor(floor.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all",
                  isSelected
                    ? "bg-primary text-white shadow-sm shadow-purple-200"
                    : "bg-gray-50 text-gray-600 hover:bg-purple-50 hover:text-primary"
                )}
              >
                <span>{floor.code} - {floor.name}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px]",
                    isSelected ? "bg-white/20 text-white" : "bg-gray-200/70 text-gray-600"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Type filter */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm phòng, bạn ở..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-primary transition-all font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Pill */}
          <div className="w-56 shrink-0">
            <CustomSelect
              value={filterType}
              onChange={(val) => setFilterType(val as any)}
              options={[
                { value: "all", label: "Tất cả loại phòng" },
                { value: "bedroom", label: "Chỉ phòng ngủ" },
                { value: "available", label: "Chỉ phòng còn chỗ trống" },
                { value: "full", label: "Phòng đã đầy" },
                { value: "facility", label: "Tiện ích sinh hoạt chung" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 4. ARCHITECTURAL FLOORPLAN DISPLAY */}
      {viewMode === "canvas" ? (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          <FloorplanCanvas
            floors={floors}
            activeFloorId={typeof selectedFloor === "number" ? selectedFloor : (floors[0]?.id || 1)}
            onSelectFloor={(flId) => setSelectedFloor(flId)}
            rooms={rooms}
            members={members}
            readOnly={!canManageHouse}
            roomOccupantsMap={roomOccupantsMap}
            onUpdateRoomPosition={(roomId, x, y, w, h) => {
              updateRoom(roomId, { x, y, w, h });
            }}
            onAddRoomWithShape={handleAddRoomWithShape}
            onDuplicateRoom={handleDuplicateRoom}
            onMoveMember={(memberId, targetRoomId) => {
              moveMemberToRoom(memberId, targetRoomId);
            }}
            onRemoveMember={(memberId) => {
              removeMemberFromRoom(memberId);
            }}
            onSelectRoom={(room) => {
              setSelectedRoomForDetail(room);
            }}
            onEditRoom={(room) => {
              openEditRoomModal(room);
            }}
            onDeleteRoom={(roomId) => {
              deleteRoom(roomId);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {floors
            .filter((f) => selectedFloor === "all" || selectedFloor === f.id)
            .map((floor) => {
              const floorRooms = filteredRooms.filter((r) => r.floor === floor.id);

              return (
                <div key={floor.id} className="flex flex-col gap-4">
                  {/* Floor Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center font-black text-primary text-sm">
                    {floor.code}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{floor.name}</h2>
                    <p className="text-xs text-gray-500 font-medium">{floor.description}</p>
                  </div>
                </div>

                {canStructure && isBuilderMode && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAddRoomModal(floor.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs border border-purple-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm phòng tầng này</span>
                    </button>
                    {floors.length > 1 && (
                      <button
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Xác nhận xóa tầng",
                            message: (
                              <span>
                                Bạn có chắc muốn xóa <strong className="text-gray-900 font-bold">{floor.name}</strong> và toàn bộ các phòng thuộc tầng này? Thao tác này không thể hoàn tác.
                              </span>
                            ),
                            confirmText: "Xóa tầng",
                            variant: "danger",
                            onConfirm: () => deleteFloor(floor.id),
                          });
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa tầng</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Rooms Grid for this floor */}
              {floorRooms.length === 0 ? (
                <div className="bg-white/60 rounded-3xl border border-dashed border-gray-200 p-8 text-center flex flex-col items-center justify-center">
                  <DoorOpen className="w-10 h-10 text-gray-300 mb-2" />
                  <p className="text-xs font-semibold text-gray-500">
                    Không tìm thấy phòng phù hợp trên tầng này.
                  </p>
                  {canStructure && isBuilderMode && (
                    <button
                      onClick={() => openAddRoomModal(floor.id)}
                      className="mt-3 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold"
                    >
                      + Tạo phòng đầu tiên cho {floor.name}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {floorRooms.map((room) => {
                    const occupants = roomOccupantsMap[room.id] || [];
                    const typeConfig = ROOM_TYPE_LABELS[room.type] || ROOM_TYPE_LABELS.other;
                    const TypeIcon = typeConfig.icon;
                    const isBedroom = room.type === "bedroom";
                    const isFull = isBedroom && occupants.length >= room.capacity;
                    const isAvailable = isBedroom && occupants.length < room.capacity;
                    const isEmpty = isBedroom && occupants.length === 0;

                    return (
                      <div
                        key={room.id}
                        className={cn(
                          "group relative bg-white rounded-3xl p-5 border transition-all duration-200 hover:shadow-md flex flex-col justify-between gap-4",
                          isBedroom
                            ? isFull
                              ? "border-purple-100 hover:border-purple-300"
                              : isEmpty
                              ? "border-emerald-200 bg-emerald-50/20 hover:border-emerald-300"
                              : "border-purple-200 bg-purple-50/10 hover:border-purple-300"
                            : "border-gray-200/80 bg-gray-50/40 hover:border-gray-300"
                        )}
                      >
                        {/* Top: Header & Badges */}
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={cn(
                                  "w-10 h-10 rounded-2xl flex items-center justify-center border font-bold",
                                  typeConfig.bg,
                                  typeConfig.color
                                )}
                              >
                                <TypeIcon className="w-5 h-5" />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-black text-gray-900 group-hover:text-primary transition-colors">
                                    {room.name}
                                  </h3>
                                  <span className="text-[11px] font-bold text-gray-400">
                                    {room.id}
                                  </span>
                                </div>
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", typeConfig.bg, typeConfig.color)}>
                                  {typeConfig.label}
                                </span>
                              </div>
                            </div>

                            {/* Capacity or Facility badge */}
                            {isBedroom ? (
                              <div
                                className={cn(
                                  "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border",
                                  isFull
                                    ? "bg-purple-100/70 text-primary border-purple-200"
                                    : isEmpty
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                )}
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>
                                  {occupants.length}/{room.capacity}
                                </span>
                              </div>
                            ) : (
                              <div className="px-2.5 py-1 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                                {room.areaM2 ? `${room.areaM2} m²` : "Khu sinh hoạt"}
                              </div>
                            )}
                          </div>

                          {/* Room Description or Notes */}
                          {room.description && (
                            <p className="text-[11px] text-gray-500 font-medium line-clamp-2 mt-1 mb-2">
                              {room.description}
                            </p>
                          )}

                          {/* Occupants Avatars & List */}
                          {isBedroom && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                                Thành viên đang ở ({occupants.length})
                              </span>

                              {occupants.length === 0 ? (
                                <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-50/60 border border-emerald-100 text-emerald-700 text-xs font-semibold">
                                  <Sparkles className="w-4 h-4 shrink-0 text-emerald-500" />
                                  <span>Phòng trống sẵn sàng tiếp nhận!</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {occupants.map((occ) => (
                                    <div
                                      key={occ.id}
                                      className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 hover:bg-purple-50/80 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center font-bold text-[10px]">
                                          {occ.avatarText}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-bold text-gray-800 leading-tight">
                                            {occ.fullName}
                                          </span>
                                          <span className="text-[10px] text-gray-400 font-medium">
                                            {occ.role} · {occ.phone}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenTransferModal(occ.id);
                                        }}
                                        className="p-1 rounded-lg hover:bg-purple-100 text-gray-400 hover:text-primary transition-colors"
                                        title="Chuyển sang phòng khác"
                                      >
                                        <ArrowRightLeft className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Amenities Tags */}
                          {room.amenities && room.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {room.amenities.slice(0, 3).map((a, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600"
                                >
                                  {a}
                                </span>
                              ))}
                              {room.amenities.length > 3 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-gray-100 text-gray-500">
                                  +{room.amenities.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <button
                            onClick={() => setSelectedRoomForDetail(room)}
                            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-[#4d2dbf] transition-colors"
                          >
                            <span>Xem chi tiết</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <div className="flex items-center gap-1.5">
                            {canManageHouse && isBedroom && occupants.length < room.capacity && (
                              <button
                                onClick={() => handleOpenAssignModal(room.id)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs border border-purple-200 transition-colors"
                                title="Thêm thành viên vào phòng này"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Thêm người</span>
                              </button>
                            )}

                            {canStructure && isBuilderMode && (
                              <>
                                <button
                                  onClick={() => openEditRoomModal(room)}
                                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
                                  title="Chỉnh sửa thông tin phòng"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Xác nhận xóa phòng",
                                      message: (
                                        <span>
                                          Bạn có chắc muốn xóa <strong className="text-gray-900 font-bold">{room.name}</strong>? Các thành viên đang ở phòng này sẽ được chuyển về trạng thái "Chưa xếp phòng".
                                        </span>
                                      ),
                                      confirmText: "Xóa phòng",
                                      variant: "danger",
                                      onConfirm: () => deleteRoom(room.id),
                                    });
                                  }}
                                  className="p-1.5 rounded-xl hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-colors"
                                  title="Xóa phòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* 5. MODAL: ROOM DETAIL VIEW */}
      {mounted && selectedRoomForDetail && createPortal(
        <div
          onClick={() => setSelectedRoomForDetail(null)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            >
              {/* Modal Header */}
              <div className="shrink-0 flex items-start justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-primary flex items-center justify-center font-bold text-lg">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-gray-900">
                        {selectedRoomForDetail.name} ({selectedRoomForDetail.id})
                      </h2>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-purple-50 text-primary border border-purple-200">
                        Tầng {selectedRoomForDetail.floor}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      {ROOM_TYPE_LABELS[selectedRoomForDetail.type]?.label || "Phòng"} · Diện tích: {selectedRoomForDetail.areaM2 || 24}m²
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRoomForDetail(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 custom-scroll">

            {/* Description */}
            {selectedRoomForDetail.description && (
              <div className="p-3.5 rounded-2xl bg-gray-50 text-xs text-gray-600 leading-relaxed font-medium">
                {selectedRoomForDetail.description}
              </div>
            )}

            {/* Amenities */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Trang thiết bị & Tiện nghi phòng
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedRoomForDetail.amenities.map((item, idx) => (
                  <span
                    key={idx}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50/70 text-primary text-xs font-bold border border-purple-100"
                  >
                    <Check className="w-3.5 h-3.5 text-primary" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Residents in this room */}
            {selectedRoomForDetail.type === "bedroom" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Thành viên đang cư trú ({(roomOccupantsMap[selectedRoomForDetail.id] || []).length}/
                    {selectedRoomForDetail.capacity})
                  </h4>
                  {canManageHouse && (roomOccupantsMap[selectedRoomForDetail.id] || []).length < selectedRoomForDetail.capacity && (
                    <button
                      onClick={() => {
                        handleOpenAssignModal(selectedRoomForDetail.id);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Xếp thêm bạn vào phòng</span>
                    </button>
                  )}
                </div>

                {(roomOccupantsMap[selectedRoomForDetail.id] || []).length === 0 ? (
                  <div className="p-6 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-center">
                    <p className="text-xs font-bold text-emerald-800">
                      Phòng hiện đang trống hoàn toàn.
                    </p>
                    <p className="text-[11px] text-emerald-600 mt-1">
                      Sẵn sàng tiếp nhận {selectedRoomForDetail.capacity} sinh viên mới nhập lưu xá.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(roomOccupantsMap[selectedRoomForDetail.id] || []).map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center font-bold text-sm">
                            {m.avatarText}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-900">{m.fullName}</span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-primary">
                                {m.role}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {m.phone}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Vào: {m.joined}
                              </span>
                            </div>
                          </div>
                        </div>

                        {canManageHouse && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedRoomForDetail(null);
                                handleOpenTransferModal(m.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-primary font-bold text-xs transition-colors"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Chuyển phòng</span>
                            </button>
                            <button
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: "Hủy xếp phòng cho thành viên",
                                  message: (
                                    <span>
                                      Bạn có chắc muốn hủy xếp phòng cho bạn{" "}
                                      <strong className="text-gray-900 font-bold">{m.fullName}</strong>?
                                      Thành viên sẽ được đưa về trạng thái "Chưa xếp phòng".
                                    </span>
                                  ),
                                  confirmText: "Hủy gán phòng",
                                  variant: "warning",
                                  onConfirm: () => removeMemberFromRoom(m.id),
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-xl hover:bg-rose-50 text-rose-500 font-bold text-xs transition-colors"
                              title="Rời khỏi phòng này"
                            >
                              Hủy gán
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

              </div>

              {/* Modal Actions */}
              <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                {canStructure && (
                  <button
                    onClick={() => {
                      const room = selectedRoomForDetail;
                      setSelectedRoomForDetail(null);
                      openEditRoomModal(room);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Chỉnh sửa phòng</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedRoomForDetail(null)}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 6. MODAL: QUICK MOVE / TRANSFER MEMBER */}
      {mounted && isTransferModalOpen && createPortal(
        <div
          onClick={() => setIsTransferModalOpen(false)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            >
              <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-100 text-primary">
                    <ArrowRightLeft className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-black text-gray-900">Điều Chuyển Phòng Nhanh</h3>
                </div>
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmTransfer} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  {/* Member Selection */}
                  <CustomSelect
                    label="1. Chọn thành viên cần chuyển:"
                    value={transferMemberId}
                    onChange={setTransferMemberId}
                    options={members.map((m) => ({
                      value: m.id,
                      label: m.fullName,
                      subLabel: `${m.room ? `Hiện ở ${m.room}` : "Chưa có phòng"} • ${m.role}`,
                    }))}
                  />

                  {/* Destination Room */}
                  <CustomSelect
                    label="2. Chọn phòng chuyển đến:"
                    value={transferTargetRoomId}
                    onChange={setTransferTargetRoomId}
                    options={bedroomRooms.map((r) => {
                      const occ = (roomOccupantsMap[r.id] || []).length;
                      const slotsLeft = r.capacity - occ;
                      return {
                        value: r.id,
                        label: `${r.name} (Tầng ${r.floor})`,
                        subLabel: slotsLeft > 0 ? `Còn ${slotsLeft} chỗ trống` : "⚠️ Đã đủ người",
                      };
                    })}
                  />

                  <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-[11px] text-purple-900 leading-relaxed font-medium">
                    💡 Hệ thống sẽ tự động cập nhật số phòng trong hồ sơ thành viên, đối soát thu chi quỹ và danh bạ liên lạc ngay lập tức.
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                  >
                    Xác nhận chuyển
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 7. MODAL: ASSIGN MEMBER TO SPECIFIC ROOM */}
      {mounted && isAssignModalOpen && createPortal(
        <div
          onClick={() => setIsAssignModalOpen(false)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            >
              <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-100 text-primary">
                    <UserPlus className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-black text-gray-900">
                    Xếp Thành Viên Vào {assignRoomId}
                  </h3>
                </div>
                <button
                  onClick={() => setIsAssignModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmAssign} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <CustomSelect
                    label="Chọn thành viên muốn gán vào phòng này:"
                    value={assignMemberId}
                    onChange={setAssignMemberId}
                    options={members.map((m) => ({
                      value: m.id,
                      label: m.fullName,
                      subLabel: m.room ? `Hiện ở ${m.room}` : "Chưa có phòng",
                    }))}
                  />
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                  >
                    Xếp vào phòng
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 8. MODAL: ADD / EDIT ROOM FORM */}
      {mounted && (isAddRoomModalOpen || isEditRoomModalOpen) && createPortal(
        <div
          onClick={() => {
            setIsAddRoomModalOpen(false);
            setIsEditRoomModalOpen(false);
            setEditingRoom(null);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            >
              <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-100 text-primary">
                    {isEditRoomModalOpen ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </span>
                  <h3 className="text-base font-black text-gray-900">
                    {isEditRoomModalOpen ? `Chỉnh Sửa ${editingRoom?.name}` : "Thêm Phòng Mới Vào Sơ Đồ"}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsAddRoomModalOpen(false);
                    setIsEditRoomModalOpen(false);
                    setEditingRoom(null);
                  }}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={isEditRoomModalOpen ? handleSaveEditRoom : handleSaveAddRoom}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 custom-scroll">
              <div className="grid grid-cols-2 gap-3">
                {/* Floor select */}
                <CustomSelect
                  label="Vị trí Tầng"
                  value={formRoomFloor}
                  onChange={(val) => setFormRoomFloor(Number(val))}
                  options={floors.map((f) => ({
                    value: f.id,
                    label: f.name,
                  }))}
                />

                {/* Room ID */}
                <CustomInput
                  label="Mã phòng"
                  type="text"
                  value={formRoomId}
                  onChange={(e) => setFormRoomId(e.target.value)}
                  placeholder="VD: P.106"
                  disabled={isEditRoomModalOpen}
                  required
                />
              </div>

              {/* Room Name */}
              <CustomInput
                label="Tên hiển thị phòng"
                type="text"
                value={formRoomName}
                onChange={(e) => setFormRoomName(e.target.value)}
                placeholder="VD: Phòng 106 (Gần ban công)"
                required
              />

              {/* Room Type & Capacity */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <CustomSelect
                  label="Loại phòng"
                  value={formRoomType}
                  onChange={(val) => setFormRoomType(val as RoomType)}
                  options={[
                    { value: "bedroom", label: "Phòng ngủ sinh viên" },
                    { value: "common", label: "Phòng sinh hoạt chung" },
                    { value: "chapel", label: "Nhà nguyện" },
                    { value: "kitchen", label: "Bếp & Nhà ăn" },
                    { value: "laundry", label: "Giặt & Sân phơi" },
                    { value: "storage", label: "Kho & Kỹ thuật" },
                    { value: "other", label: "Khác" },
                  ]}
                />

                {formRoomType === "bedroom" ? (
                  <CustomInput
                    label="Sức chứa (giường)"
                    type="number"
                    min={1}
                    max={8}
                    value={formRoomCapacity}
                    onChange={(e) => setFormRoomCapacity(Number(e.target.value))}
                    required
                  />
                ) : (
                  <CustomInput
                    label="Diện tích (m²)"
                    type="number"
                    min={5}
                    max={200}
                    value={formRoomArea}
                    onChange={(e) => setFormRoomArea(Number(e.target.value))}
                  />
                )}
              </div>

              {/* Amenities Selector Chips */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Tiện ích trang bị sẵn trong phòng
                </label>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_OPTIONS.map((amenity) => {
                    const isSelected = formRoomAmenities.includes(amenity);
                    return (
                      <button
                        key={amenity}
                        type="button"
                        onClick={() => toggleAmenity(amenity)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                          isSelected
                            ? "bg-purple-100 text-primary border-purple-300 shadow-2xs"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        {isSelected && "✓ "}
                        {amenity}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <CustomTextarea
                label="Mô tả / Ghi chú đặc điểm phòng"
                rows={2}
                value={formRoomDescription}
                onChange={(e) => setFormRoomDescription(e.target.value)}
                placeholder="VD: Cửa sổ hướng Đông, có ban công thoáng mát..."
              />
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
              <button
                type="button"
                onClick={() => {
                  setIsAddRoomModalOpen(false);
                  setIsEditRoomModalOpen(false);
                  setEditingRoom(null);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
              >
                {isEditRoomModalOpen ? "Lưu thay đổi" : "Tạo phòng"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )}

      {/* 9. MODAL: ADD FLOOR FORM */}
      {mounted && isAddFloorModalOpen && createPortal(
        <div
          onClick={() => setIsAddFloorModalOpen(false)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-50 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            >
              <div className="shrink-0 flex items-center justify-between p-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-100 text-primary">
                    <Layers className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-black text-gray-900">Thêm Tầng Mới</h3>
                </div>
                <button
                  onClick={() => setIsAddFloorModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAddFloor} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <CustomInput
                      label="Số tầng"
                      type="number"
                      value={formFloorId}
                      onChange={(e) => setFormFloorId(Number(e.target.value))}
                      required
                    />
                    <CustomInput
                      label="Mã tầng"
                      type="text"
                      value={formFloorCode}
                      onChange={(e) => setFormFloorCode(e.target.value)}
                      placeholder="VD: T4"
                      required
                    />
                  </div>

                  <CustomInput
                    label="Tên tầng"
                    type="text"
                    value={formFloorName}
                    onChange={(e) => setFormFloorName(e.target.value)}
                    placeholder="VD: Tầng 4 (Khu mở rộng)"
                    required
                  />

                  <CustomTextarea
                    label="Mô tả chức năng"
                    rows={2}
                    value={formFloorDesc}
                    onChange={(e) => setFormFloorDesc(e.target.value)}
                    placeholder="VD: Khu phòng tự học mở và sân vườn cà phê sinh viên..."
                  />
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 p-4 px-6 border-t border-gray-100 bg-gray-50/70">
                  <button
                    type="button"
                    onClick={() => setIsAddFloorModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95"
                  >
                    Tạo tầng mới
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
