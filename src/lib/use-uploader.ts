"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";
import { isAbort, uploadFile, type UploadBucket, type UploadedFile, type UploadPhase } from "./uploader";

export interface UploadState {
  name: string;
  phase: UploadPhase;
  /** 0–1: tiến độ gửi (chỉ có nghĩa ở pha "uploading") */
  ratio: number;
  /** Tải nhiều ảnh: thứ tự hiện tại (1-based) / tổng số */
  index?: number;
  total?: number;
}

/**
 * Trạng thái tải lên của MỘT ô tải ảnh: `run(file, bucket)` tải (có tiến độ), `cancel()` hủy. `state` = null khi rảnh.
 * Tự hủy khi component bị gỡ ra (đóng hộp thoại) để không để lại yêu cầu treo.
 */
export function useUploader() {
  const [state, setState] = useState<UploadState | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  const run = useCallback(async (file: File, bucket: UploadBucket, extra?: Pick<UploadState, "index" | "total">): Promise<UploadedFile> => {
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    setState({ name: file.name, phase: "optimizing", ratio: 0, ...extra });
    try {
      return await uploadFile(file, bucket, {
        signal,
        onPhase: (phase) => setState((s) => (s ? { ...s, phase } : s)),
        onProgress: (ratio) => setState((s) => (s ? { ...s, ratio } : s)),
      });
    } finally {
      setState(null);
    }
  }, []);

  const cancel = useCallback(() => ctl.current?.abort(), []);
  return { state, uploading: state !== null, run, cancel };
}

/** Thông điệp lỗi cho người dùng; null nếu người dùng chủ động hủy (không phải lỗi). */
export const uploadErrorMessage = (e: unknown): string | null => (isAbort(e) ? null : errorMessage(e));
