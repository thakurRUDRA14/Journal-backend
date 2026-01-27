import { prisma } from '../lib/prisma';

export interface PaginationOptions {
    limit: number;
    offset: number;
}

export interface CreateAnswerData {
    userId: string;
    questionId: string;
    answer: string;
    answerDate: Date;
}

export const questionRepository = {
    /**
     * Find the active question set (most recent startDate <= today)
     * Requirements: 5.1 - Select QuestionSet with most recent startDate not in future
     */
    async findActiveQuestionSet() {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        return prisma.questionSet.findFirst({
            where: {
                startDate: { lte: today },
            },
            orderBy: {
                startDate: 'desc',
            },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                },
            },
        });
    },

    /**
     * Find question by set and order
     * Requirements: 1.2 - Select question based on day of week mapping to order 0-6
     */
    async findQuestionBySetAndOrder(questionSetId: string, order: number) {
        return prisma.question.findUnique({
            where: {
                questionSetId_order: {
                    questionSetId,
                    order,
                },
            },
        });
    },

    /**
     * Find user's answer for a specific date
     * Requirements: 2.1, 2.2 - Check if user already answered today
     */
    async findAnswerByUserAndDate(userId: string, date: Date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        return prisma.questionAnswer.findFirst({
            where: {
                userId,
                answerDate: { gte: startOfDay, lte: endOfDay },
            },
            include: {
                question: true,
            },
        });
    },

    /**
     * Create a new answer
     * Requirements: 2.1, 2.2 - Create QuestionAnswer record
     */
    async createAnswer(data: CreateAnswerData) {
        return prisma.questionAnswer.create({
            data,
            include: {
                question: true,
            },
        });
    },

    /**
     * Find all answers for a user with pagination
     * Requirements: 3.1 - Return paginated list of past answers
     */
    async findAnswersByUser(userId: string, options: PaginationOptions) {
        return prisma.questionAnswer.findMany({
            where: { userId },
            orderBy: { answerDate: 'desc' },
            skip: options.offset,
            take: options.limit,
            include: {
                question: true,
            },
        });
    },

    /**
     * Count answers for a user
     * Requirements: 3.1 - For pagination total count
     */
    async countAnswersByUser(userId: string) {
        return prisma.questionAnswer.count({
            where: { userId },
        });
    },
};
