"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Bed,
  Users,
  Church,
  UtensilsCrossed,
  Wind,
  Package,
  DoorOpen,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  Sparkles,
  GripVertical,
  Plus,
  ArrowRightLeft,
  User,
  Trash2,
  Edit2,
  Compass,
  Copy,
  X,
  Check,
  Layers,
  ChevronDown,
  Info,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  ArrowUpDown,
  Footprints,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { Room, RoomType, Member, Floor } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const GRID_SIZE = 20;

export const ROOM_TYPE_THEMES: Record<
  RoomType,
  { label: string; icon: any; border: string; bg: string; text: string; lightBg: string }
> = {
  bedroom: {
    label: "Phòng ngủ",
    icon: Bed,
    border: "border-purple-300",
    bg: "bg-purple-600",
    text: "text-purple-700",
    lightBg: "bg-purple-50/80",
  },
  common: {
    label: "Sinh hoạt chung",
    icon: Users,
    border: "border-emerald-300",
    bg: "bg-emerald-600",
    text: "text-emerald-700",
    lightBg: "bg-emerald-50/80",
  },
  chapel: {
    label: "Nhà nguyện",
    icon: Church,
    border: "border-indigo-300",
    bg: "bg-indigo-600",
    text: "text-indigo-700",
    lightBg: "bg-indigo-50/80",
  },
  kitchen: {
    label: "Bếp & Ăn",
    icon: UtensilsCrossed,
    border: "border-amber-300",
    bg: "bg-amber-600",
    text: "text-amber-700",
    lightBg: "bg-amber-50/80",
  },
  laundry: {
    label: "Giặt & Phơi",
    icon: Wind,
    border: "border-cyan-300",
    bg: "bg-cyan-600",
    text: "text-cyan-700",
    lightBg: "bg-cyan-50/80",
  },
  storage: {
    label: "Kho & Kỹ thuật",
    icon: Package,
    border: "border-gray-300",
    bg: "bg-gray-600",
    text: "text-gray-700",
    lightBg: "bg-gray-100",
  },
  stairs: {
    label: "Cầu thang bộ",
    icon: ArrowUpDown,
    border: "border-indigo-400",
    bg: "bg-indigo-600",
    text: "text-indigo-800",
    lightBg: "bg-indigo-50/90",
  },
  corridor: {
    label: "Hành lang",
    icon: Footprints,
    border: "border-purple-300",
    bg: "bg-purple-500",
    text: "text-purple-700",
    lightBg: "bg-purple-50/60",
  },
  other: {
    label: "Khác",
    icon: DoorOpen,
    border: "border-blue-300",
    bg: "bg-blue-600",
    text: "text-blue-700",
    lightBg: "bg-blue-50/80",
  },
};

// Preset room templates available in the Shape Palette
interface ShapeTemplate {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
  areaM2: number;
  w: number;
  h: number;
  description: string;
  amenities: string[];
}

const PRESET_SHAPES: ShapeTemplate[] = [
  {
    id: "shape-bed-2",
    name: "Phòng Ngủ Đôi (Chuẩn)",
    type: "bedroom",
    capacity: 2,
    areaM2: 24,
    w: 230,
    h: 180,
    description: "Phòng ngủ tiêu chuẩn 2 giường đơn, ban công thoáng và WC khép kín.",
    amenities: ["Điều hòa", "WC khép kín", "Bàn học đôi", "Tủ quần áo"],
  },
  {
    id: "shape-bed-4",
    name: "Phòng Ngủ Lớn (4 Giường)",
    type: "bedroom",
    capacity: 4,
    areaM2: 36,
    w: 280,
    h: 210,
    description: "Phòng rộng 4 giường tầng thông minh cho sinh viên năm nhất.",
    amenities: ["Điều hòa", "WC khép kín", "4 Bàn học", "Tủ đồ cá nhân"],
  },
  {
    id: "shape-bed-1",
    name: "Phòng Đơn / Tiếp Khách",
    type: "bedroom",
    capacity: 1,
    areaM2: 18,
    w: 200,
    h: 160,
    description: "Phòng đơn yên tĩnh đón phụ huynh, quý Cha hoặc sinh viên năm cuối.",
    amenities: ["Điều hòa", "Bàn làm việc", "WC riêng"],
  },
  {
    id: "shape-common",
    name: "Sinh Hoạt Chung & Tự Học",
    type: "common",
    capacity: 0,
    areaM2: 40,
    w: 300,
    h: 220,
    description: "Không gian học tập nhóm, hội họp huynh đệ và đón khách.",
    amenities: ["Máy chiếu HD", "Bảng từ trắng", "Bàn họp lớn", "Wifi tốc độ cao"],
  },
  {
    id: "shape-chapel",
    name: "Nguyện Đường Assisi",
    type: "chapel",
    capacity: 0,
    areaM2: 45,
    w: 320,
    h: 240,
    description: "Không gian thánh thiêng cử hành Kinh Tối và Chầu Thánh Thể.",
    amenities: ["Bàn thờ gỗ", "Đàn Organ", "Hệ thống âm thanh", "Thảm quỳ"],
  },
  {
    id: "shape-kitchen",
    name: "Gian Bếp & Phòng Ăn",
    type: "kitchen",
    capacity: 0,
    areaM2: 38,
    w: 280,
    h: 200,
    description: "Gian bếp chung nấu nướng bữa trưa/tối huynh đệ mỗi ngày.",
    amenities: ["Bếp gas đôi", "Tủ lạnh 4 cánh", "Bàn ăn 16 chỗ", "Máy lọc nước RO"],
  },
  {
    id: "shape-laundry",
    name: "Khu Giặt & Sân Phơi",
    type: "laundry",
    capacity: 0,
    areaM2: 28,
    w: 240,
    h: 170,
    description: "Khu vực máy giặt và giàn phơi quần áo đón nắng tự nhiên.",
    amenities: ["2 Máy giặt", "Giàn phơi inox", "Mái che lấy sáng"],
  },
  {
    id: "shape-storage",
    name: "Kho Kỹ Thuật & Dụng Cụ",
    type: "storage",
    capacity: 0,
    areaM2: 15,
    w: 180,
    h: 140,
    description: "Nơi cất giữ đồ nghề sửa chữa, dụng cụ lao động và vật tư dự phòng.",
    amenities: ["Kệ sắt chịu lực", "Hộp đồ nghề", "Thang nhôm"],
  },
  {
    id: "shape-stairs",
    name: "Cầu Thang Bộ (Lên / Xuống)",
    type: "stairs",
    capacity: 0,
    areaM2: 10,
    w: 110,
    h: 80,
    description: "Khối kiến trúc cầu thang bộ kết nối giao thông giữa các tầng lầu.",
    amenities: ["Tay vịn gỗ", "Đèn cảm ứng ban đêm", "Bình cứu hỏa"],
  },
  {
    id: "shape-corridor",
    name: "Hành Lang & Lối Đi Chung",
    type: "corridor",
    capacity: 0,
    areaM2: 20,
    w: 100,
    h: 260,
    description: "Lối đi thông thoáng kết nối các phòng trong mặt bằng tầng.",
    amenities: ["Đèn LED hành lang", "Camera an ninh"],
  },
];

interface FloorplanCanvasProps {
  floors: Floor[];
  activeFloorId: number;
  onSelectFloor: (floorId: number) => void;
  rooms: Room[];
  members: Member[];
  roomOccupantsMap: Record<string, Member[]>;
  onUpdateRoomPosition: (roomId: string, x: number, y: number, w: number, h: number) => void;
  onAddRoomWithShape: (roomData: Omit<Room, "id">) => void;
  onDuplicateRoom: (room: Room) => void;
  onMoveMember: (memberId: string, targetRoomId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onSelectRoom: (room: Room) => void;
  onEditRoom: (room: Room) => void;
  onDeleteRoom: (roomId: string) => void;
}

export const FloorplanCanvas: React.FC<FloorplanCanvasProps> = ({
  floors,
  activeFloorId,
  onSelectFloor,
  rooms,
  members,
  roomOccupantsMap,
  onUpdateRoomPosition,
  onAddRoomWithShape,
  onDuplicateRoom,
  onMoveMember,
  onRemoveMember,
  onSelectRoom,
  onEditRoom,
  onDeleteRoom,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Active Floor & Rooms
  const currentFloor = floors.find((f) => f.id === activeFloorId) || floors[0];
  const floorRooms = useMemo(
    () => rooms.filter((r) => r.floor === activeFloorId),
    [rooms, activeFloorId]
  );

  // View & Settings State
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isShapePaletteOpen, setIsShapePaletteOpen] = useState(true);
  const [isMemberDockOpen, setIsMemberDockOpen] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Dragging Room (Move or Resize)
  const [activeDrag, setActiveDrag] = useState<{
    roomId: string;
    type: "move" | "resize";
    resizeHandle?: "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w";
    startX: number;
    startY: number;
    initialRoomX: number;
    initialRoomY: number;
    initialRoomW: number;
    initialRoomH: number;
    hasMoved: boolean;
  } | null>(null);

  // Live positions during drag
  const [livePositions, setLivePositions] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  // Sync rooms into livePositions
  useEffect(() => {
    const map: Record<string, { x: number; y: number; w: number; h: number }> = {};
    floorRooms.forEach((r, idx) => {
      map[r.id] = {
        x: r.x ?? 30 + (idx % 3) * 260,
        y: r.y ?? 30 + Math.floor(idx / 3) * 220,
        w: r.w ?? 230,
        h: r.h ?? 180,
      };
    });
    setLivePositions(map);
  }, [floorRooms]);

  // Global Dragged Member Reference (100% reliable across browsers)
  const activeDraggedMemberRef = useRef<Member | null>(null);
  const [draggedMember, setDraggedMember] = useState<Member | null>(null);
  const [hoveredDropRoomId, setHoveredDropRoomId] = useState<string | null>(null);

  // Dragging New Shape from Palette onto Canvas
  const activeDraggedShapeRef = useRef<ShapeTemplate | null>(null);
  const [draggedShape, setDraggedShape] = useState<ShapeTemplate | null>(null);
  const [canvasGhostPosition, setCanvasGhostPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  // Quick move popover state for dock
  const [quickMoveMemberId, setQuickMoveMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!quickMoveMemberId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickMoveMemberId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickMoveMemberId]);

  // -------------------------------------------------------------------------
  // POINTER DRAG & RESIZE FOR ROOMS
  // -------------------------------------------------------------------------
  const handleRoomPointerDown = (
    e: React.PointerEvent,
    roomId: string,
    type: "move" | "resize",
    resizeHandle?: "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w"
  ) => {
    // Only left click
    if (e.button !== 0) return;
    e.stopPropagation();

    const current = livePositions[roomId] || { x: 30, y: 30, w: 230, h: 180 };
    setSelectedRoomId(roomId);

    setActiveDrag({
      roomId,
      type,
      resizeHandle,
      startX: e.clientX,
      startY: e.clientY,
      initialRoomX: current.x,
      initialRoomY: current.y,
      initialRoomW: current.w,
      initialRoomH: current.h,
      hasMoved: false,
    });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!activeDrag) return;

      const deltaX = (e.clientX - activeDrag.startX) / zoom;
      const deltaY = (e.clientY - activeDrag.startY) / zoom;

      if (!activeDrag.hasMoved && Math.hypot(deltaX, deltaY) > 4) {
        setActiveDrag((prev) => (prev ? { ...prev, hasMoved: true } : null));
      }

      if (activeDrag.type === "move") {
        let newX = activeDrag.initialRoomX + deltaX;
        let newY = activeDrag.initialRoomY + deltaY;

        if (snapToGrid) {
          newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
          newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
        }

        // Clamp inside canvas boundary (1000 x 620)
        newX = Math.max(10, Math.min(newX, 990 - activeDrag.initialRoomW));
        newY = Math.max(10, Math.min(newY, 610 - activeDrag.initialRoomH));

        setLivePositions((prev) => ({
          ...prev,
          [activeDrag.roomId]: {
            ...prev[activeDrag.roomId],
            x: newX,
            y: newY,
          },
        }));
      } else if (activeDrag.type === "resize") {
        let newW = activeDrag.initialRoomW;
        let newH = activeDrag.initialRoomH;

        if (activeDrag.resizeHandle === "se" || !activeDrag.resizeHandle) {
          newW = activeDrag.initialRoomW + deltaX;
          newH = activeDrag.initialRoomH + deltaY;
        } else if (activeDrag.resizeHandle === "e") {
          newW = activeDrag.initialRoomW + deltaX;
        } else if (activeDrag.resizeHandle === "s") {
          newH = activeDrag.initialRoomH + deltaY;
        }

        if (snapToGrid) {
          newW = Math.round(newW / GRID_SIZE) * GRID_SIZE;
          newH = Math.round(newH / GRID_SIZE) * GRID_SIZE;
        }

        // Room size constraints
        newW = Math.max(180, Math.min(newW, 480));
        newH = Math.max(140, Math.min(newH, 560));

        setLivePositions((prev) => ({
          ...prev,
          [activeDrag.roomId]: {
            ...prev[activeDrag.roomId],
            w: newW,
            h: newH,
          },
        }));
      }
    };

    const handlePointerUp = () => {
      if (activeDrag) {
        if (activeDrag.hasMoved) {
          const final = livePositions[activeDrag.roomId];
          if (final) {
            onUpdateRoomPosition(activeDrag.roomId, final.x, final.y, final.w, final.h);
          }
        }
        setActiveDrag(null);
      }
    };

    if (activeDrag) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeDrag, zoom, snapToGrid, livePositions, onUpdateRoomPosition]);

  // -------------------------------------------------------------------------
  // MEMBER DRAG & DROP
  // -------------------------------------------------------------------------
  const handleMemberDragStart = (
    e: React.DragEvent,
    member: Member,
    fromRoomId: string
  ) => {
    e.stopPropagation();
    activeDraggedMemberRef.current = member;
    setDraggedMember(member);

    e.dataTransfer.setData("text/plain", member.id);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ memberId: member.id, fromRoomId, fullName: member.fullName })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleMemberDragEnd = () => {
    activeDraggedMemberRef.current = null;
    setDraggedMember(null);
    setHoveredDropRoomId(null);
  };

  const handleRoomDragOver = (e: React.DragEvent, roomId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (hoveredDropRoomId !== roomId) {
      setHoveredDropRoomId(roomId);
    }
  };

  const handleRoomDrop = (e: React.DragEvent, targetRoomId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredDropRoomId(null);

    const memberId =
      activeDraggedMemberRef.current?.id ||
      e.dataTransfer.getData("text/plain") ||
      (() => {
        try {
          const parsed = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
          return parsed.memberId;
        } catch {
          return null;
        }
      })();

    if (memberId) {
      onMoveMember(memberId, targetRoomId);
    }

    activeDraggedMemberRef.current = null;
    setDraggedMember(null);
  };

  // -------------------------------------------------------------------------
  // SHAPE PALETTE DRAG & DROP ONTO CANVAS
  // -------------------------------------------------------------------------
  const handleShapeDragStart = (e: React.DragEvent, shape: ShapeTemplate) => {
    activeDraggedShapeRef.current = shape;
    setDraggedShape(shape);
    e.dataTransfer.setData("text/plain", shape.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleShapeDragEnd = () => {
    activeDraggedShapeRef.current = null;
    setDraggedShape(null);
    setCanvasGhostPosition(null);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    if (!activeDraggedShapeRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      let rawX = (e.clientX - rect.left) / zoom;
      let rawY = (e.clientY - rect.top) / zoom;

      if (snapToGrid) {
        rawX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
        rawY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
      }

      setCanvasGhostPosition({ x: rawX, y: rawY });
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    if (!activeDraggedShapeRef.current || !canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const shape = activeDraggedShapeRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    let rawX = (e.clientX - rect.left) / zoom;
    let rawY = (e.clientY - rect.top) / zoom;

    if (snapToGrid) {
      rawX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
      rawY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
    }

    // Clamp coordinates
    const finalX = Math.max(10, Math.min(rawX, 990 - shape.w));
    const finalY = Math.max(10, Math.min(rawY, 610 - shape.h));

    // Generate room name & ID
    const countOnFloor = floorRooms.length + 1;
    const roomName = `${shape.name} ${activeFloorId}0${countOnFloor}`;

    onAddRoomWithShape({
      name: roomName,
      floor: activeFloorId,
      type: shape.type,
      capacity: shape.capacity,
      areaM2: shape.areaM2,
      amenities: shape.amenities,
      status: "active",
      x: finalX,
      y: finalY,
      w: shape.w,
      h: shape.h,
      description: shape.description,
    });

    activeDraggedShapeRef.current = null;
    setDraggedShape(null);
    setCanvasGhostPosition(null);
  };

  // Click to add template instantly
  const handleQuickAddShape = (shape: ShapeTemplate) => {
    const countOnFloor = floorRooms.length + 1;
    const roomName = `${shape.name} ${activeFloorId}0${countOnFloor}`;
    const staggeredX = 40 + ((countOnFloor * 40) % 400);
    const staggeredY = 40 + ((countOnFloor * 30) % 300);

    onAddRoomWithShape({
      name: roomName,
      floor: activeFloorId,
      type: shape.type,
      capacity: shape.capacity,
      areaM2: shape.areaM2,
      amenities: shape.amenities,
      status: "active",
      x: staggeredX,
      y: staggeredY,
      w: shape.w,
      h: shape.h,
      description: shape.description,
    });
  };

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* 1. TOP CANVA BAR: FLOOR SELECTOR TABS & ACTION CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white rounded-3xl border border-purple-50 shadow-xs">
        {/* Floor Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1 sm:pb-0">
          <span className="text-xs font-black text-gray-400 mr-1 shrink-0 uppercase tracking-wider">
            Tầng:
          </span>
          {floors.map((fl) => {
            const count = rooms.filter((r) => r.floor === fl.id).length;
            const isSelected = activeFloorId === fl.id;

            return (
              <button
                key={fl.id}
                onClick={() => onSelectFloor(fl.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs",
                  isSelected
                    ? "bg-primary text-white shadow-purple-200"
                    : "bg-surface-container-low text-gray-700 hover:bg-purple-100"
                )}
              >
                <span>{fl.name}</span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-black",
                    isSelected ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
                  )}
                >
                  {count} phòng
                </span>
              </button>
            );
          })}
        </div>

        {/* Canvas Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle Member Dock */}
          <button
            onClick={() => setIsMemberDockOpen(!isMemberDockOpen)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs",
              isMemberDockOpen
                ? "bg-purple-100 text-primary border-purple-200"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            )}
            title="Bật/Tắt khay kéo thả thành viên"
          >
            <Users className="w-4 h-4 text-primary" />
            <span>Khay Thành Viên ({members.length})</span>
          </button>

          {/* Snap to Grid */}
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border",
              snapToGrid
                ? "bg-purple-50 text-primary border-purple-200"
                : "bg-gray-50 text-gray-500 border-gray-200"
            )}
            title="Bật/Tắt hít nam châm theo lưới 20px"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden md:inline">Lưới 20px</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-gray-50 rounded-xl p-0.5 border border-gray-200">
            <button
              onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(1))))}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-bold text-gray-700 min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.3, Number((z + 0.1).toFixed(1))))}
              className="p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-gray-900 transition-colors"
              title="Đặt lại 100%"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: BLUEPRINT CANVAS VIEWPORT */}
      <div className="w-full overflow-hidden rounded-3xl border border-purple-100 bg-[#faf8ff] shadow-sm relative">
        {/* Top Compass Banner */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-purple-100 shadow-2xs text-[11px] text-gray-600 font-medium pointer-events-none">
          <Compass className="w-3.5 h-3.5 text-primary" />
          <span>
            {currentFloor.name} · Sơ đồ cố định · Kéo thả thẻ thành viên từ Khay vào phòng để xếp chỗ ở
          </span>
        </div>

          <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-xl bg-white/90 backdrop-blur-md border border-purple-100 text-[10px] font-black text-gray-500 uppercase tracking-widest pointer-events-none">
            BẮC (N) 🧭
          </div>

          {/* Scrollable Viewport */}
          <div className="w-full overflow-auto custom-scroll p-4 sm:p-6 min-h-[620px] max-h-[700px]">
            <div
              ref={canvasRef}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              onClick={() => setSelectedRoomId(null)}
              style={{
                width: "1000px",
                height: "620px",
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
              className="relative rounded-3xl border-2 border-dashed border-purple-200 bg-white shadow-inner select-none transition-transform duration-75"
            >
              {/* Dot Grid Background */}
              {showGrid && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern
                      id={`dot-grid-${activeFloorId}`}
                      width={GRID_SIZE}
                      height={GRID_SIZE}
                      patternUnits="userSpaceOnUse"
                    >
                      <circle cx="2" cy="2" r="1.2" fill="#d2c9fb" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#dot-grid-${activeFloorId})`} />
                </svg>
              )}

              {/* Hallway Guideline */}
              <div
                style={{
                  position: "absolute",
                  left: "290px",
                  top: "20px",
                  width: "100px",
                  height: "580px",
                }}
                className="border-2 border-dashed border-purple-200/80 bg-purple-50/20 rounded-2xl flex flex-col items-center justify-center pointer-events-none"
              >
                <span className="text-[10px] font-black text-purple-300 tracking-widest [writing-mode:vertical-lr] rotate-180 uppercase opacity-75">
                  HÀNH LANG TRUNG TÂM · LỐI ĐI CHUNG
                </span>
              </div>

              {/* GHOST PREVIEW WHILE DRAGGING SHAPE FROM PALETTE */}
              {draggedShape && canvasGhostPosition && (
                <div
                  style={{
                    position: "absolute",
                    left: `${canvasGhostPosition.x}px`,
                    top: `${canvasGhostPosition.y}px`,
                    width: `${draggedShape.w}px`,
                    height: `${draggedShape.h}px`,
                  }}
                  className="rounded-2xl border-2 border-dashed border-primary bg-primary/20 backdrop-blur-2xs flex flex-col items-center justify-center text-primary font-bold text-xs pointer-events-none shadow-xl z-40 animate-pulse"
                >
                  <Sparkles className="w-5 h-5 mb-1" />
                  <span>Thả để đặt {draggedShape.name}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    ({canvasGhostPosition.x}, {canvasGhostPosition.y})
                  </span>
                </div>
              )}

              {/* ROOMS RENDERED ON CANVAS */}
              {floorRooms.map((room) => {
                const pos = livePositions[room.id] || {
                  x: 30,
                  y: 30,
                  w: 230,
                  h: 180,
                };
                const occupants = roomOccupantsMap[room.id] || [];
                const theme = ROOM_TYPE_THEMES[room.type] || ROOM_TYPE_THEMES.other;
                const TypeIcon = theme.icon;
                const isBedroom = room.type === "bedroom";
                const isFull = isBedroom && occupants.length >= room.capacity;
                const isSelected = selectedRoomId === room.id;
                const isHoveredDrop = hoveredDropRoomId === room.id;
                const isDraggingThis = activeDrag?.roomId === room.id;

                return (
                  <div
                    key={room.id}
                    style={{
                      position: "absolute",
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      width: `${pos.w}px`,
                      height: `${pos.h}px`,
                      zIndex: isHoveredDrop ? 40 : isDraggingThis ? 35 : isSelected ? 30 : 15,
                    }}
                    onDragOver={(e) => handleRoomDragOver(e, room.id)}
                    onDrop={(e) => handleRoomDrop(e, room.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRoomId(room.id);
                    }}
                    className={cn(
                      "group rounded-2xl border-2 transition-all flex flex-col justify-between cursor-default select-none relative",
                      isHoveredDrop
                        ? "border-emerald-500 bg-emerald-50 shadow-2xl ring-4 ring-emerald-300 scale-[1.02]"
                        : isSelected
                        ? "border-primary ring-4 ring-purple-200 shadow-xl bg-white"
                        : isBedroom
                        ? isFull
                          ? "border-purple-200 bg-white hover:border-purple-400 hover:shadow-md"
                          : occupants.length === 0
                          ? "border-emerald-200 bg-emerald-50/20 hover:border-emerald-400 hover:shadow-md"
                          : "border-purple-200 bg-white hover:border-purple-400 hover:shadow-md"
                        : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-md"
                    )}
                  >
                    {/* LIVE DRAGGING HUD BADGE */}
                    {isDraggingThis && activeDrag?.type === "move" && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-purple-900 text-white text-[10px] font-mono font-bold shadow-xl pointer-events-none whitespace-nowrap z-50 animate-bounce">
                        📍 X: {pos.x}px · Y: {pos.y}px
                      </div>
                    )}
                    {isDraggingThis && activeDrag?.type === "resize" && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-indigo-900 text-white text-[10px] font-mono font-bold shadow-xl pointer-events-none whitespace-nowrap z-50 animate-bounce">
                        📐 W: {pos.w}px · H: {pos.h}px ({Math.round((pos.w * pos.h) / 2000)}m²)
                      </div>
                    )}

                    {/* FLOATING ACTION TOOLBAR ON ROOM SELECTION */}
                    {isSelected && !activeDrag && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute -top-11 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-gray-900 text-white shadow-2xl border border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-150"
                      >
                        <button
                          onClick={() => onEditRoom(room)}
                          className="p-1 rounded-lg hover:bg-white/20 text-gray-200 hover:text-white transition-colors"
                          title="Chỉnh sửa thông tin phòng"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDuplicateRoom(room)}
                          className="p-1 rounded-lg hover:bg-white/20 text-gray-200 hover:text-white transition-colors"
                          title="Nhân bản phòng này"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onSelectRoom(room)}
                          className="p-1 rounded-lg hover:bg-white/20 text-gray-200 hover:text-white transition-colors"
                          title="Xem chi tiết phòng"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-px h-3.5 bg-gray-700 mx-0.5" />
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có chắc muốn xóa ${room.name}?`)) {
                              onDeleteRoom(room.id);
                            }
                          }}
                          className="p-1 rounded-lg hover:bg-rose-500 text-rose-400 hover:text-white transition-colors"
                          title="Xóa phòng"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedRoomId(null)}
                          className="p-1 rounded-lg hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                          title="Đóng thanh công cụ"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* DROP HOVER OVERLAY NOTIFICATION */}
                    {isHoveredDrop && (
                      <div className="absolute inset-0 z-40 bg-emerald-600/90 backdrop-blur-2xs flex flex-col items-center justify-center p-3 text-white text-center animate-in fade-in duration-100 pointer-events-none">
                        <Sparkles className="w-6 h-6 mb-1 animate-bounce" />
                        <span className="text-xs font-black">
                          Thả để xếp vào {room.name}
                        </span>
                        {draggedMember && (
                          <span className="text-[11px] opacity-90 font-medium">
                            Bạn: {draggedMember.fullName}
                          </span>
                        )}
                      </div>
                    )}

                    {/* ROOM HEADER */}
                    <div
                      onClick={() => onSelectRoom(room)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 border-b transition-colors cursor-pointer hover:opacity-90",
                        theme.lightBg,
                        "border-gray-100"
                      )}
                      title="Bấm để xem chi tiết & danh sách thành viên phòng này"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={cn("p-1 rounded-lg text-white font-bold", theme.bg)}>
                          <TypeIcon className="w-3 h-3" />
                        </span>
                        <span className="text-xs font-black text-gray-900 truncate">
                          {room.name}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400">
                          {room.id}
                        </span>
                      </div>

                      {/* Capacity badge */}
                      {isBedroom ? (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black border pointer-events-none",
                            isFull
                              ? "bg-purple-100 text-primary border-purple-200"
                              : occupants.length === 0
                              ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                              : "bg-amber-100 text-amber-800 border-amber-300"
                          )}
                        >
                          {occupants.length}/{room.capacity} chỗ
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-500 pointer-events-none">
                          {room.areaM2 ? `${room.areaM2}m²` : "Tiện ích"}
                        </span>
                      )}
                    </div>

                    {/* ROOM INTERIOR & OCCUPANTS */}
                    <div
                      className={cn(
                        "p-2.5 flex-1 flex flex-col justify-between gap-1 overflow-hidden",
                        draggedMember && "pointer-events-none"
                      )}
                    >
                      {/* Bed Slots */}
                      {isBedroom && (
                        <div className="flex items-center gap-1 mb-1">
                          {Array.from({ length: room.capacity }).map((_, slotIdx) => {
                            const isOccupied = slotIdx < occupants.length;
                            return (
                              <div
                                key={slotIdx}
                                className={cn(
                                  "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border transition-colors",
                                  isOccupied
                                    ? "bg-purple-50 text-primary border-purple-200"
                                    : "bg-gray-50 text-gray-400 border-dashed border-gray-300"
                                )}
                              >
                                <Bed className="w-2.5 h-2.5" />
                                <span>G{slotIdx + 1}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Resident Avatar Tags (DRAGGABLE TO MOVE OUT!) */}
                      {isBedroom && (
                        <div className="flex flex-col gap-1 overflow-y-auto max-h-[95px] custom-scroll">
                          {occupants.length === 0 ? (
                            <div className="py-2 text-center text-[10px] font-semibold text-emerald-600 bg-emerald-50/50 rounded-xl border border-emerald-100">
                              ✨ Giường trống - Thả bạn vào đây
                            </div>
                          ) : (
                            occupants.map((occ) => (
                              <div
                                key={occ.id}
                                draggable={true}
                                onDragStart={(e) => handleMemberDragStart(e, occ, room.id)}
                                onDragEnd={handleMemberDragEnd}
                                className="flex items-center justify-between px-2 py-1 rounded-xl bg-purple-50/80 hover:bg-purple-100 border border-purple-100 transition-all cursor-grab active:cursor-grabbing hover:scale-[1.01] shadow-2xs group/member"
                                title="Kéo bạn này sang phòng khác để chuyển phòng"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="w-5 h-5 rounded-md bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                                    {occ.avatarText}
                                  </span>
                                  <span className="text-[11px] font-bold text-gray-800 truncate">
                                    {occ.fullName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveMember(occ.id);
                                    }}
                                    className="p-0.5 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover/member:opacity-100 transition-opacity"
                                    title="Hủy xếp phòng cho bạn này"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <span className="text-gray-400 group-hover/member:text-primary shrink-0">
                                    <GripVertical className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {room.type === "stairs" ? (
                        <div className="flex flex-col items-center justify-center h-full gap-1 py-1 bg-indigo-50/50 rounded-xl border border-indigo-100/60 p-2">
                          <div className="flex items-center gap-1.5 text-indigo-700 font-extrabold text-[10px] tracking-wider uppercase">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span>CẦU THANG BỘ</span>
                          </div>
                          <div className="w-full flex flex-col gap-1 px-2 opacity-70">
                            <div className="h-0.5 bg-indigo-300 rounded-full w-full" />
                            <div className="h-0.5 bg-indigo-300 rounded-full w-4/5 mx-auto" />
                            <div className="h-0.5 bg-indigo-300 rounded-full w-3/5 mx-auto" />
                          </div>
                          <span className="text-[9px] text-indigo-600 font-semibold">⬆ Lên / Xuống ⬇</span>
                        </div>
                      ) : room.type === "corridor" ? (
                        <div className="flex flex-col items-center justify-center h-full gap-1 py-1 bg-purple-50/40 rounded-xl border border-dashed border-purple-200 p-2">
                          <Footprints className="w-4 h-4 text-purple-400" />
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest text-center">
                            HÀNH LANG CHUNG
                          </span>
                        </div>
                      ) : !isBedroom ? (
                        <p className="text-[11px] text-gray-500 font-medium line-clamp-2 italic">
                          {room.description || "Không gian sinh hoạt và tiện ích chung."}
                        </p>
                      ) : null}
                    </div>

                    {/* ROOM FOOTER */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50/90 border-t border-gray-100 text-[10px]">
                      <div className="flex items-center gap-1 text-gray-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        <span>Cửa vào</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRoom(room);
                          }}
                          className="text-primary font-bold hover:underline"
                        >
                          Chi tiết →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      {/* 3. BOTTOM MEMBER DOCK ("KHAY THÀNH VIÊN KÉO THẢ") */}
      {isMemberDockOpen && (
        <div className="bg-white rounded-3xl p-5 border border-purple-50 shadow-xs flex flex-col gap-3 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-2xl bg-purple-100 text-primary">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <h4 className="text-xs font-extrabold text-gray-900 leading-tight">
                  Khay Thành Viên Kéo Thả ({members.length} anh em)
                </h4>
                <p className="text-[11px] text-gray-500">
                  👉 Nắm giữ thẻ của bạn và <b>kéo thả trực tiếp</b> vào bất kỳ phòng nào trên sơ đồ tầng!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-purple-50 text-primary border border-purple-200">
                100% Drag &amp; Drop Ready
              </span>
            </div>
          </div>

          {/* Members Scrollable Row */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-2 custom-scroll">
            {members.map((m) => {
              const currentRoom = rooms.find((r) => r.id === m.room);
              const isOnThisFloor = currentRoom && currentRoom.floor === activeFloorId;
              const hasNoRoom = !m.room || m.room === "Chưa xếp phòng";

              return (
                <div
                  key={m.id}
                  draggable={true}
                  onDragStart={(e) => handleMemberDragStart(e, m, m.room)}
                  onDragEnd={handleMemberDragEnd}
                  className={cn(
                    "relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all cursor-grab active:cursor-grabbing hover:shadow-md shrink-0 select-none group",
                    hasNoRoom
                      ? "bg-amber-50/70 border-amber-300 ring-2 ring-amber-100"
                      : isOnThisFloor
                      ? "bg-purple-50/70 border-purple-200"
                      : "bg-gray-50 border-gray-200 hover:border-purple-300"
                  )}
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                    {m.avatarText}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-900 leading-tight group-hover:text-primary transition-colors">
                      {m.fullName}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {hasNoRoom ? (
                        <span className="text-amber-700 font-bold">⚠️ Chưa xếp phòng</span>
                      ) : (
                        <span>
                          {currentRoom?.name} (T{currentRoom?.floor})
                        </span>
                      )}
                    </span>
                  </div>

                  {/* 1-Click Quick Move Dropdown Trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickMoveMemberId(quickMoveMemberId === m.id ? null : m.id);
                      }}
                      className="p-1 rounded-lg hover:bg-purple-100 text-gray-400 hover:text-primary transition-colors"
                      title="Chuyển nhanh sang phòng khác"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>

                  </div>

                  <GripVertical className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QUICK MOVE MEMBER MODAL (PORTAL) */}
      {quickMoveMemberId &&
        mounted &&
        createPortal(
          <div
            onClick={() => setQuickMoveMemberId(null)}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
          >
            <div className="flex min-h-full items-center justify-center">
              {(() => {
                const activeMember = members.find((m) => m.id === quickMoveMemberId);
                if (!activeMember) return null;

                return (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-purple-100 flex flex-col gap-3 animate-in zoom-in-95 duration-150 my-auto"
                  >
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        {activeMember.avatarText}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-gray-900 leading-tight">
                          Xếp phòng cho {activeMember.fullName}
                        </h4>
                        <p className="text-[10px] text-gray-500 font-medium">
                          {activeMember.room && activeMember.room !== "Chưa xếp phòng"
                            ? `Hiện ở ${activeMember.room}`
                            : "⚠️ Chưa xếp phòng"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setQuickMoveMemberId(null)}
                      className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Chọn phòng chuyển đến:
                  </div>

                  <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scroll pr-1">
                    {rooms
                      .filter((r) => r.type === "bedroom")
                      .map((r) => {
                        const occ = (roomOccupantsMap[r.id] || []).length;
                        const free = r.capacity - occ;
                        const isCurrent = activeMember.room === r.id;

                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              onMoveMember(activeMember.id, r.id);
                              setQuickMoveMemberId(null);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors border",
                              isCurrent
                                ? "bg-purple-100 text-primary border-purple-200 font-bold"
                                : "bg-white hover:bg-purple-50 hover:text-primary border-gray-100"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Bed className="w-3.5 h-3.5 text-purple-600" />
                              <span>
                                {r.name} (Tầng {r.floor})
                              </span>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                isCurrent
                                  ? "bg-primary text-white"
                                  : free > 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-gray-100 text-gray-400"
                              )}
                            >
                              {isCurrent ? "Đang ở" : free > 0 ? `Còn ${free} chỗ` : "Đầy"}
                            </span>
                          </button>
                        );
                      })}
                  </div>

                  {activeMember.room && activeMember.room !== "Chưa xếp phòng" && (
                    <button
                      type="button"
                      onClick={() => {
                        onRemoveMember(activeMember.id);
                        setQuickMoveMemberId(null);
                      }}
                      className="w-full py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-bold transition"
                    >
                      Hủy xếp phòng (Chuyển về Chưa xếp phòng)
                    </button>
                  )}
                </div>
              );
            })()}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
