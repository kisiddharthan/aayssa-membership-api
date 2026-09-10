# AAYSSA Membership Portal Agent Notes

Keep this file current. Any future change that alters the tech stack, authentication flow, environment variables, data model, API behavior, portal features, embeds, integrations, deployment behavior, or operational scripts should update this file in the same commit.

## Project

Atlanta Ayyappa Seva Sangam (AAYSSA) Membership Portal.

Public website:
`https://atlantaayyappasevasangam.org`

Member portal:
`https://portal.atlantaayyappasevasangam.org`

Public member login:
`https://atlantaayyappasevasangam.org/member-login`

## Tech Stack

- Hosting/API: Vercel serverless functions.
- Runtime: Node.js serverless API routes under `api/`.
- Frontend: static HTML/CSS/JavaScript in `public/index.html`.
- Public embeds:
  - `public/login-embed.html`
  - `public/register-embed.html`
- Authentication: Supabase email OTP/passcode.
- Membership database: Baserow.
- Donation data: Zeffy API.
- Secrets: Vercel environment variables and local `.env.local`.

Do not expose server-side tokens in browser code.

## Important Environment Variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `BASEROW_URL`
- `BASEROW_TOKEN`
- `BASEROW_TABLE_ID`
- `BASEROW_VOLUNTEERS_TABLE_ID`
- `ZEFFY_API_KEY`

`.env.local` is ignored by Git. Never commit secrets.

## Baserow Tables

Members table:
- Name: `AAYSSA_Members`
- Table ID: `1142367`

Volunteer table:
- Name: `AAYSSA_Volunteers`
- Table ID: `1179938`

Volunteer records are per person:
- Primary
- Spouse
- Additional Member

Volunteer areas:
- Pooja
- Annadhanam
- Bhajan
- Media
- Decorations

## Authentication Flow

The public login embed uses passcode login:

1. User enters email in `public/login-embed.html`.
2. Browser calls `POST /api/login`.
3. Supabase sends a one-time email passcode.
4. User enters the passcode.
5. Browser calls `POST /api/verify-login-code`.
6. API verifies the passcode with Supabase.
7. API sets HttpOnly cookies:
   - `aayssa_access`
   - `aayssa_refresh`
8. Browser redirects to the member portal.

If an active portal session already exists, the login embed calls `GET /api/me` with credentials and redirects directly to the portal.

The old Supabase magic-link callback route was removed after switching to passcode login.

## Authorization Rules

- The browser must never supply or be trusted for role, family row ID, or Baserow row identity.
- Authenticated email from Supabase is the source of identity.
- Backend looks up the member row by normalized email.
- Board/Admin access is enforced server-side.
- Member-only APIs must scope reads/writes to the authenticated member family.

## API Routes

- `POST /api/register`
  - Creates a Baserow member row.
  - Creates per-person volunteer rows.

- `POST /api/login`
  - Starts Supabase email OTP/passcode login.

- `POST /api/verify-login-code`
  - Verifies passcode.
  - Sets portal session cookies.

- `GET /api/me`
  - Returns authenticated member profile.
  - Supports credentialed CORS for public login session detection.

- `POST /api/logout`
  - Clears portal session cookies.

- `GET /api/my-volunteers`
  - Returns active volunteer rows for the authenticated member family.

- `POST /api/update-volunteers`
  - Updates primary/spouse/additional volunteer entries.
  - Deactivates removed additional members.

- `POST /api/update-profile`
  - Updates family/contact/preferences fields for the authenticated member.

- `GET /api/my-donations`
  - Returns current-year Zeffy donation summary for the authenticated member email.

- `GET /api/admin-stats`
  - Board/Admin only.
  - Returns membership counts, volunteer stats, registration trend, Zeffy donation total, and monthly donation trend.

- `GET /api/admin-members`
  - Board/Admin only.
  - Returns paginated member directory.
  - Supports search and sorting by primary name or registered date.

## Portal Features

Member portal (`public/index.html`) includes:

- Family details card with edit controls.
- Contact information card with edit controls.
- Seva & Volunteering card with edit controls.
- Communication preferences card with edit controls.
- Donations & Tax Receipts card:
  - Current-year Zeffy donation total.
  - Payment list.
  - Download tax receipt links when available.
  - Donate button linking to `https://atlantaayyappasevasangam.org/donations`.

Board/Admin dashboard includes:

- Registered families.
- Total people.
- Adults.
- Kids.
- Donations this year.
- Seva area counts.
- Volunteer participation, including total volunteers.
- Monthly donations chart from Zeffy.
- Registration trends chart.
- Member directory with search, pagination, and sorting.

## Public Registration Embed

`public/register-embed.html` is intended for GoDaddy.

Registration supports:

- Primary member information.
- Spouse information.
- Primary volunteering preferences.
- Spouse volunteering preferences.
- Additional family member volunteering preferences.
- Email/text opt-in.

It posts to:
`https://aayssa-membership-api.vercel.app/api/register`

## Public Login Embed

`public/login-embed.html` is intended for GoDaddy.

It uses:
`https://portal.atlantaayyappasevasangam.org/api`

When this file changes, copy the updated embed into GoDaddy for the public login page.

## Zeffy Integration

Zeffy data is read server-side only with `ZEFFY_API_KEY`.

Member donation lookup:
- Uses authenticated Supabase email.
- Looks up matching Zeffy contact(s).
- Reads current-year successful payments.
- Returns totals and receipt URLs only for that member.

Admin dashboard donation summary:
- Board/Admin only.
- Reads current-year successful organization payments.
- Returns aggregate totals and monthly buckets.
- Does not expose donor details.

## Operational Notes

- Vercel Hobby deployments were sensitive to API route count. Keep the route count in mind before adding new API files.
- Current API routes are all actual endpoints. Shared helpers live under `api/_lib/`.
- Before pushing:
  - Run syntax checks for changed API files.
  - Keep route count stable when possible.
  - Verify `.env.local` and `.vercel/` remain ignored.
- `scripts/migrate-volunteers.cjs` supports:
  - `npm run migrate:volunteers:dry-run`
  - `npm run migrate:volunteers:apply`

## Maintenance Requirement

For every future feature or bug fix, update this `AGENTS.md` if the change affects architecture, auth, routes, data fields, integrations, deployment assumptions, public embeds, or user-facing portal capabilities. Treat this file as the quick-start reference for future development sessions.
