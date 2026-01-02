import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { SourceModel } from '../models/Source.js';
import { AiRequestModel } from '../models/AiRequest.js';
import { UpdateJobModel } from '../models/UpdateJob.js';
import { CountryModel } from '../models/Country.js';
import { fetchAndExtractSource } from '../services/fetcher.js';
import { generateCountrySummary } from '../services/llm.js';
import { runUpdateJob } from '../jobs/scheduler.js';

const router = Router();

// All admin routes require authentication
router.use(authenticateToken);
router.use(requireAdmin);

// POST /api/ai/generate - Generate LLM draft for a country
router.post('/ai/generate', async (req: Request, res: Response) => {
    try {
        const { iso3 } = req.body;

        if (!iso3 || typeof iso3 !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'ISO3 country code required'
            });
        }

        // Get all sources for this country
        const sources = await SourceModel.find({
            countries: iso3.toUpperCase(),
            status: 'active',
            extractedText: { $exists: true, $ne: '' }
        }).lean();

        if (sources.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No active sources found for this country'
            });
        }

        // Get country details
        const country = await CountryModel.findOne({ iso3: iso3.toUpperCase() });
        const countryName = (country?.country as string) || iso3.toUpperCase();

        // Generate summary using LLM
        const result = await generateCountrySummary(
            countryName,
            iso3.toUpperCase(),
            sources
        );

        res.json({
            success: true,
            data: {
                aiRequestId: result.aiRequestId,
                draft: result.output.summary,
                sourcesUsed: sources.length
            }
        });
    } catch (error) {
        console.error('AI generate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate AI summary'
        });
    }
});

// POST /api/sources/fetch - Fetch and extract a single source
router.post('/sources/fetch', async (req: Request, res: Response) => {
    try {
        const { sourceId } = req.body;

        if (!sourceId) {
            return res.status(400).json({
                success: false,
                error: 'Source ID required'
            });
        }

        const source = await SourceModel.findById(sourceId);

        if (!source) {
            return res.status(404).json({
                success: false,
                error: 'Source not found'
            });
        }

        const result = await fetchAndExtractSource(source);

        res.json({
            success: true,
            data: {
                sourceId: source._id,
                title: source.title,
                changed: result.changed,
                hash: result.hash,
                textLength: result.text.length
            }
        });
    } catch (error) {
        console.error('Source fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch source'
        });
    }
});

// POST /api/updates/run - Trigger manual update job
// Body: { specificCountry?: 'ISO3' } - Process specific country or all countries
router.post('/updates/run', async (req: Request<{}, {}, { specificCountry?: string }>, res: Response) => {
    try {
        const userId = req.user?.userId;
        const specificCountry = req.body.specificCountry?.toUpperCase();

        // Check if there's already a running job
        const runningJob = await UpdateJobModel.findOne({ status: 'running' });
        if (runningJob) {
            return res.status(409).json({
                success: false,
                error: 'An update job is already running',
                jobId: runningJob._id
            });
        }

        console.log(`📋 Starting update job${specificCountry ? ` for ${specificCountry}` : ' for ALL countries'}...`);

        // Start the job (don't await - run in background)
        runUpdateJob('manual', userId, { specificCountry }).catch(err => {
            console.error('Background job error:', err);
        });

        res.json({
            success: true,
            message: specificCountry
                ? `Update job started for ${specificCountry}`
                : 'Update job started for all countries (skipping recently updated)',
            specificCountry: specificCountry || null
        });
    } catch (error) {
        console.error('Manual update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start update job'
        });
    }
});

// GET /api/update_jobs - List update job history
router.get('/update_jobs', async (req: Request, res: Response) => {
    try {
        const { limit = 20, skip = 0 } = req.query;

        const jobs = await UpdateJobModel.find()
            .sort({ startedAt: -1 })
            .skip(Number(skip))
            .limit(Number(limit))
            .lean();

        const total = await UpdateJobModel.countDocuments();

        res.json({
            success: true,
            data: jobs,
            pagination: {
                total,
                limit: Number(limit),
                skip: Number(skip)
            }
        });
    } catch (error) {
        console.error('Fetch update jobs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch update jobs'
        });
    }
});

// GET /api/sources - List all sources
router.get('/sources', async (req: Request, res: Response) => {
    try {
        const { status, type, country } = req.query;
        const query: Record<string, unknown> = {};

        if (status) query.status = status;
        if (type) query.type = type;
        if (country) query.countries = country;

        const sources = await SourceModel.find(query)
            .select('-extractedText') // Exclude large text field
            .sort({ title: 1 })
            .lean();

        res.json({
            success: true,
            data: sources,
            count: sources.length
        });
    } catch (error) {
        console.error('Fetch sources error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sources'
        });
    }
});

// GET /api/sources/:id - Get single source with text
router.get('/sources/:id', async (req: Request, res: Response) => {
    try {
        const source = await SourceModel.findById(req.params.id).lean();

        if (!source) {
            return res.status(404).json({
                success: false,
                error: 'Source not found'
            });
        }

        res.json({
            success: true,
            data: source
        });
    } catch (error) {
        console.error('Fetch source error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch source'
        });
    }
});

// ============================================================
// MANUAL SUMMARY EDITING
// ============================================================

// Validation helpers
function isValidUrl(str: string): boolean {
    if (!str || str.trim() === '') return true; // Empty is valid (optional)
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidEmail(str: string): boolean {
    if (!str || str.trim() === '') return true; // Empty is valid (optional)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
}

function isValidPhone(str: string): boolean {
    if (!str || str.trim() === '') return true; // Empty is valid (optional)
    // Allow digits, spaces, +, -, (), and . (common phone formats)
    const phoneRegex = /^[\d\s+\-().]+$/;
    return phoneRegex.test(str) && str.replace(/\D/g, '').length >= 6;
}

function validateSummary(summary: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!summary || typeof summary !== 'object') {
        return { valid: false, errors: ['Summary must be an object'] };
    }

    const s = summary as Record<string, unknown>;

    // Validate minimum_lead_time
    if (s.minimum_lead_time && typeof s.minimum_lead_time === 'string' && s.minimum_lead_time.length > 200) {
        errors.push('minimum_lead_time must be 200 characters or less');
    }

    // Validate URLs
    if (s.icao_doc_url && !isValidUrl(String(s.icao_doc_url))) {
        errors.push('icao_doc_url must be a valid URL (http:// or https://)');
    }
    if (s.state_rules_url && !isValidUrl(String(s.state_rules_url))) {
        errors.push('state_rules_url must be a valid URL (http:// or https://)');
    }

    // Validate primary_contact
    if (s.primary_contact && typeof s.primary_contact === 'object') {
        const pc = s.primary_contact as Record<string, unknown>;
        if (pc.email && !isValidEmail(String(pc.email))) {
            errors.push('primary_contact.email must be a valid email address');
        }
        if (pc.phone && !isValidPhone(String(pc.phone))) {
            errors.push('primary_contact.phone must be a valid phone number');
        }
        if (pc.website && !isValidUrl(String(pc.website))) {
            errors.push('primary_contact.website must be a valid URL');
        }
    }

    // Validate array sections
    const arraySections = [
        'status', 'permit_and_conditions', 'israel_limitation',
        'key_extracts', 'ops_notes', 'ops_checklist'
    ];

    for (const section of arraySections) {
        if (s[section]) {
            if (!Array.isArray(s[section])) {
                errors.push(`${section} must be an array`);
            } else {
                const arr = s[section] as unknown[];
                if (arr.length > 50) {
                    errors.push(`${section} must have 50 items or less`);
                }
                for (let i = 0; i < arr.length; i++) {
                    if (typeof arr[i] !== 'string') {
                        errors.push(`${section}[${i}] must be a string`);
                    } else if ((arr[i] as string).length > 1000) {
                        errors.push(`${section}[${i}] must be 1000 characters or less`);
                    }
                }
            }
        }
    }

    // Validate authorities_contacts
    if (s.authorities_contacts) {
        if (!Array.isArray(s.authorities_contacts)) {
            errors.push('authorities_contacts must be an array');
        } else {
            const contacts = s.authorities_contacts as unknown[];
            if (contacts.length > 20) {
                errors.push('authorities_contacts must have 20 items or less');
            }
            for (let i = 0; i < contacts.length; i++) {
                const c = contacts[i] as Record<string, unknown>;
                if (!c || typeof c !== 'object') {
                    errors.push(`authorities_contacts[${i}] must be an object`);
                    continue;
                }
                if (!c.name || typeof c.name !== 'string' || c.name.trim() === '') {
                    errors.push(`authorities_contacts[${i}].name is required`);
                }
                if (c.email && !isValidEmail(String(c.email))) {
                    errors.push(`authorities_contacts[${i}].email must be valid`);
                }
                if (c.url && !isValidUrl(String(c.url))) {
                    errors.push(`authorities_contacts[${i}].url must be valid`);
                }
            }
        }
    }

    // Validate references
    if (s.references) {
        if (!Array.isArray(s.references)) {
            errors.push('references must be an array');
        } else {
            const refs = s.references as unknown[];
            if (refs.length > 50) {
                errors.push('references must have 50 items or less');
            }
            for (let i = 0; i < refs.length; i++) {
                const r = refs[i] as Record<string, unknown>;
                if (!r || typeof r !== 'object') {
                    errors.push(`references[${i}] must be an object`);
                    continue;
                }
                if (!r.id || typeof r.id !== 'string') {
                    errors.push(`references[${i}].id is required`);
                }
                if (!r.title || typeof r.title !== 'string') {
                    errors.push(`references[${i}].title is required`);
                }
                if (!r.url || !isValidUrl(String(r.url))) {
                    errors.push(`references[${i}].url must be a valid URL`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// PUT /api/admin/countries/:iso3/summary - Manual edit country summary
router.put('/countries/:iso3/summary', async (req: Request, res: Response) => {
    try {
        const { iso3 } = req.params;
        const { summary } = req.body;
        const userId = req.user?.userId;

        if (!iso3) {
            return res.status(400).json({
                success: false,
                error: 'ISO3 country code required'
            });
        }

        if (!summary) {
            return res.status(400).json({
                success: false,
                error: 'Summary data required'
            });
        }

        // Validate summary format
        const validation = validateSummary(summary);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                validationErrors: validation.errors
            });
        }

        // Find the country
        const country = await CountryModel.findOne({ iso3: iso3.toUpperCase() });
        if (!country) {
            return res.status(404).json({
                success: false,
                error: 'Country not found'
            });
        }

        // Build sanitized summary
        const sanitizedSummary = {
            minimum_lead_time: String(summary.minimum_lead_time || '').trim(),
            icao_doc_url: String(summary.icao_doc_url || '').trim(),
            state_rules_url: String(summary.state_rules_url || '').trim(),
            primary_contact: {
                phone: String(summary.primary_contact?.phone || '').trim(),
                email: String(summary.primary_contact?.email || '').trim(),
                website: String(summary.primary_contact?.website || '').trim()
            },
            status: Array.isArray(summary.status) ? summary.status.map((s: unknown) => String(s).trim()) : [],
            permit_and_conditions: Array.isArray(summary.permit_and_conditions) ? summary.permit_and_conditions.map((s: unknown) => String(s).trim()) : [],
            israel_limitation: Array.isArray(summary.israel_limitation) ? summary.israel_limitation.map((s: unknown) => String(s).trim()) : [],
            key_extracts: Array.isArray(summary.key_extracts) ? summary.key_extracts.map((s: unknown) => String(s).trim()) : [],
            ops_notes: Array.isArray(summary.ops_notes) ? summary.ops_notes.map((s: unknown) => String(s).trim()) : [],
            ops_checklist: Array.isArray(summary.ops_checklist) ? summary.ops_checklist.map((s: unknown) => String(s).trim()) : [],
            authorities_contacts: Array.isArray(summary.authorities_contacts) ? summary.authorities_contacts.map((c: Record<string, unknown>) => ({
                name: String(c.name || '').trim(),
                role: String(c.role || '').trim(),
                phone: String(c.phone || '').trim(),
                email: String(c.email || '').trim(),
                url: String(c.url || '').trim()
            })) : [],
            references: Array.isArray(summary.references) ? summary.references.map((r: Record<string, unknown>) => ({
                id: String(r.id || `ref-${Date.now()}`).trim(),
                title: String(r.title || '').trim(),
                url: String(r.url || '').trim(),
                fetchedAt: String(r.fetchedAt || new Date().toISOString())
            })) : []
        };

        // Update the country
        await CountryModel.findOneAndUpdate(
            { iso3: iso3.toUpperCase() },
            {
                $set: {
                    summary: sanitizedSummary,
                    lastUpdated: new Date().toISOString(),
                    version: ((country.version as number) || 0) + 1
                }
            }
        );

        console.log(`✏️ Manual edit: ${country.country} (${iso3}) by user ${userId}`);

        res.json({
            success: true,
            data: {
                iso3: iso3.toUpperCase(),
                country: country.country,
                message: 'Summary updated successfully',
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Manual edit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update country summary'
        });
    }
});

// GET /api/admin/countries/:iso3 - Get country details for editing
router.get('/countries/:iso3', async (req: Request, res: Response) => {
    try {
        const { iso3 } = req.params;

        const country = await CountryModel.findOne({ iso3: iso3.toUpperCase() }).lean();

        if (!country) {
            return res.status(404).json({
                success: false,
                error: 'Country not found'
            });
        }

        res.json({
            success: true,
            data: country
        });
    } catch (error) {
        console.error('Get country error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get country'
        });
    }
});

export default router;