# QSIS-ARMS v2

**QSIS Academic Resource Management System** — A centralized platform for managing and sharing academic resources for the Department of Qur'anic Sciences & Islamic Studies, IIUC.

## Live: [qsis-arms.eu.cc](https://qsis-arms.eu.cc)

## Features
- Browse 8 semesters of academic files (sheets, notes, previous questions, syllabus, hadith)
- Related Kitabs — cross-semester & Shariah resources
- PDF viewer (Adobe SDK), image viewer, Office document viewer
- Upload files via GitHub Pull Request
- Firebase Auth (Google + IIUC email only)
- Contributors page, Reading History, Class Routine
- Dark theme, responsive design

## File Storage
All academic files (PDFs, documents) are stored in a separate repo:
- **[QSIS-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER)** — Fork this to contribute files directly

## Tech Stack
- Next.js 14, TypeScript, Tailwind CSS, Zustand
- Firebase Auth, NextAuth.js
- Prisma + CockroachDB
- GitHub API (fork → PR workflow)
- Adobe PDF Embed SDK

## Getting Started
```bash
npm install
cp .env.example .env  # fill in your keys
npx prisma db push
npm run dev
```

## Contributing
1. Fork [QSIS-ACADEMIC-FILES-MANAFGER](https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER)
2. Add your files to the appropriate semester/category folder
3. Create a Pull Request

## Security
If you discover a vulnerability, please report it responsibly. Never commit secrets to the repo.

## Developer
Developed with ❤ by **Sayed Atiqur Rahman** — QSIS, IIUC
