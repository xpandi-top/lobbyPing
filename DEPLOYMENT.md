# LobbyPing Deployment

## Frontend

The frontend lives in `app/` and is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

Local check:

```bash
cd app
npm ci
npm run build
```

## Firebase Rules

Rules live in `firestore.rules`.

Local test:

```bash
npm ci
npm run test:rules
```

Manual deploy from terminal:

```bash
npm run deploy:rules
```

Manual deploy from GitHub:

- Open the `Deploy Firebase Rules and Vercel API` workflow.
- Choose `rules` or `all`.
- Required secret: `FIREBASE_SERVICE_ACCOUNT`.
- Optional variable: `FIREBASE_PROJECT` defaults to `lobbyping-5ae0f`.

## Vercel API

The API lives in `api/notify.ts`.

Manual deploy from terminal:

```bash
npm run deploy:api
```

Manual deploy from GitHub:

- Open the `Deploy Firebase Rules and Vercel API` workflow.
- Choose `api` or `all`.
- Required secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Optional variable: `VERCEL_PROJECT` defaults to `lobby-ping`.

## Full Local Deployment

```bash
npm run deploy:check
npm run deploy
```

## Rollback

- Frontend: revert or redeploy a known-good GitHub commit on `main`.
- Firebase rules: redeploy the previous `firestore.rules` revision.
- Vercel API: use Vercel dashboard rollback or redeploy a known-good commit.
