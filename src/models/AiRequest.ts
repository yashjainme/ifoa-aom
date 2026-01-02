import mongoose, { Schema, HydratedDocument } from 'mongoose';

// Schema definition without type parameter to avoid conflicts
const AiRequestSchema = new Schema({
    countryIso3: { type: String, required: true, uppercase: true },
    prompt: { type: String, required: true },
    model: { type: String, default: 'gemini-2.0-flash' }, // Not required - set default
    response: { type: String, default: '' }, // Not required - filled after LLM call
    sourceIds: [{ type: Schema.Types.ObjectId, ref: 'Source' }],
    status: { type: String, enum: ['draft', 'verified', 'rejected', 'pending'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: String },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, {
    timestamps: true,
    collection: 'ai_requests'
});

// Indexes
AiRequestSchema.index({ countryIso3: 1 });
AiRequestSchema.index({ status: 1 });
AiRequestSchema.index({ createdAt: -1 });

// Infer the document type from the schema
type AiRequestDoc = {
    countryIso3: string;
    prompt: string;
    model: string;
    response: string;
    sourceIds: mongoose.Types.ObjectId[];
    status: 'draft' | 'verified' | 'rejected';
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: string;
    createdAt: string;
};

export type AiRequestDocument = HydratedDocument<AiRequestDoc>;
export const AiRequestModel = mongoose.model('AiRequest', AiRequestSchema);
