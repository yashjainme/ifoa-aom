/**
 * Seed Users - Create test admin and regular users
 * Run: npm run seed:users
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { UserModel } from '../models/User.js';

config();

// Test users to create
const SEED_USERS = [
    // Admin users
    {
        email: 'admin@aow.com',
        password: 'Admin@123',
        role: 'admin'
    },
    {
        email: 'superadmin@aow.com',
        password: 'SuperAdmin@123',
        role: 'admin'
    },
    // Regular users
    {
        email: 'user1@test.com',
        password: 'User@123',
        role: 'user'
    },
    {
        email: 'user2@test.com',
        password: 'User@123',
        role: 'user'
    },
    {
        email: 'demo@aow.com',
        password: 'Demo@123',
        role: 'user'
    }
];

async function seedUsers() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/aow';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // First, update all existing users without a role to be 'admin'
        const updateResult = await UserModel.updateMany(
            { role: { $exists: false } },
            { $set: { role: 'admin' } }
        );
        if (updateResult.modifiedCount > 0) {
            console.log(`📝 Updated ${updateResult.modifiedCount} existing users to 'admin' role`);
        }

        // Also update any 'viewer' roles to 'user'
        const viewerUpdate = await UserModel.updateMany(
            { role: 'viewer' },
            { $set: { role: 'user' } }
        );
        if (viewerUpdate.modifiedCount > 0) {
            console.log(`📝 Updated ${viewerUpdate.modifiedCount} 'viewer' users to 'user' role`);
        }

        let created = 0;
        let skipped = 0;

        for (const userData of SEED_USERS) {
            const existing = await UserModel.findOne({ email: userData.email });

            if (existing) {
                console.log(`   ⏭️ ${userData.email}: Already exists`);
                skipped++;
            } else {
                const passwordHash = await bcrypt.hash(userData.password, 10);
                await UserModel.create({
                    email: userData.email,
                    passwordHash,
                    role: userData.role,
                    createdAt: new Date().toISOString()
                });
                console.log(`   ✅ ${userData.email}: Created (${userData.role})`);
                created++;
            }
        }

        console.log(`\n📊 Seed Results:`);
        console.log(`   Created: ${created}`);
        console.log(`   Skipped: ${skipped}`);

        // Show all users
        const allUsers = await UserModel.find().select('email role').lean();
        console.log(`\n👥 All Users (${allUsers.length}):`);
        allUsers.forEach(u => {
            console.log(`   ${u.email} - ${u.role}`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Seed complete!');
    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    }
}

seedUsers();
