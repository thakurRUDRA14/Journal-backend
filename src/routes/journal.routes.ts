import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { journalService } from '../services/journal';
import { requireAuth } from '../middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

const router = Router();

// Setup multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'journal');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const userId = (req as Request & { user?: { userId: string } }).user?.userId ?? 'unknown';
        const ext = path.extname(file.originalname);
        cb(null, `${userId}-${Date.now()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    },
});

const createJournalSchema = z.object({
    content: z.string().min(1, 'Content is required'),
});

router.use(requireAuth());

// POST /api/v1/journal - Create today's entry with optional photo and audio
router.post(
    '/',
    upload.single('media'),
    asyncHandler(async (req: Request, res: Response) => {
        const parseResult = createJournalSchema.safeParse(req.body);
        if (!parseResult.success) {
            throw ValidationError.invalidInput(parseResult.error.flatten().fieldErrors);
        }

        const photoUrl = req.file ? `/uploads/journal/photo/${req.file.filename}` : undefined;
        const audioUrl = req.file ? `/uploads/journal/audio/${req.file.filename}` : undefined;

        const entry = await journalService.createEntry(req.user!.userId, {
            content: parseResult.data.content,
            photoUrl,
            audioUrl
        });

        res.status(201).json(entry);
    })
);

// GET /api/v1/journal/me - Get all entries
router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response) => {
        const entry = await journalService.getAllEntries(req.user!.userId);
        res.status(200).json(entry);
    })
);

export { router as journalRouter };
