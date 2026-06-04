# LobbyPing Security Notes

## Authorization Model

- Visitors use Firebase anonymous auth. Arrival documents store `visitorUid`; visitor-only updates must come from that same UID.
- Residents register a device from an invite code. The app stores a device document and a UID-keyed resident profile.
- Resident responses and resident-to-visitor rings must include a registered device ID with `permissions.respond == true`.
- Building and room administration in Firestore rules requires a Firebase custom claim: `admin == true`.

## Required Admin Setup

The legacy `VITE_ADMIN_KEY` only hides the admin page in the browser. It is not a security boundary.

Before using the admin UI against the tightened rules, grant a trusted Firebase Auth user an admin custom claim with Firebase Admin SDK:

```js
await admin.auth().setCustomUserClaims(uid, { admin: true })
```

After setting the claim, the user must refresh/re-authenticate so the ID token includes the claim.

## Current Accepted Risk

Invite-code lookup is still readable by authenticated users so the existing client-side join flow continues to work. The next hardening step is to move invite redemption into a trusted API endpoint so invite code documents no longer need broad authenticated reads.

## Push Token Handling

FCM tokens are stored in room device documents. Rules now restrict device reads to admins, the device owner, or a room owner. The Vercel notify API uses Firebase Admin to read tokens server-side and removes stale tokens reported by FCM.

## API Controls

`api/notify.ts` rejects unsupported origins, validates notification kind, gates notification sends against current arrival state, and applies a lightweight per-arrival/IP rate limit.
