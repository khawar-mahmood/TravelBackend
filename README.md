# Robin Holidays — Backend API

Express + MongoDB (Mongoose) API that powers the Robin Holidays website inquiries
and the admin panel (New / In Process / Complete / Failed).

## Requirements

- Node.js 18+
- A MongoDB database (MongoDB Atlas recommended) — **optional** for local dev,
  thanks to the built-in in-memory fallback.

## Setup

```bash
cd "D:\Travel BackEND"
npm install
copy .env.example .env   # then edit .env
npm run dev
```

The API runs on **http://localhost:5000**.

### Database options

Edit `MONGODB_URI` in `.env`:

- **MongoDB Atlas (recommended for production):**
  ```
  MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/robinholidays?retryWrites=true&w=majority
  ```
- **Local MongoDB:**
  ```
  MONGODB_URI=mongodb://127.0.0.1:27017/robinholidays
  ```
- **In-memory dev database (no install needed):** leave `MONGODB_URI` blank and run:
  ```bash
  npm i -D mongodb-memory-server
  npm run dev
  ```
  This spins up a throwaway database that auto-seeds sample inquiries on startup.
  Data resets every time the server restarts.

## Scripts

| Script          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Start with auto-reload (`node --watch`)                 |
| `npm start`     | Start the server                                        |
| `npm run seed`  | Seed sample inquiries into a **persistent** DB (Atlas/local) |

## API Endpoints

| Method | Path                     | Auth  | Description                          |
| ------ | ------------------------ | ----- | ------------------------------------ |
| GET    | `/api/health`            | —     | Health + DB status                   |
| POST   | `/api/inquiries`         | —     | Create inquiry (public website forms)|
| POST   | `/api/auth/login`        | —     | Admin login → returns JWT            |
| GET    | `/api/inquiries`         | admin | List all inquiries (`?status=` filter) |
| GET    | `/api/inquiries/stats`   | admin | Counts per status                    |
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
