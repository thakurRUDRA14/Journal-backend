import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError, UploadError } from '../utils/errors';
import { MoodType } from '../../generated/prisma/enums';
import { moodService } from '../services/mood/mood.service';

const router = Router();

const createMoodSchema = z.object({
    mood: z.nativeEnum(MoodType),
    reason: z.string().optional(),
});

router.use(requireAuth());

// POST /api/v1/mood - Create today's entry with optional photo and audio
router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
        const parseResult = createMoodSchema.safeParse(req.body);

        if (!parseResult.success) {
            throw ValidationError.invalidInput(parseResult.error.flatten().fieldErrors);
        }

        const entry = await moodService.createEntry(req.user!.userId, {
            mood: parseResult.data.mood,
            reason: parseResult.data.reason
        });

        res.status(201).json(entry);
    })
);

// GET /api/v1/mood/me - Get all entries
router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response) => {
        const entry = await moodService.getAllEntries(req.user!.userId);
        res.status(200).json(entry);
    })
);

export { router as moodRouter };
