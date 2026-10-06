"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Bed,
  Users,
  Church,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  GripVertical,
  ArrowRightLeft,
  User,
  Layers,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Search,
  Compass,
  Info,
  Sliders,
  Check,
  ChevronRight,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { Room, RoomType, Member, Floor } from "@/lib/types/members";
import { cn } from "@/lib/utils";

export interface FloorplanCanvasProps {
  floors: Floor[];
  activeFloorId: number;
  onSelectFloor: (floorId: number) => void;
  rooms: Room[];
  members: Member[];
  roomOccupantsMap: Record<string, Member[]>;
  onMoveMember: (memberId: string, targetRoomId: string) => void;
  onRemoveMember?: (memberId: string) => void;
  onSelectRoom: (room: Room) => void;
  // Optional compatibility handlers
  onUpdateRoomPosition?: (roomId: string, x: number, y: number, w: number, h: number) => void;
  onAddRoomWithShape?: (roomData: Omit<Room, "id">) => void;
  onDuplicateRoom?: (room: Room) => void;
  onEditRoom?: (room: Room) => void;
  onDeleteRoom?: (roomId: string) => void;
  /** Không có quyền xếp phòng: tắt kéo thả thành viên */
  readOnly?: boolean;
}

// Các phòng đã có hình vẽ cố định trong bản vẽ Tầng 1/Tầng 2; phòng khác được vẽ động theo tọa độ layout_x/y/w/h trong DB
const FIXED_ROOM_CODES = new Set(["P.XE", "P.1", "P.2", "P.WC_P2", "P.3", "P.SANH1", "P.WC_NGOAI", "P.4", "P.WC_P4", "P.WC_P5", "P.5", "P.SANH2"]);

export const FloorplanCanvas: React.FC<FloorplanCanvasProps> = ({
  floors,
  activeFloorId,
  onSelectFloor,
  rooms,
  members,
  roomOccupantsMap,
  onMoveMember,
  onSelectRoom,
  readOnly = false,
}) => {
  const { showToast } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMemberDockOpen, setIsMemberDockOpen] = useState(true);
  const [dockSearch, setDockSearch] = useState("");
  const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentFloor = floors.find((f) => f.id === activeFloorId) || floors[0];

  // Bedrooms on current floor
  const currentFloorBedrooms = useMemo(() => {
    return rooms.filter((r) => r.floor === activeFloorId && r.type === "bedroom");
  }, [rooms, activeFloorId]);

  // Filtered members in dock
  const filteredDockMembers = useMemo(() => {
    return members.filter((m) => {
      const q = dockSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        (m.room && m.room.toLowerCase().includes(q)) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
      );
    });
  }, [members, dockSearch]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 1.8));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.7));
  const handleResetZoom = () => setZoom(1);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Drag and Drop handlers
  const handleDragStartMember = (memberId: string, e: React.DragEvent) => {
    if (readOnly) {
      e.preventDefault();
      showToast("info", "Chỉ Trưởng nhà (hoặc vai trò được giao quyền xếp phòng) được xếp phòng.");
      return;
    }
    setDraggedMemberId(memberId);
    e.dataTransfer.setData("text/plain", memberId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedMemberId(null);
    setDragOverRoomId(null);
  };

  const handleRoomDragOver = (roomId: string, e: React.DragEvent) => {
    e.preventDefault();
    const targetRoom = rooms.find((r) => r.id === roomId);
    if (targetRoom && targetRoom.type === "bedroom" && draggedMemberId) {
      const occs = roomOccupantsMap[roomId] || [];
      const isAlreadyInRoom = occs.some((m) => m.id === draggedMemberId);
      if (!isAlreadyInRoom && occs.length >= targetRoom.capacity) {
        e.dataTransfer.dropEffect = "none";
        if (dragOverRoomId !== roomId) {
          setDragOverRoomId(roomId);
        }
        return;
      }
    }
    e.dataTransfer.dropEffect = "move";
    if (dragOverRoomId !== roomId) {
      setDragOverRoomId(roomId);
    }
  };

  const handleRoomDragLeave = (roomId: string) => {
    if (dragOverRoomId === roomId) {
      setDragOverRoomId(null);
    }
  };

  const handleRoomDrop = (roomId: string, e: React.DragEvent) => {
    e.preventDefault();
    const memberId = e.dataTransfer.getData("text/plain") || draggedMemberId;
    if (memberId && roomId) {
      const targetRoom = rooms.find((r) => r.id === roomId);
      if (targetRoom && targetRoom.type === "bedroom") {
        const occs = roomOccupantsMap[roomId] || [];
        const isAlreadyInRoom = occs.some((m) => m.id === memberId);
        if (!isAlreadyInRoom && occs.length >= targetRoom.capacity) {
          showToast(
            "error",
            `Không thể thêm! ${targetRoom.name} đã đủ tối đa ${targetRoom.capacity} người (${occs.map((o) => o.fullName).join(", ")}).`
          );
          setDraggedMemberId(null);
          setDragOverRoomId(null);
          return;
        }
      }
      onMoveMember(memberId, roomId);
    }
    setDraggedMemberId(null);
    setDragOverRoomId(null);
  };

  /** Vẽ các phòng không có hình cố định: theo tọa độ DB, phòng chưa có tọa độ xếp thành hàng phía dưới bản vẽ. */
  const renderDynamicRooms = (floorId: number, onlyNonFixed: boolean) => {
    const list = rooms.filter((r) => r.floor === floorId && (!onlyNonFixed || !FIXED_ROOM_CODES.has(r.id)));
    let auto = 0;
    return list.map((r) => {
      const hasLayout = r.x !== undefined && r.y !== undefined && r.w !== undefined && r.h !== undefined;
      const idx = hasLayout ? 0 : auto++;
      const x = hasLayout ? r.x! : 30 + (idx % 6) * 106;
      const y = hasLayout ? r.y! : 300 + Math.floor(idx / 6) * 56;
      const w = hasLayout ? r.w! : 98;
      const h = hasLayout ? r.h! : 48;
      const occs = roomOccupantsMap[r.id] || [];
      const isBed = r.type === "bedroom";
      const isDragOver = dragOverRoomId === r.id;
      const isHovered = hoveredRoomId === r.id;
      const isFull = isBed && occs.length >= r.capacity;
      const fill = isDragOver ? (isFull ? "#fee2e2" : "#dcfce7") : isHovered ? "#ede9fe" : isBed ? "#faf5ff" : "#f1efe8";
      return (
        <g
          key={r.id}
          className="cursor-pointer"
          onClick={() => onSelectRoom(r)}
          onMouseEnter={() => setHoveredRoomId(r.id)}
          onMouseLeave={() => setHoveredRoomId(null)}
          onDragOver={(e) => handleRoomDragOver(r.id, e)}
          onDragLeave={() => handleRoomDragLeave(r.id)}
          onDrop={(e) => handleRoomDrop(r.id, e)}
        >
          <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={isBed ? "#7c3aed" : "#5f5e5a"} strokeWidth="2" strokeDasharray={hasLayout ? undefined : "5 3"} />
          <text x={x + w / 2} y={y + h / 2 - (isBed ? 7 : 0)} textAnchor="middle" dominantBaseline="central" fill="#3f3f3c" fontSize="11" fontWeight="700">
            {r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name}
          </text>
          {isBed && (
            <text x={x + w / 2} y={y + h / 2 + 9} textAnchor="middle" dominantBaseline="central" fill={isFull ? "#b91c1c" : "#6d28d9"} fontSize="10" fontWeight="700">
              {occs.length}/{r.capacity} chỗ
            </text>
          )}
        </g>
      );
    });
  };

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-white rounded-3xl border border-purple-100 shadow-sm flex flex-col overflow-hidden transition-all duration-300",
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-0" : "w-full"
      )}
    >
      {/* ========================================================================= */}
      {/* 1. CANVAS TOOLBAR HEADER                                                  */}
      {/* ========================================================================= */}
      <div className="bg-purple-900 text-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-purple-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-800/80 text-[#fcd34d] flex items-center justify-center font-bold shadow-inner">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white">
                Sơ Đồ Kiến Trúc Nhà Lưu Xá
              </h2>
              <span className="text-[10px] bg-purple-700/80 text-[#e9d5ff] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Bản vẽ phác thảo chuẩn
              </span>
            </div>
            <p className="text-[11px] text-[#e9d5ff]/80">
              {currentFloor ? `${currentFloor.name}: ${currentFloor.description}` : ""}
            </p>
          </div>
        </div>

        {/* Floor switcher tabs & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Floor tabs */}
          <div className="bg-purple-950/70 p-1 rounded-xl flex items-center gap-1 border border-purple-800/60">
            {floors.map((f) => {
              const isActive = f.id === activeFloorId;
              return (
                <button
                  key={f.id}
                  onClick={() => onSelectFloor(f.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                    isActive
                      ? "bg-amber-400 text-purple-950 shadow-sm"
                      : "text-[#e9d5ff] hover:text-white hover:bg-purple-800/50"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{f.name}</span>
                </button>
              );
            })}
          </div>

          {/* Zoom & View Controls */}
          <div className="flex items-center gap-1 bg-purple-950/70 p-1 rounded-xl border border-purple-800/60">
            <button
              onClick={handleZoomOut}
              title="Thu nhỏ"
              className="p-1.5 rounded-lg text-[#e9d5ff] hover:text-white hover:bg-purple-800/60 transition"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              title="Tỉ lệ chuẩn 100%"
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#e9d5ff] hover:text-white hover:bg-purple-800/60 transition"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              title="Phóng to"
              className="p-1.5 rounded-lg text-[#e9d5ff] hover:text-white hover:bg-purple-800/60 transition"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-purple-800 mx-0.5" />
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
              className="p-1.5 rounded-lg text-[#e9d5ff] hover:text-white hover:bg-purple-800/60 transition"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Toggle Dock Button */}
          <button
            onClick={() => setIsMemberDockOpen(!isMemberDockOpen)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border",
              isMemberDockOpen
                ? "bg-purple-800 text-white border-purple-700"
                : "bg-purple-950/70 text-[#e9d5ff] border-purple-800 hover:text-white"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Phân phòng ({members.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE AREA: BLUEPRINT CANVAS + MEMBER DOCK                     */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-[560px]">
        {/* BLUEPRINT CANVAS */}
        <div className="flex-1 bg-stone-50/70 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-center relative">
          {/* Subtle architectural grid pattern */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(#94a3b8 1px, transparent 1px), radial-gradient(#94a3b8 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0, 12px 12px",
            }}
          />

          {/* Helper hint for drag-and-drop */}
          <div className="absolute top-3 left-4 z-10 hidden md:flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-purple-200/80 shadow-xs text-xs text-purple-950">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span className="font-semibold">Mẹo:</span> Kéo tên thành viên từ danh sách bên phải rồi thả vào phòng ngủ để xếp phòng!
          </div>

          {/* SCALABLE SVG BLUEPRINT CONTAINER */}
          <div
            className="w-full max-w-[920px] transition-transform duration-200 ease-out origin-center"
            style={{ transform: `scale(${zoom})` }}
          >
            <div className="relative bg-white rounded-2xl shadow-md border border-stone-200/80 p-2 sm:p-4">
              {activeFloorId === 1 ? (
                /* ============================================================= */
                /* FLOOR 1 SVG BLUEPRINT (Ground Floor)                          */
                /* ============================================================= */
                <svg
                  viewBox="0 0 680 420"
                  className="w-full h-auto select-none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <filter id="card-shadow" x="-5%" y="-5%" width="110%" height="110%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.1" />
                    </filter>
                  </defs>

                  {/* Outer lot boundary */}
                  <rect
                    x="20"
                    y="10"
                    width="650"
                    height="395"
                    rx="6"
                    fill="#fcfbfa"
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="6 4"
                  />

                  {/* Yards labels */}
                  <text x="290" y="38" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân sau
                  </text>
                  <text x="56" y="170" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân trái
                  </text>
                  <text x="560" y="215" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân phải
                  </text>
                  <text x="330" y="292" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân trước
                  </text>

                  {/* 1. Nhà để xe (x:107, y:99, w:60, h:150) */}
                  {(() => {
                    const rXe = rooms.find((r) => r.id === "P.XE");
                    return (
                      <g
                        className="cursor-pointer group"
                        onClick={() => rXe && onSelectRoom(rXe)}
                        onMouseEnter={() => setHoveredRoomId("P.XE")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="107"
                          y="99"
                          width="60"
                          height="150"
                          fill={hoveredRoomId === "P.XE" ? "#eae6dc" : "#f1efe8"}
                          stroke="#5f5e5a"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="137"
                          y="166"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#3f3f3c"
                          fontSize="13"
                          fontWeight="700"
                        >
                          Nhà để
                        </text>
                        <text
                          x="137"
                          y="183"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#3f3f3c"
                          fontSize="13"
                          fontWeight="700"
                        >
                          xe
                        </text>
                      </g>
                    );
                  })()}

                  {/* 2. PHÒNG 1 (x:167, y:67, w:76, h:131) - BEDROOM */}
                  {(() => {
                    const r1 = rooms.find((r) => r.id === "P.1");
                    const occs = roomOccupantsMap["P.1"] || [];
                    const isDragOver = dragOverRoomId === "P.1";
                    const isHovered = hoveredRoomId === "P.1";
                    const isDraggingSelf = draggedMemberId ? occs.some((m) => m.id === draggedMemberId) : false;
                    const isFull = !isDraggingSelf && occs.length >= (r1?.capacity || 2);
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => r1 && onSelectRoom(r1)}
                        onMouseEnter={() => setHoveredRoomId("P.1")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                        onDragOver={(e) => handleRoomDragOver("P.1", e)}
                        onDragLeave={() => handleRoomDragLeave("P.1")}
                        onDrop={(e) => handleRoomDrop("P.1", e)}
                      >
                        <rect
                          x="167"
                          y="67"
                          width="76"
                          height="131"
                          fill={isDragOver ? (isFull ? "#fee2e2" : "#a7f3d0") : isHovered ? "#ccfbf1" : "#e1f5ee"}
                          stroke={isDragOver ? (isFull ? "#ef4444" : "#059669") : "#0f6e56"}
                          strokeWidth={isDragOver ? "3" : "2"}
                          strokeDasharray={isDragOver && isFull ? "4 2" : undefined}
                          rx="2"
                        />
                        <text
                          x="205"
                          y="85"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#085041"
                          fontSize="14"
                          fontWeight="800"
                        >
                          Phòng 1
                        </text>

                        {/* Occupancy pill */}
                        <rect
                          x="180"
                          y="98"
                          width="50"
                          height="16"
                          rx="8"
                          fill={occs.length >= (r1?.capacity || 2) ? "#0f6e56" : "#0d9488"}
                        />
                        <text
                          x="205"
                          y="107"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {occs.length}/{r1?.capacity || 2} chỗ
                        </text>

                        {/* Drag over indicator */}
                        {isDragOver && (
                          <g transform="translate(172, 118)">
                            <rect
                              x="0"
                              y="0"
                              width="66"
                              height="20"
                              rx="6"
                              fill={isFull ? "#ef4444" : "#059669"}
                            />
                            <text
                              x="33"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {isFull ? "ĐÃ ĐỦ 2/2" : "THẢ VÀO ĐÂY"}
                            </text>
                          </g>
                        )}

                        {/* Member avatar chips */}
                        {occs.map((m, idx) => (
                          <g key={m.id} transform={`translate(172, ${120 + idx * 22})`}>
                            <rect
                              x="0"
                              y="0"
                              width="66"
                              height="18"
                              rx="9"
                              fill="#ffffff"
                              stroke="#0f6e56"
                              strokeWidth="0.8"
                              opacity="0.95"
                            />
                            <circle cx="9" cy="9" r="6" fill="#0f6e56" />
                            <text
                              x="9"
                              y="10"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {m.fullName.charAt(0)}
                            </text>
                            <text
                              x="20"
                              y="10"
                              dominantBaseline="central"
                              fill="#0f6e56"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {m.fullName.split(" ").slice(-1)[0]}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                  {/* 3. PHÒNG 2 (x:243, y:67, w:133, h:131) - BEDROOM */}
                  {(() => {
                    const r2 = rooms.find((r) => r.id === "P.2");
                    const occs = roomOccupantsMap["P.2"] || [];
                    const isDragOver = dragOverRoomId === "P.2";
                    const isHovered = hoveredRoomId === "P.2";
                    const isDraggingSelf = draggedMemberId ? occs.some((m) => m.id === draggedMemberId) : false;
                    const isFull = !isDraggingSelf && occs.length >= (r2?.capacity || 3);
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => r2 && onSelectRoom(r2)}
                        onMouseEnter={() => setHoveredRoomId("P.2")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                        onDragOver={(e) => handleRoomDragOver("P.2", e)}
                        onDragLeave={() => handleRoomDragLeave("P.2")}
                        onDrop={(e) => handleRoomDrop("P.2", e)}
                      >
                        <rect
                          x="243"
                          y="67"
                          width="133"
                          height="131"
                          fill={isDragOver ? (isFull ? "#fee2e2" : "#a7f3d0") : isHovered ? "#ccfbf1" : "#e1f5ee"}
                          stroke={isDragOver ? (isFull ? "#ef4444" : "#059669") : "#0f6e56"}
                          strokeWidth={isDragOver ? "3" : "2"}
                          strokeDasharray={isDragOver && isFull ? "4 2" : undefined}
                          rx="2"
                        />
                        <text
                          x="309"
                          y="85"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#085041"
                          fontSize="14"
                          fontWeight="800"
                        >
                          Phòng 2
                        </text>

                        {/* Occupancy pill */}
                        <rect
                          x="284"
                          y="98"
                          width="50"
                          height="16"
                          rx="8"
                          fill={occs.length >= (r2?.capacity || 3) ? "#0f6e56" : "#0d9488"}
                        />
                        <text
                          x="309"
                          y="107"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {occs.length}/{r2?.capacity || 3} chỗ
                        </text>

                        {/* Drag over indicator */}
                        {isDragOver && (
                          <g transform="translate(268, 118)">
                            <rect
                              x="0"
                              y="0"
                              width="82"
                              height="20"
                              rx="6"
                              fill={isFull ? "#ef4444" : "#059669"}
                            />
                            <text
                              x="41"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {isFull ? "ĐÃ ĐỦ 3/3" : "THẢ VÀO ĐÂY"}
                            </text>
                          </g>
                        )}

                        {/* Member avatar chips */}
                        {occs.map((m, idx) => (
                          <g key={m.id} transform={`translate(252, ${120 + idx * 22})`}>
                            <rect
                              x="0"
                              y="0"
                              width="114"
                              height="18"
                              rx="9"
                              fill="#ffffff"
                              stroke="#0f6e56"
                              strokeWidth="0.8"
                              opacity="0.95"
                            />
                            <circle cx="10" cy="9" r="6" fill="#0f6e56" />
                            <text
                              x="10"
                              y="10"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {m.fullName.charAt(0)}
                            </text>
                            <text
                              x="22"
                              y="10"
                              dominantBaseline="central"
                              fill="#0f6e56"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {m.fullName}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                  {/* 4. NVS + TẮM PHÒNG 2 (x:376, y:67, w:96, h:41) */}
                  {(() => {
                    const rWc2 = rooms.find((r) => r.id === "P.WC_P2");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rWc2 && onSelectRoom(rWc2)}
                        onMouseEnter={() => setHoveredRoomId("P.WC_P2")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="376"
                          y="67"
                          width="96"
                          height="41"
                          fill={hoveredRoomId === "P.WC_P2" ? "#dbeafe" : "#e6f1fb"}
                          stroke="#185fa5"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="424"
                          y="81"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#0c447c"
                          fontSize="13"
                          fontWeight="700"
                        >
                          NVS + tắm
                        </text>
                        <text
                          x="424"
                          y="96"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#185fa5"
                          fontSize="11"
                          fontWeight="600"
                        >
                          phòng 2
                        </text>
                      </g>
                    );
                  })()}

                  {/* 5. PHÒNG 3 (x:376, y:108, w:96, h:165) - BEDROOM */}
                  {(() => {
                    const r3 = rooms.find((r) => r.id === "P.3");
                    const occs = roomOccupantsMap["P.3"] || [];
                    const isDragOver = dragOverRoomId === "P.3";
                    const isHovered = hoveredRoomId === "P.3";
                    const isDraggingSelf = draggedMemberId ? occs.some((m) => m.id === draggedMemberId) : false;
                    const isFull = !isDraggingSelf && occs.length >= (r3?.capacity || 3);
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => r3 && onSelectRoom(r3)}
                        onMouseEnter={() => setHoveredRoomId("P.3")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                        onDragOver={(e) => handleRoomDragOver("P.3", e)}
                        onDragLeave={() => handleRoomDragLeave("P.3")}
                        onDrop={(e) => handleRoomDrop("P.3", e)}
                      >
                        <rect
                          x="376"
                          y="108"
                          width="96"
                          height="165"
                          fill={isDragOver ? (isFull ? "#fee2e2" : "#a7f3d0") : isHovered ? "#ccfbf1" : "#e1f5ee"}
                          stroke={isDragOver ? (isFull ? "#ef4444" : "#059669") : "#0f6e56"}
                          strokeWidth={isDragOver ? "3" : "2"}
                          strokeDasharray={isDragOver && isFull ? "4 2" : undefined}
                          rx="2"
                        />
                        <text
                          x="424"
                          y="126"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#085041"
                          fontSize="14"
                          fontWeight="800"
                        >
                          Phòng 3
                        </text>

                        {/* Occupancy pill */}
                        <rect
                          x="399"
                          y="138"
                          width="50"
                          height="16"
                          rx="8"
                          fill={occs.length >= (r3?.capacity || 3) ? "#0f6e56" : "#0d9488"}
                        />
                        <text
                          x="424"
                          y="147"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {occs.length}/{r3?.capacity || 3} chỗ
                        </text>

                        {/* Drag over indicator */}
                        {isDragOver && (
                          <g transform="translate(383, 160)">
                            <rect
                              x="0"
                              y="0"
                              width="82"
                              height="20"
                              rx="6"
                              fill={isFull ? "#ef4444" : "#059669"}
                            />
                            <text
                              x="41"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {isFull ? "ĐÃ ĐỦ 3/3" : "THẢ VÀO ĐÂY"}
                            </text>
                          </g>
                        )}

                        {/* Member avatar chips */}
                        {occs.map((m, idx) => (
                          <g key={m.id} transform={`translate(382, ${164 + idx * 24})`}>
                            <rect
                              x="0"
                              y="0"
                              width="84"
                              height="20"
                              rx="10"
                              fill="#ffffff"
                              stroke="#0f6e56"
                              strokeWidth="0.8"
                              opacity="0.95"
                            />
                            <circle cx="10" cy="10" r="7" fill="#0f6e56" />
                            <text
                              x="10"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {m.fullName.charAt(0)}
                            </text>
                            <text
                              x="22"
                              y="11"
                              dominantBaseline="central"
                              fill="#0f6e56"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {m.fullName.split(" ").slice(-2).join(" ")}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                  {/* 6. SẢNH CHUNG (x:167, y:198, w:209, h:51) */}
                  {(() => {
                    const rSanh = rooms.find((r) => r.id === "P.SANH1");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rSanh && onSelectRoom(rSanh)}
                        onMouseEnter={() => setHoveredRoomId("P.SANH1")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="167"
                          y="198"
                          width="209"
                          height="51"
                          fill={hoveredRoomId === "P.SANH1" ? "#e9e7e1" : "#f1efe8"}
                          stroke="#5f5e5a"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="288"
                          y="220"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#444441"
                          fontSize="13"
                          fontWeight="700"
                        >
                          Sảnh chung
                        </text>
                        <text
                          x="288"
                          y="236"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#5f5e5a"
                          fontSize="11"
                          fontWeight="500"
                        >
                          (đọc kinh tối ngày thường)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Bàn thờ T1 (x:256, y:203, w:42, h:10) */}
                  <rect
                    x="256"
                    y="203"
                    width="42"
                    height="10"
                    rx="3"
                    fill="#eeedfe"
                    stroke="#534ab7"
                    strokeWidth="0.8"
                  />
                  <text
                    x="277"
                    y="208"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#534ab7"
                    fontSize="7"
                    fontWeight="700"
                  >
                    BÀN THỜ
                  </text>

                  {/* Cầu thang T1 (x:170, y:209, w:22, h:38) */}
                  <rect x="170" y="209" width="22" height="38" fill="#ffffff" stroke="#52514e" strokeWidth="1" />
                  <line x1="170" y1="215" x2="192" y2="215" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="170" y1="221" x2="192" y2="221" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="170" y1="227" x2="192" y2="227" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="170" y1="233" x2="192" y2="233" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="170" y1="239" x2="192" y2="239" stroke="#52514e" strokeWidth="0.8" />

                  {/* 7. KHU VỆ SINH NGOÀI (x:500..659, y:15, h:77) */}
                  {(() => {
                    const rWcNgoai = rooms.find((r) => r.id === "P.WC_NGOAI");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rWcNgoai && onSelectRoom(rWcNgoai)}
                        onMouseEnter={() => setHoveredRoomId("P.WC_NGOAI")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        {/* Nhà vệ sinh */}
                        <rect x="500" y="15" width="53" height="77" fill="#e6f1fb" stroke="#185fa5" strokeWidth="2" />
                        <ellipse cx="526" cy="38" rx="7" ry="9" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <rect x="521" y="22" width="10" height="6" rx="2" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <text x="526" y="62" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          Nhà vệ
                        </text>
                        <text x="526" y="78" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          sinh
                        </text>

                        {/* Nhà tắm */}
                        <rect x="553" y="15" width="53" height="77" fill="#e6f1fb" stroke="#185fa5" strokeWidth="2" />
                        <ellipse cx="579" cy="38" rx="7" ry="9" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <rect x="574" y="22" width="10" height="6" rx="2" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <text x="579" y="62" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          Nhà
                        </text>
                        <text x="579" y="78" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          tắm
                        </text>

                        {/* Phòng giặt đồ */}
                        <rect x="606" y="15" width="53" height="77" fill="#e6f1fb" stroke="#185fa5" strokeWidth="2" />
                        <ellipse cx="632" cy="38" rx="7" ry="9" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <rect x="627" y="22" width="10" height="6" rx="2" fill="none" stroke="#52514e" strokeWidth="1.2" />
                        <text x="632" y="62" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          Phòng
                        </text>
                        <text x="632" y="78" textAnchor="middle" dominantBaseline="central" fill="#0b0b0b" fontSize="11" fontWeight="700">
                          giặt đồ
                        </text>

                        {/* Bồn tiểu */}
                        <circle cx="640" cy="118" r="6" fill="#e6f1fb" stroke="#185fa5" strokeWidth="1.2" />
                        <text x="628" y="118" textAnchor="end" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                          Bồn tiểu
                        </text>
                      </g>
                    );
                  })()}

                  {/* 8. Nơi để thùng rác (x:300, y:335, w:126, h:34) */}
                  <rect x="300" y="335" width="126" height="34" rx="4" fill="#fcfcfb" stroke="#94a3b8" strokeWidth="0.8" />
                  <text x="363" y="352" textAnchor="middle" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Nơi để thùng rác
                  </text>

                  {/* DOORS (Cam #D85A30 strokeWidth: 5) */}
                  {/* Doors to WC Ngoài */}
                  <line x1="512" y1="92" x2="536" y2="92" stroke="#D85A30" strokeWidth="5" />
                  <line x1="565" y1="92" x2="589" y2="92" stroke="#D85A30" strokeWidth="5" />
                  <line x1="618" y1="92" x2="642" y2="92" stroke="#D85A30" strokeWidth="5" />

                  {/* Doors around rooms */}
                  <line x1="167" y1="72" x2="167" y2="94" stroke="#D85A30" strokeWidth="5" />
                  <line x1="213" y1="198" x2="239" y2="198" stroke="#D85A30" strokeWidth="5" />
                  <line x1="346" y1="198" x2="372" y2="198" stroke="#D85A30" strokeWidth="5" />
                  <line x1="376" y1="88" x2="376" y2="107" stroke="#D85A30" strokeWidth="5" />
                  <line x1="376" y1="225" x2="376" y2="247" stroke="#D85A30" strokeWidth="5" />
                  <line x1="472" y1="126" x2="472" y2="146" stroke="#D85A30" strokeWidth="5" />
                  <line x1="472" y1="246" x2="472" y2="266" stroke="#D85A30" strokeWidth="5" />
                  <line x1="167" y1="201" x2="167" y2="216" stroke="#D85A30" strokeWidth="5" />
                  <line x1="126" y1="249" x2="158" y2="249" stroke="#D85A30" strokeWidth="5" />

                  {/* MAIN DOUBLE DOOR (Vàng #BA7517 strokeWidth: 6) */}
                  <line x1="258" y1="249" x2="272" y2="249" stroke="#BA7517" strokeWidth="6" />
                  <line x1="276" y1="249" x2="290" y2="249" stroke="#BA7517" strokeWidth="6" />

                  {/* WINDOWS (Xanh #378ADD strokeWidth: 5) */}
                  <line x1="303" y1="67" x2="330" y2="67" stroke="#378ADD" strokeWidth="5" />
                  <line x1="199" y1="249" x2="221" y2="249" stroke="#378ADD" strokeWidth="5" />
                  <line x1="318" y1="249" x2="336" y2="249" stroke="#378ADD" strokeWidth="5" />
                  <line x1="417" y1="273" x2="440" y2="273" stroke="#378ADD" strokeWidth="5" />

                  {/* LEGEND / CHÚ THÍCH TẦNG 1 */}
                  <line x1="40" y1="330" x2="64" y2="330" stroke="#D85A30" strokeWidth="5" />
                  <text x="74" y="330" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cửa phòng / cửa thường
                  </text>

                  <line x1="40" y1="352" x2="51" y2="352" stroke="#BA7517" strokeWidth="6" />
                  <line x1="53" y1="352" x2="64" y2="352" stroke="#BA7517" strokeWidth="6" />
                  <text x="74" y="352" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cửa chính (2 cánh)
                  </text>

                  <line x1="40" y1="374" x2="64" y2="374" stroke="#378ADD" strokeWidth="5" />
                  <text x="74" y="374" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cửa sổ
                  </text>

                  <rect x="210" y="325" width="26" height="10" rx="3" fill="#eeedfe" stroke="#534ab7" strokeWidth="0.8" />
                  <text x="246" y="330" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Bàn thờ
                  </text>

                  <rect x="212" y="345" width="20" height="14" fill="#ffffff" stroke="#52514e" strokeWidth="1" />
                  <line x1="212" y1="350" x2="232" y2="350" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="212" y1="354" x2="232" y2="354" stroke="#52514e" strokeWidth="0.8" />
                  <text x="246" y="352" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cầu thang
                  </text>

                  <ellipse cx="222" cy="376" rx="5" ry="6" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                  <rect x="218" y="366" width="8" height="4" rx="1" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                  <text x="246" y="374" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Bồn cầu
                  </text>
                  {renderDynamicRooms(1, true)}
                </svg>
              ) : activeFloorId !== 2 ? (
                /* Tầng thêm mới: chưa có bản vẽ cố định — vẽ phòng theo tọa độ trong DB */
                <svg viewBox="0 0 680 420" className="w-full h-auto select-none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="20" y="10" width="650" height="395" rx="6" fill="#fcfbfa" stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 4" />
                  <text x="345" y="34" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    {currentFloor?.name ?? "Tầng mới"} — phòng chưa có tọa độ được xếp tạm phía dưới
                  </text>
                  {renderDynamicRooms(activeFloorId, false)}
                </svg>
              ) : (
                /* ============================================================= */
                /* FLOOR 2 SVG BLUEPRINT (First Floor / Lầu 1)                  */
                /* ============================================================= */
                <svg
                  viewBox="0 0 680 420"
                  className="w-full h-auto select-none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern
                      id="hatch-canvas"
                      width="9"
                      height="9"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <line x1="0" y1="0" x2="0" y2="9" stroke="#94a3b8" strokeWidth="1.2" opacity="0.5" />
                    </pattern>
                  </defs>

                  {/* Outer lot boundary */}
                  <rect
                    x="20"
                    y="10"
                    width="650"
                    height="395"
                    rx="6"
                    fill="#fcfbfa"
                    stroke="#94a3b8"
                    strokeWidth="1"
                    strokeDasharray="6 4"
                  />

                  {/* Yards labels */}
                  <text x="290" y="38" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân sau
                  </text>
                  <text x="56" y="170" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân trái
                  </text>
                  <text x="560" y="215" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân phải
                  </text>
                  <text x="330" y="292" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                    Sân trước
                  </text>

                  {/* Hatched Areas (Ground Floor footprint only) */}
                  {/* Nhà để xe (hatched) */}
                  <rect
                    x="107"
                    y="99"
                    width="60"
                    height="150"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <text x="137" y="168" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="11" fontWeight="600">
                    Nhà để
                  </text>
                  <text x="137" y="184" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="11" fontWeight="600">
                    xe
                  </text>

                  {/* Cụm WC ngoài (hatched) */}
                  <rect
                    x="500"
                    y="15"
                    width="53"
                    height="77"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <rect
                    x="553"
                    y="15"
                    width="53"
                    height="77"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <rect
                    x="606"
                    y="15"
                    width="53"
                    height="77"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <text x="526" y="46" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    Nhà vệ
                  </text>
                  <text x="526" y="62" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    sinh
                  </text>
                  <text x="579" y="46" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    Nhà
                  </text>
                  <text x="579" y="62" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    tắm
                  </text>
                  <text x="632" y="46" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    Phòng
                  </text>
                  <text x="632" y="62" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    giặt đồ
                  </text>
                  <circle cx="640" cy="118" r="6" fill="url(#hatch-canvas)" stroke="#888780" strokeWidth="1" strokeDasharray="3 2" />
                  <text x="628" y="118" textAnchor="end" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    Bồn tiểu
                  </text>

                  {/* Nơi để thùng rác (hatched) */}
                  <rect
                    x="300"
                    y="335"
                    width="126"
                    height="34"
                    rx="4"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="5 3"
                  />
                  <text x="363" y="352" textAnchor="middle" dominantBaseline="central" fill="#888780" fontSize="10" fontWeight="600">
                    Nơi để thùng rác (T1)
                  </text>

                  {/* 1. PHÒNG 4 (x:167, y:67, w:209, h:78) - BEDROOM */}
                  {(() => {
                    const r4 = rooms.find((r) => r.id === "P.4");
                    const occs = roomOccupantsMap["P.4"] || [];
                    const isDragOver = dragOverRoomId === "P.4";
                    const isHovered = hoveredRoomId === "P.4";
                    const isDraggingSelf = draggedMemberId ? occs.some((m) => m.id === draggedMemberId) : false;
                    const isFull = !isDraggingSelf && occs.length >= (r4?.capacity || 3);
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => r4 && onSelectRoom(r4)}
                        onMouseEnter={() => setHoveredRoomId("P.4")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                        onDragOver={(e) => handleRoomDragOver("P.4", e)}
                        onDragLeave={() => handleRoomDragLeave("P.4")}
                        onDrop={(e) => handleRoomDrop("P.4", e)}
                      >
                        <rect
                          x="167"
                          y="67"
                          width="209"
                          height="78"
                          fill={isDragOver ? (isFull ? "#fee2e2" : "#a7f3d0") : isHovered ? "#ccfbf1" : "#e1f5ee"}
                          stroke={isDragOver ? (isFull ? "#ef4444" : "#059669") : "#0f6e56"}
                          strokeWidth={isDragOver ? "3" : "2"}
                          strokeDasharray={isDragOver && isFull ? "4 2" : undefined}
                          rx="2"
                        />
                        <text
                          x="271"
                          y="86"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#085041"
                          fontSize="15"
                          fontWeight="800"
                        >
                          Phòng 4
                        </text>

                        {/* Occupancy pill */}
                        <rect
                          x="246"
                          y="98"
                          width="50"
                          height="16"
                          rx="8"
                          fill={occs.length >= (r4?.capacity || 3) ? "#0f6e56" : "#0d9488"}
                        />
                        <text
                          x="271"
                          y="107"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {occs.length}/{r4?.capacity || 3} chỗ
                        </text>

                        {/* Drag over indicator */}
                        {isDragOver && (
                          <g transform="translate(230, 116)">
                            <rect
                              x="0"
                              y="0"
                              width="82"
                              height="20"
                              rx="6"
                              fill={isFull ? "#ef4444" : "#059669"}
                            />
                            <text
                              x="41"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {isFull ? "ĐÃ ĐỦ 3/3" : "THẢ VÀO ĐÂY"}
                            </text>
                          </g>
                        )}

                        {/* Member avatar chips */}
                        {occs.map((m, idx) => (
                          <g key={m.id} transform={`translate(${178 + idx * 64}, 118)`}>
                            <rect
                              x="0"
                              y="0"
                              width="58"
                              height="20"
                              rx="10"
                              fill="#ffffff"
                              stroke="#0f6e56"
                              strokeWidth="0.8"
                              opacity="0.95"
                            />
                            <circle cx="10" cy="10" r="7" fill="#0f6e56" />
                            <text
                              x="10"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {m.fullName.charAt(0)}
                            </text>
                            <text
                              x="20"
                              y="11"
                              dominantBaseline="central"
                              fill="#0f6e56"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {m.fullName.split(" ").slice(-1)[0]}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                  {/* 2. NVS + TẮM PHÒNG 4 (x:376, y:67, w:96, h:37) */}
                  {(() => {
                    const rWc4 = rooms.find((r) => r.id === "P.WC_P4");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rWc4 && onSelectRoom(rWc4)}
                        onMouseEnter={() => setHoveredRoomId("P.WC_P4")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="376"
                          y="67"
                          width="96"
                          height="37"
                          fill={hoveredRoomId === "P.WC_P4" ? "#dbeafe" : "#e6f1fb"}
                          stroke="#185fa5"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="410"
                          y="80"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#0c447c"
                          fontSize="13"
                          fontWeight="700"
                        >
                          NVS + tắm
                        </text>
                        <text
                          x="410"
                          y="95"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#185fa5"
                          fontSize="11"
                          fontWeight="600"
                        >
                          phòng 4
                        </text>
                        <ellipse cx="456" cy="87" rx="5" ry="6" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                        <rect x="452" y="76" width="8" height="4" rx="1" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                      </g>
                    );
                  })()}

                  {/* 3. NVS P5 (x:376, y:104, w:96, h:33) */}
                  {(() => {
                    const rWc5 = rooms.find((r) => r.id === "P.WC_P5");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rWc5 && onSelectRoom(rWc5)}
                        onMouseEnter={() => setHoveredRoomId("P.WC_P5")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="376"
                          y="104"
                          width="96"
                          height="33"
                          fill={hoveredRoomId === "P.WC_P5" ? "#dbeafe" : "#e6f1fb"}
                          stroke="#185fa5"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="410"
                          y="121"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#0c447c"
                          fontSize="13"
                          fontWeight="700"
                        >
                          NVS p5
                        </text>
                        <ellipse cx="456" cy="123" rx="5" ry="6" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                        <rect x="452" y="112" width="8" height="4" rx="1" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                      </g>
                    );
                  })()}

                  {/* 4. PHÒNG 5 (x:376, y:137, w:96, h:141) - BEDROOM */}
                  {(() => {
                    const r5 = rooms.find((r) => r.id === "P.5");
                    const occs = roomOccupantsMap["P.5"] || [];
                    const isDragOver = dragOverRoomId === "P.5";
                    const isHovered = hoveredRoomId === "P.5";
                    const isDraggingSelf = draggedMemberId ? occs.some((m) => m.id === draggedMemberId) : false;
                    const isFull = !isDraggingSelf && occs.length >= (r5?.capacity || 3);
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => r5 && onSelectRoom(r5)}
                        onMouseEnter={() => setHoveredRoomId("P.5")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                        onDragOver={(e) => handleRoomDragOver("P.5", e)}
                        onDragLeave={() => handleRoomDragLeave("P.5")}
                        onDrop={(e) => handleRoomDrop("P.5", e)}
                      >
                        <rect
                          x="376"
                          y="137"
                          width="96"
                          height="141"
                          fill={isDragOver ? (isFull ? "#fee2e2" : "#a7f3d0") : isHovered ? "#ccfbf1" : "#e1f5ee"}
                          stroke={isDragOver ? (isFull ? "#ef4444" : "#059669") : "#0f6e56"}
                          strokeWidth={isDragOver ? "3" : "2"}
                          strokeDasharray={isDragOver && isFull ? "4 2" : undefined}
                          rx="2"
                        />
                        <text
                          x="424"
                          y="158"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#085041"
                          fontSize="15"
                          fontWeight="800"
                        >
                          Phòng 5
                        </text>

                        {/* Occupancy pill */}
                        <rect
                          x="399"
                          y="170"
                          width="50"
                          height="16"
                          rx="8"
                          fill={occs.length >= (r5?.capacity || 3) ? "#0f6e56" : "#0d9488"}
                        />
                        <text
                          x="424"
                          y="179"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="700"
                        >
                          {occs.length}/{r5?.capacity || 3} chỗ
                        </text>

                        {/* Drag over indicator */}
                        {isDragOver && (
                          <g transform="translate(383, 192)">
                            <rect
                              x="0"
                              y="0"
                              width="82"
                              height="20"
                              rx="6"
                              fill={isFull ? "#ef4444" : "#059669"}
                            />
                            <text
                              x="41"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {isFull ? "ĐÃ ĐỦ 3/3" : "THẢ VÀO ĐÂY"}
                            </text>
                          </g>
                        )}

                        {/* Member avatar chips */}
                        {occs.map((m, idx) => (
                          <g key={m.id} transform={`translate(382, ${196 + idx * 24})`}>
                            <rect
                              x="0"
                              y="0"
                              width="84"
                              height="20"
                              rx="10"
                              fill="#ffffff"
                              stroke="#0f6e56"
                              strokeWidth="0.8"
                              opacity="0.95"
                            />
                            <circle cx="10" cy="10" r="7" fill="#0f6e56" />
                            <text
                              x="10"
                              y="11"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                            >
                              {m.fullName.charAt(0)}
                            </text>
                            <text
                              x="22"
                              y="11"
                              dominantBaseline="central"
                              fill="#0f6e56"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {m.fullName.split(" ").slice(-2).join(" ")}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}

                  {/* 5. SẢNH NGUYỆN (x:167, y:145, w:209, h:104) */}
                  {(() => {
                    const rSanh2 = rooms.find((r) => r.id === "P.SANH2");
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => rSanh2 && onSelectRoom(rSanh2)}
                        onMouseEnter={() => setHoveredRoomId("P.SANH2")}
                        onMouseLeave={() => setHoveredRoomId(null)}
                      >
                        <rect
                          x="167"
                          y="145"
                          width="209"
                          height="104"
                          fill={hoveredRoomId === "P.SANH2" ? "#e9e7e1" : "#f1efe8"}
                          stroke="#5f5e5a"
                          strokeWidth="2"
                          rx="2"
                        />
                        <text
                          x="282"
                          y="186"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#444441"
                          fontSize="15"
                          fontWeight="700"
                        >
                          Sảnh nguyện
                        </text>
                        <text
                          x="282"
                          y="205"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#5f5e5a"
                          fontSize="12"
                          fontWeight="500"
                        >
                          (sảnh đọc kinh chung)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Bàn thờ T2 (x:359, y:177, w:12, h:26) */}
                  <rect
                    x="359"
                    y="177"
                    width="12"
                    height="26"
                    rx="3"
                    fill="#eeedfe"
                    stroke="#534ab7"
                    strokeWidth="0.8"
                  />
                  <text
                    x="365"
                    y="190"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#534ab7"
                    fontSize="6"
                    fontWeight="700"
                    transform="rotate(90, 365, 190)"
                  >
                    BÀN THỜ
                  </text>

                  {/* Cầu thang thông tầng T2 (x:170, y:169, w:22, h:78 - 12 bậc thang) */}
                  <rect x="170" y="169" width="22" height="78" fill="#ffffff" stroke="#52514e" strokeWidth="1" />
                  {[175, 181, 187, 193, 199, 205, 211, 217, 223, 229, 235, 241].map((yVal) => (
                    <line key={yVal} x1="170" y1={yVal} x2="192" y2={yVal} stroke="#52514e" strokeWidth="0.8" />
                  ))}

                  {/* DOORS T2 (Cam #D85A30 strokeWidth: 5) */}
                  <line x1="172" y1="145" x2="198" y2="145" stroke="#D85A30" strokeWidth="5" />
                  <line x1="376" y1="72" x2="376" y2="92" stroke="#D85A30" strokeWidth="5" />
                  <line x1="380" y1="137" x2="404" y2="137" stroke="#D85A30" strokeWidth="5" />
                  <line x1="376" y1="222" x2="376" y2="244" stroke="#D85A30" strokeWidth="5" />

                  {/* WINDOWS T2 (Xanh #378ADD strokeWidth: 5) */}
                  <line x1="206" y1="67" x2="242" y2="67" stroke="#378ADD" strokeWidth="5" />
                  <line x1="304" y1="67" x2="329" y2="67" stroke="#378ADD" strokeWidth="5" />
                  <line x1="214" y1="145" x2="242" y2="145" stroke="#378ADD" strokeWidth="5" />
                  <line x1="303" y1="145" x2="330" y2="145" stroke="#378ADD" strokeWidth="5" />
                  <line x1="198" y1="249" x2="221" y2="249" stroke="#378ADD" strokeWidth="5" />
                  <line x1="260" y1="249" x2="286" y2="249" stroke="#378ADD" strokeWidth="5" />
                  <line x1="316" y1="249" x2="339" y2="249" stroke="#378ADD" strokeWidth="5" />
                  <line x1="472" y1="161" x2="472" y2="187" stroke="#378ADD" strokeWidth="5" />
                  <line x1="472" y1="234" x2="472" y2="265" stroke="#378ADD" strokeWidth="5" />
                  <line x1="423" y1="278" x2="444" y2="278" stroke="#378ADD" strokeWidth="5" />

                  {/* LEGEND / CHÚ THÍCH TẦNG 2 */}
                  <line x1="40" y1="330" x2="64" y2="330" stroke="#D85A30" strokeWidth="5" />
                  <text x="74" y="330" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cửa phòng
                  </text>

                  <line x1="40" y1="352" x2="64" y2="352" stroke="#378ADD" strokeWidth="5" />
                  <text x="74" y="352" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cửa sổ
                  </text>

                  <rect
                    x="40"
                    y="367"
                    width="24"
                    height="14"
                    fill="url(#hatch-canvas)"
                    stroke="#888780"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <text x="74" y="374" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Chỉ có ở tầng 1
                  </text>

                  <rect x="200" y="325" width="26" height="10" rx="3" fill="#eeedfe" stroke="#534ab7" strokeWidth="0.8" />
                  <text x="236" y="330" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Bàn thờ
                  </text>

                  <rect x="202" y="345" width="20" height="14" fill="#ffffff" stroke="#52514e" strokeWidth="1" />
                  <line x1="202" y1="350" x2="222" y2="350" stroke="#52514e" strokeWidth="0.8" />
                  <line x1="202" y1="354" x2="222" y2="354" stroke="#52514e" strokeWidth="0.8" />
                  <text x="236" y="352" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Cầu thang
                  </text>

                  <ellipse cx="212" cy="376" rx="5" ry="6" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                  <rect x="208" y="366" width="8" height="4" rx="1" fill="#ffffff" stroke="#52514e" strokeWidth="1.2" />
                  <text x="236" y="374" dominantBaseline="central" fill="#52514e" fontSize="11" fontWeight="600">
                    Bồn cầu
                  </text>
                  {renderDynamicRooms(2, true)}
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. COLLAPSIBLE MEMBER DOCK & DRAG PALETTE                                 */}
        {/* ========================================================================= */}
        {isMemberDockOpen && (
          <aside className="w-full lg:w-80 bg-stone-50/90 border-t lg:border-t-0 lg:border-l border-purple-100 flex flex-col h-[320px] lg:h-auto overflow-hidden">
            <div className="p-3.5 bg-white border-b border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-700" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Thành viên lưu xá ({members.length})
                  </h3>
                </div>
                <span className="text-[11px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                  {members.filter((m) => !!m.room).length}/{members.length} có phòng
                </span>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={dockSearch}
                  onChange={(e) => setDockSearch(e.target.value)}
                  placeholder="Tìm theo tên, phòng, vai trò..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-100/80 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Draggable member cards list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredDockMembers.map((m) => {
                const assignedRoom = rooms.find((r) => r.id === m.room);
                const isDragging = draggedMemberId === m.id;

                return (
                  <div
                    key={m.id}
                    draggable={!readOnly}
                    onDragStart={(e) => handleDragStartMember(m.id, e)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group bg-white p-2.5 rounded-2xl border border-stone-200 shadow-xs hover:border-purple-300 hover:shadow-sm transition cursor-grab active:cursor-grabbing flex items-center justify-between gap-2.5 select-none",
                      isDragging && "opacity-40 scale-95 border-purple-400 bg-purple-50"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="text-stone-300 group-hover:text-purple-500 transition">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center shrink-0 border border-purple-200">
                        {m.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate flex items-center gap-1.5">
                          <span>{m.fullName}</span>
                          {m.role !== "Thành viên" && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.2 rounded">
                              {m.role}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                          <span>{assignedRoom ? assignedRoom.name : "Chưa xếp phòng"}</span>
                          {assignedRoom && <span className="text-stone-300">·</span>}
                          {assignedRoom && <span>Tầng {assignedRoom.floor}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-lg border",
                          assignedRoom
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-600 border-red-200"
                        )}
                      >
                        {m.room || "Trống"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredDockMembers.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-xs">
                  Không tìm thấy thành viên phù hợp
                </div>
              )}
            </div>

            {/* Quick overview of rooms on active floor */}
            <div className="p-3 bg-white border-t border-stone-200 text-xs">
              <div className="text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                Phòng tầng {activeFloorId}:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {currentFloorBedrooms.map((r) => {
                  const occs = roomOccupantsMap[r.id] || [];
                  const isFull = occs.length >= r.capacity;
                  return (
                    <div
                      key={r.id}
                      onClick={() => onSelectRoom(r)}
                      className={cn(
                        "p-1.5 rounded-xl border text-[11px] cursor-pointer transition flex items-center justify-between",
                        isFull
                          ? "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                          : "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                      )}
                    >
                      <span className="font-bold">{r.name}</span>
                      <span className="font-extrabold text-[10px]">
                        {occs.length}/{r.capacity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
