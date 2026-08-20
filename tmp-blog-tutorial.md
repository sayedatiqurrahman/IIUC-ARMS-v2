# How to Login & Connect GitHub on IIUC-ARMS — Complete Guide

## Why Do You Need This?

IIUC-ARMS is your all-in-one academic resource hub at IIUC. By logging in and connecting your GitHub account, you unlock:

- **Upload & share** academic files (notes, question papers, slides) with your department
- **Contribute** to the IIUC-ARMS repository and get recognized on the Contributors page
- **Track your contributions** — commits, PRs, and uploads are counted automatically
- **Download** materials uploaded by other students
- **Manage your profile** — set your department, semester, WhatsApp, and more

Without logging in, you can only **browse** public content. Logging in gives you superpowers.

---

## Step 1: What You Need Before Starting

| Requirement | Details |
|---|---|
| **University Email** | Your official IIUC email (e.g., `name@student.iiuc.ac.bd`) |
| **Google Account** | The Google account where your university email is logged in |
| **GitHub Account** | Free to create — we'll guide you below |

> **Don't have a university email yet?**
> Contact the **IIUC IT Office** (Room: IT Center, or email `it@iiuc.ac.bd`) to get your official student email address. They will provide you with a Gmail-based university email. Once you have it, log in to that email on Gmail first, then come back here.

---

## Step 2: Create a GitHub Account (Skip if you already have one)

1. Go to [github.com](https://github.com)
2. Click **Sign up** (top-right corner)
3. Enter your **email address** (your university email is recommended)
4. Create a **password** (use something strong and memorable)
5. Choose a **username** — this will be your public identity (e.g., `atiq-iiuc`)
6. Complete the verification puzzle
7. Check your email for the **verification code** and enter it
8. Choose the **Free** plan (you don't need Pro)

> **Tip:** Use your university email as your primary email on GitHub. This helps IIUC-ARMS match your contributions to your profile automatically.

---

## Step 3: Login to IIUC-ARMS

1. Go to [**IIUC-ARMS**](https://iiuc-arms.eu.cc) — your campus opens in the browser
2. Click the **Login** button (top-right corner of the navbar)
3. You'll see the login modal — click **"Continue with GitHub"**
4. You'll be redirected to GitHub — enter your GitHub **username/email** and **password**
5. If prompted, click **Authorize** to grant IIUC-ARMS access
6. You're in! You'll be redirected back to IIUC-ARMS, now logged in

> **First time?** A setup modal may appear asking you to complete your profile. Fill in your name, department, semester, and WhatsApp number.

---

## Step 4: Connect Your GitHub Token for Uploads

Logging in with GitHub (Step 3) only **authenticates** you — it doesn't give IIUC-ARMS permission to upload files on your behalf. For that, you need a **Personal Access Token (PAT)**.

> **Why is this needed?** When you upload files, IIUC-ARMS commits them to the [Academic Files Repository](https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAGER) under **your GitHub identity**. The PAT is what grants this permission. Without it, uploads won't be credited to you.

### How to Connect

1. Go to your **Dashboard** — click your avatar in the top-right → **Dashboard**
2. Find the **GitHub Connection** section (on the right side or the **Security** tab)
3. You'll see a red **"Not Connected"** status — click **[Connect with Personal Access Token](https://iiuc-arms.eu.cc/?action=github-token)**
4. A modal will open with a button: **"Open GitHub Token Page"** — click it
5. You'll be taken to GitHub's token creation page with the correct settings already filled in
6. Select **No expiration** from the dropdown (recommended — so it never expires)
7. Click **"Generate token"** at the bottom of the page
8. GitHub will show your new token — **copy it immediately** (it starts with `ghp_`)
   > ⚠️ You won't be able to see this token again after leaving the page.
9. Back in IIUC-ARMS, **paste the token** in the input field and click **"Connect"**
10. You should see a green **"PAT saved — visible in Contributors list"** confirmation

### Verify It Worked

- In the GitHub Connection section, you should now see:
  - Your **GitHub avatar and username**
  - A green dot with **"Connected via Personal Access Token"**
  - A green bar saying **"PAT saved — visible in Contributors list"**
- Visit the [Contributors page](/contributors) — your name should now appear there

### What If I Already Connected Before?

If you see your GitHub profile but the token has expired or become invalid:
1. You'll see an amber warning: **"PAT expired or invalid"**
2. Click **"Reconnect"**
3. Generate a new token on GitHub and paste it

> **Privacy note:** Your PAT is stored securely on IIUC-ARMS and is never shared. It's used only for file uploads and contribution tracking.

---

## Step 5: Set Up Your Profile

A complete profile helps others identify and contact you:

1. Go to **Dashboard** → **Profile** tab
2. Fill in:
   - **Full Name** — your real name
   - **Department** — e.g., CSE, EEE, BBA
   - **Semester** — e.g., 4th Semester
   - **University ID** — your student ID number
   - **WhatsApp** — for peer coordination
3. Click **Save**

> **Privacy:** You can hide your WhatsApp, University ID, or Semester from the public Contributors page using the visibility toggles.

---

## Step 6: Upload Your First Files

1. Click the **Upload** button (center of the navbar, or the + button on mobile)
2. Select the **Department** and **Semester**
3. Choose the **Category** — Notes, Midterm Questions, Final Questions, etc.
4. **Drag and drop** your files or click to browse
5. Add a **description** if you want
6. Click **Upload** — files are committed to GitHub automatically

> **What happens behind the scenes?** Your files are uploaded to the IIUC Academic Files repository on GitHub, organized by department → semester → category. The commit is attributed to your GitHub account.

---

## Troubleshooting

### "I don't have a university email"
→ Contact the **IIUC IT Office**. Visit the IT Center on campus or email them. They will create your official student email (Gmail-based). You **must** have this email to log in.

### "GitHub login says 'not authorized'"
→ Make sure you're clicking **"Continue with GitHub"** (not Google). If your GitHub account has a **public email set**, go to GitHub → Settings → Emails → uncheck "Keep my email addresses private" so IIUC-ARMS can match your identity.

### "My uploads don't show my name"
→ Make sure you've connected a **Personal Access Token** in Dashboard → GitHub Connection. Just logging in with GitHub isn't enough — you need the PAT for uploads to be credited to you. See [Step 4](#step-4-connect-your-github-token-for-uploads).

### "I forgot my password"
→ Since we use GitHub login, your password is your **GitHub password**. Reset it at [github.com/login](https://github.com/login) → "Forgot password?"

### "I can't see the Upload button"
→ You need to be **logged in**. If you're logged in but still can't see it, your account may be **pending approval**. Wait for an Admin/Manager/Teacher to approve your account.

### "I don't want to create a GitHub token"
→ You can still use IIUC-ARMS without a PAT — you can **browse and download** all public files. But you **cannot upload** or contribute to the repository without one.

---

## Quick Reference

| Action | Where |
|---|---|
| Login | Click "Login" → "Continue with GitHub" |
| Upload files | Click "Upload" button in navbar |
| View contributors | Navigate to [Contributors](/contributors) |
| Edit profile | Dashboard → Profile tab |
| Connect GitHub token | Dashboard → GitHub Connection → "Connect with Personal Access Token" |
| Browse files | Homepage → Select department → semester → category |

---

## Summary

```
University Email → GitHub Account → IIUC-ARMS Login → Upload & Contribute
```

1. Get your **university email** from IT Office
2. Create a **GitHub account** (free)
3. **Login** to IIUC-ARMS with GitHub
4. **Connect your GitHub token (PAT)** in Dashboard for uploads
5. **Complete your profile** in Dashboard
6. **Upload files** and contribute to the community

Your contributions are tracked, counted, and displayed on the Contributors page. Help your juniors by sharing your notes and question papers. Build your open-source profile while helping your university. Win-win.

---

*Questions? Reach out on the [IIUC-ARMS Telegram group](https://t.me/iiuc_arms) or contact the admin team.*
