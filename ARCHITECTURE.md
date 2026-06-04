# LobbyPing Architecture

LobbyPing is a web/PWA arrival notification app.

## Runtime

- Frontend: Vite React app in `app/`, deployed to GitHub Pages at `/lobbyPing/`.
- Realtime data: Firebase Firestore.
- Authentication: Firebase anonymous auth for visitors and residents.
- Push notifications: Firebase Cloud Messaging tokens stored per resident device.
- API: Vercel serverless endpoint at `api/notify.ts` sends FCM notifications with Firebase Admin.

## Core Flow

1. Visitor opens `/visit?b=<building>` from a QR code.
2. Visitor selects a room, type, and wait time.
3. App creates an arrival document with the visitor anonymous UID.
4. Vercel `/api/notify` reads the arrival and sends push to registered room devices.
5. Resident pages subscribe to arrivals in Firestore and can respond, ring the visitor, or manage room settings.
6. Visitor status page subscribes to the arrival and can ring/remind/reply while the arrival remains active.

## Code Organization

- `app/src/lib/firestore.ts`: Firestore reads/writes and transactional arrival mutations.
- `app/src/lib/arrivalPolicy.ts`: shared lifecycle limits and state predicates.
- `app/src/lib/notify.ts`: frontend wrapper for the Vercel notify API.
- `api/notify.ts`: server-side FCM sender.
- `firestore.rules`: authorization boundary for Firestore.

## Current Constraints

- Ringing is alarm-style notification only, not WebRTC voice/video.
- Resident-to-visitor ring only works while the visitor status page is open.
- GitHub Pages hosts static frontend assets; server work belongs in Vercel or Firebase.
