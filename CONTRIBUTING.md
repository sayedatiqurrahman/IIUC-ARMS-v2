# Contributing to IIUC-ARMS v2

## Quick Start (5 minutes)

### 1. Fork & Clone
```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/IIUC-ARMS-v2.git
cd IIUC-ARMS-v2
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env.local
```

Fill in the **minimum required** vars in `.env.local`:

| Variable | Where to get it | Required? |
|----------|----------------|-----------|
| `DATABASE_URL` | Use `file:./prisma/dev.db` for local | Yes |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console > Project Settings | Yes |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console > Service Accounts | Yes |
| `FIREBASE_PRIVATE_KEY` | Firebase Console > Service Accounts | Yes |
| `GITHUB_TOKEN` | GitHub Settings > Developer Settings > PATs | Yes |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` | Yes |

**Optional** (app works without these):
- `TELEGRAM_BOT_TOKEN` — Telegram notifications
- `TURNSTILE_SECRET` — Captcha
- `NEXT_PUBLIC_ADOBE_CLIENT_ID` — PDF viewer

### 3. Database Setup
```bash
npx prisma generate
npx prisma db push
node scripts/fix-profile-columns.js
```

### 4. Run Dev Server
```bash
npm run dev
```

## How Preview Deployments Work

When you push a branch and open a PR, **Vercel automatically deploys a preview**:
- Each PR gets its own unique URL (e.g. `iiuc-arms-abc123.vercel.app`)
- Environment variables are copied from the production deployment
- You can test your changes live without needing any env vars locally
- The PR description auto-includes the preview link

**This means you don't need Telegram, GitHub App, or production secrets locally.** The preview deployment has them from the Vercel project settings.

## What You Can Test Locally Without Secrets

| Feature | Works locally? | Notes |
|---------|---------------|-------|
| UI / Pages | Yes | All pages render |
| Firebase Auth | Need Firebase keys | Create a free Firebase project |
| Database | Yes | Uses local SQLite file |
| Club Pages | Yes | Works with local DB |
| Certificate Studio | Yes | Works with local DB |
| File Upload | Need GitHub PAT | Free to create |
| Telegram | No | Needs bot token (shared via Vercel) |
| Captcha | No | Optional, app works without it |

## Branch Workflow

```
main (production)
  └── dev (development, preview deployments)
       └── feature/my-feature (your work)
            └── PR → dev
```

1. Create a branch from `dev`:
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/my-feature
   ```

2. Make changes, commit, push:
   ```bash
   git add .
   git commit -m "feat: add cool feature"
   git push origin feature/my-feature
   ```

3. Open a PR on GitHub → `dev` branch
4. Vercel auto-deploys a preview → test it live
5. After review, merge to `dev` → then `dev` → `main` for production

## Getting Firebase Access (Free)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Ask the project owner to add your email as a **Viewer** or **Editor**
3. Go to Project Settings > General > Copy the web config values
4. Go to Project Settings > Service Accounts > Generate new private key

## Getting a GitHub PAT (Free)

1. Go to GitHub Settings > Developer Settings > Personal access tokens > Fine-grained tokens
2. Create a token with:
   - Repository access: `IIUC-ACADEMIC-FILES-MANAFGER` (read/write)
   - Permissions: Contents (read/write)
3. Copy the token

## Shared Dev Credentials (via Vercel)

The project owner sets these in Vercel > Settings > Environment Variables (available on all deployments including previews):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Turso database URL |
| `DATABASE_AUTH_TOKEN` | Turso auth token |
| `GITHUB_TOKEN` | For file uploads |
| `TELEGRAM_BOT_TOKEN` | For notifications |

**You never see these values.** They're injected automatically into preview deployments.

## Project Structure

```
app/
  ├── api/          # API routes
  │   ├── clubs/    # Club system APIs
  │   ├── studio/   # Certificate Studio APIs
  │   └── telegram/ # Telegram integration
  ├── clubs/        # Club pages
  ├── studio/       # Studio apps
  └── verify/       # Certificate verification
components/
  ├── clubs/        # Club UI components
  ├── admin/        # Admin panel
  └── notices/      # Notice system
lib/
  ├── club-*.ts     # Club logic
  ├── telegram/     # Telegram bot
  └── cert-theme.ts # Certificate themes
prisma/
  └── schema.prisma # Database schema
scripts/
  └── fix-profile-columns.js # DB migrations
```

## Code Style

- **TypeScript** — strict mode, no `any` if possible
- **Tailwind CSS** — utility classes, dark theme (`bg-dark-bg`, `text-dark-text`)
- **No comments** in code unless absolutely necessary
- **Component naming**: PascalCase for components, camelCase for functions
- **API routes**: RESTful, use `rateLimit()` for all endpoints

## Need Help?

- Check existing code patterns before writing new code
- Look at `lib/config.ts` for app configuration
- Look at `lib/prisma.ts` for database access pattern
- All API routes use `getUserEmail(req)` for auth
