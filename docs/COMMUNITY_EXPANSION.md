# Community expansion

The existing GitHub authentication, MongoDB, React frontend, safety controls, comments, notifications and staff audit trail are reused. This change does not introduce another authentication system or grant XP for social actions.

## Features and locations

| Area | Location | Behavior |
| --- | --- | --- |
| Projects | Community → Projects | GitHub repository, objective, up to 12 milestones, tags, state, team and latest 20 updates. Import the current personal goal or a profile showcase repository. |
| Collaboration | Project detail | Apply for an available role. Only the owner accepts or declines; acceptance adds the member locally, without granting GitHub repository permissions. |
| Help | Community → Help requests | Literal search, category and state filters, technologies, owner-selected solution, helper recognition. Resolving a request closes new entries and makes its conversation read-only. |
| Discovery | Community feed, Interests and public profiles | Follow users and projects, save posts privately, choose up to five interests, filter posts by collection/tag/text. Project updates reuse the existing feed interactions. |
| Events | Community → Events; staff → Events | Staff creates a draft with requirements and dates, then publishes or cancels. Users submit a GitHub repository within the deadline; staff manually accepts or requests changes. |
| Onboarding | Home → First steps | GitHub connection, personal goal, XP explanation acknowledgment and first interaction; dismiss and resume persist on the account. |
| Staff tools | Staff → Engagement and scheduling | Active projects, available events, recent posts/help resolutions/updates, pending reviews, unanswered help, scheduled announcements and cancellation. |

## Rules

- New project, follow, save, comment, event and onboarding actions do **not** grant XP. Existing contribution, mission and achievement rules continue to determine XP.
- Repository URLs accept GitHub repositories. The system does not automatically certify that a repository exists, is complete or has quality code. Event review is manual.
- Event requirements and dates are frozen after publication. Cancellation preserves the record. Deliveries can be changed or withdrawn only during the event window.
- Editing project milestones/state and reviewing event deliveries require the displayed version. Concurrent stale changes return 409. Retrying a confirmed review does not send duplicate notifications.
- Project creation, updates, staff event actions and announcement creation use stable request identifiers. Staff actions require a reason and enter the existing audit collection.
- Private saved posts and pending collaboration applications are scoped to the viewer/owner. Existing blocks, hidden content, staff roles, suspension restrictions, origin checks and rate limits remain enforced on the server.
- Project moderation also hides associated feed previews, while preserving independent moderation of individual posts.
- Lists are paginated or explicitly bounded. Project teams have at most 20 members; following is limited to 500 people/projects per collection.

## Announcements and operation

The existing `community-worker` checks scheduled announcements every minute, independently of the GitHub synchronization interval. When stopped, announcements remain pending and are delivered after it restarts. Delivery uses a lease and a stable notification key to recover interrupted work without duplicating the inbox message. Cancellation is accepted only before the worker claims the announcement.

No new environment variables or npm packages are required. Rebuild the existing Docker services; MongoDB indexes are initialized by the existing startup routine. This feature does not require publishing a public deployment.

## Validation

- Frontend: 311 passing tests in the full Jest suite, including project creation, navigation, onboarding, event confirmation and staff tools.
- Backend: 111 passing tests, no skips, in the full Node suite against an isolated real MongoDB 7 instance, including collaboration races, private saves, literal search, accepted solutions, permissions, stale event reviews and retried announcement delivery.
- Build and tooling: production Vite build and two passing SPA/public-configuration checks.
- Browser: project creation/milestones, collaboration approval and update, saved feed post, help comments/accepted solution, event publication/submission/review, scheduled announcement retry, onboarding, HTTP permission/origin checks and mobile widths passed. No runtime errors were observed.
- Browser verification uses synthetic accounts and an isolated MongoDB, not real GitHub accounts or production data. OAuth provider login and real repository quality are outside this validation.
