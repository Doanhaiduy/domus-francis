import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Church,
  Clock,
  DoorClosed,
  DoorOpen,
  ExternalLink,
  FileText,
  HeartHandshake,
  HelpCircle,
  House,
  Info,
  MapPin,
  MoonStar,
  Navigation,
  Phone,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react";
import { ADMISSION_DOCUMENTS, ADMISSION_DOCUMENTS_NOTE, ADMISSION_VALUES, admissionIntro, admissionSteps, type AdmissionValue } from "@/content/admission";
import { OG_DEFAULT_IMAGES, PUBLIC_HOME, SITE_CITY, SITE_KIND, mapLinks, telHref } from "@/lib/public-site";
import type { AdmissionInfo } from "@/lib/types/public-site";
import { formatVND } from "@/lib/utils";
import { getAdmissionInfo, listFaqs } from "@/server/modules/public-site";
import { getSiteInfo, publicDb, siteOrigin } from "@/server/public";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PageHero } from "@/components/public/PageHero";
import { JoinCta } from "@/components/public/JoinCta";
import { ArticleMarkdown } from "@/components/public/ArticleMarkdown";
import { JsonLd } from "@/components/public/JsonLd";

export const dynamic = "force-dynamic";

const PATH = "/vao-o";

export async function generateMetadata(): Promise<Metadata> {
  const { org } = await getSiteInfo();
  const description = `Chi phí, chỗ trống, nhịp sinh hoạt và các bước để vào ở ${org.houseName} — mái nhà chung của nam sinh viên Công giáo tại ${SITE_CITY}.`;
  return {
    title: `Vào ở ${SITE_KIND}: chi phí, chỗ trống, thủ tục`,
    description,
    alternates: { canonical: PATH },
    openGraph: { title: `Vào ở lưu xá — ${org.houseName}`, description, url: PATH, type: "website", locale: "vi_VN", siteName: org.houseName, images: OG_DEFAULT_IMAGES },
  };
}

const VALUE_ICON: Record<AdmissionValue["icon"], typeof Church> = { pray: Church, study: BookOpen, home: House, heart: HeartHandshake };

/** "2026-07" ⇒ "T7/2026" */
const monthLabel = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `T${Number(ym.slice(5))}/${ym.slice(0, 4)}` : ym);
/** "2026-07-15" ⇒ "15/07/2026" */
const dmy = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d);
/** Mức mỗi tháng quy đổi, làm tròn tới 1.000đ */
const perMonth = (amount: number, months: number) => Math.round(amount / Math.max(1, months) / 1000) * 1000;

interface Fact {
  icon: typeof Church;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "full";
}

function facts(info: AdmissionInfo): Fact[] {
  const out: Fact[] = [];
  const v = info.vacancies;
  if (v.enabled) {
    out.push(
      v.free > 0
        ? { icon: BedDouble, label: "Chỗ trống", value: `Còn ${v.free} chỗ`, sub: `${v.residents}/${v.capacity} chỗ đang có người ở`, tone: "ok" }
        : { icon: BedDouble, label: "Chỗ trống", value: "Tạm đủ người", sub: "Vẫn nhận đăng ký để xếp khi có chỗ", tone: "full" },
    );
  }
  const d = info.dues;
  if (d.cycleAmountVnd && d.cycleMonths) {
    out.push({
      icon: Wallet,
      label: "Quỹ sinh hoạt chung",
      value: `${formatVND(d.cycleAmountVnd)} / ${d.cycleMonths} tháng`,
      sub: d.cycleMonths > 1 ? `≈ ${formatVND(perMonth(d.cycleAmountVnd, d.cycleMonths))} mỗi tháng` : "Đóng theo tháng",
    });
  }
  out.push(
    info.utilities
      ? { icon: Zap, label: "Điện nước", value: `≈ ${formatVND(info.utilities.avgPerPersonVnd)} / tháng`, sub: `Bình quân mỗi người, ${info.utilities.months} tháng gần nhất` }
      : { icon: Zap, label: "Điện nước", value: "Chia theo hóa đơn", sub: "Chia đều tiền điện, nước thực tế mỗi tháng" },
  );
  const r = info.rhythm;
  if (r.gateOpen || r.gateClose || r.nightPrayerTime) {
    out.push({
      icon: Clock,
      label: "Giờ giấc",
      value: r.gateOpen && r.gateClose ? `Cổng ${r.gateOpen} – ${r.gateClose}` : r.gateClose ? `Đóng cổng ${r.gateClose}` : `Kinh tối ${r.nightPrayerTime}`,
      sub: (r.gateOpen || r.gateClose) && r.nightPrayerTime ? `Kinh tối chung lúc ${r.nightPrayerTime}` : "Nhịp sinh hoạt hằng ngày",
    });
  }
  return out;
}

function SectionTitle({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">{eyebrow}</p>}
      <h2 id={id} className="mt-1 text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
      {children && <p className="mt-1.5 text-sm text-gray-600 leading-relaxed max-w-2xl">{children}</p>}
    </div>
  );
}

export default async function AdmissionPage() {
  const [site, info, faqs] = await Promise.all([getSiteInfo(), publicDb((tx) => getAdmissionInfo(tx)), publicDb((tx) => listFaqs(tx)).catch(() => [])]);
  const org = site.org;
  const origin = siteOrigin();
  const steps = admissionSteps(org);
  const map = org.address ? mapLinks(org.address) : null;
  const r = info.rhythm;
  const d = info.dues;
  const topFaqs = faqs.slice(0, 4);

  const chips = [
    r.gateOpen && { icon: DoorOpen, label: "Mở cổng", time: r.gateOpen },
    r.gateClose && { icon: DoorClosed, label: "Đóng cổng", time: r.gateClose },
    r.nightPrayerTime && { icon: Church, label: "Kinh tối chung", time: r.nightPrayerTime },
    r.quietTime && { icon: MoonStar, label: "Giữ yên lặng", time: r.quietTime },
    r.lunchCutoff && { icon: UtensilsCrossed, label: "Hạn báo cơm trưa", time: r.lunchCutoff },
    r.dinnerCutoff && { icon: UtensilsCrossed, label: "Hạn báo cơm tối", time: r.dinnerCutoff },
  ].filter(Boolean) as { icon: typeof Church; label: string; time: string }[];

  // Dữ liệu có cấu trúc: trang + đường dẫn + các bước (HowTo) + giấy tờ (HowToSupply)
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${origin}${PATH}`,
        url: `${origin}${PATH}`,
        name: `Vào ở ${org.houseName}`,
        description: admissionIntro(org),
        inLanguage: "vi",
        isPartOf: { "@id": `${origin}/#website` },
        about: { "@id": `${origin}/#org` },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Giới thiệu", item: `${origin}${PUBLIC_HOME}` },
            { "@type": "ListItem", position: 2, name: "Vào ở lưu xá", item: `${origin}${PATH}` },
          ],
        },
      },
      {
        "@type": "HowTo",
        name: `Các bước vào ở ${org.houseName}`,
        inLanguage: "vi",
        supply: ADMISSION_DOCUMENTS.map((x) => ({ "@type": "HowToSupply", name: x.title })),
        step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "") })),
      },
    ],
  };

  return (
    <>
      <PublicHeader org={org} section="vao-o" donationEnabled={site.donationEnabled} />
      <JsonLd data={jsonLd} />
      <PageHero eyebrow="Vào ở lưu xá" title={`Vào ở ${org.houseName}`} subtitle={admissionIntro(org)}>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/lien-he#dang-ky" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff] text-[#5f3add] text-sm font-extrabold hover:bg-[#f3f0ff] transition active:scale-95">
            Đăng ký tìm hiểu <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <a href="#cac-buoc" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#ffffff]/15 border border-[#ffffff]/30 text-white text-sm font-bold hover:bg-[#ffffff]/25 transition active:scale-95">
            Xem các bước vào ở
          </a>
        </div>
      </PageHero>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 space-y-14">
        {/* SỐ LIỆU NHANH */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 -mt-16 sm:-mt-20 relative" aria-label="Thông tin nhanh">
          {facts(info).map((f) => (
            <div key={f.label} className="rounded-2xl bg-white border border-purple-100 shadow-md p-4 sm:p-5 min-w-0">
              <f.icon className={`w-5 h-5 mb-2.5 ${f.tone === "ok" ? "text-emerald-600" : f.tone === "full" ? "text-amber-600" : "text-primary"}`} aria-hidden />
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{f.label}</p>
              <p className="text-[15px] sm:text-base font-extrabold text-gray-900 mt-0.5 leading-snug break-words">{f.value}</p>
              {f.sub && <p className="text-xs text-gray-500 mt-1 leading-snug">{f.sub}</p>}
            </div>
          ))}
        </div>

        {/* ĐỜI SỐNG Ở NHÀ */}
        <section aria-labelledby="doi-song">
          <SectionTitle id="doi-song" eyebrow="Đời sống ở nhà" title="Cùng học, cùng sống và cùng cầu nguyện" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ADMISSION_VALUES.map((v) => {
              const Icon = VALUE_ICON[v.icon];
              return (
                <div key={v.title} className="rounded-3xl bg-white border border-purple-100 p-5">
                  <span className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center" aria-hidden>
                    <Icon className="w-5 h-5" />
                  </span>
                  <h3 className="mt-3 font-extrabold text-gray-900">{v.title}</h3>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{v.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-10 lg:gap-8 lg:grid-cols-2 items-start">
          {/* CHI PHÍ */}
          <section id="chi-phi" aria-labelledby="chi-phi-title" className="scroll-mt-28">
            <SectionTitle id="chi-phi-title" eyebrow="Chi phí" title="Anh em cùng góp để giữ mái nhà chung">
              Số liệu dưới đây được cập nhật tự động từ cấu hình và sổ quỹ của nhà.
            </SectionTitle>
            <ul className="rounded-3xl bg-white border border-purple-100 overflow-hidden">
              <li className="p-5 flex gap-4">
                <Wallet className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">Quỹ sinh hoạt chung</p>
                  {d.cycleAmountVnd && d.cycleMonths ? (
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                      <b className="text-gray-900">{formatVND(d.cycleAmountVnd)}</b> mỗi kỳ {d.cycleMonths} tháng
                      {d.cycleMonths > 1 && <> (≈ {formatVND(perMonth(d.cycleAmountVnd, d.cycleMonths))}/tháng)</>}
                      {d.cycleDueDay ? `, hạn nộp ngày ${d.cycleDueDay} của tháng đầu kỳ.` : "."}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">Mức đóng góp theo kỳ — người quản lý sẽ trao đổi cụ thể khi bạn đến thăm.</p>
                  )}
                  {d.currentPlan && (
                    <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-xl bg-purple-50/70 border border-purple-100 px-3 py-1.5 text-xs text-gray-700">
                      <span className="font-bold text-gray-900">Kỳ đang thu:</span> {d.currentPlan.name} · {formatVND(d.currentPlan.amountVnd)}
                      {d.currentPlan.dueDate && <> · hạn {dmy(d.currentPlan.dueDate)}</>}
                    </p>
                  )}
                </div>
              </li>
              <li className="p-5 flex gap-4 border-t border-purple-50">
                <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">Tiền điện nước</p>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                    Chia đều theo hóa đơn điện, nước thực tế mỗi tháng (làm tròn lên 1.000đ mỗi người).
                    {info.utilities && (
                      <>
                        {" "}Bình quân {info.utilities.months > 1 ? `${info.utilities.months} tháng gần nhất (${monthLabel(info.utilities.from)} – ${monthLabel(info.utilities.to)})` : `tháng ${monthLabel(info.utilities.to)}`}:{" "}
                        <b className="text-gray-900">≈ {formatVND(info.utilities.avgPerPersonVnd)}</b> mỗi người.
                      </>
                    )}
                  </p>
                </div>
              </li>
              <li className="p-5 flex gap-4 border-t border-purple-50">
                <UtensilsCrossed className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">Cơm nước</p>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                    {r.mealsEnabled
                      ? `Nhà có bếp chung: anh em đăng ký suất ăn trên ứng dụng${r.lunchCutoff ? ` trước ${r.lunchCutoff} cho bữa trưa` : ""}${r.dinnerCutoff ? `${r.lunchCutoff ? "," : ""} trước ${r.dinnerCutoff} cho bữa tối` : ""}.`
                      : "Hãy hỏi người quản lý cách tổ chức bữa ăn hiện nay khi bạn đến thăm nhà."}
                  </p>
                </div>
              </li>
            </ul>
            <p className="mt-3 flex gap-2 text-xs text-gray-500 leading-relaxed">
              <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
              <span>Mức đóng góp do nhà thống nhất và có thể thay đổi. Nếu gia đình đang gặp khó khăn, bạn cứ chia sẻ riêng với người quản lý khi đến thăm.</span>
            </p>
          </section>

          {/* NHỊP SINH HOẠT */}
          <section id="nhip-sinh-hoat" aria-labelledby="nhip-title" className="scroll-mt-28">
            <SectionTitle id="nhip-title" eyebrow="Nhịp sinh hoạt" title="Một ngày ở lưu xá">
              Giờ giấc giúp cả nhà vừa học tốt vừa giữ được đời sống cầu nguyện chung.
            </SectionTitle>
            {chips.length > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                {chips.map((c) => (
                  <li key={c.label} className="rounded-2xl bg-white border border-purple-100 px-3.5 py-3 flex items-center gap-3 min-w-0">
                    <c.icon className="w-5 h-5 text-primary shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold text-gray-900 leading-tight">{c.time}</span>
                      <span className="block text-[11px] font-semibold text-gray-500 leading-tight">{c.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {info.schedule ? (
              <div className="rounded-3xl bg-white border border-purple-100 p-5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Trích Luật nhà — {info.schedule.title}</p>
                <ul className="mt-3 space-y-3">
                  {info.schedule.items.map((it, i) => (
                    <li key={i} className={`flex gap-3 ${it.sub ? "pl-6" : ""}`}>
                      {it.time ? (
                        <span className="shrink-0 min-w-[4.5rem] text-center px-2 py-1 rounded-lg bg-purple-50 text-primary text-xs font-extrabold tabular-nums h-fit">{it.time}</span>
                      ) : (
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-purple-300 mt-2" aria-hidden />
                      )}
                      <span className={`text-sm leading-relaxed ${it.note ? "text-gray-500 italic" : "text-gray-700"}`}>{it.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 pt-3 border-t border-purple-50 text-xs text-gray-500 leading-relaxed">
                  Cần về muộn, ngủ ngoài hay về quê? Anh em gửi đơn xin phép trên ứng dụng của nhà để người quản lý nắm được.
                </p>
              </div>
            ) : (
              !chips.length && (
                <p className="rounded-3xl bg-white border border-purple-100 p-5 text-sm text-gray-600">Người quản lý sẽ giới thiệu giờ giấc sinh hoạt chung khi bạn đến thăm nhà.</p>
              )
            )}
          </section>
        </div>

        <div className="grid gap-10 lg:gap-8 lg:grid-cols-[1.25fr_1fr] items-start">
          {/* CÁC BƯỚC */}
          <section id="cac-buoc" aria-labelledby="cac-buoc-title" className="scroll-mt-28">
            <SectionTitle id="cac-buoc-title" eyebrow="Thủ tục" title="Các bước vào ở" />
            <ol className="relative space-y-4">
              {steps.map((s, i) => (
                <li key={s.title} className="relative flex gap-4">
                  {i < steps.length - 1 && <span className="absolute left-5 top-11 bottom-[-1rem] w-px bg-purple-200" aria-hidden />}
                  <span className="relative shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#5f3add] to-[#7857f8] text-white font-extrabold flex items-center justify-center shadow-md shadow-primary/20" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 rounded-3xl bg-white border border-purple-100 p-4 sm:p-5">
                    <h3 className="font-extrabold text-gray-900">
                      <span className="sr-only">Bước {i + 1}: </span>
                      {s.title}
                    </h3>
                    <ArticleMarkdown source={s.text} compact className="mt-1 !text-sm !leading-relaxed !text-gray-600 [&>p]:my-0" />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* GIẤY TỜ */}
          <section id="giay-to" aria-labelledby="giay-to-title" className="scroll-mt-28">
            <SectionTitle id="giay-to-title" eyebrow="Chuẩn bị" title="Giấy tờ thường cần" />
            <ul className="rounded-3xl bg-white border border-purple-100 p-5 space-y-3.5">
              {ADMISSION_DOCUMENTS.map((doc) => (
                <li key={doc.title} className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-900">{doc.title}</span>
                    {doc.note && <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">{doc.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex gap-2 text-xs text-gray-500 leading-relaxed">
              <FileText className="w-4 h-4 shrink-0 mt-px" aria-hidden />
              <span>{ADMISSION_DOCUMENTS_NOTE}</span>
            </p>
          </section>
        </div>

        {/* ĐƯỜNG ĐẾN NHÀ */}
        {(org.address || org.phone) && (
          <section id="duong-den" aria-labelledby="duong-den-title" className="scroll-mt-28">
            <SectionTitle id="duong-den-title" eyebrow="Đến thăm nhà" title="Đường đến nhà" />
            <div className="rounded-3xl bg-white border border-purple-100 p-5 sm:p-6 grid gap-5 md:grid-cols-[1.4fr_1fr] items-center">
              <div className="space-y-3 min-w-0">
                {org.address && (
                  <p className="flex gap-3 text-gray-900">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span className="font-semibold leading-relaxed">{org.address}</span>
                  </p>
                )}
                {org.phone && (
                  <p className="flex gap-3">
                    <Phone className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                    <a href={telHref(org.phone)} className="font-extrabold text-gray-900 hover:text-primary">{org.phone}</a>
                  </p>
                )}
                <p className="text-xs text-gray-500 leading-relaxed">Bản đồ mở ở trang Google Maps / OpenStreetMap khi bạn bấm — trang này không nhúng bản đồ của bên thứ ba.</p>
              </div>
              {map && (
                <div className="flex flex-col sm:flex-row md:flex-col gap-2.5">
                  <a href={map.google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition active:scale-95">
                    <Navigation className="w-4 h-4" aria-hidden /> Mở Google Maps <ExternalLink className="w-3.5 h-3.5 opacity-80" aria-hidden />
                  </a>
                  <a href={map.osm} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 bg-white text-primary text-sm font-bold hover:bg-purple-50 transition active:scale-95">
                    <MapPin className="w-4 h-4" aria-hidden /> Mở OpenStreetMap <ExternalLink className="w-3.5 h-3.5 opacity-80" aria-hidden />
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* HỎI ĐÁP */}
        {topFaqs.length > 0 && (
          <section aria-labelledby="hoi-dap-title">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
              <SectionTitle id="hoi-dap-title" eyebrow="Hỏi đáp" title="Bạn có thể đang thắc mắc" />
              <Link href="/hoi-dap" className="mb-5 text-sm font-bold text-primary hover:underline inline-flex items-center gap-1">
                Tất cả câu hỏi <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </div>
            <div className="space-y-3">
              {topFaqs.map((f) => (
                <details key={f.id} className="group rounded-2xl bg-white border border-purple-100 open:shadow-md open:border-purple-300 transition">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer select-none list-none px-5 py-4 font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start gap-3"><HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />{f.question}</span>
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="px-5 pb-5 pl-[3.25rem]">
                    <ArticleMarkdown source={f.answer} compact className="!text-[15px] !leading-7" />
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        <JoinCta org={org} title="Sẵn sàng đến thăm nhà?" secondary={{ href: "/hoi-dap", label: "Câu hỏi thường gặp" }} />
      </div>
    </>
  );
}
