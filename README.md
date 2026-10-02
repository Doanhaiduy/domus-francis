# 🕊️ Lưu Xá Phanxicô - Student Community Management System

> **A comprehensive, modern web portal designed for Catholic student dormitories and residential communities.** Built with Next.js 14, React 18, TypeScript, and Tailwind CSS.

---

## ✨ Key Features

- **🏠 Architecture & Floorplan (`/so-do-nha`):** Visual interactive house floorplan with drag-and-drop room assignments.
- **🧹 House Duties & Logistics (`/hau-can`):** 6 cleaning zones, weekly rosters, check-in with device photo evidence, duty swaps, and review workflows.
- **🎓 Academic Management (`/hoc-tap`):** Semester transcript logging, midterm & final scores, automatic GPA (10 & 4.0 scale), letter grades, portal transcript evidence upload, and peer tutoring indicators.
- **💰 Financial Treasury (`/thu-chi`):** Transparent bookkeeping, expense logging with invoice receipt uploads, 12-month member contribution matrix, and PDF financial reports.
- **📅 Events & Calendar (`/lich-su-kien`):** Activity scheduling, recurring liturgies, QR attendance check-in, and real-time interactive polls & voting.
- **📸 Moments & Photo Gallery (`/khoanh-khac`):** Album management, cover photo upload, batch multi-photo upload from device, and fullscreen lightbox viewer.
- **📢 Community Board & Forum (`/thong-bao`, `/dien-dan`):** Pinned announcements with read tracking, discussion threads, and anonymous prayer intentions.
- **📤 Local File Uploads:** Integrated dropzone component supporting direct device file selection with instant base64 preview across all modals.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18, Tailwind CSS, Headless UI
- **Icons:** Lucide React
- **Language:** TypeScript
- **PDF Generation:** Custom sanitized canvas & jsPDF export
- **Database Architecture:** PostgreSQL 16 (Complete DDL specification in [`PROMPT_BACKEND_PGSQL_DDL.md`](./PROMPT_BACKEND_PGSQL_DDL.md))

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.18.0
- pnpm (recommended) or npm / yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/<repo-name>.git

# Navigate to project folder
cd <repo-name>

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to view the application.

### Production Build

```bash
# Build production bundle
pnpm build

# Start production server
pnpm start
```

---

## 📄 Backend & Database Blueprint

Looking for the complete PostgreSQL DDL and backend architecture specification?  
See [`PROMPT_BACKEND_PGSQL_DDL.md`](./PROMPT_BACKEND_PGSQL_DDL.md) for the full all-in-one system design prompt.
