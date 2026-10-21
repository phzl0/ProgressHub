# Social profiles, notifications and project teams

## User-facing locations

- Home: four recent feed publications selected by existing reaction/comment counts among the latest twenty visible manual publications. This is a bounded preview, not a recommendation engine or a global all-time ranking.
- Own/public profile: Progress Hub follower and following totals, the latest four manually published feed posts and a separate scrollable publication window. The window loads twenty per page. Automatic project-update feed previews are excluded; a user manually selecting the project category is still included. Help requests remain last on the profile.
- Settings: notification preferences for replies, comments, followed projects, collaboration and event reviews. Official and security notices remain available.
- Project detail: cancel a pending application, apply again after withdrawal, leave a team, or remove a collaborator as owner. All destructive membership actions require UI confirmation. Previous updates stay available; these actions do not grant XP or change GitHub repository permissions.

## Consistency and privacy

Follower information refers to Progress Hub, not GitHub followers. Public post history requires an opted-in profile. Owners can view their own history while private. Viewer blocks, deleted/hidden publications and hidden project previews are respected. Favorite identities remain private.

Team editing uses a displayed project version. Acceptance changes that version, so an old membership update fails rather than overwriting a concurrent change. Application attempt identifiers let a refreshed client distinguish a new application from an older withdrawn one. The owner cannot leave their own project; non-owners cannot remove other members. Leaving/removal revokes publishing privileges immediately and preserves history.

Notification writes use stable keys. Retried comments/replies do not create duplicate inbox entries; self-notifications are omitted. Project activity is queued at most once per project per Brasília calendar day. The existing worker drains up to five batches of one hundred followers per pass, with leases, a cursor and recipient-level deduplication. Preference changes, unfollows and blocks are checked at delivery time. Delivery requires the existing worker and normally starts on its next one-minute pass. Pending batches recover after a restart.

## Verification

Automated frontend coverage includes the profile publication window, home links, confirmed team exit and persisted notification choices. Isolated real-MongoDB coverage includes cancellation/reapplication, membership ownership, stale versions, preserved history/XP, public/private visibility, pagination, notification retries, preferences and queued daily delivery. Existing tests remain part of the full suite. No production deployment or new dependencies are required.

Validation completed with 316 passing frontend tests, 116 passing real-MongoDB backend tests, a production build and browser flows for home/profile previews, the publication window, confirmed membership changes, saved notification choices and responsive authenticated profiles.
