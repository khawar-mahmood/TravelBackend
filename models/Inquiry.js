import mongoose from 'mongoose'

export const STATUSES = ['new', 'in_process', 'complete', 'failed']

const inquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    service: { type: String, trim: true, default: '' },
    destination: { type: String, trim: true, default: '' },
    travelDate: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: 'website' },
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)

export default mongoose.model('Inquiry', inquirySchema)
