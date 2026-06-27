// Vercel serverless entry point.
// Vercel routes every request to this function (see vercel.json) and the
// Express app handles routing internally (/api/health, /api/auth, /api/inquiries).
import app from '../app.js'

export default app
