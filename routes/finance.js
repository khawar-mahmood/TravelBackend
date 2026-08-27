import { Router } from 'express'
import Inquiry from '../models/Inquiry.js'
import Agent from '../models/Agent.js'
import Expense from '../models/Expense.js'
import Budget from '../models/Budget.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  resolveFinancePeriod,
  resolvePreviousPeriod,
  inFinancePeriod,
  inquiryFinanceDate,
  expenseFinanceDate,
} from '../lib/financePeriod.js'
import { buildFinanceSeries, buildAgentSeries, buildPerAgentSeries } from '../lib/kpiSeries.js'

const router = Router()

function bumpMap(map, key, amount = 0, count = 1) {
  const label = key || 'Unspecified'
  if (!map.has(label)) map.set(label, { label, amount: 0, count: 0 })
  const row = map.get(label)
  row.amount += amount
  row.count += count
}

function mapToSorted(map, limit = 10) {
  return [...map.values()]
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .slice(0, limit)
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function computeTotals(filteredInquiries, filteredExpenses) {
  const revenueRows = filteredInquiries
    .filter((row) => row.totalPayment > 0 || row.initialPayment > 0 || row.refundAmount > 0)
    .map((row) => ({
      ...row,
      outstanding: Math.max(0, Number(row.totalPayment || 0) - Number(row.initialPayment || 0)),
      netRevenue: Math.max(0, Number(row.totalPayment || 0) - Number(row.refundAmount || 0)),
    }))

  const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.totalPayment || 0), 0)
  const totalInitial = revenueRows.reduce((sum, row) => sum + Number(row.initialPayment || 0), 0)
  const totalOutstanding = revenueRows.reduce((sum, row) => sum + row.outstanding, 0)
  const inquiryRefunds = revenueRows.reduce((sum, row) => sum + Number(row.refundAmount || 0), 0)
  const revenueVat = revenueRows.reduce((sum, row) => sum + Number(row.vatAmount || 0), 0)

  const expenseRows = filteredExpenses
  const operating = expenseRows.filter((row) => row.entryType === 'expense' || !row.entryType)
  const refundEntries = expenseRows.filter((row) => row.entryType === 'refund')
  const adjustments = expenseRows.filter((row) => row.entryType === 'adjustment')

  const totalCogs = operating.filter((row) => row.costType === 'cogs').reduce((sum, row) => sum + row.amount, 0)
  const totalOverhead = operating.filter((row) => row.costType !== 'cogs').reduce((sum, row) => sum + row.amount, 0)
  const expenseRefunds = refundEntries.reduce((sum, row) => sum + row.amount, 0)
  const totalAdjustments = adjustments.reduce((sum, row) => sum + row.amount, 0)
  const totalExpenses = operating.reduce((sum, row) => sum + row.amount, 0) + expenseRefunds + totalAdjustments
  const expenseVat = expenseRows.reduce((sum, row) => sum + Number(row.vatAmount || 0), 0)

  const totalRefunds = inquiryRefunds + expenseRefunds
  const netRevenue = totalRevenue - inquiryRefunds
  const grossProfit = netRevenue - totalCogs
  const netProfit = netRevenue - totalExpenses
  const avgDealSize = revenueRows.length ? Math.round((totalRevenue / revenueRows.length) * 100) / 100 : 0
  const expenseRatio = netRevenue > 0 ? Math.round((totalExpenses / netRevenue) * 100) : 0
  const marginPct = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 100) : 0
  const grossMarginPct = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100) : 0

  const adminExpenses = expenseRows.filter((row) => row.createdBy !== 'agent').reduce((sum, row) => sum + row.amount, 0)
  const agentLoggedExpenses = expenseRows.filter((row) => row.createdBy === 'agent').reduce((sum, row) => sum + row.amount, 0)

  return {
    revenueRows,
    expenseRows,
    totalRevenue,
    totalInitial,
    totalOutstanding,
    inquiryRefunds,
    expenseRefunds,
    totalRefunds,
    netRevenue,
    totalCogs,
    totalOverhead,
    totalAdjustments,
    totalExpenses,
    grossProfit,
    netProfit,
    avgDealSize,
    expenseRatio,
    marginPct,
    grossMarginPct,
    revenueVat,
    expenseVat,
    adminExpenses,
    agentLoggedExpenses,
    revenueCount: revenueRows.filter((row) => row.totalPayment > 0 || row.initialPayment > 0).length,
  }
}

async function buildSummary(period, inquiries, agents, expenses) {
  const filteredInquiries = inquiries.filter((row) => inFinancePeriod(inquiryFinanceDate(row), period))
  const filteredExpenses = expenses.filter((row) => inFinancePeriod(expenseFinanceDate(row), period))
  const totals = computeTotals(filteredInquiries, filteredExpenses)

  const agentExpenses = new Map()
  for (const expense of totals.expenseRows) {
    if (!expense.agentId) continue
    agentExpenses.set(expense.agentId, (agentExpenses.get(expense.agentId) || 0) + expense.amount)
  }

  const agentMap = Object.fromEntries(agents.map((agent) => [agent._id, agent.name]))
  const byAgentMap = new Map()

  for (const row of filteredInquiries) {
    if (!row.assignedAgentId) continue
    const key = row.assignedAgentId
    if (!byAgentMap.has(key)) {
      byAgentMap.set(key, {
        agentId: key,
        name: row.assignedAgentName || agentMap[key] || 'Unknown',
        dealt: 0,
        success: 0,
        failure: 0,
        inProcess: 0,
        revenue: 0,
        initialCollected: 0,
        outstanding: 0,
        refunds: 0,
        payingDeals: 0,
      })
    }
    const stats = byAgentMap.get(key)
    stats.dealt += 1
    if (row.status === 'complete') stats.success += 1
    if (row.status === 'failed') stats.failure += 1
    if (row.status === 'in_process') stats.inProcess += 1
    stats.revenue += row.totalPayment
    stats.initialCollected += row.initialPayment
    stats.refunds += Number(row.refundAmount || 0)
    if (row.totalPayment > 0 || row.initialPayment > 0) {
      stats.payingDeals += 1
      stats.outstanding += Math.max(0, Number(row.totalPayment || 0) - Number(row.initialPayment || 0))
    }
  }

  for (const [agentId] of agentExpenses) {
    if (!byAgentMap.has(agentId)) {
      byAgentMap.set(agentId, {
        agentId,
        name: agentMap[agentId] || 'Unknown',
        dealt: 0,
        success: 0,
        failure: 0,
        inProcess: 0,
        revenue: 0,
        initialCollected: 0,
        outstanding: 0,
        refunds: 0,
        payingDeals: 0,
      })
    }
  }

  const chartSeries = buildFinanceSeries({ inquiries: filteredInquiries, expenses: filteredExpenses, period })
  const agentSeries = buildAgentSeries(filteredInquiries, period)
  const perAgentSeries = buildPerAgentSeries(filteredInquiries, period)

  const agentPerformance = [...byAgentMap.values()]
    .map((row) => {
      const expensesAmount = agentExpenses.get(row.agentId) || 0
      const netRev = row.revenue - row.refunds
      const revenuePerInquiry = row.dealt ? Math.round((row.revenue / row.dealt) * 100) / 100 : 0
      return {
        ...row,
        expenses: expensesAmount,
        net: Math.round((netRev - expensesAmount) * 100) / 100,
        successRate: row.dealt ? Math.round((row.success / row.dealt) * 100) : 0,
        assigned: row.dealt,
        completed: row.success,
        conversionRate: row.dealt ? Math.round((row.success / row.dealt) * 100) : 0,
        revenuePerInquiry,
        series: perAgentSeries.byAgent[row.agentId] || { dealt: [], success: [], failure: [], revenue: [] },
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const efficiencyReport = [...agentPerformance]
    .filter((row) => row.dealt > 0 && row.revenue > 0)
    .sort((a, b) => b.revenuePerInquiry - a.revenuePerInquiry || b.revenue - a.revenue)
    .map((row, index) => ({ ...row, rank: index + 1 }))

  const bySource = new Map()
  const byDestination = new Map()
  const byService = new Map()
  const byPaymentMethod = new Map()
  const byPaymentStatus = new Map()
  for (const row of totals.revenueRows) {
    bumpMap(bySource, row.source || 'website', row.totalPayment)
    bumpMap(byDestination, row.destination || 'Unspecified', row.totalPayment)
    bumpMap(byService, row.service || 'Unspecified', row.totalPayment)
    bumpMap(byPaymentMethod, row.paymentMethod || 'unspecified', row.totalPayment)
    bumpMap(byPaymentStatus, row.paymentStatus || 'unpaid', row.totalPayment)
  }

  const byCategory = new Map()
  const byExpenseSource = new Map()
  const byCostType = new Map()
  const byEntryType = new Map()
  for (const row of totals.expenseRows) {
    bumpMap(byCategory, row.category || 'general', row.amount)
    bumpMap(byExpenseSource, row.createdBy === 'agent' ? 'Agent logged' : 'Admin logged', row.amount)
    bumpMap(byCostType, row.costType === 'cogs' ? 'Cost of sale' : 'Overhead', row.amount)
    bumpMap(byEntryType, row.entryType || 'expense', row.amount)
  }

  let budget = null
  if (period.type === 'month' && period.month) {
    budget = await Budget.findByMonth(period.month)
  }

  return {
    period: {
      type: period.type,
      month: period.month,
      from: period.from,
      to: period.to,
      label: period.label,
    },
    totalRevenue: totals.totalRevenue,
    totalInitial: totals.totalInitial,
    totalOutstanding: totals.totalOutstanding,
    totalRefunds: totals.totalRefunds,
    inquiryRefunds: totals.inquiryRefunds,
    expenseRefunds: totals.expenseRefunds,
    netRevenue: totals.netRevenue,
    totalCogs: totals.totalCogs,
    totalOverhead: totals.totalOverhead,
    totalAdjustments: totals.totalAdjustments,
    totalExpenses: totals.totalExpenses,
    grossProfit: totals.grossProfit,
    netProfit: totals.netProfit,
    avgDealSize: totals.avgDealSize,
    expenseRatio: totals.expenseRatio,
    marginPct: totals.marginPct,
    grossMarginPct: totals.grossMarginPct,
    revenueVat: totals.revenueVat,
    expenseVat: totals.expenseVat,
    revenueCount: totals.revenueCount,
    inquiryCount: filteredInquiries.length,
    expenseCount: totals.expenseRows.length,
    adminExpenses: totals.adminExpenses,
    agentLoggedExpenses: totals.agentLoggedExpenses,
    budget: budget
      ? {
          ...budget,
          revenueProgress: budget.revenueTarget
            ? Math.round((totals.totalRevenue / budget.revenueTarget) * 100)
            : null,
          expenseProgress: budget.expenseTarget
            ? Math.round((totals.totalExpenses / budget.expenseTarget) * 100)
            : null,
          revenueVariance: Math.round((totals.totalRevenue - budget.revenueTarget) * 100) / 100,
          expenseVariance: Math.round((totals.totalExpenses - budget.expenseTarget) * 100) / 100,
        }
      : null,
    agentPerformance,
    efficiencyReport,
    breakdowns: {
      bySource: mapToSorted(bySource),
      byDestination: mapToSorted(byDestination, 8),
      byService: mapToSorted(byService),
      byCategory: mapToSorted(byCategory),
      byExpenseSource: mapToSorted(byExpenseSource),
      byCostType: mapToSorted(byCostType),
      byEntryType: mapToSorted(byEntryType),
      byPaymentMethod: mapToSorted(byPaymentMethod),
      byPaymentStatus: mapToSorted(byPaymentStatus),
    },
    revenueRows: totals.revenueRows
      .slice()
      .sort((a, b) => b.totalPayment - a.totalPayment)
      .slice(0, 150),
    expenses: totals.expenseRows
      .slice()
      .sort((a, b) => String(b.expenseDate || '').localeCompare(String(a.expenseDate || ''))),
    series: chartSeries,
    agentSeries,
  }
}

router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    let period
    try {
      period = resolveFinancePeriod(req.query)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    const [inquiries, agents, expenses] = await Promise.all([
      Inquiry.find(),
      Agent.find(),
      Expense.find(),
    ])

    const summary = await buildSummary(period, inquiries, agents, expenses)

    const previousPeriod = resolvePreviousPeriod(period)
    let comparison = null
    if (previousPeriod) {
      const prev = await buildSummary(previousPeriod, inquiries, agents, expenses)
      comparison = {
        period: prev.period,
        totalRevenue: prev.totalRevenue,
        totalExpenses: prev.totalExpenses,
        netProfit: prev.netProfit,
        totalOutstanding: prev.totalOutstanding,
        totalRefunds: prev.totalRefunds,
        grossProfit: prev.grossProfit,
        changes: {
          totalRevenue: pctChange(summary.totalRevenue, prev.totalRevenue),
          totalExpenses: pctChange(summary.totalExpenses, prev.totalExpenses),
          netProfit: pctChange(summary.netProfit, prev.netProfit),
          totalOutstanding: pctChange(summary.totalOutstanding, prev.totalOutstanding),
        },
      }
    }

    res.json({ ...summary, comparison })
  } catch (err) {
    res.status(500).json({ error: 'Could not load finance summary.', detail: err.message })
  }
})

router.get('/budgets', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const budgets = await Budget.find()
    res.json({ budgets })
  } catch (err) {
    res.status(500).json({ error: 'Could not load budgets.', detail: err.message })
  }
})

router.put('/budgets', requireAuth, requireAdmin, async (req, res) => {
  try {
    const budget = await Budget.upsertByMonth(req.body || {})
    res.json({ ok: true, budget })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save budget.' })
  }
})

export default router
