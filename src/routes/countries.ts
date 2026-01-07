import { Router, Request, Response } from 'express';
import { CountryModel } from '../models/Country.js';
import { REGIONS } from '../types/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All country routes require authentication
router.use(authenticateToken);

// GET /api/regions - List all regions
router.get('/regions', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: REGIONS
    });
});

// GET /api/countries - List countries with optional filters
router.get('/countries', async (req: Request, res: Response) => {
    try {
        const { region, search, requires_permit, embargo } = req.query;

        // Build query
        const query: Record<string, unknown> = {};

        if (region && region !== 'All Countries') {
            query.region = region;
        }

        if (search && typeof search === 'string') {
            // Fuzzy search on country name
            query.country = { $regex: search, $options: 'i' };
        }

        if (requires_permit === 'true') {
            query.requires_permit = true;
        }

        if (embargo === 'true') {
            query.embargo = true;
        }

        const countries = await CountryModel.find(query)
            .select('country iso3 region flagUrl requires_permit embargo lastUpdated summary')
            .sort({ country: 1 })
            .lean();

        // Add hasSummary and isComplete fields
        // hasSummary = has ops_notes (determines if country has ANY data)
        // isComplete = has ops_notes AND authorities_contacts AND references
        const countriesWithSummaryStatus = countries.map(c => {
            const hasOpsNotes = !!(c.summary && c.summary.ops_notes && c.summary.ops_notes.length > 0);
            const hasAuthorities = !!(c.summary && c.summary.authorities_contacts && c.summary.authorities_contacts.length > 0);
            const hasReferences = !!(c.summary && c.summary.references && c.summary.references.length > 0);

            return {
                _id: c._id,
                country: c.country,
                iso3: c.iso3,
                region: c.region,
                flagUrl: c.flagUrl,
                requires_permit: c.requires_permit,
                embargo: c.embargo,
                lastUpdated: c.lastUpdated,
                hasSummary: hasOpsNotes,
                isComplete: hasOpsNotes && hasAuthorities && hasReferences
            };
        });

        res.json({
            success: true,
            data: countriesWithSummaryStatus,
            count: countriesWithSummaryStatus.length
        });
    } catch (error) {
        console.error('Error fetching countries:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch countries'
        });
    }
});

// GET /api/country/:iso3 - Get single country with full details
router.get('/country/:iso3', async (req: Request, res: Response) => {
    try {
        const { iso3 } = req.params;

        if (!iso3 || iso3.length !== 3) {
            res.status(400).json({
                success: false,
                error: 'Invalid ISO3 code'
            });
            return;
        }

        const country = await CountryModel.findOne({
            iso3: iso3.toUpperCase()
        }).lean();

        if (!country) {
            res.status(404).json({
                success: false,
                error: 'Country not found'
            });
            return;
        }

        res.json({
            success: true,
            data: country
        });
    } catch (error) {
        console.error('Error fetching country:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch country'
        });
    }
});

export default router;
