# AZ FILMS Security Specification

## 1. Data Invariants
1. **Film Catalog Integrity**: Only verified Admins (`az1606276@gmail.com` or UID present in `/admins/{uid}`) may create, update, or delete `/films/{filmId}` documents. Public visitors and viewers can only read/list films where `isVisible == true`.
2. **Role Isolation & No Self-Escalation**: A signed-in user creating their own `/users/{uid}` document can only assign `role: "viewer"` (unless they are the bootstrapped admin). Users cannot modify their own `role` field on update; only an existing Admin can modify user roles or write to `/admins/{uid}`.
3. **PII Protection**: User profiles (`/users/{uid}`) contain email and display info; `get` is strictly restricted to the profile owner or Admin, and `list` is strictly restricted to Admins.
4. **Watchlist Ownership**: `/users/{uid}/watchlist/{filmId}` is strictly scoped to `request.auth.uid == uid`, validates that the referenced film exists in `/films/{filmId}`, and enforces `isValidId(filmId)`.
5. **Write-Once / Admin-Read Analytics**: Anonymous visitors may create deduplicated visit records (`/analytics_visits/{visitId}`), update their session heartbeat (`/analytics_sessions/{visitorId}`), and log playback progress (`/analytics_views/{viewId}` for existing films). Non-admins can NEVER read, list, or delete any analytics documents.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, `addedAt`, `startedAt` fields must match `request.time`, and creation timestamps are immutable on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Film**: Viewer or Admin attempts `films/test` with extra field `isHacked: true` -> Rejected by `hasOnly(...)`.
2. **Privilege Escalation on User Create**: Normal user creates `/users/{uid}` with `role: "admin"` -> Rejected because `role` must be `"viewer"` for non-bootstrapped admins.
3. **Privilege Escalation on User Update**: Normal user updates `/users/{uid}` changing `role` from `"viewer"` to `"admin"` -> Rejected by `affectedKeys().hasOnly(['displayName', 'photoURL', 'updatedAt'])` and `incoming().role == existing().role`.
4. **Email Spoofing Admin Bypass**: User with unverified email token (`email_verified: false`) matching admin email attempts film write -> Rejected by `request.auth.token.email_verified == true`.
5. **PII Blanket Read**: Viewer attempts `get(/users/{otherUid})` or `list(/users)` -> Rejected by owner/admin guard.
6. **Hidden Film Scraping**: Unauthenticated visitor or viewer queries `/films` without `where('isVisible', '==', true)` -> Rejected by `allow list: if resource.data.isVisible == true || isAdmin()`.
7. **Orphaned Watchlist Item**: User adds a non-existent `filmId` to `/users/{uid}/watchlist/fake-id` -> Rejected by `exists(/databases/$(database)/documents/films/$(filmId))`.
8. **Cross-User Watchlist Tampering**: User A attempts to write/read `/users/{userB}/watchlist/{filmId}` -> Rejected by `request.auth.uid == userId`.
9. **ID Poisoning**: Attacker attempts to create `/films/{1500-char-id}` or `/analytics_visits/bad$id` -> Rejected by `isValidId()`.
10. **Analytics Tampering / Rollback**: Attacker attempts to decrease `watchedSeconds` or revert `completed: true` to `false` on `/analytics_views/{viewId}` -> Rejected by monotonic progress invariant.
11. **Analytics Snooping**: Non-admin attempts `list(/analytics_views)` or `get(/analytics_sessions/{id})` -> Rejected by `allow read: if isAdmin()`.
12. **Client Timestamp Forgery**: Attacker sends arbitrary past/future `createdAt` instead of `serverTimestamp()` -> Rejected by `incoming().createdAt == request.time`.
