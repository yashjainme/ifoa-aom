import mongoose from 'mongoose';
import { config } from 'dotenv';
import { CountryModel } from '../models/Country.js';

config();

async function checkCountries() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/aow';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check specific countries
    const toCheck = ['FRA', 'NOR', 'GRL'];

    for (const iso3 of toCheck) {
        const country = await CountryModel.findOne({ iso3 });
        if (country) {
            console.log(`✅ ${iso3}: ${country.country} (${country.region})`);
        } else {
            console.log(`❌ ${iso3}: NOT FOUND`);
        }
    }

    // Count by ISO3 pattern
    const europeCount = await CountryModel.countDocuments({ region: 'Europe' });
    console.log(`\nEurope count: ${europeCount}`);

    // List all Europe countries
    const europeCountries = await CountryModel.find({ region: 'Europe' }).select('country iso3').sort({ country: 1 });
    console.log('\nEurope countries:');
    europeCountries.forEach(c => console.log(`  - ${c.country} (${c.iso3})`));

    await mongoose.disconnect();
}

checkCountries();
