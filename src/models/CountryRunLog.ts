import mongoose, { Schema, Document } from 'mongoose';

export interface ICountryRunLog {
    jobId: mongoose.Types.ObjectId;
    iso3: string;
    country: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    duration?: number; // in milliseconds
    retryCount: number;
    timestamp: string;
}

const CountryRunLogSchema = new Schema<ICountryRunLog & Document>({
    jobId: { type: Schema.Types.ObjectId, ref: 'UpdateJob', required: true },
    iso3: { type: String, required: true },
    country: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
    error: { type: String },
    duration: { type: Number },
    retryCount: { type: Number, default: 1 },
    timestamp: { type: String, required: true }
}, {
    timestamps: true,
    collection: 'country_run_logs'
});

// Indexes for efficient querying
CountryRunLogSchema.index({ jobId: 1 });
CountryRunLogSchema.index({ iso3: 1 });
CountryRunLogSchema.index({ status: 1 });
CountryRunLogSchema.index({ timestamp: -1 });

export const CountryRunLogModel = mongoose.model<ICountryRunLog & Document>('CountryRunLog', CountryRunLogSchema);
