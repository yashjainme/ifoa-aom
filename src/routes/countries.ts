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
            .select('country iso3 region flagUrl requires_permit embargo lastUpdated')
            .sort({ country: 1 })
            .lean();

        res.json({
            success: true,
            data: countries,
            count: countries.length
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
