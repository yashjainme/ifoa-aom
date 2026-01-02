import mongoose, { Schema, HydratedDocument } from 'mongoose';
import type { Country, CountrySummary, AuthorityContact, Reference } from '../types/index.js';

const AuthorityContactSchema = new Schema<AuthorityContact>({
    name: { type: String, required: true },
    role: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    url: { type: String, default: '' }
}, { _id: false });

const ReferenceSchema = new Schema<Reference>({
    id: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    fetchedAt: { type: String, required: true }
}, { _id: false });

const PrimaryContactSchema = new Schema({
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' }
}, { _id: false });

const CountrySummarySchema = new Schema<CountrySummary>({
    minimum_lead_time: { type: String, default: '' },
    icao_doc_url: { type: String, default: '' },
    state_rules_url: { type: String, default: '' },
    primary_contact: { type: PrimaryContactSchema, default: () => ({}) },
    status: [{ type: String }],
    permit_and_conditions: [{ type: String }],
    israel_limitation: [{ type: String }],
    key_extracts: [{ type: String }],
    ops_notes: [{ type: String }],
    ops_checklist: [{ type: String }],
    authorities_contacts: [AuthorityContactSchema],
    references: [ReferenceSchema]
}, { _id: false });

const CountrySchema = new Schema({
    country: { type: String, required: true },
    iso3: { type: String, required: true, unique: true, uppercase: true },
    region: { type: String, required: true },
    flagUrl: { type: String },
    requires_permit: { type: Boolean, default: false },
    embargo: { type: Boolean, default: false },
    lastUpdated: { type: String, required: true },
    version: { type: Number, default: 1 },
    summary: { type: CountrySummarySchema, required: true }
}, {
    timestamps: true,
    collection: 'countries'
});

// Indexes
CountrySchema.index({ region: 1 });
CountrySchema.index({ country: 'text' });
CountrySchema.index({ requires_permit: 1 });
CountrySchema.index({ embargo: 1 });

export type CountryDocument = HydratedDocument<Country>;
export const CountryModel = mongoose.model('Country', CountrySchema);
