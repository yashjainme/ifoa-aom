import cron from 'node-cron';
import { UpdateJobModel } from '../models/UpdateJob.js';
import { CountryModel } from '../models/Country.js';
import { CountryRunLogModel } from '../models/CountryRunLog.js';
import { generateCountrySummary } from '../services/llm.js';
import type { UpdateJob } from '../types/index.js';

// ============================================================
// CONFIGURATION - AIRAC ALIGNED
// ============================================================
const CONFIG = {
    // First run date (AIRAC aligned)
    FIRST_RUN: '2026-01-23T02:00:00',

    // Cycle interval in days
    CYCLE_DAYS: 28,

    // Batch processing
    BATCH_SIZE: 20,

    // Delays (in milliseconds)
    DELAY_BETWEEN_LLM_CALLS_MS: 60 * 1000,      // 1 minute between LLM calls
    DELAY_BETWEEN_BATCHES_MS: 2 * 60 * 1000,    // 2 minutes between batches

    // Skip recently updated
    SKIP_IF_UPDATED_WITHIN_MS: 24 * 60 * 60 * 1000,  // 24 hours

    // Retry configuration
    ERROR_THRESHOLD: 5,         // Number of failures to trigger retry
    MAX_RETRIES: 3,             // Maximum retry attempts per country
    RETRY_DELAY_MS: 30 * 60 * 1000,  // 30 minutes before retrying

    // Progress save interval
    SAVE_EVERY: 5
};

// Sleep helper
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Format duration
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
}

// Scheduler instance
let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Calculate next AIRAC run time
 */
function getNextAiracRun(): Date {
    const firstRun = new Date(CONFIG.FIRST_RUN);
    const now = new Date();

    if (now < firstRun) {
        return firstRun;
    }

    // Calculate cycles since first run
    const msSinceFirst = now.getTime() - firstRun.getTime();
    const cycleMs = CONFIG.CYCLE_DAYS * 24 * 60 * 60 * 1000;
    const cyclesSinceFirst = Math.floor(msSinceFirst / cycleMs);

    // Next run is one cycle after the last run
    const nextRun = new Date(firstRun.getTime() + (cyclesSinceFirst + 1) * cycleMs);
    return nextRun;
}

/**
 * Initialize and start the AIRAC-aligned scheduler
 */
export function startScheduler(): void {
    const nextRun = getNextAiracRun();

    console.log(`\n📅 AIRAC SCHEDULER CONFIGURATION`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`   First run: ${CONFIG.FIRST_RUN}`);
    console.log(`   Cycle: Every ${CONFIG.CYCLE_DAYS} days`);
    console.log(`   Next scheduled run: ${nextRun.toISOString()}`);
    console.log(`   Batch size: ${CONFIG.BATCH_SIZE} countries`);
    console.log(`   LLM delay: ${CONFIG.DELAY_BETWEEN_LLM_CALLS_MS / 1000}s`);
    console.log(`   Batch delay: ${CONFIG.DELAY_BETWEEN_BATCHES_MS / 1000}s`);
    console.log(`   Skip if updated within: ${CONFIG.SKIP_IF_UPDATED_WITHIN_MS / (60 * 60 * 1000)}h`);
    console.log(`   Error threshold: ${CONFIG.ERROR_THRESHOLD} failures → retry`);
    console.log(`   Max retries: ${CONFIG.MAX_RETRIES}`);
    console.log(`   Retry delay: ${CONFIG.RETRY_DELAY_MS / (60 * 1000)}min`);
    console.log(`${'─'.repeat(40)}\n`);

    // Run daily check at 2:00 AM to see if it's an AIRAC day
    scheduledTask = cron.schedule('0 2 * * *', async () => {
        const today = new Date();
        const nextAirac = getNextAiracRun();

        // Check if today is an AIRAC day (within 1 hour of scheduled time)
        const timeDiff = Math.abs(today.getTime() - nextAirac.getTime());
        if (timeDiff < 60 * 60 * 1000) {
            console.log('⏰ AIRAC scheduled run triggered');
            try {
                await runUpdateJob('scheduled');
            } catch (error) {
                console.error('Scheduled job failed:', error);
            }
        }
    });

    scheduledTask.start();
    console.log('✅ AIRAC Scheduler started');
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
 * Log a country run result to MongoDB
 */
async function logCountryRun(
    jobId: any,
    iso3: string,
    country: string,
    status: 'success' | 'failed' | 'skipped',
    retryCount: number,
    error?: string,
    duration?: number
): Promise<void> {
    try {
        await CountryRunLogModel.create({
            jobId,
            iso3,
            country,
            status,
            error,
            duration,
            retryCount,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error(`   ⚠️ Failed to log run for ${iso3}:`, err);
    }
}

/**
 * Process a single country with LLM
 */
async function processCountry(
    countryData: { iso3: string; country: string },
    jobId: any,
    retryCount: number = 1
): Promise<{ success: boolean; error?: string; duration: number }> {
    const startTime = Date.now();

    try {
        console.log(`   🔄 ${countryData.country} (${countryData.iso3})${retryCount > 1 ? ` [Retry ${retryCount}]` : ''}...`);

        // Generate summary using LLM
        const result = await generateCountrySummary(countryData.country, countryData.iso3, []);

        // Get existing country to preserve additional_notes
        const existingCountry = await CountryModel.findOne({ iso3: countryData.iso3 });
        const existingNotes = existingCountry?.summary?.additional_notes || [];

        // Merge LLM summary with preserved additional_notes
        const mergedSummary = {
            ...result.output.summary,
            additional_notes: existingNotes
        };

        // Save to MongoDB
        await CountryModel.findOneAndUpdate(
            { iso3: countryData.iso3 },
            {
                $set: {
                    summary: mergedSummary,
                    lastUpdated: new Date().toISOString(),
                    version: (Number(existingCountry?.version) || 0) + 1
                }
            },
            { upsert: true }
        );

        const duration = Date.now() - startTime;
        console.log(`   ✅ ${countryData.country}: Saved! (${formatDuration(duration)})`);

        // Log success
        await logCountryRun(jobId, countryData.iso3, countryData.country, 'success', retryCount, undefined, duration);

        return { success: true, duration };
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`   ❌ ${countryData.country}: Failed - ${errorMsg}`);

        // Log failure
        await logCountryRun(jobId, countryData.iso3, countryData.country, 'failed', retryCount, errorMsg, duration);

        return { success: false, error: errorMsg, duration };
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
    const isAllCountries = !specificCountry;

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
            // Single country mode - use old behavior (no batching/retry)
            const country = await CountryModel.findOne({ iso3: specificCountry }).lean() as any;
            if (!country) {
                throw new Error(`Country not found: ${specificCountry}`);
            }
            countriesToProcess = [{ iso3: country.iso3, country: country.country, lastUpdated: country.lastUpdated }];
            console.log(`📍 Processing single country: ${country.country} (${specificCountry})`);

            // Process single country directly
            const result = await processCountry(countriesToProcess[0], job._id, 1);
            if (result.success) {
                job.draftsCreated = 1;
            }

            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            await job.save();
            return job;
        }

        // All countries mode - full batch processing with retry
        const allCountries = await CountryModel.find().select('iso3 country lastUpdated').lean() as any[];
        countriesToProcess = allCountries.map(c => ({
            iso3: c.iso3,
            country: c.country,
            lastUpdated: c.lastUpdated
        }));
        console.log(`📊 Found ${countriesToProcess.length} countries to process`);

        // Filter out recently updated countries
        const now = Date.now();
        const toProcess: typeof countriesToProcess = [];
        const skipped: typeof countriesToProcess = [];

        for (const c of countriesToProcess) {
            if (c.lastUpdated) {
                const lastUpdate = new Date(c.lastUpdated).getTime();
                if (now - lastUpdate < CONFIG.SKIP_IF_UPDATED_WITHIN_MS) {
                    skipped.push(c);
                } else {
                    toProcess.push(c);
                }
            } else {
                toProcess.push(c);
            }
        }

        // Log skipped countries
        for (const s of skipped) {
            await logCountryRun(job._id, s.iso3, s.country, 'skipped', 0, 'Recently updated');
        }

        if (skipped.length > 0) {
            console.log(`⏭️ Skipping ${skipped.length} countries (updated within 24 hours)`);
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
        console.log(`   Countries to process: ${toProcess.length}`);
        console.log(`   Batch size: ${CONFIG.BATCH_SIZE}`);
        console.log(`   LLM delay: ${CONFIG.DELAY_BETWEEN_LLM_CALLS_MS / 1000}s`);
        console.log(`${'─'.repeat(40)}\n`);

        // Track results
        let processed = 0;
        let errors = 0;
        const failedCountries: Array<{ iso3: string; country: string; retryCount: number }> = [];

        // Process in batches
        for (let batchStart = 0; batchStart < toProcess.length; batchStart += CONFIG.BATCH_SIZE) {
            const batch = toProcess.slice(batchStart, batchStart + CONFIG.BATCH_SIZE);
            const batchNum = Math.floor(batchStart / CONFIG.BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(toProcess.length / CONFIG.BATCH_SIZE);

            console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} countries)`);

            for (let i = 0; i < batch.length; i++) {
                const countryData = batch[i];
                const result = await processCountry(countryData, job._id, 1);

                if (result.success) {
                    job.draftsCreated++;
                    processed++;
                } else {
                    errors++;
                    failedCountries.push({ ...countryData, retryCount: 1 });
                }

                // Save job progress periodically
                if ((processed + errors) % CONFIG.SAVE_EVERY === 0) {
                    await job.save();
                    console.log(`   💾 Progress saved (${processed + errors}/${toProcess.length})`);
                }

                // Rate limit between LLM calls
                if (i < batch.length - 1) {
                    await sleep(CONFIG.DELAY_BETWEEN_LLM_CALLS_MS);
                }
            }

            // Delay between batches
            if (batchStart + CONFIG.BATCH_SIZE < toProcess.length) {
                console.log(`   ⏳ Waiting ${CONFIG.DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
                await sleep(CONFIG.DELAY_BETWEEN_BATCHES_MS);
            }
        }

        // ============================================================
        // RETRY LOGIC
        // ============================================================
        if (failedCountries.length >= CONFIG.ERROR_THRESHOLD && failedCountries.length > 0) {
            console.log(`\n${'─'.repeat(40)}`);
            console.log(`🔄 RETRY MECHANISM TRIGGERED`);
            console.log(`   Failed: ${failedCountries.length} countries`);
            console.log(`   Waiting ${CONFIG.RETRY_DELAY_MS / (60 * 1000)} minutes before retry...`);
            console.log(`${'─'.repeat(40)}\n`);

            let retryQueue = [...failedCountries];

            for (let retryRound = 2; retryRound <= CONFIG.MAX_RETRIES && retryQueue.length > 0; retryRound++) {
                await sleep(CONFIG.RETRY_DELAY_MS);

                console.log(`\n🔁 Retry Round ${retryRound}/${CONFIG.MAX_RETRIES} (${retryQueue.length} countries)`);

                const stillFailing: typeof retryQueue = [];

                for (const countryData of retryQueue) {
                    const result = await processCountry(countryData, job._id, retryRound);

                    if (result.success) {
                        job.draftsCreated++;
                        processed++;
                        errors--;
                    } else {
                        stillFailing.push({ ...countryData, retryCount: retryRound });
                    }

                    // Rate limit
                    await sleep(CONFIG.DELAY_BETWEEN_LLM_CALLS_MS);
                }

                retryQueue = stillFailing;
                console.log(`   Retry round ${retryRound} complete: ${retryQueue.length} still failing`);
            }
        }

        // ============================================================
        // COMPLETION
        // ============================================================
        console.log(`\n📈 Processing complete: ${processed} succeeded, ${errors} failed, ${skipped.length} skipped`);

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        await job.save();

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ UPDATE JOB COMPLETED`);
        console.log(`   Job ID: ${job._id}`);
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

/**
 * Get scheduler status and next run info
 */
export function getSchedulerStatus(): {
    isRunning: boolean;
    nextRun: string;
    config: typeof CONFIG;
} {
    return {
        isRunning: scheduledTask !== null,
        nextRun: getNextAiracRun().toISOString(),
        config: CONFIG
    };
}
