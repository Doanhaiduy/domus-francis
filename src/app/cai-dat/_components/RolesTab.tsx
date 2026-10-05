"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  ChevronRight,
  Search,
  Users,
  AlertTriangle,
  Check,
  Info,
  Lock,
  Plus,
  Pencil,
  Trash2,
  Eye,
  X,
  Save,
} from "lucide-react";
import { CustomInput, CustomTextarea } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Portal } from "@/components/ui/Portal";
import { useSession } from "@/lib/session";
import { useApp } from "@/lib/store";
import { fileUrl, errorMessage } from "@/lib/api";
import { rbacApi, refreshRbac } from "@/lib/data/settings";
import {
  CUSTOM_ROLE_RANK,
  PROTECTED_PERMISSIONS,
  PROTECTED_PERMISSION_REASON,
  ROLE_CODE_RE,
  type PermissionModuleDto,
  type RbacMatrixDto,
  type RoleDto,
} from "@/lib/types/settings";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "Ban Lễ tân" → "ban_le_tan" (gợi ý mã khi tạo vai trò). */
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);

const cleanDesc = (d: string | null) => (d ?? "").replace(/^\[ĐỀ XUẤT\]\s*/, "");

interface Props {
  matrix: RbacMatrixDto | undefined;
  isLoading: boolean;
  error: unknown;
}

type EditorState = { mode: "create" } | { mode: "edit"; role: RoleDto } | { mode: "view"; role: RoleDto };

/** Cài đặt → "Phân quyền & Vai trò": danh sách vai trò (hệ thống khóa 🔒, tự tạo sửa/xóa được), trình sửa vai trò, ma trận quyền. */
export default function RolesTab({ matrix, isLoading, error }: Props) {
  const { session } = useSession();
  const { showToast } = useApp();
  const myRoles = session?.roles ?? [];
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [toDelete, setToDelete] = useState<RoleDto | null>(null);

  const roles = matrix?.roles ?? [];
  const canManage = !!matrix?.canManage;
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  if (isLoading && !matrix) {
    return <div className="bg-white rounded-3xl p-10 border border-purple-50 text-center text-xs text-gray-400">Đang tải phân quyền…</div>;
  }
  if (error && !matrix) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> Không tải được phân quyền: {errorMessage(error)}
      </div>
    );
  }

  const doDelete = async (r: RoleDto) => {
    try {
      const res = await rbacApi.deleteRole(r.code);
      showToast(
        "success",
        res.result === "archived"
          ? `Đã xóa vai trò "${r.name}" — người đang giữ đã bị thu hồi; lịch sử được lưu trữ.`
          : `Đã xóa vai trò "${r.name}".`,
      );
      await refreshRbac();
    } catch (e) {
      showToast("error", errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Đầu mục */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Phân quyền &amp; Vai trò</h2>
              <p className="text-xs text-gray-500">
                {systemRoles.length} vai trò hệ thống · {customRoles.length} vai trò tự tạo (các ban, nhóm phụ trách…)
              </p>
            </div>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" /> Thêm vai trò
            </button>
          ) : (
            <span className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              🔒 Chế độ chỉ xem
            </span>
          )}
        </div>
        <div className="p-3 rounded-2xl bg-surface-container-low border border-purple-50 text-[11px] text-gray-600 flex gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            <b>Vai trò hệ thống</b> (Admin, Trưởng nhà, Thủ quỹ, Thành viên) có bộ quyền cố định theo thiết kế — chỉ đổi được tên hiển thị và mô tả.{" "}
            <b>Vai trò tự tạo</b> do Admin thêm, chọn quyền, sửa hoặc xóa. Mỗi người có thể giữ nhiều vai trò; quyền thực tế là hợp các vai trò.
            Gán vai trò cho từng người ở tab <b>Tài khoản</b> hoặc màn hình Thành viên.
            {!canManage && " Chỉ Admin được thêm, sửa hoặc xóa vai trò."}
          </span>
        </div>
        {matrix?.holdersVisibility === "own" && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Vì quyền riêng tư, bạn chỉ thấy vai trò của chính mình trong danh sách người giữ vai trò.</span>
          </div>
        )}
      </div>

      {/* Danh sách vai trò */}
      <RoleSection
        title="Vai trò hệ thống"
        subtitle="Không xóa được · bộ quyền khóa"
        roles={systemRoles}
        myRoles={myRoles}
        canManage={canManage}
        onView={(r) => setEditor({ mode: "view", role: r })}
        onEdit={(r) => setEditor({ mode: "edit", role: r })}
        onDelete={setToDelete}
      />
      <RoleSection
        title="Vai trò tự tạo"
        subtitle={canManage ? "Admin thêm / sửa quyền / xóa" : "Do Admin quản lý"}
        roles={customRoles}
        myRoles={myRoles}
        canManage={canManage}
        onView={(r) => setEditor({ mode: "view", role: r })}
        onEdit={(r) => setEditor({ mode: "edit", role: r })}
        onDelete={setToDelete}
        empty={
          canManage ? (
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="w-full p-6 rounded-2xl border-2 border-dashed border-purple-200 text-xs font-bold text-primary hover:bg-purple-50/60"
            >
              + Thêm vai trò đầu tiên (VD: Trưởng ban Lễ tân)
            </button>
          ) : (
            <p className="text-xs text-gray-400 italic">Chưa có vai trò tự tạo.</p>
          )
        }
      />

      {matrix && <PermissionMatrix matrix={matrix} myRoles={myRoles} />}

      {editor && matrix && (
        <RoleEditor
          key={editor.mode === "create" ? "new" : editor.role.code}
          state={editor}
          matrix={matrix}
          heldByMe={editor.mode !== "create" && myRoles.includes(editor.role.code)}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Xóa vai trò "${toDelete?.name ?? ""}"?`}
        message={
          toDelete && toDelete.holders.length > 0 ? (
            <>
              Vai trò đang có <b>{toDelete.holders.length}</b> người giữ ({toDelete.holders.map((h) => h.name).join(", ")}). Họ sẽ <b>mất các quyền</b> của
              vai trò này ngay lập tức. Vai trò được lưu trữ để giữ lịch sử và không gán lại được.
            </>
          ) : (
            "Vai trò sẽ bị xóa. Nếu từng được gán trước đây, vai trò được lưu trữ để giữ lịch sử."
          )
        }
        confirmText="Xóa vai trò"
        variant="danger"
        onConfirm={() => {
          const r = toDelete;
          setToDelete(null);
          if (r) void doDelete(r);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Danh sách vai trò
// ---------------------------------------------------------------------
function RoleSection({
  title,
  subtitle,
  roles,
  myRoles,
  canManage,
  onView,
  onEdit,
  onDelete,
  empty,
}: {
  title: string;
  subtitle: string;
  roles: RoleDto[];
  myRoles: string[];
  canManage: boolean;
  onView: (r: RoleDto) => void;
  onEdit: (r: RoleDto) => void;
  onDelete: (r: RoleDto) => void;
  empty?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-secondary flex items-center justify-center font-bold shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {roles.length === 0 ? (
        empty
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {roles.map((r) => (
            <RoleCard
              key={r.code}
              role={r}
              mine={myRoles.includes(r.code)}
              canManage={canManage}
              onView={() => onView(r)}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({
  role,
  mine,
  canManage,
  onView,
  onEdit,
  onDelete,
}: {
  role: RoleDto;
  mine: boolean;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const max = role.code === "member" ? 10 : 6;
  const iconBtn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition";
  return (
    <div className={cn("rounded-2xl border p-4 flex flex-col gap-2.5", mine ? "border-purple-200 bg-purple-50/40" : "border-gray-100 bg-white")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 leading-tight flex items-center gap-1.5">
            {role.isSystem && <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Vai trò hệ thống" />}
            <span className="truncate">{role.name}</span>
          </h3>
          <p className="text-[10.5px] text-gray-400 mt-0.5">
            {role.isSystem ? "Vai trò hệ thống" : "Vai trò tự tạo"} · {role.permissionCount} quyền{mine ? " · bạn đang giữ" : ""}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 shrink-0" title="Số người đang giữ">
          {role.holders.length}
        </span>
      </div>
      {role.description && <p className="text-[11px] text-gray-500 leading-snug line-clamp-3">{cleanDesc(role.description)}</p>}
      <div className="flex flex-wrap gap-1.5">
        {role.holders.slice(0, max).map((h) => {
          const src = fileUrl(h.avatarFileId, "thumb");
          return (
            <span
              key={h.userId}
              className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10.5px] font-semibold text-gray-700"
              title={h.fullName ?? h.name}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-purple-100 text-primary text-[8.5px] font-black flex items-center justify-center">
                  {initials(h.name)}
                </span>
              )}
              {h.name}
            </span>
          );
        })}
        {role.holders.length > max && <span className="text-[10.5px] text-gray-400 self-center">+{role.holders.length - max}</span>}
        {role.holders.length === 0 && <span className="text-[10.5px] text-gray-400 italic">Chưa thấy ai giữ vai trò này</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-auto pt-1.5 border-t border-gray-100/80">
        <button type="button" onClick={onView} className={`${iconBtn} border-gray-200 text-gray-600 hover:bg-gray-50`}>
          <Eye className="w-3.5 h-3.5" /> Xem quyền
        </button>
        {canManage && (
          <button type="button" onClick={onEdit} className={`${iconBtn} border-purple-200 text-primary hover:bg-purple-50`}>
            <Pencil className="w-3.5 h-3.5" /> {role.isSystem ? "Đổi tên" : "Sửa"}
          </button>
        )}
        {canManage && !role.isSystem && (
          <button type="button" onClick={onDelete} className={`${iconBtn} border-rose-200 text-rose-600 hover:bg-rose-50`}>
            <Trash2 className="w-3.5 h-3.5" /> Xóa
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Trình sửa vai trò
// ---------------------------------------------------------------------
function RoleEditor({
  state,
  matrix,
  heldByMe,
  onClose,
}: {
  state: EditorState;
  matrix: RbacMatrixDto;
  heldByMe: boolean;
  onClose: () => void;
}) {
  const { showToast } = useApp();
  const role = state.mode === "create" ? null : state.role;
  const readOnly = state.mode === "view";
  const isSystem = !!role?.isSystem;
  const permsLocked = readOnly || isSystem;
  const protectedSet = useMemo(
    () => new Set<string>(matrix.protectedPermissions.length ? matrix.protectedPermissions : PROTECTED_PERMISSIONS),
    [matrix.protectedPermissions],
  );
  const original = useMemo(() => new Set(role?.permissions ?? []), [role]);

  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState(cleanDesc(role?.description ?? null));
  const [rank, setRank] = useState<string>(String(role?.rank ?? CUSTOM_ROLE_RANK.default));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(readOnly);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (state.mode === "create" && !codeTouched) setCode(slugify(name));
  }, [name, codeTouched, state.mode]);

  const modules: PermissionModuleDto[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matrix.modules
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            (!onlySelected || selected.has(p.code)) &&
            (!q || p.description.toLowerCase().includes(q) || p.code.includes(q) || m.label.toLowerCase().includes(q)),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [matrix.modules, query, onlySelected, selected]);
  const searching = query.trim().length > 0 || onlySelected;

  // Không cho THÊM quyền vào vai trò mình đang giữ (DB cũng chặn — BR-RBAC-05); bớt quyền thì được
  const canAdd = (pcode: string) => !permsLocked && !protectedSet.has(pcode) && (!heldByMe || original.has(pcode));
  const toggle = (pcode: string) => {
    if (permsLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pcode)) next.delete(pcode);
      else if (canAdd(pcode)) next.add(pcode);
      return next;
    });
  };
  const toggleModule = (m: PermissionModuleDto, on: boolean) => {
    if (permsLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of m.permissions) {
        if (on && canAdd(p.code)) next.add(p.code);
        if (!on) next.delete(p.code);
      }
      return next;
    });
  };

  const rankNum = Number(rank);
  const nameErr = name.trim().length < 2 ? "Tên vai trò tối thiểu 2 ký tự." : name.trim().length > 80 ? "Tối đa 80 ký tự." : null;
  const codeErr = state.mode === "create" && !ROLE_CODE_RE.test(code) ? "3–40 ký tự: chữ thường không dấu, số, dấu gạch dưới; bắt đầu bằng chữ." : null;
  const rankErr =
    !isSystem && rank !== String(role?.rank ?? "") && (!Number.isInteger(rankNum) || rankNum < CUSTOM_ROLE_RANK.min || rankNum > CUSTOM_ROLE_RANK.max)
      ? `Từ ${CUSTOM_ROLE_RANK.min} đến ${CUSTOM_ROLE_RANK.max}.`
      : null;
  const descErr = description.trim().length > 300 ? "Tối đa 300 ký tự." : null;
  const invalid = !!(nameErr || codeErr || rankErr || descErr);

  const save = async () => {
    if (invalid || readOnly) return;
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        rank: isSystem ? null : rankNum,
        permissions: isSystem ? null : [...selected].sort(),
      };
      if (state.mode === "create") {
        await rbacApi.createRole({ ...body, code });
        showToast("success", `Đã thêm vai trò "${body.name}". Gán cho thành viên ở tab Tài khoản.`);
      } else if (role) {
        await rbacApi.updateRole(role.code, body);
        showToast("success", `Đã lưu vai trò "${body.name}".`);
      }
      await refreshRbac();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const title = state.mode === "create" ? "Thêm vai trò" : readOnly ? role!.name : isSystem ? `Đổi tên — ${role!.name}` : `Sửa vai trò — ${role!.name}`;
  const added = [...selected].filter((p) => !original.has(p)).length;
  const removed = [...original].filter((p) => !selected.has(p)).length;

  return (
    <Portal>
      <div onClick={onClose} className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-2 sm:p-5 animate-in fade-in duration-150">
        <div className="flex min-h-full items-center justify-center">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl my-auto bg-white rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[92vh] overflow-hidden"
          >
            <div className="flex items-start justify-between p-4 sm:p-6 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-primary flex items-center justify-center shrink-0">
                  {isSystem ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">{title}</h3>
                  <p className="text-xs text-gray-500">
                    {state.mode === "create" ? "Vai trò tự tạo" : isSystem ? "Vai trò hệ thống — bộ quyền cố định" : "Vai trò tự tạo"} · {selected.size} quyền
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 shrink-0" aria-label="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
              {!readOnly && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomInput label="Tên vai trò" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Trưởng ban Lễ tân" error={nameErr ?? undefined} maxLength={80} />
                  {state.mode === "create" ? (
                    <CustomInput
                      label="Mã vai trò (không đổi được sau khi tạo)"
                      value={code}
                      onChange={(e) => {
                        setCodeTouched(true);
                        setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                      }}
                      placeholder="truong_ban_le_tan"
                      error={codeErr ?? undefined}
                      maxLength={40}
                    />
                  ) : !isSystem ? (
                    <CustomInput
                      label={`Thứ tự hiển thị (${CUSTOM_ROLE_RANK.min}–${CUSTOM_ROLE_RANK.max}, nhỏ đứng trước)`}
                      type="number"
                      value={rank}
                      onChange={(e) => setRank(e.target.value)}
                      error={rankErr ?? undefined}
                    />
                  ) : (
                    <div className="text-[11px] text-gray-500 p-3 rounded-xl bg-amber-50 border border-amber-100 self-end">
                      🔒 Vai trò hệ thống: chỉ đổi được tên hiển thị và mô tả.
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <CustomTextarea label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} error={descErr ?? undefined} maxLength={300} placeholder="Phụ trách việc gì, trong phạm vi nào…" />
                  </div>
                  {state.mode === "create" && (
                    <div className="sm:col-span-2 max-w-[220px]">
                      <CustomInput
                        label={`Thứ tự hiển thị (${CUSTOM_ROLE_RANK.min}–${CUSTOM_ROLE_RANK.max})`}
                        type="number"
                        value={rank}
                        onChange={(e) => setRank(e.target.value)}
                        error={rankErr ?? undefined}
                      />
                    </div>
                  )}
                </div>
              )}
              {readOnly && role?.description && <p className="text-xs text-gray-600">{cleanDesc(role.description)}</p>}

              {heldByMe && !permsLocked && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Bạn đang giữ vai trò này nên chỉ có thể bớt quyền (không tự thêm quyền cho chính mình).
                </div>
              )}

              {/* Chọn quyền */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <h4 className="text-sm font-bold text-gray-900">
                    Quyền {permsLocked ? "" : "được cấp"}
                    {!permsLocked && state.mode === "edit" && (added || removed) ? (
                      <span className="ml-2 text-[11px] font-semibold text-primary">
                        {added ? `+${added}` : ""} {removed ? `−${removed}` : ""}
                      </span>
                    ) : null}
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 sm:w-56">
                      <CustomInput placeholder="Tìm quyền…" value={query} onChange={(e) => setQuery(e.target.value)} leftIcon={<Search className="w-3.5 h-3.5" />} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnlySelected((s) => !s)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-[11px] font-bold border whitespace-nowrap",
                        onlySelected ? "bg-purple-50 border-purple-200 text-primary" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
                      )}
                    >
                      Chỉ quyền đã chọn
                    </button>
                  </div>
                </div>
                {isSystem && !readOnly && (
                  <p className="text-[11px] text-gray-500">Bộ quyền của vai trò hệ thống được khóa theo thiết kế (tách bạch tài chính và dữ liệu cá nhân).</p>
                )}
                <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {modules.map((m) => {
                    const expanded = searching || permsLocked || !!open[m.code];
                    const n = m.permissions.filter((p) => selected.has(p.code)).length;
                    const addable = m.permissions.filter((p) => canAdd(p.code));
                    const allOn = addable.length > 0 && addable.every((p) => selected.has(p.code));
                    return (
                      <div key={m.code}>
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-container-low/50">
                          <button
                            type="button"
                            onClick={() => setOpen((o) => ({ ...o, [m.code]: !o[m.code] }))}
                            className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-xs font-bold text-gray-900"
                          >
                            <ChevronRight className={cn("w-3.5 h-3.5 text-gray-400 transition-transform shrink-0", expanded && "rotate-90 text-primary")} />
                            <span className="truncate">{m.label}</span>
                            <span className="text-[10px] font-semibold text-gray-400 shrink-0">
                              ({n}/{m.permissions.length})
                            </span>
                          </button>
                          {!permsLocked && addable.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleModule(m, !allOn)}
                              className="text-[10.5px] font-bold text-primary hover:underline shrink-0"
                            >
                              {allOn ? "Bỏ chọn nhóm" : "Chọn cả nhóm"}
                            </button>
                          )}
                        </div>
                        {expanded && (
                          <ul className="divide-y divide-gray-50">
                            {m.permissions.map((p) => {
                              const on = selected.has(p.code);
                              const isProtected = protectedSet.has(p.code);
                              const blocked = !on && !canAdd(p.code);
                              const reason = permsLocked
                                ? null
                                : isProtected
                                  ? PROTECTED_PERMISSION_REASON[p.code] ?? "Chỉ vai trò hệ thống có quyền này"
                                  : heldByMe && blocked
                                    ? "Bạn đang giữ vai trò này"
                                    : null;
                              return (
                                <li key={p.code}>
                                  <label
                                    className={cn(
                                      "flex items-start gap-2.5 px-3 py-2 pl-8",
                                      !permsLocked && !blocked ? "cursor-pointer hover:bg-gray-50/70" : "",
                                      !permsLocked && isProtected && "opacity-60",
                                    )}
                                    title={reason ?? undefined}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      disabled={permsLocked || blocked}
                                      onChange={() => toggle(p.code)}
                                      className="accent-primary w-4 h-4 mt-0.5 shrink-0"
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-[11.5px] text-gray-800 leading-snug">
                                        {p.description}
                                        {p.isSensitive && (
                                          <span className="ml-1.5 align-middle px-1.5 py-[1px] rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-100">
                                            Nhạy cảm
                                          </span>
                                        )}
                                      </span>
                                      {reason && (
                                        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-700">
                                          <Lock className="w-3 h-3" /> {reason}
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {modules.length === 0 && <p className="p-6 text-center text-xs text-gray-400">Không có quyền nào khớp bộ lọc.</p>}
                </div>
              </div>

              {err && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {err}
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 sm:px-6 border-t border-gray-100 shrink-0 flex items-center justify-end gap-2 bg-gray-50/70">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700">
                {readOnly ? "Đóng" : "Hủy"}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || invalid}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-xs font-bold text-white shadow-md shadow-purple-200 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" /> {saving ? "Đang lưu…" : state.mode === "create" ? "Thêm vai trò" : "Lưu"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------
// Ma trận vai trò × quyền (chỉ đọc) — màn hình rộng; trên điện thoại xem quyền trong từng vai trò
// ---------------------------------------------------------------------
function PermissionMatrix({ matrix, myRoles }: { matrix: RbacMatrixDto; myRoles: string[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [shown, setShown] = useState(false);
  const roles = matrix.roles;
  const modules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matrix.modules
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            (!sensitiveOnly || p.isSensitive) &&
            (!q || p.description.toLowerCase().includes(q) || p.code.includes(q) || m.label.toLowerCase().includes(q)),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [matrix, query, sensitiveOnly]);
  const searching = query.trim().length > 0 || sensitiveOnly;
  const allOpen = modules.length > 0 && modules.every((m) => open[m.code]);
  const totalPerms = matrix.modules.reduce((n, m) => n + m.permissions.length, 0);

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-primary flex items-center justify-center font-bold shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Ma trận quyền</h2>
            <p className="text-xs text-gray-500">
              {roles.length} vai trò × {totalPerms} quyền nguyên tử, nhóm theo phân hệ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="hidden sm:inline-flex self-start md:self-auto px-3 py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        >
          {shown ? "Ẩn ma trận" : "Hiện ma trận"}
        </button>
      </div>
      <p className="sm:hidden text-[11px] text-gray-500">Trên điện thoại, bấm “Xem quyền” ở từng vai trò để xem chi tiết.</p>

      {shown && (
        <div className="hidden sm:flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <CustomInput placeholder="Tìm quyền..." value={query} onChange={(e) => setQuery(e.target.value)} leftIcon={<Search className="w-3.5 h-3.5" />} />
            </div>
            <button
              type="button"
              onClick={() => setSensitiveOnly((s) => !s)}
              className={cn(
                "px-3 py-2.5 rounded-xl text-[11px] font-bold border transition whitespace-nowrap",
                sensitiveOnly ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              Quyền nhạy cảm
            </button>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? {} : Object.fromEntries(modules.map((m) => [m.code, true])))}
              className="px-3 py-2.5 rounded-xl text-[11px] font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              {allOpen ? "Thu gọn tất cả" : "Mở tất cả"}
            </button>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3 min-w-[260px]">Phân hệ / Quyền</th>
                  {roles.map((r) => (
                    <th key={r.code} className={cn("py-3 px-2 text-center align-bottom", myRoles.includes(r.code) && "bg-purple-50/70 text-primary rounded-t-xl")}>
                      <div className="leading-tight normal-case text-[10.5px]">
                        {r.isSystem && "🔒 "}
                        {r.name.replace(" (quản trị kỹ thuật)", "")}
                      </div>
                      <div className="mt-0.5 text-[9px] font-semibold text-gray-400 normal-case">
                        {r.permissionCount} quyền{myRoles.includes(r.code) ? " · bạn" : ""}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-gray-700 font-medium">
                {modules.map((m) => {
                  const expanded = searching || !!open[m.code];
                  return (
                    <React.Fragment key={m.code}>
                      <tr
                        className="border-t border-gray-100 bg-surface-container-low/60 hover:bg-purple-50/50 cursor-pointer"
                        onClick={() => setOpen((o) => ({ ...o, [m.code]: !o[m.code] }))}
                      >
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", expanded && "rotate-90 text-primary")} />
                            {m.label}
                            <span className="text-[10px] font-semibold text-gray-400">({m.permissions.length})</span>
                          </span>
                        </td>
                        {roles.map((r) => {
                          const n = m.permissions.filter((p) => p.roles.includes(r.code)).length;
                          return (
                            <td key={r.code} className={cn("py-2.5 px-2 text-center", myRoles.includes(r.code) && "bg-purple-50/70")}>
                              <span
                                className={cn(
                                  "inline-block min-w-[42px] px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap",
                                  n === 0 ? "text-gray-300" : n === m.permissions.length ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600",
                                )}
                              >
                                {n === 0 ? "—" : n === m.permissions.length ? "Toàn quyền" : `${n}/${m.permissions.length}`}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                      {expanded &&
                        m.permissions.map((p) => (
                          <tr key={p.code} className="border-t border-gray-50 hover:bg-gray-50/60">
                            <td className="py-2 px-3 pl-8">
                              <div className="text-[11.5px] text-gray-800 leading-snug">
                                {p.description}
                                {p.isSensitive && (
                                  <span className="ml-1.5 align-middle px-1.5 py-[1px] rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-100">
                                    Nhạy cảm
                                  </span>
                                )}
                              </div>
                            </td>
                            {roles.map((r) => (
                              <td key={r.code} className={cn("py-2 px-2 text-center", myRoles.includes(r.code) && "bg-purple-50/70")}>
                                {p.roles.includes(r.code) ? (
                                  <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center">
                                    <Check className="w-3 h-3" strokeWidth={3} />
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
                {modules.length === 0 && (
                  <tr>
                    <td colSpan={roles.length + 1} className="py-10 text-center text-gray-400">
                      Không có quyền nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
