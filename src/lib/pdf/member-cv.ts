"use client";

import type { Content, TableCell } from "pdfmake/interfaces";
import { cohortLabel, type Member } from "@/lib/types/members";
import { C, FONT, baseDoc, doubleRule, downloadPdf, fileSlug, imageToDataUrl, plain, sectionBar, signatures } from "./core";

export interface MemberCvPdfInput {
  member: Member;
  org: { orderName?: string; houseName?: string; motto?: string; address?: string; contactPhone?: string; chaplainName?: string };
  houseHeadName: string | null;
  /** Tình trạng đóng quỹ đã diễn giải (null = không có quyền xem) */
  dues: { text: string; tone: "ok" | "owe" | "none" } | null;
}

type KV = { k: string; v: string; full?: boolean; color?: string; bold?: boolean; mono?: boolean };

/** Lưới "nhãn: giá trị" 2 cột; mục full chiếm cả hàng. */
function kvGrid(items: KV[]): Content {
  const cell = (it: KV): TableCell[] => [
    { text: it.k, fontSize: 8, color: C.muted, margin: [0, 1, 0, 0] },
    { text: it.v || "—", color: it.color ?? C.ink, bold: !!it.bold, fontSize: 9.5, ...(it.mono ? { characterSpacing: 0.3 } : {}) },
  ];
  const rows: TableCell[][] = [];
  let pending: KV | null = null;
  const flush = () => {
    if (pending) {
      rows.push([...cell(pending), {}, {}]);
      pending = null;
    }
  };
  for (const it of items) {
    if (it.full) {
      flush();
      const [a, b] = cell(it);
      rows.push([a, { ...(b as object), colSpan: 3 } as TableCell, {}, {}]);
    } else if (pending) {
      rows.push([...cell(pending), ...cell(it)]);
      pending = null;
    } else pending = it;
  }
  flush();
  return {
    table: { widths: [92, "*", 92, "*"], body: rows, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length ? 0 : 0.4),
      hLineColor: () => C.line,
      vLineWidth: () => 0,
      paddingLeft: () => 4,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

const STATUS: Record<string, string> = { graduated: "Đã tốt nghiệp (ra trường)", suspended: "Bảo lưu", dropped_out: "Thôi học" };

/** PDF "Sơ yếu lý lịch sinh viên nội trú" (A4 dọc, có ô ảnh 3×4 và 3 chữ ký). */
export async function downloadMemberCvPdf(p: MemberCvPdfInput) {
  const { member: m, org } = p;
  const W = 595 - 84;
  const house = org.houseName || "Lưu Xá Sinh Viên Công Giáo Phanxicô Assisi";
  const now = new Date();
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const photo = m.avatarFileId ? await imageToDataUrl(`/api/v1/files/${m.avatarFileId}?v=medium`, 480) : null;

  const photoBox: Content = photo
    ? { image: photo, fit: [70, 93] }
    : {
        table: { widths: [70], heights: [93], body: [[{ text: "ẢNH 3×4\n(Dán ảnh tại đây)", alignment: "center", color: C.faint, fontSize: 7.5, margin: [0, 34, 0, 0] }]] },
        layout: {
          hLineWidth: () => 0.8,
          vLineWidth: () => 0.8,
          hLineColor: () => C.faint,
          vLineColor: () => C.faint,
          hLineStyle: () => ({ dash: { length: 3 } }),
          vLineStyle: () => ({ dash: { length: 3 } }),
        },
      };

  const dues = p.dues
    ? { v: p.dues.text, color: p.dues.tone === "ok" ? C.green : p.dues.tone === "owe" ? C.red : C.muted, bold: p.dues.tone !== "none" }
    : { v: "—", color: C.muted, bold: false };

  const content: Content[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            ...(org.orderName ? [{ text: org.orderName.toUpperCase(), fontSize: 7.5, bold: true, color: C.muted, characterSpacing: 0.5 }] : []),
            { text: house.toUpperCase(), font: FONT.heavy, fontSize: 12, color: C.ink, margin: [0, 2, 0, 0] },
            { text: `“${org.motto || "Pax et Bonum — Bình An và Thiện Hảo"}”`, italics: true, fontSize: 8.5, color: C.primary, margin: [0, 2, 0, 0] },
            { text: `Địa chỉ: ${org.address || "—"}${org.contactPhone ? ` · Hotline: ${org.contactPhone}` : ""}`, fontSize: 8, color: C.muted, margin: [0, 3, 0, 0] },
          ],
        },
        { width: 72, stack: [photoBox] },
      ],
      columnGap: 14,
    },
    doubleRule(W),
    {
      margin: [0, 0, 0, 6],
      stack: [
        { text: "SƠ YẾU LÝ LỊCH SINH VIÊN NỘI TRÚ", style: "h1", alignment: "center" },
        { text: `(Hồ sơ quản lý nhân sự & đăng ký tạm trú lưu xá · Niên khóa ${y} – ${y + 1})`, alignment: "center", italics: true, fontSize: 8.5, color: C.muted, margin: [0, 3, 0, 0] },
      ],
    },

    sectionBar("I. Thông tin bản thân & đức tin"),
    kvGrid([
      { k: "Tên Thánh", v: m.holyName || "Chưa cập nhật", color: C.primary, bold: true },
      { k: "Họ và tên khai sinh", v: m.fullName.toUpperCase(), bold: true },
      { k: "Ngày tháng năm sinh", v: m.birthDate || "" },
      { k: "Giới tính", v: m.gender || "Nam" },
      { k: "Số CCCD / Định danh", v: m.identityCard || "", mono: true },
      { k: "Điện thoại cá nhân", v: m.phone || "", bold: true, mono: true },
      { k: "Giáo phận", v: m.diocese || "" },
      { k: "Giáo xứ / Giáo họ", v: m.parish || "" },
      { k: "Linh mục chính xứ", v: m.pastor || "", full: true },
      { k: "Các Bí tích đã lãnh", v: m.sacraments?.length ? m.sacraments.join(" · ") : "", full: true },
    ]),

    sectionBar("II. Quá trình học tập & đào tạo"),
    kvGrid([
      { k: "Trường Đại học", v: m.university || "", bold: true, full: true },
      { k: "Ngành / Chuyên ngành", v: m.major || "" },
      { k: "Niên khóa", v: cohortLabel(m) },
      { k: "Tình trạng", v: (m.studentStatus && STATUS[m.studentStatus]) || "Đang học (sinh viên)", color: m.studentStatus === "graduated" ? C.primaryDark : C.ink, bold: m.studentStatus === "graduated" },
      { k: "Mã số sinh viên", v: m.studentCode || "", mono: true },
      { k: "Quê quán", v: m.hometown || "", full: true },
    ]),

    sectionBar("III. Thông tin gia đình & liên hệ khẩn cấp"),
    kvGrid([
      { k: "Họ tên Bố / Phụ huynh", v: m.fatherName || "" },
      { k: "Họ tên Mẹ", v: m.motherName || "" },
      { k: "SĐT liên hệ khẩn cấp", v: m.parentPhone || "", color: C.red, bold: true, mono: true, full: true },
      { k: "Địa chỉ gia đình", v: m.homeAddress || m.hometown || "", full: true },
    ]),

    sectionBar("IV. Sinh hoạt tại lưu xá"),
    kvGrid([
      { k: "Phòng ở hiện tại", v: m.room || "", color: C.primaryDark, bold: true },
      { k: "Ngày nhập xá", v: m.joined || "" },
      { k: "Chức vụ trong lưu xá", v: m.role || "", bold: true },
      { k: "Tình trạng đóng quỹ", v: dues.v, color: dues.color, bold: dues.bold },
      {
        k: "Định mức quỹ kỳ",
        v: m.customDuesVnd
          ? `${m.customDuesVnd.toLocaleString("vi-VN")} đ (định mức riêng)`
          : m.effectiveDuesVnd
          ? `${m.effectiveDuesVnd.toLocaleString("vi-VN")} đ (${m.studentStatus === "graduated" ? "đã ra trường" : "sinh viên"})`
          : "",
        full: true,
      },
      { k: "Ban & trách vụ", v: m.duty || "Thành viên ban đời sống huynh đệ", full: true },
    ]),

    {
      margin: [0, 14, 0, 0],
      text: [
        { text: "Lời cam kết của sinh viên: ", bold: true, color: C.ink },
        `Tôi xin cam kết những thông tin khai báo trên là hoàn toàn chính xác. Trong suốt thời gian lưu trú tại ${plain(house)}, tôi cam kết chấp hành nội quy lưu xá, tích cực tham dự giờ kinh nguyện tối, lễ bổn mạng, các buổi sinh hoạt huynh đệ và hoàn thành tốt các nhiệm vụ trực nhật, dọn dẹp khuôn viên chung.`,
      ],
      alignment: "justify",
      italics: true,
      fontSize: 8.8,
      color: C.muted,
      lineHeight: 1.4,
    },
    signatures(
      [
        { title: "Sinh viên nội trú", hint: "(Ký và ghi rõ họ tên)", name: m.fullName },
        { title: "Trưởng lưu xá", hint: "(Xác nhận & duyệt phòng)", name: p.houseHeadName },
        { title: "Linh hướng / Đồng hành", hint: "(Chứng nhận)", name: org.chaplainName },
      ],
      { place: `Ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(now.getMonth() + 1).padStart(2, "0")} năm ${now.getFullYear()}` },
    ),
    { text: `Mã hồ sơ: LX-PX-${String(m.memberNo ?? 0).padStart(4, "0")}`, alignment: "right", fontSize: 7.5, color: C.faint, margin: [0, 10, 0, 0] },
  ];

  await downloadPdf(baseDoc({ runningTitle: `Sơ yếu lý lịch · ${m.fullName}`, orgName: house }, content), `So_Yeu_Ly_Lich_${fileSlug(m.fullName)}`);
}
