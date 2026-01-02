/**
 * LLM Service - Generate country summaries using Google Gemini API with Google Search Grounding
 * OPTIMIZED VERSION with improved accuracy and reliability
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { SourceModel } from '../models/Source.js';
import { AiRequestModel } from '../models/AiRequest.js';

// TypeScript interfaces for the LLM output
interface PrimaryContact {
    phone: string;
    email: string;
    website: string;
}

interface AuthorityContact {
    name: string;
    role: string;
    phone: string;
    email: string;
    url: string;
}

interface Reference {
    id: string;
    title: string;
    url: string;
    fetchedAt: string;
}

interface CountrySummary {
    minimum_lead_time: string;
    icao_doc_url: string;
    state_rules_url: string;
    primary_contact: PrimaryContact;
    status: string[];
    permit_and_conditions: string[];
    israel_limitation: string[];
    key_extracts: string[];
    ops_notes: string[];
    ops_checklist: string[];
    authorities_contacts: AuthorityContact[];
    references: Reference[];
}

interface LlmOutput {
    country: string;
    iso3: string;
    lastUpdated: string;
    summary: CountrySummary;
}

// Streamlined prompt with clearer structure and expectations
const GROUNDING_PROMPT = `You are compiling operational intelligence for aviation cargo operators. Your task is to produce a factual regulatory brief for the carriage, transit, import, export, and overflight of munitions of war (weapons, ammunition, explosives, military material) by air.

RESEARCH PROTOCOL:
Search official sources in this priority order:
1. Country's AIP (Aeronautical Information Publication) - especially GEN 1.2, 1.4, 1.6
2. Civil Aviation Authority website and contact directories
3. National dangerous goods transport regulations
4. ICAO compliance documentation
5. EUROCONTROL AIS Online for European countries

Focus your search on: permit requirements, lead times, contact information, specific restrictions, and Israel-related policies.

WRITING REQUIREMENTS:
- Direct operational language for flight operations personnel
- Specific facts with regulation numbers, timeframes, fees, contact details
- No hedging ("may", "might", "could") - state requirements definitively
- No corporate tone or obvious disclaimers
- Complete actionable statements, not fragments
- Natural varied phrasing - avoid repetitive structures
- Include real processing times and practical operational context

OUTPUT FORMAT (Return ONLY valid JSON with no markdown):
{
  "country": "<COUNTRY_NAME>",
  "iso3": "<ISO3_CODE>",
  "lastUpdated": "<current ISO timestamp>",
  "summary": {
    "minimum_lead_time": "<MUST include numeric timeframe. Examples: '5-7 working days', '2-3 weeks (verify with authority)', '10 business days minimum'. Never just 'varies' or 'contact authority'. Max 10 words.>",
    "icao_doc_url": "<Direct URL to ICAO Doc 9284 or relevant compliance page>",
    "state_rules_url": "<Direct URL to AIP GEN section or national regulations>",
    "primary_contact": {
      "phone": "<Direct line with country code from AIP GEN 1.2/1.4>",
      "email": "<Operational contact email from official sources>",
      "website": "<Authority website URL>"
    },
    "status": [
      "-> Prior authorization required from [specific authority]. Submit to [department/email]",
      "-> Permits valid for [duration] and are [route-specific/multi-use]. Processing via [method]",
      "-> Active restrictions: [Specific limitations with dates, or 'Standard ICAO procedures apply']"
    ],
    "permit_and_conditions": [
      "-> Application requirements: [Specific documents]. Submit to [email/portal] with [lead time]",
      "-> Operator must hold [license type] from [authority]. Fee: [amount if known]",
      "-> Insurance: [Minimum coverage amount and regulation reference]",
      "-> Processing time: [Specific timeframe]. Expedited options: [if available]",
      "-> Ground handling: [Certified handler requirements and advance notice period]"
    ],
    "israel_limitation": [
      "-> [Specific policy on Israel-origin/destination cargo, or 'No specific restrictions identified']",
      "-> Overflight restrictions: [Routing requirements for Israel flights, or 'Standard rules apply']",
      "-> Israeli-registered aircraft: [Special requirements, or 'Treated as foreign-registered']"
    ],
    "key_extracts": [
      "-> [Law/Regulation name, Article number]: [Plain language requirement]",
      "-> AIP [code] GEN [section]: [Specific operational requirement]",
      "-> [Regulation] Article [X]: [Key compliance point]",
      "-> Chicago Convention implementation: [Country's specific approach]"
    ],
    "ops_notes": [
      "-> Required documents: [List]. Originals required at [checkpoint]",
      "-> Customs filing: Use [system/form] by [timeframe before arrival]",
      "-> Ground handling: [Security zones, parking positions, fueling restrictions]",
      "-> Common delays: [Typical issues, peak periods, infrastructure considerations]"
    ],
    "ops_checklist": [
      "[_] Permit application submitted [timeframe] before flight - receipt confirmed",
      "[_] End-user certificate authenticated by [authority] - original in aircraft docs",
      "[_] Insurance certificate references [regulation] - coverage verified",
      "[_] Ground handler confirmed and notified [timeframe] in advance",
      "[_] Crew briefed on [country-specific requirements] - documented in flight folder"
    ],
    "authorities_contacts": [
      {
        "name": "<Official department name>",
        "role": "<Function: e.g., 'Dangerous Goods Approvals', 'Overflight Permits'>",
        "phone": "<Direct line with country code and extension>",
        "email": "<Functional email from AIP or official website>",
        "url": "<Direct link to department page>"
      }
    ],
    "references": [
      {
        "id": "ref-1",
        "title": "<Exact regulation/AIP section title>",
        "url": "<Direct URL>",
        "fetchedAt": "<current timestamp>"
      }
    ]
  }
}

CRITICAL VALIDATION RULES:
1. minimum_lead_time MUST contain numbers (days/weeks) - estimate if exact unknown
2. Every bullet point must have specific actionable information - no placeholders
3. Use "->" prefix for all bullet points
4. If information unverified, include it with [verify] tag but never leave sections empty
5. All URLs must be real from search results - no placeholders
6. primary_contact must be the permit office from AIP GEN 1.2/1.4
7. operational_guidance combines procedures, checklists, and practical notes
8. Include at least 2 authority contacts if available (permits office + operations/customs)
9. Cite specific AIP sections and regulation articles with exact titles
10. Vary sentence structure - avoid formulaic repetition

Generate the brief for:`;

/**
 * Build the full prompt
 */
function buildPrompt(country: string, iso3: string): string {
    return `${GROUNDING_PROMPT}\nCountry: ${country}\nISO3 Code: ${iso3}`;
}

/**
 * Call Gemini API with optimized settings for accuracy
 */
async function callGeminiApi(prompt: string): Promise<string> {
    const apiKey = process.env.LLM_API_KEY;

    if (!apiKey) {
        throw new Error('LLM_API_KEY environment variable not set. Get your key from https://aistudio.google.com/app/apikey');
    }

    // Use Gemini 2.0 Flash Thinking for better reasoning, or Pro for complex cases
    const modelName = process.env.LLM_MODEL || 'gemini-2.0-flash-thinking-exp-1219';

    console.log(`   🤖 Calling Gemini API with Google Search Grounding...`);
    console.log(`   📍 Model: ${modelName}`);
    console.log(`   ⏱️ Starting API call at ${new Date().toISOString()}`);

    // Extended timeout for thinking models - 2 minutes
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API call timed out after 120 seconds')), 120000);
    });

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Optimized generation config for accuracy
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.2, // Lower for more consistent, factual output
                topP: 0.8,
                topK: 30,
                maxOutputTokens: 16384, // Doubled from 8192 for complete responses
            },
            // Enable Google Search grounding with dynamic retrieval
            tools: [{
                googleSearch: {}
            }] as any
        });

        console.log(`   📡 Sending request to Gemini...`);
        const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise
        ]);

        console.log(`   📨 Got response from Gemini`);
        const response = result.response;
        const text = response.text();
        console.log(`   📝 Response: ${text}`);

        if (!text) {
            throw new Error('Empty response from Gemini API');
        }

        // Enhanced grounding metadata logging
        const candidate = response.candidates?.[0];
        if (candidate?.groundingMetadata) {
            const gm = candidate.groundingMetadata as any;
            if (gm.webSearchQueries) {
                console.log(`   🔍 Search queries executed: ${gm.webSearchQueries.length}`);
                console.log(`   📝 Sample queries: ${gm.webSearchQueries.slice(0, 3).join(', ')}`);
            }
            if (gm.groundingChunks) {
                console.log(`   📚 Grounding sources used: ${gm.groundingChunks.length}`);
            }
            if (gm.groundingSupport) {
                console.log(`   ✓ Grounding confidence: High`);
            }
        }

        console.log(`   ✅ Response received (${text.length} characters)`);
        return text;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Gemini API Error: ${errMsg}`);
        throw error;
    }
}

/**
 * Enhanced JSON parsing with better recovery
 */
function parseResponse(response: string): LlmOutput {
    let jsonStr = response;

    // Remove markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    }

    // Extract JSON object
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    // Clean up common JSON issues
    jsonStr = jsonStr
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}')
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .replace(/"\s*\+\s*"/g, '')
        .trim();

    try {
        const parsed = JSON.parse(jsonStr);

        if (!parsed.country || !parsed.iso3 || !parsed.summary) {
            throw new Error('Missing required fields in LLM response');
        }

        // Helper functions for data sanitization
        const ensureArray = (val: unknown): string[] =>
            Array.isArray(val) ? val.map(v => String(v).trim()).filter(Boolean) : [];

        const ensureContactArray = (val: unknown): AuthorityContact[] => {
            if (!Array.isArray(val)) return [];
            return val.filter(c => c && typeof c === 'object').map(c => ({
                name: String(c.name || '').trim(),
                role: String(c.role || '').trim(),
                phone: String(c.phone || '').trim(),
                email: String(c.email || '').trim(),
                url: String(c.url || '').trim()
            })).filter(c => c.name || c.email || c.phone); // Keep only contacts with some data
        };

        const ensureRefArray = (val: unknown): Reference[] => {
            if (!Array.isArray(val)) return [];
            return val.filter(r => r && typeof r === 'object').map((r, idx) => ({
                id: String(r.id || `ref-${idx + 1}`),
                title: String(r.title || '').trim(),
                url: String(r.url || '').trim(),
                fetchedAt: String(r.fetchedAt || new Date().toISOString())
            })).filter(r => r.title && r.url); // Keep only valid references
        };

        const ensurePrimaryContact = (val: unknown): PrimaryContact => {
            if (!val || typeof val !== 'object') {
                return { phone: '', email: '', website: '' };
            }
            const c = val as Record<string, unknown>;
            return {
                phone: String(c.phone || '').trim(),
                email: String(c.email || '').trim(),
                website: String(c.website || '').trim()
            };
        };

        const summary = parsed.summary;
        
        const result: LlmOutput = {
            country: String(parsed.country).trim(),
            iso3: String(parsed.iso3).toUpperCase().trim(),
            lastUpdated: String(parsed.lastUpdated || new Date().toISOString()),
            summary: {
                minimum_lead_time: String(summary.minimum_lead_time || '').trim(),
                icao_doc_url: String(summary.icao_doc_url || '').trim(),
                state_rules_url: String(summary.state_rules_url || '').trim(),
                primary_contact: ensurePrimaryContact(summary.primary_contact),
                status: ensureArray(summary.status),
                permit_and_conditions: ensureArray(summary.permit_and_conditions),
                israel_limitation: ensureArray(summary.israel_limitation),
                key_extracts: ensureArray(summary.key_extracts),
                ops_notes: ensureArray(summary.ops_notes),
                ops_checklist: ensureArray(summary.ops_checklist),
                authorities_contacts: ensureContactArray(summary.authorities_contacts),
                references: ensureRefArray(summary.references)
            }
        };

        // Validation warnings
        if (!result.summary.minimum_lead_time.match(/\d/)) {
            console.warn('   ⚠️ Warning: minimum_lead_time missing numeric value');
        }
        if (result.summary.status.length === 0) {
            console.warn('   ⚠️ Warning: No status information found');
        }
        if (result.summary.authorities_contacts.length === 0) {
            console.warn('   ⚠️ Warning: No authority contacts found');
        }

        console.log(`   ✅ Parsed successfully`);
        console.log(`   📋 Lead Time: ${result.summary.minimum_lead_time || '(missing)'}`);
        console.log(`   📞 Contact: ${result.summary.primary_contact.email || result.summary.primary_contact.phone || '(missing)'}`);
        console.log(`   📚 References: ${result.summary.references.length}`);
        console.log(`   👥 Contacts: ${result.summary.authorities_contacts.length}`);
        
        return result;
    } catch (error) {
        console.error('   ❌ Initial parse failed, attempting recovery...');

        try {
            const recoveredJson = attemptJsonRecovery(jsonStr);
            const parsed = JSON.parse(recoveredJson);

            const recoveredResult: LlmOutput = {
                country: String(parsed.country || 'Unknown'),
                iso3: String(parsed.iso3 || 'UNK').toUpperCase(),
                lastUpdated: new Date().toISOString(),
                summary: {
                    minimum_lead_time: String(parsed.summary?.minimum_lead_time || '2-4 weeks (verify with authority)'),
                    icao_doc_url: String(parsed.summary?.icao_doc_url || ''),
                    state_rules_url: String(parsed.summary?.state_rules_url || ''),
                    primary_contact: {
                        phone: String(parsed.summary?.primary_contact?.phone || ''),
                        email: String(parsed.summary?.primary_contact?.email || ''),
                        website: String(parsed.summary?.primary_contact?.website || '')
                    },
                    status: Array.isArray(parsed.summary?.status) ? parsed.summary.status : [],
                    permit_and_conditions: Array.isArray(parsed.summary?.permit_and_conditions) ? parsed.summary.permit_and_conditions : [],
                    israel_limitation: Array.isArray(parsed.summary?.israel_limitation) ? parsed.summary.israel_limitation : [],
                    key_extracts: Array.isArray(parsed.summary?.key_extracts) ? parsed.summary.key_extracts : [],
                    ops_notes: Array.isArray(parsed.summary?.ops_notes) ? parsed.summary.ops_notes : [],
                    ops_checklist: Array.isArray(parsed.summary?.ops_checklist) ? parsed.summary.ops_checklist : [],
                    authorities_contacts: [],
                    references: []
                }
            };

            console.log('   🔧 JSON recovered with partial data');
            return recoveredResult;
        } catch {
            console.error('   ❌ JSON recovery failed');
            console.error('   Raw response preview:', response.substring(0, 500));
            throw new Error('Invalid JSON response from LLM - parsing failed completely');
        }
    }
}

/**
 * Enhanced JSON recovery with better bracket balancing
 */
function attemptJsonRecovery(jsonStr: string): string {
    let recovered = jsonStr;
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let lastValidPos = 0;
    let escapeNext = false;

    for (let i = 0; i < recovered.length; i++) {
        const char = recovered[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            escapeNext = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
        }

        if (!inString) {
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;

            if (openBraces >= 0 && openBrackets >= 0) {
                lastValidPos = i;
            }
        }
    }

    // Truncate and close
    if (openBraces !== 0 || openBrackets !== 0 || inString) {
        recovered = recovered.substring(0, lastValidPos + 1);

        if (inString) {
            recovered += '"';
        }

        while (openBrackets > 0) {
            recovered += ']';
            openBrackets--;
        }
        while (openBraces > 0) {
            recovered += '}';
            openBraces--;
        }
    }

    return recovered
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}')
        .replace(/\n\s*\n/g, '\n');
}

/**
 * Generate country summary with improved accuracy
 */
export async function generateCountrySummary(
    country: string,
    iso3: string,
    sources: Array<{
        _id?: unknown;
        title: string;
        url: string;
        extractedText?: string;
        lastFetched?: string;
        hash?: string;
    }> = []
): Promise<{
    output: LlmOutput;
    aiRequestId: string;
}> {
    const prompt = buildPrompt(country, iso3);

    console.log(`\n🔄 Generating summary for ${country} (${iso3})...`);
    console.log(`   🌐 Using Google Search Grounding for real-time regulatory data`);
    console.log(`   🎯 Enhanced accuracy mode enabled`);

    const aiRequest = await AiRequestModel.create({
        countryIso3: iso3,
        prompt: prompt.substring(0, 10000),
        model: process.env.LLM_MODEL || 'gemini-2.0-flash-thinking-exp-1219',
        sourceIds: sources.map(s => s._id).filter(Boolean),
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    try {
        const rawResponse = await callGeminiApi(prompt);
        const output = parseResponse(rawResponse);

        await AiRequestModel.findByIdAndUpdate(aiRequest._id, {
            $set: {
                response: rawResponse,
                status: 'draft'
            }
        });

        console.log(`   ✅ Summary generated successfully for ${country}`);
        console.log(`   📊 Quality metrics: ${output.summary.references.length} refs, ${output.summary.authorities_contacts.length} contacts`);

        return {
            output,
            aiRequestId: aiRequest._id.toString()
        };
    } catch (error) {
        await AiRequestModel.findByIdAndUpdate(aiRequest._id, {
            $set: {
                response: error instanceof Error ? error.message : 'Unknown error',
                status: 'rejected'
            }
        });
        throw error;
    }
}

/**
 * Get sources for a country (optional with grounding)
 */
export async function getSourcesForCountry(iso3: string) {
    return SourceModel.find({
        countries: iso3.toUpperCase(),
        status: 'active',
        extractedText: { $exists: true, $ne: '' }
    }).lean();
}