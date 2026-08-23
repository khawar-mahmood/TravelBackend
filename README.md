# Robin Holidays — Backend API

Express + Firestore API that powers the Robin Holidays website inquiries
and the admin panel (New / In Process / Complete / Failed).

## Requirements

- Node.js 18+
- A Firebase project with Cloud Firestore — **optional** for local dev,
  thanks to the built-in in-memory fallback.

## Setup

```bash
cd "D:\Travel BackEND"
npm install
copy .env.example .env   # then edit .env
npm run dev
```

The API runs on **http://localhost:5000**.

### Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `robin-holidays`).
2. In **Build → Firestore Database**, click **Create database**.
   - Start in **production mode**.
   - Pick a region close to your users (e.g. `europe-west2` for the UK).
3. Deploy the locked-down rules in `firestore.rules` (or paste them in the Rules tab). The Admin SDK bypasses rules; this just blocks direct browser access.
4. Open **Project settings → Service accounts → Generate new private key**.
5. Put the credentials in `.env` using either:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----\n"
```

or a single JSON env var:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"..."}
```

On Vercel, add the same variables in **Project Settings → Environment Variables**. Keep the private key's `\n` characters as the two-character sequence `\n` (not a real newline).

### Database options

- **Firestore (required for production):** set the Firebase credentials above.
- **In-memory dev store:** leave the Firebase vars blank and run `npm run dev`.
  This uses a throwaway store that auto-seeds sample inquiries on startup.
  Data resets every time the server restarts.

## Scripts

| Script          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Start with auto-reload (`node --watch`)                 |
| `npm start`     | Start the server                                        |
| `npm run seed`  | Seed sample inquiries into **Firestore**                |

## API Endpoints

| Method | Path                     | Auth  | Description                          |
| ------ | ------------------------ | ----- | ------------------------------------ |
| GET    | `/api/health`            | —     | Health + DB status                   |
| POST   | `/api/inquiries`         | —     | Create inquiry (public website forms)|
| POST   | `/api/auth/login`        | —     | Admin login → returns JWT            |
| GET    | `/api/inquiries`         | admin | List all inquiries (`?status=` filter) |
| GET    | `/api/inquiries/stats`   | admin | Counts per status                    |
| GET    | `/api/inquiries/analytics` | admin | Dashboard KPIs and breakdowns      |
| PATCH  | `/api/inquiries/:id`     | admin | Update status / notes                |
| DELETE | `/api/inquiries/:id`     | admin | Delete inquiry                       |

Admin endpoints require an `Authorization: Bearer <token>` header.

### Inquiry statuses

`new` · `in_process` · `complete` · `failed`

## Admin login

Set credentials in `.env`:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## Connecting the frontend

The frontend (in `D:\Travel`) calls `/api/...`. In development, Vite proxies
`/api` to `http://localhost:5000` (see `vite.config.js`). For production, set
`VITE_API_URL` in the frontend to this API's URL and add that origin to
`CLIENT_ORIGIN` here.
