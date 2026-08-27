import { Router } from 'express'
import Expense from '../models/Expense.js'
import Inquiry from '../models/Inquiry.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = {}
    if (req.user.role === 'agent') {
      filter.agentId = req.user.agentId
      if (req.query.inquiryId) filter.inquiryId = String(req.query.inquiryId)
    }
    const expenses = await Expense.find(filter)
    res.json({ expenses })
  } catch (err) {
    res.status(500).json({ error: 'Could not load expenses.', detail: err.message })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const expense = await Expense.create(req.body || {})
      return res.status(201).json({ ok: true, expense })
    }

    if (req.user.role === 'agent') {
      const inquiryId = String(req.body?.inquiryId || '').trim()
      const title = String(req.body?.title || req.body?.description || '').trim()
      const amount = req.body?.amount

      if (!inquiryId) {
        return res.status(400).json({ error: 'Inquiry is required for agent expenses.' })
      }

      const inquiry = await Inquiry.findById(inquiryId)
      if (!inquiry || inquiry.assignedAgentId !== req.user.agentId) {
        return res.status(403).json({ error: 'You can only add expenses to your assigned inquiries.' })
      }

      const expense = await Expense.create({
        title,
        amount,
        notes: req.body?.notes || '',
        inquiryId,
        inquiryLabel: [inquiry.name, inquiry.destination].filter(Boolean).join(' · '),
        agentId: req.user.agentId,
        agentName: req.user.name || req.user.username,
        category: 'inquiry',
        costType: req.body?.costType === 'cogs' ? 'cogs' : 'overhead',
        entryType: ['expense', 'refund', 'adjustment'].includes(req.body?.entryType) ? req.body.entryType : 'expense',
        reference: req.body?.reference || '',
        vatAmount: req.body?.vatAmount || 0,
        createdBy: 'agent',
      })

      return res.status(201).json({ ok: true, expense })
    }

    return res.status(403).json({ error: 'Not allowed.' })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create expense.' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Expense not found.' })

    if (req.user.role === 'agent') {
      if (existing.agentId !== req.user.agentId) {
        return res.status(403).json({ error: 'You can only edit your own expenses.' })
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed.' })
    }

    const updates = {}
    if (req.body.title !== undefined || req.body.description !== undefined) {
      updates.title = String(req.body.title ?? req.body.description ?? '').trim()
    }
    if (req.body.amount !== undefined) updates.amount = req.body.amount
    if (req.body.notes !== undefined) updates.notes = req.body.notes
    if (req.user.role === 'admin') {
      if (req.body.category !== undefined) updates.category = req.body.category
      if (req.body.expenseDate !== undefined) updates.expenseDate = req.body.expenseDate
      if (req.body.costType !== undefined) updates.costType = req.body.costType
      if (req.body.entryType !== undefined) updates.entryType = req.body.entryType
      if (req.body.reference !== undefined) updates.reference = req.body.reference
      if (req.body.vatAmount !== undefined) updates.vatAmount = req.body.vatAmount
    } else {
      if (req.body.reference !== undefined) updates.reference = req.body.reference
      if (req.body.vatAmount !== undefined) updates.vatAmount = req.body.vatAmount
      if (req.body.costType !== undefined) updates.costType = req.body.costType
      if (req.body.entryType !== undefined) updates.entryType = req.body.entryType
    }

    const expense = await Expense.findByIdAndUpdate(req.params.id, updates)
    res.json({ ok: true, expense })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not update expense.' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Expense not found.' })

    if (req.user.role === 'agent') {
      if (existing.agentId !== req.user.agentId) {
        return res.status(403).json({ error: 'You can only delete your own expenses.' })
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed.' })
    }

    await Expense.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Could not delete expense.', detail: err.message })
  }
})

export default router
