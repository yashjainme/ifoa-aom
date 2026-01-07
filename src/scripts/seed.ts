import mongoose from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

// Ireland sample data
const irelandData = {
    country: "Ireland",
    iso3: "IRL",
    region: "Europe",
    flagUrl: "https://flagcdn.com/w80/ie.png",
    requires_permit: true,
    embargo: false,
    lastUpdated: new Date().toISOString(),
    version: 1,
    summary: {
        status: [
            "⚠️ Carriage of munitions of war by air in/over Ireland requires prior written exemption from the Minister for Transport.",
            "🛂 Applies to all civil, state, diplomatic, and technical flights with AOW.",
            "📄 Legal baseline: Air Navigation (Carriage of Munitions of War) Order 1973."
        ],
        permit_and_conditions: [
            "📝 Application must be submitted to the MW Exemptions Unit at least 10 working days before the intended operation.",
            "📄 Required documents: Aircraft registration, AOC copy, cargo manifest, shipper's declaration.",
            "🛂 Permit is issued as a written exemption valid for the specific flight/route."
        ],
        israel_limitation: [
            "⚠️ Specific restrictions may apply to military material destined for regions under EU arms embargo [verify]."
        ],
        key_extracts: [
            "📄 SI 224/1973 Art. 3: 'No aircraft shall carry munitions of war over or into the State unless... an exemption in writing from the Minister.'"
        ],
        ops_notes: [
            "✈️ File permit request with MW Exemptions Unit concurrently with flight plan submission.",
            "📦 Cargo must be packaged in accordance with IATA DGR and ICAO TI."
        ],
        ops_checklist: [
            "✅ Verify cargo classification against Irish munitions control list",
            "✅ Submit MW Exemptions application ≥10 working days prior",
            "✅ Confirm permit receipt before dispatch",
            "✅ Carry permit copy on board aircraft"
        ],
        authorities_contacts: [
            {
                name: "Department of Transport - MW Exemptions Unit",
                role: "Primary authority for munitions exemptions",
                phone: "+353 1 670 7444",
                email: "exemptwm@transport.gov.ie",
                url: "https://www.gov.ie/en/organisation/department-of-transport/"
            }
        ],
        references: []
    }
};

// UK sample data
const ukData = {
    country: "United Kingdom",
    iso3: "GBR",
    region: "Europe",
    flagUrl: "https://flagcdn.com/w80/gb.png",
    requires_permit: true,
    embargo: false,
    lastUpdated: new Date().toISOString(),
    version: 1,
    summary: {
        status: [
            "⚠️ Carriage of munitions of war requires CAA authorization under the Air Navigation Order 2016.",
            "🛂 All AOW movements must comply with UK Strategic Export Control regulations."
        ],
        permit_and_conditions: [
            "📝 Apply to CAA Dangerous Goods Office minimum 5 working days in advance.",
            "📄 Export licenses from ECJU required for controlled goods."
        ],
        israel_limitation: [],
        key_extracts: [
            "📄 ANO 2016 Article 247: Permission required for carriage of munitions."
        ],
        ops_notes: [
            "✈️ Coordinate with handling agent for secure cargo handling.",
            "📦 All DG documentation must accompany shipment."
        ],
        ops_checklist: [
            "✅ Obtain CAA dangerous goods permission",
            "✅ Verify export license if applicable",
            "✅ Coordinate airport security notification"
        ],
        authorities_contacts: [
            {
                name: "CAA Dangerous Goods Office",
                role: "Aviation dangerous goods authority",
                phone: "+44 330 022 1500",
                email: "dgo@caa.co.uk",
                url: "https://www.caa.co.uk"
            }
        ],
        references: []
    }
};

// UAE sample data  
const uaeData = {
    country: "United Arab Emirates",
    iso3: "ARE",
    region: "Middle East",
    flagUrl: "https://flagcdn.com/w80/ae.png",
    requires_permit: true,
    embargo: false,
    lastUpdated: new Date().toISOString(),
    version: 1,
    summary: {
        status: [
            "⚠️ All munitions of war require GCAA and Ministry of Defence approval.",
            "🛂 Strict security vetting applies to all AOW shipments."
        ],
        permit_and_conditions: [
            "📝 Submit application through UAE GCAA portal minimum 15 days prior.",
            "📄 End-user certificate mandatory for all weapons shipments."
        ],
        israel_limitation: [
            "⚠️ Aircraft with Israeli markings or origin may face restrictions [verify]."
        ],
        key_extracts: [],
        ops_notes: [
            "✈️ Coordinate with Dubai Customs for pre-clearance.",
            "📦 Secure storage required at all UAE airports."
        ],
        ops_checklist: [
            "✅ Obtain GCAA approval",
            "✅ Ministry of Defence clearance",
            "✅ Pre-notify customs 48 hours before arrival"
        ],
        authorities_contacts: [
            {
                name: "UAE GCAA",
                role: "Civil aviation authority",
                phone: "+971 2 599 8888",
                email: "info@gcaa.gov.ae",
                url: "https://www.gcaa.gov.ae"
            }
        ],
        references: []
    }
};

// Sample sources with pre-extracted text (simulating what fetcher would produce)
const sampleSources = [
    {
        title: "Ireland AIP - Entry Requirements",
        type: "AIP_GEN",
        url: "https://www.iaa.ie/commercial-aviation/airworthiness/registration",
        countries: ["IRL"],
        status: "active",
        lastFetched: new Date().toISOString(),
        hash: "sample-hash-irl-001",
        extractedText: `
Ireland Aviation Regulations - Munitions of War

CARRIAGE OF DANGEROUS GOODS AND MUNITIONS OF WAR
All aircraft operating to/from/over Ireland carrying munitions of war, weapons, 
or dangerous goods must obtain prior written exemption from the Minister for Transport.

APPLICATION REQUIREMENTS:
- Submit application minimum 10 working days before intended operation
- Include aircraft registration certificate
- Provide cargo manifest with detailed descriptions
- Include shipper's declaration for dangerous goods
- End-user certificate where applicable

CONTACT:
MW Exemptions Unit
Department of Transport
Phone: +353 1 670 7444
Email: exemptwm@transport.gov.ie

Legal Reference: SI 224/1973 Air Navigation (Carriage of Munitions of War) Order
        `.trim()
    },
    {
        title: "UK CAA - Dangerous Goods Regulations",
        type: "AIR_NAVIGATION_ORDER",
        url: "https://www.caa.co.uk/commercial-industry/aircraft/operations/dangerous-goods/",
        countries: ["GBR"],
        status: "active",
        lastFetched: new Date().toISOString(),
        hash: "sample-hash-gbr-001",
        extractedText: `
UK CAA Dangerous Goods Regulations

MUNITIONS OF WAR CARRIAGE BY AIR
Aircraft operating to/from/within UK airspace carrying munitions of war 
require CAA Dangerous Goods Office authorization under ANO 2016.

PERMIT REQUIREMENTS:
- Apply minimum 5 working days in advance
- Export license from ECJU for controlled items
- Declare all dangerous goods per IATA DGR
- Coordinate with airport security

AUTHORITY CONTACTS:
CAA Dangerous Goods Office
Phone: +44 330 022 1500
Email: dgo@caa.co.uk
Website: www.caa.co.uk

Legal Reference: Air Navigation Order 2016, Article 247
        `.trim()
    },
    {
        title: "UAE GCAA Aviation Security Requirements",
        type: "AIP_GEN",
        url: "https://www.gcaa.gov.ae/en/eservices/pages/aip.aspx",
        countries: ["ARE"],
        status: "active",
        lastFetched: new Date().toISOString(),
        hash: "sample-hash-are-001",
        extractedText: `
UAE General Civil Aviation Authority - Security Requirements

MUNITIONS AND RESTRICTED ITEMS
All munitions of war require GCAA and Ministry of Defence approval
for import, export, transit, or overflight of UAE airspace.

APPLICATION PROCEDURE:
- Submit via GCAA online portal minimum 15 days prior
- Ministry of Defence security clearance required
- End-user certificate mandatory for weapons
- Pre-notify customs 48 hours before arrival

RESTRICTIONS:
- Aircraft with certain markings may face additional scrutiny
- Secure storage required at UAE airports
- Inspection may be required upon arrival

CONTACT:
UAE GCAA
Phone: +971 2 599 8888  
Email: info@gcaa.gov.ae
Website: www.gcaa.gov.ae
        `.trim()
    }
];

async function seedDatabase() {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        console.error('❌ MONGO_URI not set in environment');
        process.exit(1);
    }

    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected!\n');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        const countriesCollection = db.collection('countries');
        const sourcesCollection = db.collection('sources');

        // Seed countries
        console.log('📊 Seeding countries...');
        for (const country of [irelandData, ukData, uaeData]) {
            await countriesCollection.updateOne(
                { iso3: country.iso3 },
                { $set: country },
                { upsert: true }
            );
            console.log(`   ✅ ${country.country} (${country.iso3})`);
        }

        // Seed sources
        console.log('\n📄 Seeding sources...');
        for (const source of sampleSources) {
            await sourcesCollection.updateOne(
                { url: source.url },
                { $set: source },
                { upsert: true }
            );
            console.log(`   ✅ ${source.title}`);
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 SEED COMPLETE!');
        console.log('='.repeat(50));
        console.log(`   Countries: ${[irelandData, ukData, uaeData].length}`);
        console.log(`   Sources: ${sampleSources.length}`);
        console.log('\n📋 Next steps:');
        console.log('   1. Run backend: npm run dev');
        console.log('   2. Login as admin at http://localhost:5173/login');
        console.log('   3. Go to Jobs page and click "Run Now"');
        console.log('   4. The LLM will process the sources and create drafts');
        console.log('   5. Review drafts in the Review page\n');

    } catch (error) {
        console.error('❌ Seed failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

seedDatabase();
