import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                error: 'Email and password required'
            });
            return;
        }

        const user = await UserModel.findOne({ email: email.toLowerCase() });

        if (!user) {
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
            return;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
            return;
        }

        const token = generateToken({
            userId: user._id!.toString(),
            email: user.email,
            role: user.role
        });

        res.json({
            success: true,
            data: {
                token,
                user: {
                    email: user.email,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// POST /api/auth/register (for initial setup - should be disabled in production)
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, role = 'user' } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                error: 'Email and password required'
            });
            return;
        }

        // Check if user exists
        const existing = await UserModel.findOne({ email: email.toLowerCase() });
        if (existing) {
            res.status(409).json({
                success: false,
                error: 'User already exists'
            });
            return;
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        const user = await UserModel.create({
            email: email.toLowerCase(),
            passwordHash,
            role: role === 'admin' ? 'admin' : 'user',
            createdAt: new Date().toISOString()
        });

        res.status(201).json({
            success: true,
            data: {
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

export default router;
