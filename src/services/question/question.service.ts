import { questionRepository } from '../../repositories/question.repository';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { startOfDay } from '../../utils/date';

export interface DailyQuestionResponse {
    id: string;
    text: string;
    hasAnswered: boolean;
    answer?: {
        id: string;
        text: string;
        answeredAt: string;
    };
}

export interface QuestionAnswerResponse {
    id: string;
    answer: string;
    answeredAt: string;
}

export interface AnswerHistoryItem {
    id: string;
    answer: string;
    answerDate: string;
    question: {
        id: string;
        text: string;
    };
}

export interface PaginatedAnswerHistory {
    items: AnswerHistoryItem[];
    total: number;
    limit: number;
    offset: number;
}

export interface PaginationOptions {
    limit?: number;
    offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function getDayOfWeekOrder(date: Date): number {
    return date.getDay();
}

function normalizePaginationOptions(options?: PaginationOptions): { limit: number; offset: number } {
    const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options?.offset ?? 0;
    return { limit: Math.max(1, limit), offset: Math.max(0, offset) };
}

export const questionService = {
    async getDailyQuestion(userId: string): Promise<DailyQuestionResponse> {
        const today = new Date();

        // Find the active question set
        const activeSet = await questionRepository.findActiveQuestionSet();

        if (!activeSet) {
            throw new NotFoundError(
                'No active question set available',
                'NO_ACTIVE_QUESTION_SET'
            );
        }

        // Get the question order based on day of week
        const questionOrder = getDayOfWeekOrder(today);

        // Find the question for today
        const question = await questionRepository.findQuestionBySetAndOrder(
            activeSet.id,
            questionOrder
        );

        if (!question) {
            throw new NotFoundError(
                'Question not found for today',
                'NO_ACTIVE_QUESTION_SET'
            );
        }

        // Check if user has already answered today
        const existingAnswer = await questionRepository.findAnswerByUserAndDate(userId, today);

        const response: DailyQuestionResponse = {
            id: question.id,
            text: question.text,
            hasAnswered: !!existingAnswer,
        };

        // Include answer if user has already answered
        if (existingAnswer) {
            response.answer = {
                id: existingAnswer.id,
                text: existingAnswer.answer,
                answeredAt: existingAnswer.createdAt.toISOString(),
            };
        }

        return response;
    },

    async submitAnswer(userId: string, answer: string): Promise<QuestionAnswerResponse> {
        // Validate answer is not empty or whitespace-only
        if (!answer || answer.trim().length === 0) {
            throw new ValidationError(
                'Answer cannot be empty or whitespace-only',
                'INVALID_ANSWER'
            );
        }

        const today = new Date();
        const todayStart = startOfDay(today);

        // Check if user already answered today
        const existingAnswer = await questionRepository.findAnswerByUserAndDate(userId, today);
        if (existingAnswer) {
            throw new ConflictError(
                'You have already answered today\'s question',
                'ALREADY_ANSWERED_TODAY',
                { date: todayStart.toISOString() }
            );
        }

        // Get the active question set and today's question
        const activeSet = await questionRepository.findActiveQuestionSet();
        if (!activeSet) {
            throw new NotFoundError(
                'No active question set available',
                'NO_ACTIVE_QUESTION_SET'
            );
        }

        const questionOrder = getDayOfWeekOrder(today);
        const question = await questionRepository.findQuestionBySetAndOrder(
            activeSet.id,
            questionOrder
        );

        if (!question) {
            throw new NotFoundError(
                'Question not found for today',
                'NO_ACTIVE_QUESTION_SET'
            );
        }

        // Create the answer
        const createdAnswer = await questionRepository.createAnswer({
            userId,
            questionId: question.id,
            answer: answer.trim(),
            answerDate: todayStart,
        });

        return {
            id: createdAnswer.id,
            answer: createdAnswer.answer,
            answeredAt: createdAnswer.createdAt.toISOString(),
        };
    },

    async getAnswerHistory(
        userId: string,
        options?: PaginationOptions
    ): Promise<PaginatedAnswerHistory> {
        const { limit, offset } = normalizePaginationOptions(options);

        const [answers, total] = await Promise.all([
            questionRepository.findAnswersByUser(userId, { limit, offset }),
            questionRepository.countAnswersByUser(userId),
        ]);

        const items: AnswerHistoryItem[] = answers.map((answer) => ({
            id: answer.id,
            answer: answer.answer,
            answerDate: answer.answerDate.toISOString(),
            question: {
                id: answer.question.id,
                text: answer.question.text,
            },
        }));

        return {
            items,
            total,
            limit,
            offset,
        };
    },
};
