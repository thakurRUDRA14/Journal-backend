import { MoodType } from '../../generated/prisma/enums';
import { prisma } from '../lib/prisma';

export const moodRepository = {
    async create(data: { userId: string; mood: MoodType; reason?: string; entryDate: Date }) {
        return prisma.moodEntry.create({ data });
    },

    async findByUserId(userId: string) {
        return prisma.moodEntry.findMany({
            where: { userId },
        });
    },

    async findByUserIdAndDate(userId: string, entryDate: Date) {
        const startOfDay = new Date(entryDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(entryDate);
        endOfDay.setHours(23, 59, 59, 999);

        return prisma.moodEntry.findFirst({
            where: {
                userId,
                entryDate: { gte: startOfDay, lte: endOfDay },
            },
        });
    },
};
