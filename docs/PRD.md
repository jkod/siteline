# Siteline — PRD: MVP (web)

Oct 20, 2026 · @Johan Ljungdahl

This PRD specifies the Siteline MVP as a web app built with Angular and Firebase, written to be handed to Claude Code and built milestone by milestone.

## 1. Overview

Siteline gives each job its own branded feed, so clients can follow progress, approve extra work in writing and get answers without calling. The MVP launches with two kinds of customer on one codebase: renovation firms with 2–15 people, who run projects, and simple recurring home services, starting with tutors and gardeners, who send a short report after each visit. It is a web app built on Angular and Firebase; native apps come later.

**Why both.** Renovation firms pay the most, but a household renovates only every few years. Tutors and gardeners visit every week and each serves many households, so far more people get to know Siteline. When those households hire a renovator, inviting them to Siteline takes one tap (F20).

**The problem.** Clients call for updates because they can't see progress or what happened at the last visit. Extra work agreed verbally gets disputed when the invoice arrives. Photos, notes and decisions get lost in text and WhatsApp threads.

**MVP goals**

1. A crew member can post an update with photos in under 30 seconds from a phone.
2. A tutor or gardener can send a visit report in under a minute.
3. A client can open their project from a text message, with no account to create and nothing to install.
4. Every extra-work decision is approved in writing, with a timestamped record that cannot be changed.
5. When a renovation is done, the firm hands over a branded PDF with photos, materials, warranties and every approved extra.
6. A client can invite any other business that works on their home in one tap, and every invite is tracked.
7. Firms can start free and upgrade by card, with a cheaper plan for recurring services.

**Pilot success metrics** (measured at day 90 of the pilot; targets from Siteline — Concept, Segments & Go-to-Market except those marked as proposals):

| Metric | Target |
| --- | --- |
| Posts per active project per week | 3 or more |
| Visits with a report | 80% or more (proposal) |
| Feed opens per client per week | 3 or more |
| Change orders approved in the app | 70% |
| Calls avoided, as reported by owners | 5 or more per firm per week |
| Design partners converting to paid | 30% |
| Firms referred by clients or other firms | 3 or more |
| Service clients who invite another business within 90 days | 5% (proposal) |

**Not in the MVP:** native apps, general chat between clients, video calls, analytics dashboards, payments between firm and client, and a marketplace.

**References:** the go-to-market doc above and the [landing page design](https://claude.ai/code/artifact/dc0dc51a-f406-47b0-944a-615461029f3b). Both are private links that Claude Code can't open, so everything it needs is written into this PRD.

## 2. Users and permissions

The MVP has four roles. Staff belong to one company. Clients are invited per project and can be clients of several firms at once.

- **Owner** creates the company, manages billing and sees every project. A company always has at least one owner.
- **Admin** can do everything an owner can, except billing and deleting the company.
- **Crew** work on the projects they are assigned to: posting updates, photos and voice notes, and managing the next visit and checklist. Crew can send priced decisions only when the company allows it; otherwise their decisions are saved as drafts for an owner or admin to send.
- **Client** is the person the work is for: the homeowner, or a parent or guardian when the service is tutoring. Clients are invited by text message. A project can have several clients, such as a couple; in the MVP any one of them can approve.

| Action | Owner | Admin | Crew | Client |
| --- | --- | --- | --- | --- |
| Edit company profile, branding and staff | Yes | Yes | No | No |
| Manage billing and plan | Yes | No | No | No |
| Create, complete and archive projects | Yes | Yes | No | No |
| See projects | All | All | Assigned | Invited |
| Invite, resend or revoke client links | Yes | Yes | Assigned | No |
| Post updates, photos and voice notes | Yes | Yes | Assigned | No |
| Ask a question (text and photos) | No | No | No | Yes |
| Comment on any post | Yes | Yes | Assigned | Yes |
| Create a decision card | Yes | Yes | Draft only, unless `crewCanSendPricedCards` is on | No |
| Approve, decline or choose on a decision | No | No | No | Yes |
| Plan the next visit | Yes | Yes | Assigned | No |
| Add checklist items | Yes | Yes | Assigned | Yes |
| Tick checklist items | Any item | Any item | Any item, assigned projects | Client items |
| Edit the handover pack and generate the PDF | Yes | Yes | No | No |
| Download the handover PDF | Yes | Yes | Assigned | Yes |
| Edit or delete own posts and comments | Yes | Yes | Yes | Yes |

**Rules that apply across roles**

- Staff can never approve on a client's behalf.
- A decision card can't be deleted once it has been sent; it can only be withdrawn.
- Deleting a post leaves a "removed by the author" marker in the feed.

**Phase 2 roles:** followers (family members who can view, or view and approve) and partners (architects, subcontractors, insurers and housing association boards) who see only what is shared with them.

## 3. Scope

The MVP is thirteen must-have features (P0) and seven that should land before the pilot ends (P1). P0 means the pilot can't start without it; P1 means build it once P0 is solid.

| ID | Feature | Priority |
| --- | --- | --- |
| F1 | Sign-in and company setup | P0 |
| F2 | Projects, service clients, crew and clients | P0 |
| F3 | Client access by text-message link, and the branded client view | P0 |
| F4 | Feed: updates, photos, questions, comments, milestones | P0 |
| F5 | Voice-to-update: an AI draft the user confirms before posting | P0 |
| F6 | Decision cards: extra work (ÄTA), choices and approvals, with approval records and a running total | P0 |
| F7 | Next visit and shared checklist, with reminders | P0 |
| F8 | Notifications and daily digest | P0 |
| F9 | Handover pack (PDF) | P0 |
| F10 | Plans and billing: free plan, a Visits plan for recurring services, Stripe subscriptions, plan limits | P0 |
| F11 | Privacy tools: export and delete | P0 |
| F19 | Service mode: recurring visits, visit reports and a client list, for tutors, gardeners and similar services | P0 |
| F20 | Invite your next provider: clients invite other businesses that work on their home, with tracking and a reward | P0 |
| F12 | Condition check-in | P1 |
| F13 | Aftercare reminders | P1 |
| F14 | Today list for staff | P1 |
| F15 | Offline photo queue | P1 |
| F16 | "Seen by" indicators | P1 |
| F17 | Phone check before a client's first approval | P1 |
| F18 | Hidden-work photo tag, with its own chapter in the handover pack | P1 |

**Two modes, one codebase.** A service client is a project with `kind: 'service'`. It reuses the feed, visits, checklist, decisions and notifications, and swaps the handover pack for a recurring schedule and visit reports. A firm can use both modes, for example a garden builder with landscaping projects and weekly maintenance clients.

**Phase 2, after the pilot:** Ask the project, a ROT and RUT helper, review requests and portfolio pages, crew translation, partner links (architects, subcontractors, insurers, housing association boards), followers and decisions that need several approvers, BankID signing, approving by replying to a text, calendar sync, a weather-aware delay card, readings (moisture and similar), season and term summaries for service clients, integrations (Fortnox, Bygglet), and inventory cards for estate clearance and moving.

**Not planned:** native apps until the web app has proven itself, general chat between clients, video calls, analytics dashboards and a marketplace.

**Phase 2 ideas from the build:**

- **Inline translation:** comments and posts shown in the reader's own language, with the original one tap away. Translated in a function behind the AI adapter, cached per language, and marked as translated.
- **Several approvers:** decisions that need several approvers have a first version already. Clients set "any one of us" or "everyone must approve" for priced decisions on their project.

**Build for phase 2 now.** Keep post text plain and searchable so Ask the project can index it. Store the labour and material split on extra work for the ROT and RUT helper. Give every post a visibility field so partners can see only some posts later. Model approvals so a decision can require more than one approver without a migration.

## 4. Key flows

### 4.1 Client invite and link access

Clients get in through a link in a text message. The link is exchanged for a Firebase custom token, so the client never creates a password or installs anything.

1. A staff member adds a client to a project: name, mobile number and an optional email. Numbers are normalised to E.164, with +46 as the default country code.
2. The `inviteClient` function creates a random 32-byte token, stores only its SHA-256 hash in `invites/{hash}` with the project, role, expiry and creator, and queues a text message with the link `https://{appDomain}/p/{token}`.
3. The client taps the link and the web app calls `redeemInvite` with the token.
4. `redeemInvite` checks the hash, expiry and revocation, finds or creates the client's user by phone number, adds them to the project and returns a custom token.
5. The app signs in with the custom token, using local persistence, and opens `/c/{projectId}`.
6. On later visits the client is already signed in. On a new device the same link works until it expires or is revoked. Staff can resend or revoke links from the project's People tab.
7. An expired or revoked link opens a friendly page with a "Request a new link" button that notifies the firm.

Treat links like passwords: never log them, rate-limit redemption, and expire them 90 days after the project is completed (staff can renew). Client accounts created from custom tokens hold no phone number or email in Firebase Authentication; contact details live only in Firestore, in the EU. With F17 (P1), a firm can require a one-time code by text before a client's first approval on a new device.

### 4.2 Posting an update

1. The composer on the project page offers Photo, Hold to talk and a text field.
2. Photos are prepared in the browser before upload: a 2,560 px version and a 640 px thumbnail, JPEG at about 0.8 quality, rotated according to EXIF, with GPS data removed. Uploads show progress.
3. A voice recording of up to 120 seconds is uploaded, and `draftFromVoice` returns a written draft in the project's language. The user edits it and confirms; nothing is posted without that confirmation.
4. The post shows instantly for the author and in real time for everyone on the project.
5. Clients are notified straight away about decisions and replies. Ordinary updates go into the evening digest, unless a client has switched on instant notifications.

### 4.3 Decision card lifecycle

A decision moves from draft to sent, then ends as approved, declined, withdrawn or superseded. Final states can never be edited or deleted.

| From | Event | Who | To | Side effects |
| --- | --- | --- | --- | --- |
| (new) | Create | Owner, admin, crew | draft | Nothing is sent |
| draft | Edit or delete | Creator, owner, admin | draft, or deleted | Nothing is sent |
| draft | Send | Owner, admin; crew if allowed | sent | Version snapshot saved; clients notified straight away |
| sent | Approve, or choose an option | Client | approved | Approval record written; project total updated; staff notified |
| sent | Decline, with an optional reason | Client | declined | Approval record written with outcome declined; staff notified |
| sent | Ask a question | Client | sent | Comment added to the card; staff notified |
| sent | Edit | Staff who can send | superseded, and a new version is sent | Old version kept read-only; clients told it changed |
| sent | Withdraw | Staff who can send | withdrawn | Clients notified |
| sent | 24 hours without an answer (P1) | System | sent | One reminder to clients; shown on the Today list |
| approved, declined, withdrawn, superseded | Anything | Anyone | unchanged | Final state |

### 4.4 Recurring visits and visit reports (service mode)

1. A tutor or gardener adds a service client: the client's name and mobile number, what the service covers (for example "Maths with Elsa" or "Garden, Tallvägen 4") and a schedule, such as every Tuesday 15:00–16:00 or every other Thursday morning.
2. Siteline creates the visits eight weeks ahead from the schedule and invites the client by text, as in flow 4.1.
3. After a visit, the provider taps Report on it, ticks what was done from a template, adds photos and a short note, flags anything the client should know, and adds items for next time. Voice-to-update can fill in the report.
4. The client gets the report straight away and sees the next visit with its list.
5. Either side can ask to move or cancel a single visit. The provider confirms, and the client is told.
6. Extra work follows flow 4.3, for example "Prune the apple tree as well: 600 kr" or "An extra session before the exam: 450 kr".

Report templates, editable per company:

- **Tutoring:** subject and topics covered, how it went (good, OK, hard), practice until next time, and a note to the parent.
- **Gardening:** tasks done (mowing, hedges, weeding, leaves, other), observations such as "the gutter is blocked", a note and photos.
- **Other services:** what was done, a note and photos.

### 4.5 Invite your next provider

1. The client's home screen, the daily digest and the handover pack show a card: "Getting other work done at home? Invite them to Siteline."
2. The client picks the kind of business (renovation, garden, cleaning, tutoring, other) and shares an invite link through the phone's own share sheet (the Web Share API), with copy-link as a fallback. The message comes from the client, not from Siteline.
3. The link `https://{appDomain}/r/{code}` opens a short page explaining Siteline. It names the client by first name only if they chose to include it.
4. A business that signs up from the link is attributed to the client and to the firm the invite came from.
5. When the new business starts paying, the firm the invite came from gets a free month (F20).
6. When the new business invites the same client by phone number, its project appears on the client's existing home screen, next to the tutor and the gardener.

## 5. Feature requirements

Each feature lists what to build and when it counts as done. The "done when" items are the acceptance tests.

### F1 Sign-in and company setup (P0)

- Staff sign in with an email link or Google through Firebase Authentication. There are no passwords.
- The first sign-in starts onboarding: company name, optional organisation number, logo (PNG, JPG or SVG up to 2 MB), accent colour (default #127A69) and language (Swedish or English).
- The owner invites staff by email or text with a role. A staff invite works like a client link but creates a staff membership.
- A function sets the staff member's company and role as custom claims (`cid`, `crole`); the app refreshes the ID token after any change.

**Done when**

- A new user can sign in, create a company and create a first project in under three minutes.
- An organisation number, when entered, is checked against the Swedish format and the Luhn checksum.
- The last owner of a company can't be removed or demoted.
- If the accent colour has less than 4.5:1 contrast against white, it is still used for fills, but text and links use a darker shade that passes.

### F2 Projects, crew and clients (P0)

- There are two kinds. A project is a job with a start and an end: a title (for example "Köksrenovering Lindqvist"), an address, a start date, an optional expected end date, assigned crew and clients. A service client is ongoing: a subject (for example "Maths with Elsa"), an optional address, a schedule and clients (F19).
- Statuses are active, completed (after handover) and archived (hidden from lists but still readable by its clients).
- Creating or reactivating a project goes through the `createProject` function, which enforces the plan's limit for that kind (active projects or service clients) in a transaction.
- The People tab lists clients and crew, with resend and revoke for client links and the last time each client opened the feed.

**Done when**

- Creating a project beyond the plan limit is blocked by the server, and the UI offers an upgrade.
- Crew see only their assigned projects; owners and admins see all of them.
- Removing a client revokes their links and access at once, and a rules test proves they can no longer read the project.

### F3 Client access and the client view (P0)

- Link access works as described in flow 4.1.
- The client view carries the firm's name, logo and accent colour. On the free plan, a small "Updates by Siteline" footer links to the marketing site.
- The client view has four tabs: Feed; Decisions (open ones first, then history with the extra-work total); Next visit (with the client's checklist items); and Handover, once it exists.
- A client sees everything from every firm they use, projects and services alike, on one home screen with the invite card (F20) at `/c`.
- The app is a PWA: installable, with an "Add to home screen" hint on the second visit that includes iPhone instructions.

**Done when**

- Opening a valid link on a fresh phone shows the feed within 3 seconds over 4G, with no password or app install.
- A client can't read any data from projects they aren't part of (rules tests).
- An expired or revoked link shows the request-a-new-link page, and the request reaches the firm.
- Siteline's own branding appears only in the footer.

### F4 Feed (P0)

- Post types are: update (staff, with text and up to 20 photos); question (client, with text and up to 5 photos); milestone (staff, a named stage such as "Plumbing done", optionally "stage 3 of 4"); decision (F6); condition report (F12); and system posts such as "Handover pack ready".
- Any post can be commented on, one level deep.
- Photos open in a full-screen viewer with swipe and pinch-zoom. Photos can be tagged before, after, hidden work (F18) or condition (F12).
- Authors can edit their own posts and comments (shown as "edited") and delete them (leaving a marker). Sent decisions can't be deleted.
- A client question is marked unanswered until a staff member comments on it or marks it resolved.
- The feed shows the newest first, 20 posts per page, with infinite scroll and real-time updates.

**Done when**

- Posting five photos over 4G shows upload progress, and the post appears immediately in a pending state.
- Stored photos are no larger than 2,560 px and contain no GPS data, verified by reading a stored file.
- Unanswered questions show a badge for staff that clears once answered.
- New posts and comments appear for other users within two seconds, without a reload.

### F5 Voice-to-update (P0)

- The user holds the button to record, or taps to start and stop for accessibility. A timer shows, with a 120-second limit.
- The audio is uploaded to Storage, and `draftFromVoice` transcribes it and rewrites it as a short, friendly update in the project's language. The rewrite keeps numbers, dates, measurements and product names exactly as spoken, adds nothing that wasn't said, uses no emoji and marks words it is unsure of.
- The draft opens in the composer for editing, and the user must confirm before it is posted.
- Audio is visible only to staff. It is deleted 30 days after the post is published, or at once if the draft is discarded.
- P1: the draft also suggests a next-visit time, client checklist items or an extra-work card, shown as one-tap chips.

**Done when**

- A 20-second Swedish recording returns an editable draft in under 15 seconds at p90.
- Nothing is posted without the user's confirmation.
- If the AI call fails, the user gets the raw transcript, or an empty composer, and can still post.
- A scheduled job deletes audio after 30 days, covered by a unit test.

### F6 Decision cards (P0)

- There are three kinds of card:
  - **Extra work (ÄTA):** title, description, photos, price including VAT, an optional labour and material split, and an optional "answer by" date.
  - **Choice:** a question with 2–6 options, each with an optional photo and price difference.
  - **Approval:** a yes or no without a price, such as "Is tile layout B OK?"
- The client can approve (or choose), decline with an optional reason, or ask a question.
- Responses go through the `respondToDecision` function, never through direct writes. It checks that the card is still sent and on the same version, then writes an approval record with a snapshot of the card, the snapshot's SHA-256 hash, the client's name, a masked phone number and a server timestamp.
- The card shows the outcome, for example "Approved by Anna Lindqvist, 3 Oct 2026, 18:42".
- The Decisions tab lists open decisions first, then history, with the total of approved extra work.
- Editing a sent card supersedes it and sends a new version; earlier versions stay visible.
- Staff can export all decisions as CSV, and the handover pack includes them.

**Done when**

- Each response creates exactly one approval record, and a repeated call for the same version is rejected.
- Nobody can update or delete an approval record through the client SDK (rules test).
- The total equals the sum of approved extra-work versions (unit test).
- Staff are notified within one minute of a client's decision.
- Prices show as "6 500 kr" in Swedish and "SEK 6,500" in English.

### F7 Next visit and checklist (P0)

- Each project has one upcoming visit: date, start time, optional end time, number of people and notes such as "Water off 09:00–11:00". Past visits are kept as history. Service clients get their visits from a recurring schedule (F19), and their next visit is the earliest one scheduled.
- Each checklist item has text, a side (client or firm), who added it, and who ticked it and when. Clients can add items for either side.
- When a visit is marked done, its unfinished items move to the next visit.
- Reminders go out the evening before (company setting, default 18:00) to clients and assigned crew, listing the open items for their side.

**Done when**

- Changing the visit time notifies clients immediately.
- A reminder is sent only when a visit is booked for the next day, and it lists only the recipient's side.
- Ticking an item records who and when; it can be unticked within 24 hours.
- Unfinished items appear on the following visit once the current one is marked done.

### F8 Notifications and daily digest (P0)

- Events, recipients and timing are listed in section 6. Every message goes through a Firestore outbox processed by functions, with retries, quiet hours, per-person preferences and a dedupe key.

**Done when**

- No message is sent twice for the same event (dedupe key test).
- Text messages to clients are never sent between 21:00 and 07:00 Stockholm time; they wait until 07:00.
- A digest is sent only when the project had new posts that day.

### F9 Handover pack (P0)

- Staff fill in a summary, before-and-after pairs picked from project photos, materials and products (name, brand, colour code, supplier, warranty years), warranty and care notes, and attachments such as manuals and certificates.
- `generateHandover` builds a branded PDF: cover, summary, key milestones, before-and-after, materials, every approved extra with approver, time and the total, hidden-work photos (F18), the condition check-in (F12) and a list of attachments. Each run is stored in Storage as a new version.
- Generating the pack marks the project completed and notifies clients, who can download it from the client view at any time.

**Done when**

- A project with 200 photos produces its PDF in under 60 seconds.
- The PDF lists every approved extra with approver, time and price, and its total matches the Decisions tab.
- Clients can still download the PDF after the project is archived.

### F10 Plans and billing (P0)

Prices are per month, excluding VAT. Annual billing gives two months free.

| Plan | Price | Active projects | Service clients | Staff | Includes |
| --- | --- | --- | --- | --- | --- |
| Free | 0 kr | 1 | 3 | 1 | Core features; "Updates by Siteline" footer |
| Visits | 99 kr | 1 | 20 | 1 | Service mode and core features for tutors, gardeners and similar; the footer stays as part of the invite loop |
| Solo | 299 kr | 5 | 20 | 1 | Adds condition check-in; no footer |
| Team | 790 kr | 25 | 100 | 10 | Adds logo and colours, aftercare reminders; Ask the project in phase 2 |
| Pro | 1,690 kr | Unlimited | Unlimited | Unlimited | Adds partner links and portfolio pages in phase 2 |

- Stripe Checkout starts subscriptions, and the Stripe Customer Portal handles cards, plan changes and cancellation. A Stripe webhook updates the company's plan and limits.
- Design partners get a `compedUntil` date that unlocks Team features for free, six months for the pilot.
- Downgrading never deletes data. Projects over the limit stay usable, but no new project can be created until usage is under the limit.

**Done when**

- Limits are enforced on the server, and the UI shows usage such as "3 of 5 active projects".
- The webhook verifies Stripe signatures, and plan changes show in the app within a minute.
- The full subscription lifecycle (start, upgrade, downgrade, cancel, failed payment) works in Stripe test mode.

### F11 Privacy tools (P0)

- An owner can delete a project after typing its name. It disappears for everyone at once, and its files are deleted after 30 days.
- A client can leave a project and ask for their personal data to be removed. Their member record is anonymised, and approval records keep only what is needed as evidence of the agreement.
- Staff can delete their own account; an owner must transfer ownership first.
- P1: a company export as a ZIP of JSON and media.

**Done when**

- A deleted project disappears from every client's list at once, and a scheduled job removes its files after 30 days.
- After a client asks to be removed, their name and phone number appear nowhere except the anonymised approval evidence.

### F19 Service mode (P0)

- A company can add service clients alongside projects. A service client is a project with `kind: 'service'`, a subject such as "Maths with Elsa", an optional address, a schedule and no end date.
- Schedules use RFC 5545 recurrence rules through the `rrule` library: weekly or every other week, on chosen days and times, with skipped dates for holidays and school breaks. A daily job keeps visits created eight weeks ahead.
- A visit report is a post linked to a visit, with the template checklist, photos, a note, flags and items for next time. Voice-to-update (F5) can fill it in.
- The staff home has two lists, Projects and Clients, and a strip of today's visits with a Report button on each. In the client view, a service client has Feed, Visits and Decisions tabs, and no handover.
- Clients can ask to move or cancel a single visit, with an optional note; staff accept or suggest another time.
- For tutoring, the client is the parent or guardian, and the student appears only as a first name or nickname in the subject. Photos are off by default (section 10).

**Done when**

- A tutor can add a client with a weekly schedule and send the first report in under three minutes.
- A gardener can send a report with the default template in under a minute, tested with three real users.
- Moving one visit leaves the rest of the series alone, and a skipped date produces no visit.
- A report notifies the client straight away, and a visit without a report stays on the provider's strip until it is reported or cancelled.

### F20 Invite your next provider (P0)

- Clients see the invite card on their home screen, in the digest and in the handover pack, and can find it at any time in settings.
- Invites are shared through the Web Share API, with copy-link as a fallback. Siteline never sends invite texts itself, which keeps invites personal and avoids unsolicited messages.
- Each invite has a code that records the inviting client, the firm and project it came from, and the kind of business chosen.
- A company that signs up from `/r/{code}` stores the referral. When it first pays, the firm the invite came from gets one month free as a Stripe credit (a proposal; see section 16).
- Firms see in their billing settings how many businesses their clients have brought in.

**Done when**

- A sign-up through an invite link is attributed to the right client and firm, and the reward is applied exactly once, when the new company first pays (Stripe test mode).
- The invited business never sees the client's phone number or address through the invite.
- Funnel events exist for card shown, invite shared, link opened, sign-up and first payment.

### P1 features

- **F12 Condition check-in:** a condition report post with photos, each with a note and location such as "Scratch, hall floor". The client acknowledges with one tap through `acknowledgeCondition`, which writes a record like an approval. The post shows "Anna acknowledged 4 photos · 2 Oct, 07:41", and the handover pack includes it.
- **F13 Aftercare reminders:** added in the handover editor with a title, note, month or date, and an optional yearly repeat. They are sent to clients at 09:00 on the day with a "Book {firm} again" button that creates a booking request for the firm. Clients can turn them off.
- **F14 Today list:** for staff, showing decisions sent more than 24 hours ago without an answer, unanswered questions, tomorrow's visits with open items, projects with no posts for three days, and booking requests.
- **F15 Offline photo queue:** a post that can't be sent is kept in IndexedDB and sent when the connection returns. A banner shows queued posts, and nothing is lost if the tab is closed.
- **F16 "Seen by":** staff see "Seen by Anna 18:42" on recent posts, based on each member's last-seen time.
- **F17 Phone check:** when the company turns it on, a client confirms a six-digit code sent by text before their first approval on a device.
- **F18 Hidden-work tag:** staff tag photos of pipes, wiring, waterproofing and insulation before they are covered, and the handover pack gives them their own chapter.

## 6. Notifications

Clients hear about decisions and replies straight away and about everything else once a day. Staff hear about client actions straight away. Every message goes through the outbox described in section 9.

| Event | Recipients | Channels | When |
| --- | --- | --- | --- |
| Invited to a project | Client | Text; email if there is no phone number | Immediately |
| Decision sent or updated | Clients | Text and push | Immediately |
| Decision unanswered after 24 hours (P1) | Clients | Push, or text if push is off | Once |
| Client approved, declined or chose | Card creator, owners, admins | Push and email | Immediately |
| Client asked a question or commented | Assigned crew, owners, admins | Push and email | Immediately |
| Staff replied to a client | That client | Push, or text if push is off | Immediately, at most one text per project every 2 hours |
| New updates and photos | Clients | Digest by text, email or push | Daily at 18:00, only if something was posted; service clients get each visit report straight away instead |
| Next visit added or changed | Clients | Text and push | Immediately |
| Next visit is tomorrow | Clients and assigned crew | Text and push | 18:00 the day before |
| Handover pack ready | Clients | Text and email | Immediately |
| Client asked for a new link | Staff on the project | Push and email | Immediately |
| Aftercare reminder (P1) | Clients | Text or email | 09:00 on the due date |
| Booking request (P1) | Owners and admins | Push and email | Immediately |
| Visit report posted | Client | Push, or text if push is off | Immediately |
| Client asked to move or cancel a visit | Owners, admins, assigned crew | Push and email | Immediately |
| Visit moved or cancelled by the provider | Client | Text and push | Immediately |
| A business joined from a client's invite | That client, and the owners of the firm the invite came from | Push or email | Immediately |

**Rules**

- **Quiet hours:** no text or push to clients between 21:00 and 07:00 Stockholm time; messages wait until 07:00. Staff set their own quiet hours.
- **Batching:** several events for the same person and project within 10 minutes become one message.
- **Preferences:** each project member can turn the digest and instant updates on or off and choose text, email or push. Decisions always notify.
- **Text format:** keep messages within 160 characters. Swedish letters (å, ä, ö) fit the standard GSM-7 character set, but emoji and en dashes force the costlier Unicode encoding, so avoid them. The sender name is the firm's short name (up to 11 characters) where the provider allows it, otherwise "Siteline".
- **Links:** every message links to the project; emails also link to notification settings.
- **Text budget:** each company has a monthly text budget set by its plan (see section 16). When it runs out, messages fall back to email or push and the owner is told.

**Swedish templates** (use them in seed data and tests):

- Invite: "Hej Anna! Ek & Lind Snickeri delar uppdateringar om Köksrenovering Lindqvist här: {link}"
- Decision: "Ek & Lind behöver ditt svar: Byt rutten golvbjälke, 6 500 kr. Svara här: {link}"
- Digest: "Idag på Köksrenovering Lindqvist: 3 uppdateringar och 8 foton. Se dem här: {link}"
- Visit reminder: "Påminnelse: Ek & Lind kommer imorgon kl. 07:30. Kvar på din lista: Flytta bilen från uppfarten. {link}"
- Handover: "Ditt överlämningspaket från Ek & Lind är klart: {link}"

## 7. Architecture and stack

One Angular app serves both staff and clients. It reads and writes Firestore and Storage directly, under security rules, and calls Cloud Functions for anything that guards money or access or talks to an outside service.

```text
Browser (Angular PWA: staff app /app, client view /c)
  │  Firestore + Storage reads/writes, under security rules
  │  Callable functions for money, access, plan limits and invites
  ▼
Firebase, europe-north1
  ├─ Auth (email link + Google for staff, custom tokens for clients)
  ├─ Firestore · Storage · Hosting · App Check · Cloud Messaging
  └─ Cloud Functions (2nd gen): callables, triggers, scheduled jobs, outbox
        │  only through functions/src/adapters
        ▼
Outside services: SMS (46elks/Twilio), email, Stripe Billing,
Gemini on Vertex AI (EU endpoint) via Genkit, pdfmake
```

The browser never writes approval records, plan limits or invite tokens. Those go through callable functions, which also make every call to an outside service.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Angular 22, the current stable release ([Angular blog](https://blog.angular.dev/announcing-angular-v22-c52bb83a4664)) | Standalone components, signals, zoneless, OnPush by default, built-in control flow, Signal Forms |
| UI | Angular CDK and Angular Aria, with custom components | Aria's accessible headless patterns are production-ready in v22. Style with the CSS custom properties in section 12 and use Lucide icons. No Angular Material, to keep the landing page look |
| Firebase access | Modular Firebase JS SDK in small injectable services that expose signals | Avoids waiting for AngularFire to support new Angular versions; AngularFire is fine if a matching release exists |
| Languages | @ngx-translate/core at runtime | Swedish by default, English second; Intl for dates, numbers and kronor |
| Validation | zod schemas in a shared package | The same schemas in the web app and in functions |
| Backend | Cloud Functions for Firebase, 2nd gen, TypeScript | Newest Node.js LTS that Functions supports, bundled with esbuild so shared code is included |
| Database | Firestore, Native mode | europe-north1 |
| Files | Cloud Storage | A bucket in europe-north1 |
| Sign-in | Firebase Authentication | Email link and Google for staff; custom tokens for clients |
| Push | Firebase Cloud Messaging, web push | On iPhone, push works only once the PWA is added to the home screen |
| Hosting | Firebase Hosting | SPA rewrites and a preview channel per pull request |
| Abuse protection | App Check with reCAPTCHA Enterprise | Enforced on Firestore, Storage and Functions |
| AI | Genkit in Functions, calling Gemini on Vertex AI through the EU endpoint | Behind an interface so the model can be swapped |
| PDF | pdfmake in a function | No headless browser to maintain |
| Payments | Stripe Billing through the Stripe Node SDK | Checkout, Customer Portal and a webhook; no Firebase extension |
| Text messages and email | Provider adapters | In development they write to the emulator log instead of sending |
| Tests | Vitest, @firebase/rules-unit-testing, Playwright | Run against the Firebase Emulator Suite |
| Recurring visits | rrule (RFC 5545 recurrence rules) | Service client schedules, with the same rules in the shared package for web and functions |

**Why europe-north1.** Firestore can run in Stockholm (europe-north2), but Cloud Functions doesn't list that region, and Google recommends running Firestore triggers in the database's own region ([Firestore locations](https://firebase.google.com/docs/firestore/locations), [Functions locations](https://firebase.google.com/docs/functions/locations), [trigger locations](https://docs.cloud.google.com/firestore/docs/extend-with-functions-2nd-gen)). Keeping Firestore, Storage and Functions together in Finland puts everything in one EU region close to Sweden. Revisit this if Functions adds europe-north2.

**AI data.** Use the Vertex AI EU endpoint, which keeps processing within EU member states ([Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency)). Send the audio and the project's language, never client names or phone numbers.

**Authentication** isn't tied to the Firestore region, which is one more reason client accounts keep no contact details in Firebase Authentication.

## 8. Data model

Firestore holds everything except files. Projects are top-level documents, so a client's access can be checked with a single read; staff access comes from custom claims.

**Conventions**

- IDs are Firestore auto IDs, except `users/{uid}` (the Auth uid) and `invites/{sha256}`.
- Money is stored as integers in öre (1 kr = 100 öre), including VAT, with `vatRate: 0.25` alongside.
- Phone numbers are stored in E.164. Timestamps are server timestamps in UTC, shown in the company's time zone (Europe/Stockholm).
- Every document has `createdAt`, and mutable documents also have `updatedAt`.
- The firm's branding is copied onto each project, so clients never read company documents.

| Path | Purpose | Key fields |
| --- | --- | --- |
| `companies/{companyId}` | The firm; readable by its staff | name, orgNumber, logoPath, accentColor, locale, timeZone, plan (free, visits, solo, team, pro), compedUntil, limits {activeProjects, serviceClients, staff, smsPerMonth}, usage {activeProjects, serviceClients, staff, smsThisMonth}, referredBy {code, companyId, clientUid}, settings {digestTime, reminderTime, crewCanSendPricedCards, requirePhoneCheck} |
| `companies/{companyId}/private/billing` | Billing details; owners only | stripeCustomerId, subscriptionId, status, interval, currentPeriodEnd |
| `companies/{companyId}/staff/{uid}` | Staff membership | role (owner, admin, crew), name, email, phone, joinedAt, notify {push, email, quietHours} |
| `users/{uid}` | One per person; readable only by that person | kind (staff, client), name, phoneE164, email, locale, companyId (staff only) |
| `users/{uid}/devices/{deviceId}` | Push tokens | fcmToken, platform, lastSeenAt |
| `projects/{projectId}` | A job | companyId, kind (project, service), title (the subject for service clients), address {street, postalCode, city}, schedule {rrule, durationMinutes, skipDates\[\]} for service clients, status (active, completed, archived), startDate, endDate, branding {name, logoUrl, accentColor, showSitelineFooter}, roles {uid: client or crew}, clientUids\[\], crewUids\[\], totals {approvedExtraWorkOre, openDecisions, unansweredQuestions}, nextVisitId, lastPostAt, completedAt |
| `projects/{projectId}/members/{uid}` | Each person's settings on a project | role, name, phoneMasked, joinedAt, lastSeenAt, notify {instant, digest, channel}, phoneVerifiedAt |
| `projects/{projectId}/posts/{postId}` | Feed items | type (update, question, milestone, decision, condition, visit\_report, system), authorUid, authorName, authorRole, text, media\[{path, thumbPath, width, height, tags\[\]}\], visibility (all; staff-only comes in phase 2), decision, condition, report, commentCount, unanswered, createdAt, editedAt, deletedAt |
| `projects/{projectId}/posts/{postId}/comments/{commentId}` | Replies | authorUid, authorName, authorRole, text, media\[\], createdAt, editedAt, deletedAt |
| `projects/{projectId}/approvals/{approvalId}` | Write-once evidence of decisions and acknowledgements | postId, version, kind (decision, condition), outcome (approved, declined, chosen, acknowledged), optionId, priceOre, reason, snapshot, snapshotSha256, actorUid, actorName, actorPhoneMasked, phoneVerified, createdAt |
| `projects/{projectId}/visits/{visitId}` | Visits | startAt, endAt, people, notes, status (planned, done, cancelled), fromSchedule, reportPostId |
| `projects/{projectId}/checklist/{itemId}` | Shared to-dos | text, side (client, firm), visitId, createdBy, doneBy, doneAt |
| `projects/{projectId}/handover/current` | Handover editor state | summary, beforeAfter\[\], materials\[\], careNotes, attachments\[\], pdf {path, version, generatedAt} |
| `projects/{projectId}/reminders/{reminderId}` | Aftercare reminders (P1) | title, note, dueDate, repeat (none, yearly), nextSendAt, active |
| `invites/{tokenSha256}` | Client and staff invites; functions only | kind (client, staff), projectId or companyId, role, name, phoneE164, email, createdBy, expiresAt, revokedAt, redeemCount, lastRedeemedAt |
| `outbox/{messageId}` | Every outgoing message; functions only | channel (sms, email, push), to {uid, phone, email}, template, params, locale, companyId, projectId, dedupeKey, sendAfter, status (queued, sending, sent, failed, suppressed), attempts, providerMessageId, error |
| `events/{eventId}` | Product metrics | name, companyId, projectId, uid, role, props, at |
| companies/{companyId}/templates/{templateId} | Visit report templates | name, trade (tutoring, gardening, other), items\[{id, label}\], fields (rating, note, flags, nextTime) |
| projects/{projectId}/visitRequests/{requestId} | Client requests to move or cancel a visit | visitId, kind (move, cancel), proposedStartAt, note, status (open, accepted, declined), createdBy, resolvedBy |
| referrals/{code} | Client invites to other businesses; functions only | clientUid, sourceCompanyId, sourceProjectId, businessKind, showFirstName, openedCount, signedUpCompanyId, firstPaidAt, rewardGrantedAt |

**Decision and condition fields** on a post:

```ts
decision: {
  kind: 'extra_work' | 'choice' | 'approval';
  title: string;
  description?: string;
  priceOre?: number;            // incl. VAT
  labourOre?: number;           // for the ROT helper in phase 2
  materialOre?: number;
  vatRate: 0.25;
  options?: { id: string; label: string; mediaIndex?: number; priceDeltaOre?: number }[];
  respondBy?: Timestamp;
  status: 'draft' | 'sent' | 'approved' | 'declined' | 'withdrawn' | 'superseded';
  version: number;
  supersedesPostId?: string;
  sentAt?: Timestamp;
  sentByUid?: string;
  decidedAt?: Timestamp;
  selectedOptionId?: string;
  approvalId?: string;
}

condition: {
  items: { mediaIndex: number; note: string; location?: string }[];
  acknowledgedAt?: Timestamp;
  approvalId?: string;
}
```

**Visit report fields** on a post with type `visit_report`:

```ts
report: {
  visitId: string;
  templateId: string;
  done: { itemId: string; label: string; checked: boolean }[];
  rating?: 'good' | 'ok' | 'hard';   // tutoring
  note?: string;
  flags?: string[];                  // things the client should know
  nextTimeItemIds?: string[];        // checklist items added for the next visit
}
```

**Storage layout**

| Path | Contents | Read | Write |
| --- | --- | --- | --- |
| `companies/{companyId}/logo.{ext}` | Logo | Via download URL, for emails and the client view | Owners, admins |
| `projects/{projectId}/media/{mediaId}/display.jpg` and `thumb.jpg` | Photos | Project members | Staff on the project; clients for their own questions |
| `projects/{projectId}/audio/{audioId}.webm` or `.m4a` | Voice recordings | Staff on the project | Staff on the project |
| `projects/{projectId}/attachments/{fileId}/{fileName}` | Manuals and certificates | Project members | Owners, admins |
| `projects/{projectId}/handover/handover-v{n}.pdf` | Handover PDFs | Project members | Functions only |

Size limits: photos up to 10 MB before processing, audio up to 5 MB, attachments up to 20 MB (PDF and images only).

**Composite indexes:** posts by (type, decision.status, createdAt) and (unanswered, createdAt); projects by (companyId, status, lastPostAt), (clientUids array-contains, lastPostAt) and (crewUids array-contains, status); checklist by (visitId, doneAt); outbox by (status, sendAfter); a collection-group index on reminders by (active, nextSendAt), a collection-group index on visits by (startAt, status) for today's visits, and referrals by (signedUpCompanyId).

## 9. Backend functions

All functions are TypeScript, 2nd gen, in europe-north1. Callables check authentication, App Check and role first, validate input with the shared zod schemas, and return typed errors.

| Function | Type | What it does |
| --- | --- | --- |
| `createCompany` | Callable | Creates the company and the owner membership, sets custom claims, and stores the referral when the owner came from an invite link |
| `inviteStaff`, `acceptStaffInvite`, `setStaffRole`, `removeStaff` | Callable | Staff management; always keeps at least one owner |
| `createProject`, `setProjectStatus` | Callable | Enforces the limit for the kind (active projects or service clients) in a transaction and updates usage |
| `inviteClient`, `resendInvite`, `revokeInvite` | Callable | Invite tokens and the invite text message |
| `redeemInvite` | Callable, no sign-in needed | Validates the token, finds or creates the client user, adds membership and returns a custom token; rate-limited |
| `requestNewLink` | Callable, no sign-in needed | From the expired-link page; notifies the project's staff |
| `sendDecision`, `reviseDecision`, `withdrawDecision` | Callable | Permission checks (including the crew setting), version snapshot and notifications |
| `respondToDecision` | Callable | A client approves, declines or chooses; writes the approval record and updates totals in one transaction |
| `acknowledgeCondition` (P1) | Callable | Writes a client's acknowledgement record |
| `draftFromVoice` | Callable | Transcribes and rewrites audio with Genkit; daily limit per user |
| `generateHandover` | Callable | Builds the PDF with pdfmake, stores a new version, marks the project completed and notifies clients |
| `createCheckoutSession`, `createPortalSession` | Callable | Stripe Checkout and Customer Portal for owners |
| `exportDecisionsCsv` | Callable | CSV of all decisions for staff |
| `deleteProject`, `leaveProject`, `deleteMyData` | Callable | Privacy actions from section 10 |
| `startPhoneCheck`, `confirmPhoneCheck` (P1) | Callable | Six-digit code by text before a first approval |
| `requestVisitChange`, `respondVisitChange` | Callable | A client asks to move or cancel a visit; staff accept or suggest another time |
| `createReferral` | Callable | Creates an invite code and share text for a client |
| `resolveReferral` | Callable, no sign-in needed | Records that an invite link was opened and returns what the landing page shows |
| `onPostWritten` | Firestore trigger | Updates project counters and lastPostAt, marks questions unanswered, queues immediate notifications (decisions, questions, visit reports), logs events |
| `onCommentCreated` | Firestore trigger | Updates counters, clears unanswered when staff reply, queues notifications |
| `onVisitWritten` | Firestore trigger | Notifies clients of a new or changed visit; moves unfinished items on when a visit is marked done |
| `onCompanyWritten` | Firestore trigger | Copies branding and the footer setting onto the company's projects |
| `onOutboxCreated` | Firestore trigger | Sends at once when allowed, otherwise leaves the message for the sweeper |
| `stripeWebhook` | HTTPS | Verifies the Stripe signature, updates plan, limits and billing status, and applies the referral reward on a referred company's first payment |
| `outboxSweeper` | Every 5 minutes | Sends messages whose `sendAfter` has passed; retries failures up to 3 times with backoff |
| `sendDigests` | Every 30 minutes | Sends digests for companies whose digest time falls in the window |
| `sendVisitReminders` | Every 30 minutes | Sends reminders for tomorrow's visits at each company's reminder time |
| `generateVisits` | Daily | Creates visits eight weeks ahead from each service client's schedule, honouring skipped dates and moved visits |
| `remindUnansweredDecisions` (P1) | Hourly | One reminder 24 hours after sending |
| `sendAftercareReminders` (P1) | Daily at 09:00 | Sends due reminders and reschedules yearly ones |
| `cleanupAudio` | Daily | Deletes audio 30 days after posting, or once a draft is discarded |
| `purgeDeleted` | Daily | Deletes files of projects deleted more than 30 days ago |
| `expireInvites` | Daily | Marks invites past their expiry |
| `aggregateMetrics` | Nightly | Rolls events into daily metrics per company |

Scheduled jobs run on Europe/Stockholm time. A small logClientError callable also records browser errors without personal data (see section 13).

**Implementation rules**

- **Idempotency:** every trigger uses its event ID or a dedupe key, so retries never send twice or count twice.
- **Errors:** callables return `permission-denied`, `failed-precondition` (for example, plan limit reached or decision no longer open), `resource-exhausted` (rate limit), `not-found` or `invalid-argument`, and the UI maps each to a translated message.
- **Secrets:** SMS, email and Stripe keys live in Secret Manager through `defineSecret`.
- **Adapters:** `SmsSender`, `EmailSender`, `PushSender`, `SpeechDrafter` and `PdfRenderer` are interfaces with one real implementation each. In the emulator, text and email messages are written to a dev log and shown on a development-only page at `/dev/outbox`.

## 10. Security, privacy and compliance

Deny by default, check membership on every read, and keep anything that proves an agreement write-once. Under GDPR each firm is the controller of its clients' data and Siteline is the processor.

### Firestore and Storage rules

- Everything is denied unless a rule allows it.
- **Staff:** `request.auth.token.cid` must equal the project's `companyId`. Owners and admins (`crole`) can read and write all of the company's projects; crew only those where `roles[uid] == 'crew'`.
- **Clients:** `roles[uid] == 'client'`. They can read the project with its posts, comments, visits, checklist and handover; create questions and comments; add checklist items; tick only client items; and update only their own member settings.
- Clients can never write decisions, approvals, invites, the outbox, totals or anyone else's data.
- Approvals, invites, the outbox and billing are written only by functions through the Admin SDK.
- Every write is validated: allowed keys, types, string lengths (5,000 characters for posts, 2,000 for comments), media counts, and `authorUid` equal to the caller.
- Storage rules check project membership with `firestore.get()`, plus file type and size.
- Rules tests cover every role against every collection, including the cases that must fail.

### Abuse and cost protection

- App Check is enforced on Firestore, Storage and every callable.
- Rate limits: `redeemInvite` allows 10 attempts per IP per 10 minutes; invites and texts are capped per company per hour; `draftFromVoice` allows 100 calls per user per day; phone checks allow 5 per number per hour.
- Each plan has a monthly text budget, and Google Cloud budget alerts are set on the project.

### Privacy

- **Roles:** Siteline signs a data processing agreement with each firm and keeps a public list of sub-processors. Siteline is the controller only for staff accounts and billing.
- **Location:** Firestore, Storage and Functions run in europe-north1. AI calls use the Vertex AI EU endpoint. The SMS and email providers must process data in the EU or under an EU data processing agreement.
- **Minimisation:** client accounts hold no contact details in Firebase Authentication, photos lose their GPS data, and logs never contain phone numbers, emails, message text or invite tokens.
- **Retention:** projects are kept while the firm's account is active. Deleted projects and accounts are purged after 30 days, audio after 30 days, and expired invites and outbox entries after 90 days.
- **Rights:** clients can leave a project and ask for their data to be deleted; staff can export and delete their data. Approval records keep a minimal, anonymised trace as evidence of the agreement.
- **Tracking:** the app stores only what sign-in needs. There are no third-party trackers in the client view, and product metrics are first-party events. Confirm with counsel whether those events need consent.

### Tutoring and children

- The parent or guardian is the client. Children never get accounts, links or messages from Siteline.
- The student appears only as a first name or nickname in the service client's title.
- Photos in tutoring reports are off by default. A tutor can turn them on for a client only after recording the parent's consent, and the composer reminds them to photograph the work, not the child.
- Nothing in Siteline lets a tutor message a child directly.
- Tutoring data follows the same retention rules, and the parent can delete it at any time.

### Approval evidence

Swedish consumer law requires a business to tell the consumer and ask for instructions before doing additional work, unless its price is insignificant or low compared with the agreed price (Konsumenttjänstlagen 8 §). Complaints about work on buildings can be made up to ten years after the job is finished (17 §) ([Riksdagen](https://data.riksdagen.se/dokument/sfs-1985-716.html)). So:

- Approval records are write-once, use server time, and contain a snapshot and hash of exactly what was approved.
- Before an owner deletes a project, the app prompts them to download the handover pack and the decisions CSV, because these records may be needed for up to ten years.
- Have a lawyer review the terms, the data processing agreement and the approval flow before launch.

## 11. Screens and routes

The staff app and the client view are separate lazy-loaded route areas in one app, so the client view stays small. Both are designed for phones first: inside a project, a bottom tab bar on mobile and a left sidebar with the project list on desktop.

| Route | Who | Screen |
| --- | --- | --- |
| `/login` | Staff | Sign in with an email link or Google |
| `/login/finish` | Staff | Completes email-link sign-in |
| `/onboarding` | New staff | Company details, logo and colour with a live preview of the client view, then the first project and first client invite |
| `/app` | Staff | Two lists, Projects and Clients (active, completed, archived), with search, a strip of today's visits with Report buttons, and the Today list on top (P1) |
| `/app/projects/new` | Owners, admins | Title, address, dates and crew |
| `/app/clients/new` | Owners, admins | Add a service client: name, mobile number, subject, schedule and report template |
| `/app/projects/:projectId` | Staff | The feed, with a composer (Photo, Hold to talk, text) and buttons for Decision, Next visit and Milestone. The header shows the clients, the next visit and open decisions. Service clients get Report instead of Milestone, and their schedule instead of the handover |
| `/app/projects/:projectId/decisions` | Staff | Open and past decisions, the extra-work total, new decision, CSV export |
| `/app/projects/:projectId/visit` | Staff | Next-visit editor, checklist by side, visit history |
| `/app/projects/:projectId/handover` | Owners, admins | Handover editor, aftercare reminders (P1), generate PDF, earlier versions |
| `/app/projects/:projectId/people` | Staff | Clients and crew: invite, resend, revoke, last seen |
| `/app/settings/company` | Owners, admins | Profile, branding with preview, digest and reminder times, crew permissions |
| `/app/settings/team` | Owners, admins | Staff, invites and roles |
| `/app/settings/billing` | Owners | Plan, usage, upgrade, Stripe portal |
| `/app/settings/me` | Staff | Name, language, notifications, quiet hours, delete account |
| `/p/:token` | Anyone | Redeems a link, then redirects |
| `/link-expired` | Anyone | Explains what happened and offers "Request a new link" |
| `/r/:code` | Anyone | Invite landing page; signing up from it stores the referral |
| `/c` | Clients | Home screen with every project and service from every firm, plus the invite card (F20) |
| `/c/:projectId` | Clients | Branded feed with an "Ask a question" composer |
| `/c/:projectId/decisions` | Clients | Open decisions first, then history and the extra-work total |
| `/c/:projectId/visit` | Clients | Next visit and the client's checklist items |
| `/c/:projectId/handover` | Clients | Download the PDF; aftercare reminders (P1) |
| `/c/settings` | Clients | Notifications, leave a project, delete my data |
| `/legal/privacy`, `/legal/terms` | Anyone | Legal pages |
| `/dev/outbox` | Developers, emulator only | Messages that would have been sent |

**Guards:** a staff guard (claims include `cid`), a role guard for owner and admin pages, and a client guard that checks project membership.

**Main components:** feed list, post card (one variant per post type), composer, photo grid and viewer, voice recorder, decision card and decision editor, visit card, checklist, handover editor, brand header, notification settings and plan usage.

**Empty states** tell people what to do next. A new project's feed says "Post your first update. Your client sees it straight away." A client's empty decisions tab says "Nothing to decide right now."

## 12. Design system

The app uses the landing page's look: warm off-white backgrounds, near-black ink, a teal accent, rounded cards and pill buttons. Put every colour, radius and font in CSS custom properties so the firm's colour can replace the accent in the client view.

```css
:root {
  /* Surfaces */
  --sl-bg: #FAF8F4;            /* page background */
  --sl-surface: #FFFFFF;       /* cards */
  --sl-panel: #F7F4EE;         /* panels inside cards */
  --sl-panel-2: #F2EEE6;       /* inputs, chips */
  --sl-dark: #1C1F26;          /* dark cards, primary text */
  --sl-dark-2: #262A33;        /* cards on dark */

  /* Text */
  --sl-text: #1C1F26;
  --sl-text-2: #4A4F5A;        /* secondary */
  --sl-text-3: #5A5F6B;        /* muted labels */

  /* Lines */
  --sl-border: #ECE7DE;
  --sl-border-strong: #DDD6CA;
  --sl-border-control: #C9C1B3;

  /* Brand: replaced per firm in the client view */
  --sl-accent: #127A69;
  --sl-accent-text: #0F5F52;   /* accent as text on light backgrounds */
  --sl-accent-tint: #DCEFEA;
  --sl-on-accent: #FFFFFF;

  /* Signals */
  --sl-highlight: #5FD3BC;     /* on dark backgrounds only */
  --sl-alert: #E8553A;

  /* Shape */
  --sl-radius-card: 24px;
  --sl-radius-panel: 16px;
  --sl-radius-pill: 999px;
  --sl-shadow-card: 0 2px 8px rgba(28, 31, 38, 0.06);

  /* Type */
  --sl-font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --sl-font-body: 'Manrope', system-ui, sans-serif;
}
```

- **Fonts:** Bricolage Grotesque (500, 700, 800) for headings and large numbers, Manrope (400–700) for everything else. Self-host them through @fontsource packages instead of loading Google Fonts at runtime, for privacy and speed.
- **Type scale:** page titles 28/32 px in the display font at 800; section titles 20/26 px at 700; body 16/24 px; small text 13/18 px. Inputs never go below 16 px, so iPhones don't zoom in.
- **Buttons:** pill-shaped. Primary buttons are filled with the accent and at least 44 px tall (52 px for the main action on a screen); secondary buttons have a 1.5 px outline in `--sl-border-control`.
- **Cards:** white, 18–24 px radius, with a 1 px border or the card shadow. Panels inside cards use `--sl-panel` with a 16 px radius.
- **Decision cards:** a small uppercase label ("EXTRA WORK"), the title, a price line, then Approve (filled) and Ask a question (outlined) side by side. The outcome shows as a teal confirmation line. Visit report cards show the date and the provider, the ticked tasks as a compact list, photos, the note and the items for next time.
- **Spacing:** a 4 px base: 4, 8, 12, 16, 20, 24, 32, 40.
- **Icons:** Lucide, 1.75–2 px stroke, 20–24 px.
- **Firm branding:** in the client view, set `--sl-accent` to the firm's colour and compute `--sl-on-accent` (white or ink, whichever contrasts more) and `--sl-accent-text` (darkened until it reaches 4.5:1 on white).
- **Formats:** dates, times and money come from Intl in the user's language: 24-hour times such as 07:30, and money as "6 500 kr" in Swedish or "SEK 6,500" in English.
- **Motion:** 150–250 ms ease-out transitions, turned off under `prefers-reduced-motion`.
- **Dark mode** is not in the MVP, but keeping every colour in tokens makes it easy to add.

The landing page's phone mockup shows the intended feed: a photo card with a caption and author line, an extra-work card with Approve and Ask a question, a dark progress card ("Phase 3 of 4 · Installation") and a rounded composer reading "Hold to talk, or write an update…".

## 13. Quality requirements

The client view must feel instant on a mid-range phone, work for everyone, and never lose a post.

- **Performance:** the client feed's largest contentful paint is 2.5 seconds or less on a mid-range Android phone over 4G. The client view's initial JavaScript is 250 kB gzipped or less. The feed shows thumbnails and loads full images on open, lazy-loads images, and pages 20 posts at a time.
- **PWA:** a web app manifest, and the Angular service worker caching the app shell. An offline banner appears when the connection drops.
- **Browsers:** Safari on iOS 17 and later, Chrome on Android, and desktop Chrome, Edge, Firefox and Safari, each in their last two versions.
- **Accessibility:** WCAG 2.2 AA. Every control works with a keyboard and has a screen-reader label; touch targets are at least 44 px; focus is visible; text contrast is at least 4.5:1. Photos use the author's caption as alt text, or "Photo from {firm}, {date}". Voice recording has a tap alternative, and reduced motion is respected. Use Angular Aria for menus, tabs, dialogs and listboxes.
- **Languages:** Swedish by default, plus English. No user-facing string is hard-coded. Times are stored in UTC and shown in Europe/Stockholm; plurals, numbers and money go through Intl.
- **Reliability:** posts are never lost. Unsent drafts are kept in local storage (and queued in IndexedDB with F15). The outbox retries failed messages, and every function is idempotent.
- **Security:** rules tests for every collection, `npm audit` in CI, a Content Security Policy on Hosting that allows only the app and Firebase domains, and no secrets in the browser bundle.
- **Observability:** structured logs with a request ID and no personal data, Cloud Error Reporting for functions, and browser errors reported through a small `logClientError` callable. Alert when more than 5% of outbox messages fail within an hour, or when a scheduled job fails.
- **Testing:** unit tests with Vitest for utilities, services and functions; component tests for the post card, composer, decision card and checklist; rules tests with @firebase/rules-unit-testing; and end-to-end tests with Playwright against the emulators.
- **The main end-to-end test:** an owner signs up, creates a project, invites a client and posts a photo update, then sends an extra-work card. The client opens the link and approves it, and the total updates. The owner generates the handover PDF, and the client downloads it. A second test covers service mode and the invite loop: a tutor adds a service client with a weekly schedule and sends a visit report; the parent reads it and shares an invite link with a gardener; the gardener signs up from the link, and the referral is recorded.
- **Environments:** local development on the Emulator Suite with seed data, plus staging and production as separate Firebase projects. Every pull request gets a Hosting preview channel, and production deploys only from `main` after a manual approval.
- **Seed data (all fictional):** the company "Ek & Lind Snickeri" with owner Erik and one crew member; the project "Köksrenovering Lindqvist"; the client "Anna Lindqvist" with a fake +46 70 number; ten posts with placeholder photos; one approved and one open extra-work card; and a next visit with three checklist items. A second company, the tutor "Berg Mattehjälp", has the service client "Maths with Elsa" for the same client, with three weekly visits and reports, so her home screen shows both firms.

## 14. Milestones

Build in five milestones. M0 to M3 should be pilot-ready by 20 December 2026, the end of the build phase in the go-to-market plan, and M4 by 17 January 2027. Each milestone ends with a demo on staging and a tagged release.

1. **M0 Foundations**
   - Builds: the repo (npm workspaces `web`, `functions`, `shared`), the Angular app, Firebase projects for staging and production plus the Emulator Suite, sign-in with email link and Google, design tokens and base components (button, card, input, tabs, dialog, toast), language setup, the route skeleton with guards, CI (lint, type check, unit tests, rules tests, build, preview deploy), the seed script and `/dev/outbox`.
   - Done when: `npm run dev` starts the emulators and the app with seed data, CI is green, and pull requests get a preview channel.
2. **M1 Feed and client access** (F1–F4, plus invite and question notifications from F8)
   - Builds: company onboarding, staff invites, projects and plan limits, client invites and link redemption, the branded client view, the feed with photo posts, questions, comments and milestones, and the outbox with the SMS adapter.
   - Done when: the end-to-end test passes for "staff create a project and invite a client; the client opens the link from the dev outbox and asks a question; staff answer it", and rules tests cover companies, projects, members, posts and comments.
3. **M2 Decisions, visits and digest** (F6, F7, F19 and the rest of F8)
   - Builds: decision cards with approval records, totals and versions; the next visit and checklist; reminders; the daily digest; quiet hours and batching; and service mode with recurring schedules, visit reports and templates (F19).
   - Done when: end-to-end tests for approve, decline and choose pass, rules tests prove approval records can't be changed, and scheduled functions are unit-tested with a fixed clock.
4. **M3 Voice and pilot polish** (F5 and F20, then F14–F17 as time allows)
   - Builds: voice-to-update, the invite loop (F20), the Today list, the offline photo queue, "seen by", the phone check, metrics events, and placeholder privacy and terms pages.
   - Done when: voice drafts return in under 15 seconds at p90 on staging, and a real firm can run a real project from start to finish.
5. **M4 Handover and billing** (F9–F13, F18)
   - Builds: the handover pack PDF, condition check-in, aftercare reminders, the hidden-work tag, Stripe plans (including Visits) and limits, comped design partners, the free-plan footer, and the privacy tools.
   - Done when: the main end-to-end test passes including the PDF, the subscription lifecycle works in Stripe test mode, and a test proves a deleted project's files are purged after 30 days.

Pilot service mode with tutors first, since they work all year round; gardeners join in early spring, when their season starts. Phase 2 is planned from pilot feedback, starting with Ask the project.

## 15. Working with Claude Code

Export this doc as Markdown to `docs/PRD.md` in the repo (in the ngxns workspace: `apps/siteline/docs/PRD.md`), add the `CLAUDE.md` below, and have Claude Code build one milestone at a time: plan first, then build, then run the tests. For a visual reference, save screenshots of the landing page to `docs/design/`, since Claude Code can't open the private links.

**Repo layout**

```text
siteline/
├─ CLAUDE.md
├─ docs/PRD.md
├─ package.json            # npm workspaces
├─ firebase.json
├─ .firebaserc             # staging and production aliases
├─ firestore.rules
├─ firestore.indexes.json
├─ storage.rules
├─ web/                    # Angular app
│  └─ src/app/
│     ├─ core/             # Firebase services, auth, guards, i18n
│     ├─ shared/           # UI components, pipes
│     ├─ staff/            # /app routes
│     ├─ client/           # /c and /p routes
│     └─ dev/              # /dev/outbox, emulator only
├─ functions/
│  └─ src/
│     ├─ callables/
│     ├─ triggers/
│     ├─ scheduled/
│     ├─ adapters/         # sms, email, push, ai, pdf
│     └─ lib/
├─ shared/                 # zod schemas, types, constants
├─ tests/
│  ├─ rules/
│  └─ e2e/
└─ scripts/seed.ts
```

**CLAUDE.md**

```markdown
# Siteline

Client project feeds for service businesses. The spec is docs/PRD.md: read the relevant sections before any feature work.

## Stack
- Angular 22: standalone components, signals, zoneless, OnPush, built-in control flow, Signal Forms.
- Firebase: Auth, Firestore, Storage, Functions (2nd gen, TypeScript), Hosting, App Check, Cloud Messaging. Region europe-north1.
- UI: Angular CDK and Angular Aria with custom components; tokens in web/src/styles/tokens.css; Lucide icons.
- Languages: @ngx-translate/core with sv as default and en second. No hard-coded user-facing strings.
- Validation: zod schemas in shared/, used by both web and functions.

## Conventions
- No `.component` suffix in file names and no `Component` suffix on class names.
- Signal-based inputs and outputs, @if/@for, and inject() everywhere.
- Logic that guards money, plan limits or access lives in callable functions, never only in the browser.
- Every change to firestore.rules or storage.rules comes with rules tests.
- Money in öre (integers). Phone numbers in E.164. Times stored in UTC and shown in Europe/Stockholm.
- Never log phone numbers, emails, message text or invite tokens.
- Outside services are called only through functions/src/adapters.

## Commands
- npm run dev: emulators, app and seed data
- npm test, npm run test:rules, npm run e2e
- npm run deploy:staging (never deploy to production from a local machine)

## Workflow
- Build one milestone at a time (PRD section 14). Plan first and list open questions, then build.
- Finish each milestone with green tests and a short summary of what changed and what is left.
```

**Kickoff prompt**

```text
Read CLAUDE.md and docs/PRD.md. We're starting milestone M0.
1. Propose the repo setup and a step-by-step plan for M0, and list any decisions you need from me.
2. Wait for my go-ahead, then build M0.
3. Use the Firebase Emulator Suite only. Don't deploy anything.
```

For later milestones: "Build milestone M1 from the PRD. Start with the data model and rules tests, then the functions, then the UI. Run all tests before you finish."

**Accounts and keys to set up yourself**

- Two Firebase projects (staging and production) on the Blaze plan, with Firestore and Storage in europe-north1, Functions, Hosting, App Check with reCAPTCHA Enterprise, the Vertex AI API and budget alerts.
- The app domain and DNS, plus a sending domain for email.
- An SMS provider account and sender name registration.
- An email provider account with SPF and DKIM set up.
- Stripe in test and live mode: products and prices for Solo, Team and Pro (monthly and annual), Customer Portal settings and the webhook endpoint.
- Terms, a privacy policy and a data processing agreement, reviewed by a lawyer.

## 16. Open decisions

The name is the most urgent: settle it before buying domains or registering accounts. The other decisions can wait until the milestone that needs them.

| Decision | Options | Recommendation |
| --- | --- | --- |
| Product name | Keep Siteline, or rename | A US company already sells construction billing software as Siteline ([siteline.com](https://siteline.com/about)). Run a Swedish and EU trademark search now, and rename before the pilot if it is a risk |
| Region | Everything in europe-north1 (Finland), or Firestore in europe-north2 (Stockholm) with functions elsewhere | europe-north1, as explained in section 7 |
| SMS provider | 46elks, Twilio, Sinch | 46elks for a Sweden-first launch; the adapter keeps switching cheap |
| Email provider | Any transactional email service | One that processes data in the EU and signs a data processing agreement |
| AI for voice drafts | Gemini on Vertex AI, or another provider | Gemini on Vertex AI: it works with Genkit, accepts audio and has an EU endpoint |
| Branding on Free and Solo | Firm name only, or logo too | The landing page puts logo and colours in Team. Consider adding the logo to Solo, since "clients see you, not us" is a core promise |
| Crew sending priced cards | Off or on by default | Off by default; owners can turn it on |
| Phone check before approving | Off, always, or above an amount | Off for the pilot; consider requiring it above 10,000 kr afterwards |
| Monthly text budgets | Proposed: Free 30, Solo 300, Team 1,500, Pro 5,000 messages | Start here and adjust from pilot usage |
| Consent for product metrics | First-party events without a banner, or ask for consent | Ask counsel before launch |
| Design partner offer | Six months free, per the go-to-market plan | Implement with `compedUntil` |
| Which recurring services first | Tutors, gardeners, cleaners | Tutors first, since they work all year; gardeners from early spring; cleaners after the pilot |
| Visits plan price and limits | 79–149 kr a month for 15–30 clients, with or without the footer | 99 kr for 20 clients with the footer; test the price with the first ten providers |
| Invite reward | A free month for the firm the invite came from, something for the client, or nothing | One free month for the firm; nothing for clients in the MVP |
| Landing page | One page with a recurring-services section, or a separate page | A separate page for recurring services, so the renovation message stays sharp |
| Photos in tutoring reports | Off, on with consent, or always on | Off by default; on per client after recording a parent's consent |

## 17. Glossary

Swedish terms used in this PRD and in the product's Swedish copy.

| Term | Meaning |
| --- | --- |
| ÄTA | Ändrings-, tilläggs- och avgående arbeten: work that is changed, added or removed compared with the original quote. Called "extra work" in the English UI |
| ROT | Tax deduction for renovation labour on the client's own home: 30% of labour costs, up to 50,000 kr per person per year in 2026 ([Hemnet](https://www.hemnet.se/artiklar/guider/2026/06/09/sa-fungerar-rot-och-rut-avdraget-2026)) |
| RUT | Tax deduction for household services such as cleaning and gardening: 50% of labour costs |
| F-skatt | The tax registration a business needs for its clients to claim ROT or RUT |
| BRF | Bostadsrättsförening, a housing cooperative. Changes to pipes or load-bearing parts of a flat need its board's permission |
| Organisationsnummer | A Swedish company's ten-digit registration number, ending in a Luhn check digit |
| Konsumenttjänstlagen | The Consumer Services Act, which covers work done for consumers, including the rules on additional work |
| NCS | Natural Colour System, the colour codes used for paint in Sweden, such as S 2010-Y30R |
| Säker Vatten, BKR | Industry certification schemes for plumbing and for wet-room (bathroom) work |
| Överlämningspaket | Handover pack |
