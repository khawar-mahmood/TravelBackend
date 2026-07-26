// Vercel serverless entry point.
// Keep this file as a thin wrapper that always exports a request handler.
import app from '../app.js'

export default function handler(req, res) {
  return app(req, res)
}
