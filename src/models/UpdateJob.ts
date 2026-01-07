import mongoose, { Schema, Document } from 'mongoose';
import type { UpdateJob } from '../types/index.js';

const UpdateJobSchema = new Schema<UpdateJob & Document>({
    type: { type: String, enum: ['scheduled', 'manual'], required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: String, required: true },
    completedAt: { type: String },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    sourcesChecked: { type: Number, default: 0 },
    sourcesChanged: { type: Number, default: 0 },
    draftsCreated: { type: Number, default: 0 },
    error: { type: String }
}, {
    timestamps: true,
    collection: 'update_jobs'
});

// Indexes
UpdateJobSchema.index({ status: 1 });
UpdateJobSchema.index({ startedAt: -1 });

export const UpdateJobModel = mongoose.model<UpdateJob & Document>('UpdateJob', UpdateJobSchema);
