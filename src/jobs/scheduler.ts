import cron from 'node-cron';
import { UpdateJobModel } from '../models/UpdateJob.js';
import { CountryModel } from '../models/Country.js';
import { generateCountrySummary } from '../services/llm.js';
import type { UpdateJob } from '../types/index.js';

// Configuration
const BATCH_SIZE = 20; // Process 20 countries per batch
const SAVE_EVERY = 2; // Save to DB after every 2 countries
const DELAY_BETWEEN_LLM_CALLS_MS = 5000; // 5 second delay between LLM calls
const DELAY_BETWEEN_BATCHES_MS = 15000; // 15 second delay between batches
const SKIP_IF_UPDATED_WITHIN_MS = 10 * 24 * 60 * 60 * 1000; // Skip if updated within 10 days

// Parse scheduler interval (e.g., "28d", "7d", "1h")
function parseInterval(interval: string): string {
    const match = interval.match(/^(\d+)([dhm])$/);
    if (!match) {
        console.warn(`Invalid interval "${interval}", defaulting to 28 days`);
        return '0 0 */28 * *';
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 'd':
            return `0 0 */${value} * *`;
        case 'h':
            return `0 */${value} * * *`;
        case 'm':
            return `*/${value} * * * *`;
        default:
            return '0 0 */28 * *';
    }
}

// Sleep helper
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Scheduler instance
let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Initialize and start the scheduler
 */
export function startScheduler(): void {
    const interval = process.env.SCHEDULER_INTERVAL || '28d';
    const cronExpression = parseInterval(interval);

    console.log(`📅 Scheduler configured with interval: ${interval} (cron: ${cronExpression})`);

    scheduledTask = cron.schedule(cronExpression, async () => {
        console.log('⏰ Scheduled job triggered');
        try {
            await runUpdateJob('scheduled');
        } catch (error) {
            console.error('Scheduled job failed:', error);
        }
    });

    scheduledTask.start();
    console.log('✅ Scheduler started');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log('⏹️ Scheduler stopped');
    }
}

/**
 * Run an update job for ALL countries or a SPECIFIC country
 * @param type - 'scheduled' or 'manual'
 * @param triggeredBy - User ID who triggered the job
 * @param options - { specificCountry?: string } - ISO3 code of specific country to process
 */
export async function runUpdateJob(
    type: 'scheduled' | 'manual',
    triggeredBy?: string,
    options?: { specificCountry?: string }
): Promise<UpdateJob> {
    const specificCountry = options?.specificCountry?.toUpperCase();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 STARTING UPDATE JOB (${type}${specificCountry ? ` - ${specificCountry} only` : ' - ALL COUNTRIES'})`);
    console.log(`${'='.repeat(60)}\n`);

    // Create job record
    const job = await UpdateJobModel.create({
        type,
        triggeredBy,
        startedAt: new Date().toISOString(),
        status: 'running',
        sourcesChecked: 0,
        sourcesChanged: 0,
        draftsCreated: 0
    });

    try {
        // Get countries to process
        let countriesToProcess: Array<{ iso3: string; country: string; lastUpdated?: string }>;

        if (specificCountry) {
            // Single country mode
            const country = await CountryModel.findOne({ iso3: specificCountry }).lean() as any;
            if (!country) {
                throw new Error(`Country not found: ${specificCountry}`);
            }
            countriesToProcess = [{ iso3: country.iso3, country: country.country, lastUpdated: country.lastUpdated }];
            console.log(`📍 Processing single country: ${country.country} (${specificCountry})`);
        } else {
            // All countries mode
            const allCountries = await CountryModel.find().select('iso3 country lastUpdated').lean() as any[];
            countriesToProcess = allCountries.map(c => ({
                iso3: c.iso3,
                country: c.country,
                lastUpdated: c.lastUpdated
            }));
            console.log(`📊 Found ${countriesToProcess.length} countries to process`);
        }

        // Filter out recently updated countries (unless specific country requested)
        const now = Date.now();
        const toProcess: typeof countriesToProcess = [];
        const skipped: string[] = [];

        for (const c of countriesToProcess) {
            if (specificCountry) {
                // Always process specific country
                toProcess.push(c);
            } else if (c.lastUpdated) {
                const lastUpdate = new Date(c.lastUpdated).getTime();
                if (now - lastUpdate < SKIP_IF_UPDATED_WITHIN_MS) {
                    skipped.push(c.iso3);
                } else {
                    toProcess.push(c);
                }
            } else {
                toProcess.push(c);
            }
        }

        if (skipped.length > 0) {
            console.log(`⏭️ Skipping ${skipped.length} countries (updated within 15 minutes)`);
        }

        if (toProcess.length === 0) {
            console.log('\n✅ No countries need processing - all recently updated!');
            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            await job.save();
            return job;
        }

        console.log(`\n${'─'.repeat(40)}`);
        console.log(`🤖 GENERATING LLM SUMMARIES`);
        console.log(`   Batch size: ${BATCH_SIZE}, Save every: ${SAVE_EVERY}`);
        console.log(`${'─'.repeat(40)}\n`);

        // Process in batches
        let processed = 0;
        let errors = 0;

        for (let batchStart = 0; batchStart < toProcess.length; batchStart += BATCH_SIZE) {
            const batch = toProcess.slice(batchStart, batchStart + BATCH_SIZE);
            const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

            console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} countries)`);

            for (let i = 0; i < batch.length; i++) {
                const countryData = batch[i];

                try {
                    console.log(`   🔄 ${countryData.country} (${countryData.iso3})...`);

                    // Generate summary using LLM with Google Search grounding
                    const result = await generateCountrySummary(countryData.country, countryData.iso3, []);

                    // Save to MongoDB
                    await CountryModel.findOneAndUpdate(
                        { iso3: countryData.iso3 },
                        {
                            $set: {
                                summary: result.output.summary,
                                lastUpdated: new Date().toISOString(),
                                version: (await CountryModel.findOne({ iso3: countryData.iso3 }))?.version || 0 + 1
                            }
                        },
                        { upsert: true }
                    );

                    job.draftsCreated++;
                    processed++;
                    console.log(`   ✅ ${countryData.country}: Saved!`);

                    // Save job progress every SAVE_EVERY countries
                    if (processed % SAVE_EVERY === 0) {
                        await job.save();
                        console.log(`   💾 Progress saved (${processed}/${toProcess.length})`);
                    }

                    // Rate limit between LLM calls
                    if (i < batch.length - 1) {
                        await sleep(DELAY_BETWEEN_LLM_CALLS_MS);
                    }
                } catch (error) {
                    console.error(`   ❌ ${countryData.country}: Failed - ${error}`);
                    errors++;
                }
            }

            // Delay between batches
            if (batchStart + BATCH_SIZE < toProcess.length) {
                console.log(`   ⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
                await sleep(DELAY_BETWEEN_BATCHES_MS);
            }
        }

        console.log(`\n📈 Processing complete: ${processed} succeeded, ${errors} failed`);

        // Mark job as completed
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        await job.save();

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ UPDATE JOB COMPLETED`);
        console.log(`   Countries processed: ${processed}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   Skipped (recently updated): ${skipped.length}`);
        console.log(`${'='.repeat(60)}\n`);

        return job;
    } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date().toISOString();
        await job.save();

        console.error(`\n❌ UPDATE JOB FAILED: ${job.error}\n`);
        throw error;
    }
}
