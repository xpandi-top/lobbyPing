# LobbyPing — Local Test Guide

## Prerequisites

1. Firebase Console — enable these (one-time):
   - **Firestore Database** → Create database → Production mode → choose region
   - **Authentication** → Sign-in method → Anonymous → Enable

2. Dev server running:
   ```
   cd app && npm run dev
   ```
   Opens at: `http://localhost:5173/lobbyPing/`

---

## Step 1 — Admin: Create Building + Room

Open in browser (Tab A):
```
http://localhost:5173/lobbyPing/#/admin?key=6oQLVcqa
```

1. Fill in building name (e.g. `Test Building`) and slug (e.g. `test-building`)
2. Click **Create Building** — note the Building ID shown
3. Enter a room number (e.g. `101`) → click **Add**
4. Room appears in list with a 6-char invite code (e.g. `ABC123`)
5. Click the copy icon on the room → saves invite link to clipboard

---

## Step 2 — Resident: Register Device

Open in browser (Tab B — can be same browser or different device):
```
http://localhost:5173/lobbyPing/#/join?b=BUILDING_ID&code=INVITE_CODE
```

Or paste the copied invite link directly.

1. Click **Register Device**
2. Redirects to Resident Dashboard
3. Go to **Notifications** tab
4. On iOS: follow Add to Home Screen steps first
5. Click **Enable Notifications** → allow when prompted
6. Click **Send Test Notification** → verify it arrives

---

## Step 3 — Visitor: Send Arrival

Open in browser (Tab C — incognito recommended to simulate different user):
```
http://localhost:5173/lobbyPing/#/visit?b=BUILDING_ID
```

Or use the QR code from the Admin panel (print it, or just use the URL).

1. Enter room number (e.g. `101`)
2. Select arrival type (Package / Food / Guest / Other)
3. Select wait time
4. Click **Notify Resident**
5. Lands on Status page — shows "Notification sent, waiting…"

> **Note:** Push notification only fires if Cloud Functions are deployed.
> Locally, the arrival doc is created in Firestore but no FCM push is sent.
> Test the response flow manually (Step 4) by opening the respond URL directly.

---

## Step 4 — Resident: Respond to Arrival

After visitor sends, open respond URL in resident's browser:
```
http://localhost:5173/lobbyPing/#/respond?b=BUILDING_ID&r=ROOM_ID&a=ARRIVAL_ID
```

Get ROOM_ID and ARRIVAL_ID from the Status page URL (Tab C).

1. Choose a response: Coming Down / Leave in Lobby / No Need to Wait
2. Response is saved to Firestore instantly

---

## Step 5 — Visitor: Sees Response

Back in Tab C (Status page) — response appears automatically via Firestore real-time listener.

---

## Deploy Cloud Functions (for real push notifications)

```bash
cd /Users/dimo/projects/lobbyPing
firebase login
firebase use lobbyping-5ae0f
firebase deploy --only functions,firestore
```

After deploy, push notifications fire automatically when visitor sends an arrival.

---

## URL Reference

| Role     | URL |
|----------|-----|
| Admin    | `/#/admin?key=6oQLVcqa` |
| Resident join | `/#/join?b=BUILDING_ID&code=INVITE_CODE` |
| Resident dashboard | `/home?b=BUILDING_ID&r=ROOM_ID` |
| Visitor  | `/#/visit?b=BUILDING_ID` |
| Visitor status | `/#/status?b=B&r=R&a=ARRIVAL_ID` |
| Resident respond | `/#/respond?b=B&r=R&a=ARRIVAL_ID` |

Replace base `http://localhost:5173/lobbyPing/` with `https://xpandi-top.github.io/lobbyPing/` for production.
