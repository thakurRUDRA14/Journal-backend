import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { authRouter, journalRouter, moodRouter, questionRouter, adminRouter } from './routes';
import { AppError } from './utils/errors';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/journal', journalRouter);
app.use('/api/v1/mood', moodRouter);
app.use('/api/v1/questions', questionRouter);
app.use('/api/v1/admin', adminRouter);

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();

    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            ...err.toJSON(),
            requestId,
            timestamp: new Date().toISOString(),
        });
        return;
    }

    console.error('Unexpected error:', err);
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        },
        requestId,
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;
