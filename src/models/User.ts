import mongoose, { Schema, Document } from 'mongoose';
import type { User } from '../types/index.js';

const UserSchema = new Schema<User & Document>({
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, {
    timestamps: true,
    collection: 'users'
});

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

export const UserModel = mongoose.model<User & Document>('User', UserSchema);
