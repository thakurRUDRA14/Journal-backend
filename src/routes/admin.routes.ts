import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';
import { questionService } from '../services/question';

const router = Router();

// Validation schemas
const createQuestionSetSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: 'Invalid date format',
    }),
    questions: z
        .array(
            z.object({
                text: z.string().min(1, 'Question text is required'),
                order: z.number().int().min(0).max(6),
            })
        )
        .length(7, 'Exactly 7 questions are required'),
});

// Apply auth and admin middleware to all routes
router.use(requireAuth());
router.use(requireAdmin());

// POST /api/v1/admin/question - Create new question set
router.post(
    '/question',
    asyncHandler(async (req: Request, res: Response) => {
        const parseResult = createQuestionSetSchema.safeParse(req.body);
        if (!parseResult.success) {
            throw ValidationError.invalidInput(parseResult.error.flatten().fieldErrors);
        }

        const questionSet = await questionService.createQuestionSet(parseResult.data);
        res.status(201).json(questionSet);
    })
);

// GET /api/v1/admin/question/sets - List all question sets
router.get(
    '/question/sets',
    asyncHandler(async (_req: Request, res: Response) => {
        const questionSets = await questionService.getQuestionSets();
        res.status(200).json(questionSets);
    })
);

export { router as adminRouter };
