# PolyAgent

PolyAgent is a React/Vite chat client with Firebase authentication and an Express/OpenAI backend.

Public site: https://alishajesani.github.io/project1/

## Run locally

Use two terminals from the repository root:

```bash
cd server
npm ci
cp .env.example .env
# Fill in the real server secrets, then:
npm run dev
```

```bash
cd client
npm ci
cp .env.example .env
# Fill in the Firebase web config, then:
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173/project1/`).

## Production setup

GitHub Actions deploys the client to GitHub Pages after every push to `main`. In the repository's Actions secrets, set the Firebase `VITE_FB_*` values and set `VITE_API_BASE` to the public **HTTPS backend origin**, without `/api` at the end.

The Express server must be deployed separately to a Node.js host. Configure these server secrets there:

- `OPENAI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (the complete Firebase Admin service-account JSON)
- `PORT` is normally supplied by the host

Use `npm start` as the server start command and `/api/health` as the health-check path.

## Verify before pushing

```bash
cd client && npm run lint && npm run build
cd ../server && npm run check
```
