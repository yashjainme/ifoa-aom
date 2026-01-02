import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { startScheduler } from './jobs/scheduler.js';
import countriesRouter from './routes/countries.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5173',
        'http://localhost:5173'
    ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Routes - ORDER MATTERS: auth must come before admin (which has auth middleware)
app.use('/api/auth', authRouter);  // Public auth routes (login, register)
app.use('/api', countriesRouter);  // Public country data routes
app.use('/api', adminRouter);      // Protected admin routes

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
    try {
        await connectDB();
        console.log('✅ MongoDB connected');

        startScheduler();
        console.log('✅ Scheduler initialized');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();

export default app;
