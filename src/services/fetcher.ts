import axios from 'axios';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';
import { SourceModel } from '../models/Source.js';
import type { Source } from '../types/index.js';

export interface FetchResult {
    text: string;
    hash: string;
    changed: boolean;
}

/**
 * Compute SHA-256 hash of text content
 */
export function computeHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Extract text from PDF buffer
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        const data = await pdfParse(buffer);
        return data.text || '';
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error('Failed to extract text from PDF');
    }
}

/**
 * Extract text from HTML content
 */
function extractHtmlText(html: string): string {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, header, footer').remove();

    // Get main content
    const main = $('main, article, .content, #content, body').first();
    const text = main.text() || $('body').text();

    // Clean up whitespace
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

/**
 * Determine content type and extract text
 */
async function extractText(buffer: Buffer, contentType: string): Promise<string> {
    if (contentType.includes('application/pdf')) {
        return extractPdfText(buffer);
    }

    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
        return extractHtmlText(buffer.toString('utf-8'));
    }

    // Try as plain text
    return buffer.toString('utf-8');
}

/**
 * Fetch a source URL, extract text, compute hash, and update database
 * Options:
 *   - forceRefetch: If true, refetch even if extractedText already exists
 */
export async function fetchAndExtractSource(
    source: Source & { _id: unknown },
    options?: { forceRefetch?: boolean }
): Promise<FetchResult> {
    const forceRefetch = options?.forceRefetch ?? false;

    // If source already has extractedText and we're not forcing refetch, skip
    if (!forceRefetch && source.extractedText && source.extractedText.length > 0) {
        console.log(`   ⏭️ ${source.title}: Already has extracted text (${source.extractedText.length} chars)`);
        return {
            text: source.extractedText,
            hash: source.hash,
            changed: false
        };
    }

    try {
        console.log(`   📥 Fetching: ${source.url.substring(0, 50)}...`);

        // Fetch the resource
        const response = await axios.get(source.url, {
            responseType: 'arraybuffer',
            timeout: 60000, // 60 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            // Accept any 2xx or 3xx status
            validateStatus: (status) => status >= 200 && status < 400
        });

        const buffer = Buffer.from(response.data);
        const contentType = response.headers['content-type'] || 'text/html';

        // Extract text
        const text = await extractText(buffer, contentType);

        if (!text || text.length < 50) {
            console.warn(`   ⚠️ ${source.title}: Extracted text too short (${text.length} chars)`);
        }

        // Compute hash
        const hash = computeHash(text);

        // Check if content changed
        const changed = hash !== source.hash;

        // Update source document
        await SourceModel.findByIdAndUpdate(source._id, {
            $set: {
                extractedText: text,
                hash: hash,
                lastFetched: new Date().toISOString(),
                status: 'active'
            }
        });

        console.log(`   ✅ ${source.title}: ${changed ? 'CHANGED' : 'No change'} (${text.length} chars)`);
        return { text, hash, changed };
    } catch (error) {
        // Log error but don't crash
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ ${source.title}: Failed - ${errMsg}`);

        // Check if it's a 404 specifically
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.log(`      💡 Tip: URL returned 404. The source may have pre-populated text that can be used directly.`);

            // If the source already has extractedText, don't mark as error
            if (source.extractedText && source.extractedText.length > 0) {
                console.log(`      📄 Using existing extractedText (${source.extractedText.length} chars)`);
                return {
                    text: source.extractedText,
                    hash: source.hash,
                    changed: false
                };
            }
        }

        // Mark source as error only if we don't have existing text
        if (!source.extractedText || source.extractedText.length === 0) {
            await SourceModel.findByIdAndUpdate(source._id, {
                $set: {
                    status: 'error',
                    lastFetched: new Date().toISOString()
                }
            });
        }

        throw error;
    }
}

/**
 * Fetch all sources and check for changes
 */
export async function fetchAllSources(): Promise<{
    checked: number;
    changed: number;
    errors: number;
}> {
    const sources = await SourceModel.find({ status: { $ne: 'error' } });

    let checked = 0;
    let changed = 0;
    let errors = 0;

    for (const source of sources) {
        try {
            const result = await fetchAndExtractSource(source);
            checked++;
            if (result.changed) changed++;
        } catch {
            errors++;
        }
    }

    return { checked, changed, errors };
}

/**
 * Get aggregated source texts for a country
 */
export async function getSourceTextsForCountry(iso3: string): Promise<{
    texts: string[];
    metadata: Array<{
        id: string;
        title: string;
        url: string;
        fetchedAt: string;
        hash: string;
    }>;
}> {
    const sources = await SourceModel.find({
        countries: iso3.toUpperCase(),
        status: 'active',
        extractedText: { $exists: true, $ne: '' }
    }).lean();

    const texts = sources.map(s => s.extractedText || '');
    const metadata = sources.map(s => ({
        id: s._id?.toString() || '',
        title: s.title,
        url: s.url,
        fetchedAt: s.lastFetched || new Date().toISOString(),
        hash: s.hash
    }));

    return { texts, metadata };
}
