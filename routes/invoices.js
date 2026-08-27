import { Router } from 'express'
import Invoice from '../models/Invoice.js'
import Agent from '../models/Agent.js'
import Inquiry from '../models/Inquiry.js'
import { requireAuth } from '../middleware/auth.js'
import { syncInquiryFromInvoices } from '../lib/invoiceSync.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.user.role === 'agent') {
      filter.agentId = req.user.agentId
    } else if (req.user.role === 'admin') {
      if (req.query.agentId) filter.agentId = String(req.query.agentId)
    } else {
      return res.status(403).json({ error: 'Not allowed.' })
    }
    const invoices = await Invoice.find(filter)
    res.json({ invoices })
  } catch (err) {
    res.status(500).json({ error: 'Could not load invoices.', detail: err.message })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    let agentId = String(req.body?.agentId || '').trim()
    if (req.user.role === 'agent') {
      agentId = req.user.agentId
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed.' })
    }

    if (!agentId) return res.status(400).json({ error: 'Agent is required.' })
    const agent = await Agent.findById(agentId)
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })

    const inquiryId = String(req.body?.inquiryId || '').trim()
    if (!inquiryId) {
      return res.status(400).json({ error: 'Select an order to attach this invoice.' })
    }

    const inquiry = await Inquiry.findById(inquiryId)
    if (!inquiry) return res.status(404).json({ error: 'Order not found.' })
    if (req.user.role === 'agent' && inquiry.assignedAgentId !== req.user.agentId) {
      return res.status(403).json({ error: 'You can only attach invoices to your assigned orders.' })
    }

    const invoice = await Invoice.create({
      ...req.body,
      agentId,
      agentName: agent.name,
      inquiryId,
      clientName: String(req.body?.clientName || '').trim() || inquiry.name,
    })
    const synced = await syncInquiryFromInvoices(inquiryId)
    res.status(201).json({ ok: true, invoice, inquiry: synced })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save invoice.' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Invoice.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' })
    if (req.user.role === 'agent' && existing.agentId !== req.user.agentId) {
      return res.status(403).json({ error: 'You can only delete your own invoices.' })
    }
    if (req.user.role !== 'admin' && req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Not allowed.' })
    }

    const invoice = await Invoice.findByIdAndDelete(req.params.id)
    const synced = invoice?.inquiryId ? await syncInquiryFromInvoices(invoice.inquiryId) : null
    res.json({ ok: true, invoice, inquiry: synced })
  } catch (err) {
    res.status(500).json({ error: 'Could not delete invoice.', detail: err.message })
  }
})

export default router
