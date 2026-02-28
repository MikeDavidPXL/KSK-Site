# [KSK] Kommando Spezialkräfte

Official website for [KSK] Kommando Spezialkräfte — a competitive FiveM KOTH clan.

---

## Features

- **Discord Login** — OAuth2 login with role-based access control
- **Clan Member List** — Full rank tracking with automatic promotion system
- **Application System** — Members can apply through the website
- **Admin Panel** — Staff can review, accept, or reject applications
- **Ban Report System** — In-game ban reporting flow
- **Promotion Queue** — Automated rank promotions with Discord role assignment
- **Verification** — Cloudflare Turnstile captcha for new member verification

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Framer Motion
- **Backend:** Netlify Functions (serverless)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Discord OAuth2 + JWT sessions
- **Captcha:** Cloudflare Turnstile

---

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials
3. Run `npm install`
4. Run `npm run dev` for local development
5. Run the SQL migrations in your Supabase dashboard

---

## Rank System

| Rank | Days Required |
|------|--------------|
| Trial Member | 0 |
| Member | 14 |
| Recruiter | 30 |
| Commander | 60 |

---

## Deployment

Deployed on Netlify at [ksk-site.netlify.app](https://ksk-site.netlify.app)