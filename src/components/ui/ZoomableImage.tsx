"use client";

import React from "react";
import { openImageViewer, viewerImageFromSrc, type ViewerImage } from "@/lib/image-viewer";
import { cn } from "@/lib/utils";

export interface ZoomableImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onClick"> {
  src: string;
  /** Ảnh (hoặc cả bộ ảnh) mở trong trình xem khi bấm; mặc định = chính ảnh này (nhận diện được tệp /api/v1/files/<mã> để nạp ảnh gốc nét). */
  viewer?: ViewerImage | ViewerImage[];
  /** Vị trí ảnh đang bấm trong bộ ảnh */
  index?: number;
}

/**
 * Ảnh bấm vào là mở trình xem ảnh dùng chung (phóng to / kéo / xoay / tải về). Bấm KHÔNG lan ra phần tử cha
 * (vd. thẻ có onClick riêng), phím Enter / Space cũng mở được.
 */
export function ZoomableImage({ src, viewer, index = 0, alt, className, title, ...rest }: ZoomableImageProps) {
  const open = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openImageViewer(viewer ?? viewerImageFromSrc(src, alt), viewer ? index : 0);
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      alt={alt ?? ""}
      title={title ?? "Bấm để xem ảnh lớn"}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(e)}
      className={cn("cursor-zoom-in", className)}
    />
  );
}
