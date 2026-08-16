# IIUC-ARMS v2

**IIUC Academic Resource Management System** — A centralized platform for managing and sharing academic resources across all IIUC departments, with special focus on Qur'anic Sciences & Islamic Studies.

## Live: [iiuc-arms.eu.cc](https://iiuc-arms.eu.cc)

## Community
- **WhatsApp Community:** [Join for updates](https://chat.whatsapp.com/BVsl3W6ep6D0JMyRzOIhUy)
- **Telegram Channel:** [Join for updates & discussion](https://t.me/iiuc_arms)

## Features
- Browse 8 semesters of academic files (sheets, notes, previous questions, syllabus)
- Department-wise file organization (17+ departments)
- Course-based file structure with Mid/Final term separation
- Related Kitabs — Shariah faculty combined resources
- Related Sources — cross-semester & cross-department resources
- PDF viewer (Adobe SDK), image viewer, Office document viewer
- Upload files via GitHub Pull Request
- Admin file actions: Move, Copy, Rename, Delete (synced to GitHub)
- Firebase Auth (Google + IIUC email + admin-created accounts)
- Contributors page, Reading History, Class Routine
- Faculty directory with public visibility
- Admin panel with role-based access control & granular permissions
- 2FA (TOTP + Magic Link)
- Dark theme, responsive design

## File Storage
All academic files (PDFs, documents) are stored in a separate repo:
- **[IIUC-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER)** — Fork this to contribute files directly

## Repository Structure

```
upload_academic_files/
├── {department}/                    # e.g. qsis, ece, cse
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
├── related-kitabs/                  # Shared across departments
│   ├── quran-tafsir/
│   ├── hadith/
│   ├── fiqh/
│   ├── aqeedah/
│   ├── seerah/
│   └── general/
└── related-sources/                 # Cross-department resources
```

### Category Placement Rules
| Category | Location | Description |
|----------|----------|-------------|
| `NOTES` | `Mid/` or `Final/` | Course notes, handouts |
| `Previous Questions` | `Mid/` or `Final/` | Past exam papers |
| `sheet` | Course root | Assignment sheets |
| `Syllabus` | Course root | Course syllabus |
| `Other` | Course root | Miscellaneous files |

## Tech Stack
- Next.js 14, TypeScript, Tailwind CSS, Zustand
- Firebase Auth, NextAuth.js
- Prisma + CockroachDB
- GitHub API (fork → PR workflow + admin file actions)
- Adobe PDF Embed SDK

## Getting Started
```bash
npm install
cp .env.example .env  # fill in your keys
npx prisma db push
npm run dev
```

## Contributing

### Upload via Website
1. Sign in with your IIUC email
2. Go to Dashboard → Upload
3. Select department, semester, course, and category
4. Upload files — they're submitted as a Pull Request

### Upload via GitHub
1. Fork [IIUC-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER)
2. Navigate to `{department}/{semester}/{CODE} - {Title}/`
3. Place files in the correct category:
   - Notes → `Mid/NOTES/` or `Final/NOTES/`
   - Previous Questions → `Mid/Previous Questions/` or `Final/Previous Questions/`
   - Sheets → `sheet/`
   - Syllabus → `Syllabus/`
4. Create a Pull Request

### Admin File Actions
Admins with `moveFile`, `copyFile`, `renameFile`, or `deleteFile` permissions can manage files directly from the browse page. These actions sync to GitHub automatically.

## Permissions System
The admin panel includes a granular permissions system:
- **Role-based**: Toggle which roles (admin, manager, teacher, CR, student, user) can perform each action
- **Per-user grants**: Admins can grant specific permissions to individual users
- **Actions**: addCourse, editCourse, deleteCourse, uploadFile, moveFile, copyFile, renameFile, deleteFile, manageFaculty, publishRoutine, manageUsers, manageSettings

## Security
If you discover a vulnerability, please report it responsibly. Never commit secrets to the repo.

## Developer
Developed with ❤ by **[Sayed Atiqur Rahman](https://atiq.is-a.dev)** — QSIS, IIUC

## Presented by
**Programming Light**
