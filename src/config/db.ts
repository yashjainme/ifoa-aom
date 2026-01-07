import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        throw new Error('MONGO_URI environment variable is not set');
    }

    try {
        await mongoose.connect(uri);

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
        });

    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}

export function getDB() {
    return mongoose.connection.db;
}
