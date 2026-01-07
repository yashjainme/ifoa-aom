import mongoose, { Schema, Document } from 'mongoose';
import type { Source, SourceType } from '../types/index.js';

const SOURCE_TYPES: SourceType[] = [
    'ICAO_ANNEX_18',
    'ICAO_DOC_9284',
    'ICAO_STATE_VARIATIONS',
    'IATA_DGR',
    'UN_MODEL_REGULATIONS',
    'IATG',
    'AIP_GEN',
    'AIR_NAVIGATION_ORDER',
    'EXPORT_IMPORT_LAW',
    'CUSTOMS_REGS',
    'OPERATOR_MANUAL',
    'AIRPORT_MANUAL'
];

const SourceSchema = new Schema<Source & Document>({
    title: { type: String, required: true },
    type: { type: String, required: true, enum: SOURCE_TYPES },
    url: { type: String, required: true },
    countries: [{ type: String, uppercase: true }], // ISO3 codes
    lastFetched: { type: String },
    hash: { type: String, default: '' },
    extractedText: { type: String },
    status: { type: String, enum: ['active', 'error', 'pending'], default: 'pending' }
}, {
    timestamps: true,
    collection: 'sources'
});

// Indexes
SourceSchema.index({ countries: 1 });
SourceSchema.index({ type: 1 });
SourceSchema.index({ status: 1 });

export const SourceModel = mongoose.model<Source & Document>('Source', SourceSchema);
