import Inquiry from '../models/Inquiry.js'
import Invoice from '../models/Invoice.js'

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

export async function syncInquiryFromInvoices(inquiryId) {
  const id = String(inquiryId || '').trim()
  if (!id) return null

  const inquiry = await Inquiry.findById(id)
  if (!inquiry) return null

  const invoices = await Invoice.find({ inquiryId: id })
  const invoiced = money(invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0))
  const totalPayment = money(Math.max(Number(inquiry.totalPayment || 0), invoiced))
  const updates = {
    initialPayment: invoiced,
    totalPayment,
  }

  if (invoiced > 0 && (!inquiry.paymentStatus || inquiry.paymentStatus === 'unpaid')) {
    updates.paymentStatus = 'deposit_paid'
  }

  return Inquiry.findByIdAndUpdate(id, updates)
}
