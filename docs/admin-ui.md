# Administration interface

`/admin` is the FATE information and moderation panel. It uses the existing
`/api/admin/*` endpoints and requires an authenticated MODERATOR or ADMIN account.
USER accounts do not see Admin navigation; direct navigation displays access denied.
Session initialization must finish before any administration page mounts or fetches.

| Route                     | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `/admin`                  | System summary and actual activity windows                      |
| `/admin/users`            | User search, role/status filters, sorting and server pagination |
| `/admin/users/:userId`    | Identity, account state, moderation and per-mode ratings        |
| `/admin/matches`          | Match filters, sorting and server pagination                    |
| `/admin/matches/:matchId` | Match/participant metadata and paginated action history         |
| `/admin/audit` | ADMIN-only append-only security/administrative journal |

The single Admin link lives in the sidebar's secondary navigation. Overview, Users
and Matches are local navigation; ADMIN also sees Audit Log. Table state lives in URL parameters and survives
reload and back/forward navigation. Text searches are explicitly submitted.

## Permissions and moderation

Moderators can block/unblock USER accounts. Administrators can also block/unblock
MODERATOR accounts and change other accounts' roles. ADMIN accounts cannot be
blocked. Self-blocking and self-role changes are unavailable. Blocked accounts cannot
receive staff privileges; unblock first. Demotion of the last active administrator
is enforced by the backend and explained as a controlled error.

Every mutation requires a confirmation dialog. A block reason is optional, plain
text, at most 500 characters. Cancel/Escape close an idle dialog. Pending mutations
disable submit/close. The shared dialog traps keyboard focus and restores its opener.
Account state changes only after the server returns the updated user; success is
announced without a page reload. Role and status badges include text.

A FORBIDDEN response immediately removes administration content and starts a current
user refresh. ACCOUNT_BLOCKED clears the session through the auth store. Outstanding
responses from a previous account/access revision are discarded. Target-policy
errors such as INSUFFICIENT_TARGET_ROLE stay within the confirmation dialog and do
not revoke the actor's administration access. The access-lost guard remains closed
until the page/session is re-established; it does not depend on a successful refresh.

## Data contracts

Responses are decoded at runtime into explicit frontend DTOs; no Prisma types are
imported into the UI. The existing authenticated client handles access-token refresh.
Administration requests use `cache: no-store` and the backend's no-store response policy.

Lists use `{items, pagination: {page, limit, total, totalPages}}`. UI page-size choices
are 20/50/100; action pages default to 50 and ascending revisions. Requests remain
server-paginated and changing one list's filters does not fetch unrelated datasets.
Request sequencing ignores obsolete responses; old table data is hidden while the
current query loads and the table headings/layout remain visible.

User query fields: `page`, `limit`, `search`, `role`, `status`, `sort`, `order`.
Search covers backend-supported name/username and exact user UUID. URL status is
case-normalized; `/admin/users?page=2&role=USER&status=blocked` restores correctly.

Match API query fields: `page`, `limit`, `status`, `gameMode`, `matchType`,
`participantUserId`, `matchId`, `createdFrom`, `createdTo`, `finishedFrom`,
`finishedTo`, `sort`, `order`. The UI accepts `participant` as a shareable URL alias;
mode/type aliases are normalized to the actual contract. IDs use native UUID input
validation. Date ranges include the full UTC end day and reject reversed ranges.
Record timestamps explicitly use Europe/Kyiv. Only the actual four statuses are
offered: WAITING, IN_PROGRESS, FINISHED, CANCELLED.

The summary presents total users, blocked accounts, total/in-progress/rated/finished
matches, compact role/mode/status counts and backend-provided 7-day/24-hour windows.
There are no invented trends, comparisons or health percentages.

User details show all persisted mode ratings, with canonical server-derived
`rankTier` added to the existing detail DTO using `getRatingTier`. RankEmblem and
rating formatting are reused. Unrecorded modes are explicitly empty. Administrators
may see the safe email field; moderators receive the backend's reduced DTO.

Match inspection shows participants, historical names, timestamps, origin, actual
winner/result, duration, turns, final/durable/action revisions, rating processing and
action/snapshot counts. The latest snapshot exposes revision, format version and
timestamp only. Recovery failures are presented as an interruption explanation
without internal error details. Technical IDs are secondary and copyable.

Action history shows revision, actor/seat, action type and timestamp. Native details
disclosure expands validated payload JSON as escaped text inside a bounded, wrapping
read-only panel. Credential-like keys are recursively stripped again by the frontend.
Unsupported/corrupt payloads show metadata and a controlled unavailable message.

## Presentation and scope

The panel reuses FATE charcoal surfaces, bronze accents, restrained crimson danger
buttons, shared pagination, Dialog, TacticalIcon and RankEmblem. Tables become
stacked records below 820px. Filters, headings and dialog buttons wrap on narrow
screens. Form controls have explicit accessible names, semantic table headings and
labelled pagination; loading/success/error states are announced. Every UI string has
English and Ukrainian translations. Persisted action type codes and payload keys are
data and remain untranslated for accurate inspection.

Match actions, snapshots, GameState, results and ratings are inspection-only. There
are no mutation/injection/force-win/rating-edit controls. The ADMIN-only
[Audit Log UI](audit-log.md) records significant security state transitions separately.
Advanced moderation, IP/device bans, OpenAPI publication and operational observability are
separate phases. Passwords, auth tokens, environment variables, logs, SQL and server
filesystem access are not exposed.

See [implementation and verification report](admin-ui-report.md) for exact checks,
reviewed viewports, changed files and verification limitations.
