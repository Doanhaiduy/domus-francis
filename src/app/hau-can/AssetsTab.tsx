"use client";
// Tab "Mượn đồ chung": sổ tài sản cho mượn (assets.is_loanable) + lượt mượn đang mở (asset_loans).
// Mượn cho chính mình, trả (người mượn hoặc asset.manage); một thiết bị chỉ một người mượn tại một thời điểm (EXCLUDE).
import React, { useEffect, useState } from "react";
import { Loader2, Package, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { CustomInput, CustomSelect, CustomToggle } from "@/components/ui/FormControls";
import { assetsApi, refreshAssets } from "@/lib/data/duty";
import { ASSET_TYPE_LABEL, assetIcon, vnStamp, vnToday } from "@/lib/duty-format";
import type { AssetDto } from "@/lib/types/duty";
import { ModalShell } from "./ui";

const DUE_OPTIONS = [
  { value: "tonight", label: "Tối nay 22:00" },
  { value: "tomorrow", label: "Ngày mai 22:00" },
  { value: "3d", label: "3 ngày" },
  { value: "7d", label: "1 tuần" },
];
function dueAt(opt: string): string {
  const today = vnToday();
  const at22 = (iso: string) => new Date(`${iso}T22:00:00+07:00`);
  if (opt === "tonight") {
    const t = at22(today);
    return (t.getTime() - Date.now() > 30 * 60e3 ? t : new Date(Date.now() + 2 * 3600e3)).toISOString();
  }
  if (opt === "tomorrow") return at22(new Date(Date.parse(today) + 86400e3).toISOString().slice(0, 10)).toISOString();
  return new Date(Date.now() + (opt === "3d" ? 3 : 7) * 86400e3).toISOString();
}

export default function AssetsTab({ assets, loaded, addOpen, onCloseAdd }: { assets: AssetDto[]; loaded: boolean; addOpen: boolean; onCloseAdd: () => void }) {
  const { showToast } = useApp();
  const { can } = useSession();
  const canManage = can("asset.manage");
  const [borrowTarget, setBorrowTarget] = useState<AssetDto | null>(null);
  const [due, setDue] = useState("tonight");
  const [busy, setBusy] = useState<string | null>(null);
  const today = vnToday();

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      showToast("success", ok);
      return true;
    } catch (e) {
      showToast("error", errorMessage(e));
      return false;
    } finally {
      setBusy(null);
      await refreshAssets();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-purple-50 shadow-xs flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Thiết bị &amp; Đồ dùng dùng chung</h2>
          <p className="text-xs text-gray-500">Kho dụng cụ tầng trệt và phòng sinh hoạt · mượn xong nhớ trả đúng hạn</p>
        </div>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 p-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách thiết bị…
        </div>
      ) : assets.length === 0 ? (
        <div className="p-10 text-center text-xs text-gray-500">
          <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          Chưa có thiết bị nào trong sổ tài sản.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((item) => {
            const loan = item.currentLoan;
            const available = item.isLoanable && item.status === "in_service" && !loan;
            const canReturn = !!loan && (loan.isMine || canManage);
            return (
              <div key={item.id} className="p-4 rounded-2xl bg-surface-container-low/60 border border-purple-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg shrink-0">{assetIcon(item)}</div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-gray-900 truncate" title={item.name}>
                      {item.name}
                    </h3>
                    <p className="text-[11px] text-gray-400 truncate" title={item.location}>
                      {item.location} · <span className="font-mono">{item.tag}</span>
                    </p>
                    {loan && (
                      <p className={`text-[10px] font-semibold ${loan.isOverdue ? "text-rose-600" : "text-amber-700"}`}>
                        {loan.isMine ? "Bạn đang mượn" : `${loan.borrower.name} đang mượn`} · {loan.isOverdue ? "quá hạn " : "trả "}
                        {vnStamp(loan.dueAt, today)}
                      </p>
                    )}
                    {!loan && item.status !== "in_service" && <p className="text-[10px] font-semibold text-gray-500">Đang sửa chữa / tạm ngưng</p>}
                    {!loan && item.status === "in_service" && !item.isLoanable && <p className="text-[10px] text-gray-400">Không cho mượn ra ngoài</p>}
                  </div>
                </div>

                {available ? (
                  <button
                    onClick={() => {
                      setDue("tonight");
                      setBorrowTarget(item);
                    }}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition bg-primary text-white hover:bg-primary-container shrink-0"
                  >
                    Mượn
                  </button>
                ) : canReturn ? (
                  <button
                    onClick={() => act(item.id, () => assetsApi.giveBack(loan!.id), `Đã hoàn trả ${item.name} vào kho!`)}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition bg-gray-200 text-gray-700 hover:bg-gray-300 shrink-0 inline-flex items-center gap-1"
                  >
                    {busy === item.id && <Loader2 className="w-3 h-3 animate-spin" />}
                    {loan!.isMine ? "Trả" : "Nhận lại"}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-gray-100 text-gray-400 shrink-0">{loan ? "Đang mượn" : "—"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModalShell open={!!borrowTarget} onClose={() => setBorrowTarget(null)} icon={borrowTarget ? assetIcon(borrowTarget) : "📦"} title="Mượn Thiết Bị Dùng Chung" subtitle={borrowTarget?.name}>
        {borrowTarget && (
          <div className="p-5 space-y-4">
            <div className="p-3 rounded-2xl bg-surface-container-low/70 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">Vị trí cất:</span>
                <span className="font-bold text-gray-900 text-right">{borrowTarget.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Mã tài sản:</span>
                <span className="font-mono font-bold text-gray-900">{borrowTarget.tag}</span>
              </div>
            </div>
            <CustomSelect label="Hạn trả:" value={due} onChange={setDue} options={DUE_OPTIONS} />
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
              <button type="button" onClick={() => setBorrowTarget(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
                Hủy
              </button>
              <button
                onClick={async () => {
                  const t = borrowTarget;
                  if (await act(t.id, () => assetsApi.borrow(t.id, dueAt(due)), `Đã ghi nhận mượn ${t.name} thành công!`)) setBorrowTarget(null);
                }}
                disabled={busy === borrowTarget.id}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {busy === borrowTarget.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Xác nhận mượn
              </button>
            </div>
          </div>
        )}
      </ModalShell>

      <AddAssetModal open={addOpen && canManage} onClose={onCloseAdd} />
    </div>
  );
}

function AddAssetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast, rooms } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState("tool");
  const [roomCode, setRoomCode] = useState("");
  const [loc, setLoc] = useState("");
  const [loanable, setLoanable] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setType("tool");
      setRoomCode("");
      setLoc("");
      setLoanable(true);
    }
  }, [open]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await assetsApi.create({ name: name.trim(), type, roomCode: roomCode || null, locationText: loc.trim() || null, isLoanable: loanable });
      await refreshAssets();
      showToast("success", `Đã thêm ${name.trim()} vào sổ tài sản.`);
      onClose();
    } catch (err) {
      showToast("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell open={open} onClose={onClose} icon={<Plus className="w-5 h-5" />} title="Thêm Thiết Bị Dùng Chung" subtitle="Mã tài sản được hệ thống tự cấp">
      <form onSubmit={submit} className="p-5 space-y-3.5">
        <CustomInput label="Tên thiết bị *" required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Máy hút bụi cầm tay" />
        <div className="grid grid-cols-2 gap-3">
          <CustomSelect label="Loại:" value={type} onChange={setType} options={Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <CustomSelect
            label="Phòng cất:"
            value={roomCode}
            onChange={setRoomCode}
            options={[{ value: "", label: "— Không chọn —" }, ...rooms.map((r) => ({ value: r.id, label: r.name, subLabel: r.id }))]}
          />
        </div>
        <CustomInput label="Vị trí cụ thể:" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="VD: Tủ đồ nghề tầng 1" />
        <CustomToggle checked={loanable} onChange={setLoanable} label="Cho anh em mượn" description="Hiện nút Mượn trong danh sách đồ dùng chung" />
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#4d2dbf] text-white text-xs font-bold shadow-md shadow-purple-200 transition disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Thêm thiết bị
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
