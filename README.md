# 420 Clan Texture Pack

Official texture pack for the 420 Clan FiveM server.

This pack includes custom weapon skins, visual effects, and graphical enhancements.

---

# Installation

1. Download the WinRAR file.
2. Extract the files into your FiveM directory.
3. Follow the provided folder structure.
4. Launch FiveM.

If Reshade does not load:
- Open the F8 console.
- Follow the instructions shown there.

---

# Features

- Custom Jet Afterburner color (Blue)  
  If you want another color, send a DM for a different version.

- Custom weapon skins  
  Full compatibility list below.

- Custom headshot FX

- QuantV included one time  
  If QuantV updates, you must install the new version yourself.

- Reshade with preset included

---

# Weapon Compatibility

## Rifles

| Weapon | Body | Mag1 | Mag2 | Mag3 | Barrel1 | Barrel2 | Sights |
|--------|------|------|------|------|---------|---------|--------|
| Advanced Rifle | ✅ | ❌ | ❌ | — | — | — | — |
| Assault Rifle | ✅ | ✅ | — | ✅ | — | — | — |
| Compact AK | ✅ | ✅ | ❌ | ✅ | — | — | — |
| Assault Rifle MK2 | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Bullpup Rifle | ✅ | ✅ | ✅ | — | — | — | — |
| Bullpup Rifle MK2 | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Carbine Rifle | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Carbine Rifle MK2 | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Special Carbine | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Special Carbine MK2 | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Battle Rifle | ✅ | ✅ | ✅ | — | — | — | ✅ |
| Military Rifle | ✅ | ✅ | ✅ | — | — | — | ✅ |
| Service Rifle | ✅ | — | — | — | — | — | — |

---

## Pistols

| Weapon | Body | Mag1 | Mag2 | Suppressor |
|--------|------|------|------|------------|
| Pistol | ✅ | ✅ | ✅ | — |
| Pistol MK2 | ✅ | ✅ | ✅ | — |
| Heavy Pistol | ✅ | ✅ | ✅ | — |
| .50 Pistol | ✅ | ✅ | ✅ | — |
| AP Pistol | ✅ | ✅ | ✅ | — |
| XM3 | ✅ | ✅ | — | ✅ |

---

## Shotguns

| Weapon | Body | Mag1 | Mag2 | Suppressor |
|--------|------|------|------|------------|
| Assault Shotgun | ✅ | ✅ | ✅ | — |
| Combat Shotgun | ✅ | ✅ | — | — |
| Pump Shotgun | ✅ | — | — | — |
| Pump Shotgun MK2 | ✅ | — | — | ✅ |

---

## SMGs

Work in progress.

---

## LMGs

| Weapon | Body | Mag1 | Mag2 | Barrel1 | Barrel2 |
|--------|------|------|------|---------|---------|
| Combat MG | ✅ | ❌ | ❌ | — | — |
| Combat MG MK2 | ✅ | ✅ | ✅ | ✅ | ✅ |
| MG | ✅ | ✅ | ✅ | — | — |
| Gusenberg | ✅ | ✅ | ✅ | — | — |

---

## Large Weapons

| Weapon | Supported |
|--------|-----------|
| RPG | ✅ |
| Homing Launcher | ✅ |
| Grenade Launcher | ✅ |

---

## Snipers

| Weapon | Body | Mag1 | Mag2 | Suppressor |
|--------|------|------|------|------------|
| Sniper Rifle | ✅ | ✅ | — | — |
| Marksman Rifle | ✅ | ✅ | ✅ | — |
| Marksman MK2 | ✅ | ❌ | ✅ | — |
| Musket | ✅ | — | — | — |
| Precision Rifle | ✅ | ✅ | — | — |
| Heavy MK2 | — | — | — | ✅ |

---

## Separate Attachments

- w_at_pi_comp_1  
- w_at_pi_comp_2  
- w_at_pi_comp_3  
- w_at_ar_supp_01  
- w_at_ar_supp_02  
- w_at_sr_supp_03  
- w_at_muzzle_8_xm_l1  
- w_at_muzzle_8_xm17  
- w_at_ar_afgrip_hi  

---

# Known Issues

The following attachments are currently not working:

- Advanced Rifle: Mag1, Mag2  
- Compact AK: Mag2  
- Combat MG: Mag1, Mag2  
- Marksman MK2: Mag1  

Fix planned in future updates.

---

# Version

Current Version: 1.2.4  
Status: Active Development

---

# Changelog

## v1.2.4

- Fixed changelog animation behavior on `/pack` (`TexturePackPage`) so the newest entry is shown first
- Added stacked preview cards behind the latest entry for clearer visual hierarchy
- Added smooth expand/collapse animation for older updates on click

## v1.2.3

- Added staff-triggered Discord membership sync for clan list management
- Members who leave the Discord guild are now auto-archived (no hard delete)
- Archived members are excluded from promotion preview/run logic
- Added Show Archived + re-add flow (rejoin starts progression from scratch)
- Updated changelog UI to highlight the latest entry with expandable older entries

## v1.2.2

### Web Platform (Technical)
- Scroll-driven hero experience implemented on `/pack` only (`TexturePackPage`) with threshold-based reveal flow
- Added lightweight scroll loop using `requestAnimationFrame` + passive listeners to reduce scroll jank on mobile
- Reveal thresholds introduced on pack page: `NAV_THRESHOLD = 100`, `CONTENT_THRESHOLD = 150`
- Hero opacity now interpolates against initial viewport height (`heroOpacity = 1 - scrollY / (vh * 0.7)`) with `will-change: opacity`
- `PackNavbar` now supports a `visible` prop and uses CSS transitions (`opacity` + `translateY`) for delayed entrance
- Main pack content now reveals with staged transition (`opacity` + upward transform) to prevent content bleed behind hero

### Moderation & Safety (Technical)
- Added full ban report flow (`/ban-report`) with Netlify function handling and Discord owner notifications
- Added 24-hour duplicate protection for ban report submissions
- Appeal timing remains server-side while appeal date is hidden in player-facing success confirmation
- Added persistent storage migration for reports: `migrations/005_create_ban_reports.sql`

## v1.2.1

### Added
- Staff Team section on homepage
- Dynamic staff card layout grouped by roles
- Clan-focused About Us rewrite
- Shield admin tools menu
- Clan List structural improvements

### Changed
- Login page title updated to "CosmicV KOTH Clan"
- "Updates & Showcase" renamed to "Showcase"
- Showcase subtitle wording updated
- Homepage content restructured to reflect clan identity

### Improved
- Layout consistency
- Mobile responsiveness improvements
- Navigation clarity for staff tools

## v1.2.0

### Application System
- Discord roles as single source of truth (`effective_status` based on Discord roles only)
- Auto-revoke: applications marked "revoked" when user loses Private role in Discord
- Reapply flow: users can override existing pending/accepted applications with "Send anyway" confirmation
- Smooth scroll to error box on "Send anyway" and error states
- Audit logging for all application events

### Admin Panel
- Extracted admin panel to standalone `/admin` route with dedicated layout
- 10-second silent auto-polling (no loading flash, preserves input state)
- Pending application badge on the navbar (red pulsing dot with count, max 99+)
- Archive system: soft-delete/restore applications with reason tracking
- Auto-archive for users who left the Discord guild

### Dashboard
- 10-second silent polling — dashboard auto-updates when admin changes application status
- Tab-focus refresh — switching back to the tab triggers an immediate status check
- Manual refresh button with "Last checked Xs ago" indicator
- No infinite loading spinners on poll cycles

### Verification System (Cloudflare Turnstile)
- New `/verify` page with Cloudflare Turnstile captcha (Managed mode)
- Server-side captcha validation via `POST /.netlify/functions/verify`
- Role swap on verify: removes Unverified role, adds KOTH Player role
- Rate limiting: max 3 verify attempts per minute per user
- Unverified users are redirected to `/verify` before they can access `/apply`
- Audit logging for all verify attempts (success, fail, rate-limited)

### Installation Page
- New `/installation` route with 8-step installation guide
- Warning badges on backup and delete steps
- Troubleshooting section and download CTA

### Infrastructure
- `silentRefresh()` in AuthContext — polls `/me` without triggering loading spinners
- `is_unverified` flag added to `/me` endpoint and User interface
- `admin-pending-count` lightweight endpoint (HEAD query for badge count)
- `admin-archive` endpoint for soft-delete/restore with audit trail