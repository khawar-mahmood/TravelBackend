import { Router } from 'express'
import Agent from '../models/Agent.js'
import Inquiry from '../models/Inquiry.js'
import Expense from '../models/Expense.js'
import Invoice from '../models/Invoice.js'
import { buildAgentStats } from '../lib/agentStats.js'
import { requireAuth, requireAdmin, requireAgent } from '../middleware/auth.js'

const router = Router()

async function loadAgentBundle(agent) {
  const [inquiries, expenses, storedInvoices] = await Promise.all([
    Inquiry.find(),
    Expense.find(),
    Invoice.find({ agentId: agent._id }),
  ])
  const stats = buildAgentStats(agent, inquiries, expenses)
  stats.invoiceCount = storedInvoices.length
  const assigned = inquiries.filter((row) => row.assignedAgentId === agent._id)
  return { agent, stats, inquiries: assigned, invoices: storedInvoices }
}

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const agents = await Agent.find()
    res.json({ agents })
  } catch (err) {
    res.status(500).json({ error: 'Could not load agents.', detail: err.message })
  }
})

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.create(req.body || {})
    res.status(201).json({ ok: true, agent })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create agent.' })
  }
})

router.get('/me', requireAuth, requireAgent, async (req, res) => {
  try {
    const agent = await Agent.findById(req.user.agentId)
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })
    res.json(await loadAgentBundle(agent))
  } catch (err) {
    res.status(500).json({ error: 'Could not load your profile.', detail: err.message })
  }
})

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })
    res.json(await loadAgentBundle(agent))
  } catch (err) {
    res.status(500).json({ error: 'Could not load agent.', detail: err.message })
  }
})

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(req.params.id, req.body || {})
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })
    res.json({ ok: true, agent })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not update agent.' })
  }
})

export default router
