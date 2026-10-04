# AAYSSA Membership Portal Agent Notes

Keep this file current. Any future change that alters the tech stack, authentication flow, environment variables, data model, API behavior, portal features, embeds, integrations, deployment behavior, or operational scripts should update this file in the same commit.

## Project

Atlanta Ayyappa Seva Sangam (AAYSSA) Membership Portal.

Public website:
`https://atlantaayyappasevasangam.org`

Member portal:
`https://portal.atlantaayyappasevasangam.org`

Public member login:
`https://portal.atlantaayyappasevasangam.org/login-embed.html`

## Tech Stack

- Hosting/API: Vercel serverless functions.
- Runtime: Node.js serverless API routes under `api/`.
- Frontend: static HTML/CSS/JavaScript in `public/index.html`.
- Public embeds:
  - `public/login-embed.html`
  - `public/register-embed.html`
  - `public/maaladharan-register-embed.html`
  - Home Pooja embed is held at `drafts/home-pooja-booking-embed.html` during Board preview and is not publicly served.
- Authentication: Supabase email OTP/passcode.
- Membership database: Baserow.
- Donation data: Zeffy API.
- Transactional email: Resend REST API.
- Secrets: Vercel environment variables and local `.env.local`.

Do not expose server-side tokens in browser code.

## Important Environment Variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `BASEROW_URL`
- `BASEROW_TOKEN`
- `BASEROW_TABLE_ID`
- `BASEROW_VOLUNTEERS_TABLE_ID`
- `BASEROW_MAALADHARAN_TABLE_ID` (defaults to `1210688`)
- `BASEROW_HOME_POOJA_TABLE_ID` (defaults to `1240702`)
- `HOME_POOJA_PUBLIC_ENABLED` (set to exactly `true` to open the public Home Pooja API; unset/false keeps Board preview mode)
- `ZEFFY_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (verified Resend sender; `RESEND_FROM`, `EMAIL_FROM`, and `FROM_EMAIL` are accepted as fallbacks)
- `RESEND_REPLY_TO_EMAIL` (optional)

`.env.local` is ignored by Git. Never commit secrets.

## Baserow Tables

Members table:
- Name: `AAYSSA_Members`
- Table ID: `1142367`

Volunteer table:
- Name: `AAYSSA_Volunteers`
- Table ID: `1179938`

Maaladharan registration table:
- Name: `AAYSSA_Maaladharan_Registrations`
- Table ID: `1210688`
- One row per registered participant.
- The API resolves Baserow fields by name.
- Member-portal submissions derive the family link and email from the authenticated session.
- Public submissions require a Supabase email passcode, store the verified normalized email, and link the family automatically when that email matches a member.
- An authenticated member lookup claims current-season public registrations that have the same verified email and no family link.

Home Pooja booking table:
- Name: `AAYSSA_Pooja_Bookings`
- Table ID: `1240702`
- Stores booking requests and administrator-created blocked dates.
- Public requests require Supabase email verification; matching members are linked by normalized email.
- Statuses are `Submitted`, `Approved`, `Rejected`, `Cancelled`, and `Blocked`.
- Only approved bookings are exposed on the privacy-safe public calendar.

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
  - Sends a best-effort Resend confirmation to the registered email after the member row is created.
  - The confirmation includes the AAYSSA Family WhatsApp group link in its HTML and plain-text versions.
- `POST /api/register?resource=maaladharan`
  - Public, create-only Maaladharan registration flow.
  - The `request-code` action sends a Supabase email passcode.
  - The `submit` action verifies the passcode before saving.
  - Links an existing member family by normalized verified email without revealing whether a membership matched.
  - Sends the registrant a best-effort confirmation email through Resend after the Baserow row is created.
  - Does not expose public read, edit, or withdrawal operations.

- `GET /api/register?resource=home-pooja`
  - Returns the privacy-safe Home Pooja calendar for the public embed.
  - Exposes availability and booked/blocked state, but no requester details.
  - Returns 404 unless `HOME_POOJA_PUBLIC_ENABLED=true`.

- `POST /api/register?resource=home-pooja`
  - Public Home Pooja request flow using `request-code` and `submit` actions.
  - Verifies the requester email with Supabase before creating a `Submitted` request.
  - Links the family automatically when the verified email matches a member.
  - Returns 404 unless `HOME_POOJA_PUBLIC_ENABLED=true`.

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

- `GET /api/my-volunteers?resource=maaladharan`
  - Returns the authenticated family's 2026-27 Maaladharan registrations.

- `POST /api/my-volunteers?resource=maaladharan`
  - Creates a family-scoped participant registration.
  - Sends the authenticated member a best-effort confirmation email through Resend after the Baserow row is created.
  - Rejects duplicate participant names for the active season.
  - Uses the server-controlled season window of October 25 through December 4, 2026.

- `PATCH /api/my-volunteers?resource=maaladharan`
  - Updates the Maaladharan date, Padi count, Irumudi offering location, and optional member note.
  - Supports withdrawing an active registration by setting its status to `Cancelled`.
  - Verifies that the requested registration belongs to the authenticated family.
  - Shares the existing `my-volunteers` function to keep the Vercel Hobby route count stable.

- `GET /api/my-volunteers?resource=home-pooja`
  - Returns the authenticated family's requests plus the privacy-safe booking calendar.
  - Claims unlinked public requests whose verified email matches the signed-in member.

- `POST /api/my-volunteers?resource=home-pooja`
  - Creates a family-linked Home Pooja request with `Submitted` status.
  - Validates the date against server-controlled availability and blocked dates.

- `GET /api/admin-stats`
  - Board/Admin only.
  - Returns membership counts, volunteer stats, registration trend, Zeffy donation total, and monthly donation trend.

- `GET /api/admin-members`
  - Board/Admin only.
  - Returns paginated member directory.
  - Supports search and sorting by primary name or registered date.

- `GET /api/admin-members?resource=home-pooja`
  - Admin-only list of Home Pooja requests, blocks, and calendar state.

- `POST /api/admin-members?resource=home-pooja`
  - Admin-only creation of a blocked calendar date with a reason.

- `PATCH /api/admin-members?resource=home-pooja`
  - Admin-only approval/rejection of requests and removal of custom date blocks.
  - Approval is refused when another approved booking or block occupies the date.

## Portal Features

Member portal (`public/index.html`) includes:

- A desktop header matching the public AAYSSA website, with its hosted transparent logo, complete navigation labels, and responsive mobile menu.
  - Member, Events, and Sevas are direct links without dropdown indicators and currently point to the public home page because standalone destination routes are unavailable.
- Top member header with welcome text, role badge, and logout button.
- An unauthenticated portal visit links directly to the deployed portal login form; do not use the removed public `/member-login` route.
- Family details card with edit controls.
- Contact information card with edit controls.
- Seva & Volunteering card with edit controls.
- Communication preferences card with edit controls.
- Native 2026-27 Maaladharan registration card:
  - Displays the Mandalam start and closing dates.
  - Registers primary, spouse, or additional family members individually.
  - Captures age, phone, Maaladharan date, Padi count, Irumudi offering location, and optional notes.
  - Irumudi offering choices are `Tampa Temple` (December 5, 2026; shared bus expense approximately $340/person), `AAYSSA Temple` (December 12, 2026; estimated cost approximately $60/person), and `Other Temple or Self`.
  - The form labels Padi as “Padi Count Completed”; the Baserow value and displayed choice are both `1`.
  - Padi guidance explicitly tells registrants not to include the current year's Padi in the completed count; this wording is shared by member create/edit forms and the public embed.
  - Padi choices run from `0 (Kanni Swamy)` through `39`, followed by `40+`; `18 (Guru Swamy)` retains its existing label.
  - Selecting `0 (Kanni Swamy)` automatically marks the participant as taking Deeksha for the first time.
  - Displays existing family registrations and prevents duplicates.
  - Shows the link to join the Maaladharan WhatsApp group after a successful registration.
- Home Pooja booking card:
  - Shows the shared availability calendar and the family's submitted requests.
  - Presents availability in a responsive month-at-a-time calendar with Previous/Next navigation and privacy-safe Available, Booked, and Blocked states.
  - Allows an authenticated family to submit a request for administrator approval.
  - Does not mark a requested date booked until the request is approved.
- During preview, appears only for authenticated Board/Admin users and the member API enforces the same role restriction.
  - Preview loading is isolated from the core member profile so an optional booking or dashboard failure cannot prevent portal access.
  - Calendar-only dates are formatted as local calendar dates to avoid UTC date shifts in the browser.
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
- 2026-27 Maaladharan charts showing active Swamies by Padi count and planned Maaladharan date.
- Member directory with search, pagination, and sorting.
- Admin-only Home Pooja request review with Approve and Reject actions.
- Admin-only date blocking with a required reason and custom-block removal.

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

- Its Member Login banner matches the gradient header treatment used by the member registration embed.
- It includes a link to join the AAYSSA Family WhatsApp group.
- External WhatsApp links use `target="_top"` so Safari can leave the cross-origin GoDaddy iframe without triggering Cross-Origin-Opener-Policy errors.

It uses:
`https://portal.atlantaayyappasevasangam.org/api`

When this file changes, copy the updated embed into GoDaddy for the public login page.

## Public Maaladharan Registration Embed

`public/maaladharan-register-embed.html` is intended for GoDaddy.

- Members and non-members can submit a 2026-27 Maaladharan registration.
- The visitor must verify the submitted email with a Supabase passcode.
- Existing members are linked by normalized email; non-members remain unlinked until a membership with the same email signs in.
- The public flow is create-only. Editing and withdrawal require member-portal authentication.
- Successful registrations receive a Resend confirmation email containing the registration details and WhatsApp group link; delivery failure does not roll back the saved registration.
- The form reveals a direct link to join the Maaladharan WhatsApp group only after a successful registration.
- Its WhatsApp link uses `target="_top"` to escape the GoDaddy iframe safely in Safari.
- When this file changes, copy the updated embed into GoDaddy for the public Maaladharan registration page.

## Public Home Pooja Booking Embed

`drafts/home-pooja-booking-embed.html` is the pre-launch GoDaddy embed. It is intentionally outside `public/` during Board preview.

- Visitors can view a privacy-safe availability calendar and submit a request after verifying their email with a Supabase passcode.
- Saturdays are offered from 5:00–8:00 PM and Sundays from 9:00 AM–12:00 PM year-round.
- During the 2026 Mandalam window, October 30 through November 29, Fridays are also offered from 5:00–8:00 PM.
- Thanksgiving dates November 25 and 26, 2026 are offered from 5:00–8:00 PM.
- November 14–15 and November 21–22, 2026 are fixed blocked dates for event preparation and the Pushpabhishekam/Sastha Preethi events.
- Administrator-created blocks and approved requests remove dates from availability; submitted requests do not reserve a date.
- Public requests start with `Submitted` status. The public flow cannot approve or edit requests.
- The public API is disabled by default during Board preview; launch it by setting `HOME_POOJA_PUBLIC_ENABLED=true`.
- At launch, move/copy the reviewed embed into the public deployment workflow, set `HOME_POOJA_PUBLIC_ENABLED=true`, and copy it into GoDaddy.

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
