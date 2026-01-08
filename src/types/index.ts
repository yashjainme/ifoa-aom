// Country document schema
export interface PrimaryContact {
    phone: string;
    email: string;
    website: string;
}

export interface AuthorityContact {
    name: string;
    role: string;
    phone: string;
    email: string;
    url: string;
}

export interface Reference {
    id: string;
    title: string;
    url: string;
    fetchedAt: string;
}

export interface CountrySummary {
    minimum_lead_time: string;
    icao_doc_url: string;
    state_rules_url: string;
    primary_contact: PrimaryContact;
    additional_notes: string[];
    status: string[];
    permit_and_conditions: string[];
    overflight_permits: string[];
    landing_permits: string[];
    israel_limitation: string[];
    key_extracts: string[];
    ops_notes: string[];
    ops_checklist: string[];
    authorities_contacts: AuthorityContact[];
    references: Reference[];
}

export interface Country {
    _id?: string;
    country: string;
    iso3: string;
    region: string;
    flagUrl?: string;
    requires_permit: boolean;
    embargo: boolean;
    lastUpdated: string;
    version: number;
    summary: CountrySummary;
}

// Source document schema
export interface Source {
    _id?: string;
    title: string;
    type: SourceType;
    url: string;
    countries: string[]; // ISO3 codes
    lastFetched: string;
    hash: string;
    extractedText?: string;
    status: 'active' | 'error' | 'pending';
}

export type SourceType =
    | 'ICAO_ANNEX_18'
    | 'ICAO_DOC_9284'
    | 'ICAO_STATE_VARIATIONS'
    | 'IATA_DGR'
    | 'UN_MODEL_REGULATIONS'
    | 'IATG'
    | 'AIP_GEN'
    | 'AIR_NAVIGATION_ORDER'
    | 'EXPORT_IMPORT_LAW'
    | 'CUSTOMS_REGS'
    | 'OPERATOR_MANUAL'
    | 'AIRPORT_MANUAL';

// AI Request document schema
export interface AiRequest {
    _id?: string;
    countryIso3: string;
    prompt: string;
    model: string;
    response: string;
    sourceIds: string[];
    status: 'draft' | 'verified' | 'rejected';
    reviewedBy?: string;
    reviewedAt?: string;
    createdAt: string;
}

// Update Job document schema
export interface UpdateJob {
    _id?: string;
    type: 'scheduled' | 'manual';
    triggeredBy?: string;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    sourcesChecked: number;
    sourcesChanged: number;
    draftsCreated: number;
    error?: string;
}

// User document schema
export interface User {
    _id?: string;
    email: string;
    passwordHash: string;
    role: 'admin' | 'user';
    createdAt: string;
}

// API response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// JWT payload
export interface JwtPayload {
    userId: string;
    email: string;
    role: 'admin' | 'user';
}

// LLM input/output types
export interface LlmInput {
    country: string;
    iso3: string;
    source_texts: string[];
    source_metadata: Array<{
        id: string;
        title: string;
        url: string;
        fetchedAt: string;
        hash: string;
    }>;
}

export interface LlmOutput {
    country: string;
    iso3: string;
    lastUpdated: string;
    summary: CountrySummary;
}

// Region enum
export const REGIONS = [
    'All Countries',
    'Africa & Indian Ocean',
    'Asia Pacific',
    'Europe',
    'Middle East',
    'NACC',
    'SAM'
] as const;

export type Region = typeof REGIONS[number];
