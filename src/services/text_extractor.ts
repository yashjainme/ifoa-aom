import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';

/**
 * Extract text from PDF buffer
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
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
export function extractHtmlText(html: string): string {
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, header, footer, aside, .sidebar, .navigation, .menu').remove();

    // Get main content areas
    const contentSelectors = [
        'main',
        'article',
        '.content',
        '#content',
        '.main-content',
        '#main-content',
        '.post-content',
        '.entry-content'
    ];

    let text = '';

    for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
            text = element.text();
            break;
        }
    }

    // Fallback to body
    if (!text) {
        text = $('body').text();
    }

    // Clean up whitespace
    return cleanText(text);
}

/**
 * Extract text from plain text content
 */
export function extractPlainText(content: string): string {
    return cleanText(content);
}

/**
 * Clean and normalize extracted text
 */
export function cleanText(text: string): string {
    return text
        .replace(/[\t\f\v]+/g, ' ')       // Replace tabs with space
        .replace(/[ ]+/g, ' ')             // Collapse multiple spaces
        .replace(/\n\s*\n\s*\n+/g, '\n\n') // Max 2 newlines
        .replace(/^\s+|\s+$/gm, '')        // Trim each line
        .trim();
}

/**
 * Determine extractor based on content type and extract text
 */
export async function extractText(
    buffer: Buffer,
    contentType: string
): Promise<string> {
    const type = contentType.toLowerCase();

    if (type.includes('application/pdf')) {
        return extractPdfText(buffer);
    }

    if (type.includes('text/html')) {
        return extractHtmlText(buffer.toString('utf-8'));
    }

    if (type.includes('text/plain')) {
        return extractPlainText(buffer.toString('utf-8'));
    }

    // Default: try as plain text
    return extractPlainText(buffer.toString('utf-8'));
}
