# Team Daily-Report System

A full-stack, multi-user daily reporting web application tailored for a 7–10 person team with role-based dashboards, scheduling, shared task tracking, and fine-tuning dataset export.

Built entirely on **free-tier Cloudflare architecture**:
- **Frontend & API**: Next.js 15 (App Router) deployed via `@opennextjs/cloudflare`
- **Database**: Cloudflare D1 (Serverless SQLite) + Drizzle ORM
- **Authentication**: Google OAuth with Better Auth (Edge & D1-native)
- **Styling**: Tailwind CSS v4 with dark mode & responsive mobile layouts

---

## Roles & Permissions

| Role | Permissions |
|---|---|
| **Master Admin** | Master dashboard, create/manage calendar schedule, edit any submission, manage users & roles, add/remove shared dev task links, export full JSONL dataset |
| **Team Member** | Personal dashboard with assigned schedule status, 3-step WhatsApp parsing submission form, edit own reports before local cutoff (11:59 PM `Asia/Dhaka`), view personal 14-day history |
| **Reviewer** | Read-only aggregated view of all submitted reports across the entire team + historical archive |

---

## Project Structure

```
├── migrations/
│   └── 0000_initial.sql           # Initial D1 SQLite schema + seed links
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx  # Google OAuth login page
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Responsive sidebar & mobile bottom nav
│   │   │   ├── member/page.tsx    # Team Member dashboard & submission form
│   │   │   ├── reviewer/page.tsx  # Reviewer aggregated read-only view
│   │   │   └── admin/
│   │   │       ├── page.tsx       # Master dashboard with daily status table
│   │   │       ├── schedule/      # Calendar grid & copy-week scheduling tool
│   │   │       ├── users/         # Role management & team task link editor
│   │   │       └── export/        # JSONL fine-tuning dataset exporter
│   │   ├── api/
│   │   │   ├── auth/[...all]/     # Better Auth edge handler
│   │   │   ├── submissions/       # CRUD with server-side report generator
│   │   │   ├── schedule/          # Schedule assignment & copy-week API
│   │   │   ├── users/             # Role updates & user deletions
│   │   │   ├── team-links/        # Shared dev task links API
│   │   │   └── export/            # Streaming fine-tuning JSONL export
│   │   ├── globals.css            # Custom dark design system
│   │   └── layout.tsx             # Root layout with Inter & JetBrains Mono fonts
│   ├── db/
│   │   ├── client.ts              # Request-scoped D1 Drizzle factory
│   │   └── schema.ts              # Full Drizzle schema (raw + final persisted)
│   └── lib/
│       ├── api-helpers.ts         # Session extraction & error handling
│       ├── auth.ts                # Better Auth + D1 config & bootstrap hook
│       ├── auth-client.ts         # Client auth hooks (signIn, signOut)
│       ├── parse-messages.ts      # Pure regex WhatsApp parsing engine
│       ├── permissions.ts         # Centralized RBAC permission engine
│       ├── report-formatter.ts    # Isolated report format generator & config
│       └── timezone.ts            # Timezone-aware cutoff validator
├── wrangler.jsonc                 # Cloudflare Workers / D1 config
└── package.json
```

---

## Setup & Deployment Guide

### 1. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in:
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from [Google Cloud Console](https://console.cloud.google.com/apis/credentials))
- `BETTER_AUTH_SECRET` (generate a random 32+ character string)
- `BOOTSTRAP_ADMIN_EMAIL` (your Google email — automatically receives the `admin` role on first login)
- `TEAM_TIMEZONE` (defaults to `"Asia/Dhaka"`)

### 2. Create Cloudflare D1 Database (Remote)
If you haven't created your D1 database yet:
```bash
npx wrangler d1 create daily-report-db
```
Paste the returned `database_id` into `wrangler.jsonc`.

### 3. Run Database Migrations
**For Local Development:**
```bash
npm run db:migrate:local
```
**For Remote Production:**
```bash
npm run db:migrate:prod
```

### 4. Run Locally
```bash
npm run dev
```
Open `http://localhost:3000`.

### 5. Build and Deploy to Cloudflare Pages (Free Tier)
```bash
npm run deploy
```

---

## Fine-Tuning Dataset Export

Every submission persists both `raw_input` (all raw fields / WhatsApp text) and `final_report` (the generated output) separately.

Navigate to **Admin &rarr; Export Dataset** (or `GET /api/export` with an admin session) to download a `.jsonl` file formatted as:
```json
{"id":"...","date":"2026-08-27","user_email":"member@company.com","user_name":"Alice","raw_input":{"tasksDone":1,"inReview":2,"inProgress":3,"overdueTasks":0,"overdueDependencies":1,"totalAssigned":12,"tomorrowCount":3},"final_report":"Here are the details of our tasks for today: ...","edited":false,"edit_count":0,"created_at":"2026-08-27T14:30:00.000Z"}
```
Each line is an independent JSON object ready for immediate fine-tuning preprocessing.
