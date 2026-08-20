# IIUC-ARMS v2

**IIUC Academic Resource Management System** — A full-stack web app + PWA for managing and sharing academic resources across all IIUC departments, with special focus on Qur'anic Sciences & Islamic Studies.

## Live: [iiuc-arms.eu.cc](https://iiuc-arms.eu.cc)

## Community
- **WhatsApp Community:** [Join for updates](https://chat.whatsapp.com/BVsl3W6ep6D0JMyRzOIhUy)
- **WhatsApp Channel:** [Join for updates](https://whatsapp.com/channel/0029VbD78MI3gvWcocoFdR1g)
- **Telegram Channel:** [Join for updates & discussion](https://t.me/iiuc_arms)

---

## What IIUC-ARMS Does

A centralized platform where IIUC students, teachers, and staff can **browse, upload, and manage** academic files — notes, previous questions, syllabus, sheets — organized by department, semester, and course.

### For Students
- Browse 8 semesters of academic files (notes, sheets, previous questions, syllabus)
- View PDFs, images, Word docs, Excel sheets, PowerPoint, audio/video — all inline
- Open files once, cache them locally — instant re-access for 30 days (configurable)
- Share files via WhatsApp, Telegram, Messenger, Discord, Facebook, X, LinkedIn, Reddit, Email
- Download as ZIP for offline use
- Class routine with timetable view
- Notice board with auto-expiry and Telegram broadcast
- Blog with tutorials and posts (markdown editor, Ctrl+V image paste)
- Faculty directory with public visibility
- Reading history with client-side pagination
- Focus/Todo timer (global floating capsule)
- Install as PWA on any device

### For Teachers & CRs
- Upload files directly from the website — creates a GitHub Pull Request
- Publish notices with category tags, optional attachments, Telegram broadcast
- Schedule notices and routines for future publication
- CRUD for notices (create, update, delete, pin-to-top)

### For Admins
- Role-based access control with granular permissions (17+ permission types)
- Manage courses, departments, semesters, faculty
- File operations: move, copy, rename, delete — synced to GitHub
- Cron job management with custom schedules and manual trigger
- Log viewer with selective deletion, user filtering, retention config
- Upload system with progress tracking, LFS support (up to 500MB)
- Admin-created accounts + Firebase Auth (Google + IIUC email)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (dark theme throughout) |
| State | Zustand |
| Auth | Firebase Auth + NextAuth.js (Google, Credentials, 2FA: TOTP + Magic Link) |
| Database | Prisma + CockroachDB |
| Storage | GitHub API (direct upload ≤10MB, Git LFS >10MB, up to 500MB) |
| PDF | pdf.js (inline viewer with annotations, zoom, page navigation) |
| Office | docx-preview (Word), native download cards (Excel, PowerPoint) |
| Markdown | marked v18 + DOMPurify (full GFM: tables, task lists, code blocks) |
| File Cache | Cache API + IndexedDB (configurable TTL, 1d–90d or never) |
| Notifications | Telegram Bot API (channel + group + personal broadcast) |
| Cron | Vercel Cron (daily merge) + client-side smart poller |
| PWA | Installable on mobile/desktop, offline-ready |
| Deployment | Vercel |

---

## Connected Repositories

IIUC-ARMS uses **3 GitHub repositories** that work together:

| Repository | Purpose |
|---|---|
| **[IIUC-ARMS-v2](https://github.com/sayedatiqurrahman/IIUC-ARMS-v2)** | The main web app (Next.js). Handles UI, API, auth, database. Users interact with this. |
| **[IIUC-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER)** | The academic files storage. All uploaded files (notes, question papers, sheets) live here, organized by department/semester/course. |
| **Your Fork** | When you upload files, IIUC-ARMS creates a branch on your fork and opens a Pull Request to the main files repo. Your contributions are credited to your GitHub profile. |

### How They Connect

```
IIUC-ARMS-v2 (Web App)
       │
       ├── writes files → IIUC-ACADEMIC-FILES-MANAFGER
       │                     ├── notices/notices.json    (notice board)
       │                     ├── blogs/tutorials/        (published tutorials)
       │                     ├── blogs/posts/            (published blog posts)
       │                     └── routines/               (routine schedules)
       │
       └── reads files ← IIUC-ACADEMIC-FILES-MANAFGER
                           └── {dept}/{semester}/{course}/{category}/  (academic files)

Your Fork
       │
       └── Pull Request → IIUC-ACADEMIC-FILES-MANAFGER (main branch)
```

### Per-User GitHub Account

Each user connects their own GitHub account via a **Personal Access Token (PAT)**. When a user uploads files:
1. IIUC-ARMS commits the files to a branch under **their fork**
2. A Pull Request is created to merge into the main files repo
3. The user gets **credited as a contributor** on GitHub
4. The user appears on the **[Contributors page](/contributors)**

> **Note:** Only the admin's bot token can commit directly to the main branch. All other users go through the Pull Request flow.
```
IIUC-ACADEMIC-FILES-MANAFGER/
├── {department}/                    # e.g. qsis, ece, cse, bba
│   ├── 1st-semister/
│   ├── 2nd-semister/
│   ├── ...
│   └── 8th-semister/
│       ├── {CODE} - {Title}/        # e.g. QSM-3602 - Tafsir Bir Rayi
│       │   ├── Mid/
│       │   │   ├── NOTES/
│       │   │   └── Previous Questions/
│       │   ├── Final/
│       │   │   ├── NOTES/
│       │   │   └── Previous Questions/
│       │   ├── sheet/
│       │   ├── Syllabus/
│       │   └── Other/
│       └── ...
├── related-kitabs/                  # Shared across Shariah departments
│   ├── quran-tafsir/
│   ├── hadith/
│   ├── fiqh/
│   ├── aqeedah/
│   ├── seerah/
│   └── general/
├── related-sources/                 # Cross-department resources
├── notices/                         # GitHub-backed notice board
│   ├── notices.json
│   └── attachments/
├── blogs/                           # Blog system
│   ├── tutorials/                   # Tutorial posts
│   │   ├── index.json               # Tutorial index
│   │   └── {slug}/
│   │       ├── index.md
│   │       ├── thumbnail.{ext}
│   │       ├── meta.json
│   │       └── assets/
│   └── posts/                       # Blog posts
│       ├── index.json               # Post index
│       └── {slug}/
│           ├── index.md
│           ├── thumbnail.{ext}
│           ├── meta.json
│           └── assets/
└── routines/                        # Routine schedules
```

### Category Placement Rules
| Category | Location | Description |
|----------|----------|-------------|
| `NOTES` | `Mid/` or `Final/` | Course notes, handouts |
| `Previous Questions` | `Mid/` or `Final/` | Past exam papers |
| `sheet` | Course root | Assignment sheets |
| `Syllabus` | Course root | Course syllabus |
| `Other` | Course root | Miscellaneous files |

---

## Key Features (Detail)

### Upload System
- **Web upload**: Select department → semester → course → category → upload files
- **GitHub PR**: Files are committed via GitHub API and submitted as Pull Requests
- **Direct commit** (admin): Files ≤10MB go directly to GitHub blob API
- **Git LFS**: Files >10MB routed through LFS (up to 500MB)
- **Progress tracking**: Per-slice progress, step-by-step log, monotonic percentage
- **Background upload**: Continues even if modal is closed
- **Subfolder picker**: Dropdown for selecting upload subfolder
- **Custom folder creation**: Create new course folders from the browse page

### Notice Board
- GitHub-backed (no database) — stored in `notices/notices.json`
- Three categories: Notice, Academic Calendar, Bus Schedule
- Pin-to-top, external links, optional attachments (image preview)
- Auto-expiry (configurable TTL, default 183 days)
- Telegram broadcast to channel/group/personal bots
- Scheduled publishing (cron-based auto-publish)
- Date-wise search, card + list view
- Full-screen document viewer for attachments

### Blog System
- **Draft/Publish separation**: Drafts stored in DB (no GitHub push), published posts stored on GitHub
- **Any logged-in user** can create drafts — no special permission needed
- **Publishing** requires `publishTutorial` or `publishBlog` permission
- Folder-based storage on GitHub: each published post gets its own folder with `index.md`, `thumbnail`, `meta.json`, `assets/`
- Separate indexes: `blogs/tutorials/index.json` and `blogs/posts/index.json`
- Markdown editor with toolbar (bold, italic, heading, link, image, code, quote, list)
- Ctrl+V image paste → uploads to assets folder on publish
- Thumbnail upload with local blob preview
- Preview mode with full GFM rendering
- Categories: Tutorial and Blog Post
- Public listing + detail pages with SEO metadata
- Admin sees all drafts; authors see only their own drafts

### Studio (Contributed Apps)
- Community-built HTML/CSS/JS apps
- Full-width iframe — no borders, fills viewport below nav
- Floating back button (top-left)
- Floating FAB for app controls
- Themes from Creative Hub repo

### File Viewer
- **PDF**: pdf.js with annotation toolbar (pen, highlighter, text, shapes, arrows), zoom, page navigation, pinch-to-zoom on mobile
- **Images**: Zoom, rotate, pan, fullscreen
- **Word (.docx)**: Inline rendering via docx-preview
- **Excel/PowerPoint**: Download card with file info
- **Audio/Video**: Native HTML5 player
- **EPUB**: Inline reader
- **Text**: Code/text viewer
- **File cache**: Cache-first strategy (Cache API + IndexedDB), configurable TTL (1d–90d or never), auto-purge on app init

### Cron Job System
- 10+ scheduled jobs: notices publish, routine publish, log cleanup, Telegram monitoring
- Per-job schedule customization (5min to monthly, or custom cron expression)
- Manual trigger from admin panel
- Smart client-side poller respects per-job schedules
- Log viewer with search, pagination, selective deletion, retention config

### Share System
- Web Share API (native share on mobile)
- 9 platforms: WhatsApp, Telegram, Messenger, Discord, Facebook, X/Twitter, LinkedIn, Reddit, Email
- Copy-to-clipboard fallback for platforms without direct share
- ZIP download via fflate (no server needed)
- Deep-link URLs with full navigation state

### Focus/Todo Timer
- Global floating capsule (draggable, expandable)
- Single source of truth timer (500ms tick)
- Play/pause, +5m, reset, done
- Full-page view at `/focus`
- Reconciles elapsed time on mount

### Admin Panel
- **Users**: Manage roles, CR status, per-user permissions
- **Courses**: Add/edit/delete courses with department and semester
- **Faculty**: Manage faculty directory
- **Cron Jobs**: View, run, configure schedules
- **Logs**: Activity, Telegram, Upload logs with search and selective delete
- **Permissions**: 17+ permission types, role-based + per-user grants

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/sayedatiqurrahman/IIUC-ARMS-v2.git
cd IIUC-ARMS-v2

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Fill in: GITHUB_TOKEN, FIREBASE_*, NEXTAUTH_SECRET, DATABASE_URL, TELEGRAM_*

# 4. Push database schema
npx prisma db push

# 5. (Optional) Seed faculty data
node scripts/seed-faculty.js

# 6. Start development server
npm run dev
```

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | GitHub PAT with repo access (for file operations) |
| `FIREBASE_*` | Firebase project config (auth) |
| `NEXTAUTH_SECRET` | NextAuth session secret |
| `DATABASE_URL` | CockroachDB connection string |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notices |
| `TELEGRAM_CHANNEL_ID` | Telegram channel for broadcasts |
| `TELEGRAM_GROUP_ID` | Telegram group for broadcasts |

---

## Contributing

### Upload via Website
1. Sign in with your IIUC email
2. Go to Dashboard → Upload
3. Select department, semester, course, and category
4. Upload files — they're submitted as a Pull Request

### Upload via GitHub
1. Fork [IIUC-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER)
2. Navigate to `{department}/{semester}/{CODE} - {Title}/`
3. Place files in the correct category (see table above)
4. Create a Pull Request

### Admin File Actions
Admins with `moveFile`, `copyFile`, `renameFile`, or `deleteFile` permissions can manage files directly from the browse page. These actions sync to GitHub automatically.

---

## Permissions System

| Permission | Description |
|-----------|-------------|
| `addCourse` | Create new courses |
| `editCourse` | Edit course details |
| `deleteCourse` | Delete courses |
| `uploadFile` | Upload files via web |
| `uploadAnySemester` | Upload to any semester |
| `uploadAnyDepartment` | Upload to any department |
| `moveFile` | Move files between folders |
| `copyFile` | Copy files between folders |
| `renameFile` | Rename files |
| `deleteFile` | Delete files |
| `deleteCourse` | Delete entire course folders |
| `manageFaculty` | Manage faculty directory |
| `publishRoutine` | Publish class routines |
| `publishNotice` | Publish notices |
| `publishBlog` | Publish blog posts |
| `publishTutorial` | Publish tutorials |
| `manageUsers` | Manage user accounts and roles |
| `manageSettings` | Manage app settings |
| `manageCronJobs` | Manage cron job schedules |

**Role-based**: Each permission can be enabled for roles (admin, manager, teacher, CR, student, user).
**Per-user grants**: Admins can also grant specific permissions to individual users.

---

## Security
If you discover a vulnerability, please report it responsibly. Never commit secrets to the repo.

---

## Developer
Developed with ❤ by **[Sayed Atiqur Rahman](https://atiq.is-a.dev)** — QSIS, IIUC

## Presented by
**Programming Light**
