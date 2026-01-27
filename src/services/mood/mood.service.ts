import { MoodType } from '../../../generated/prisma/enums';
import { ConflictError } from '../../utils/errors';
import { moodRepository } from '../../repositories/mood.repository';

export interface CreateMoodInput {
    mood: MoodType;
    reason?: string;
}

export const moodService = {
    async createEntry(userId: string, input: CreateMoodInput) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if entry already exists for today
        const existing = await moodRepository.findByUserIdAndDate(userId, today);
        if (existing) {
            throw ConflictError.moodEntryExists(today);
        }

        return moodRepository.create({
            userId,
            mood: input.mood,
            reason: input.reason,
            entryDate: today,
        });
    },

    async getAllEntries(userId: string) {
        return moodRepository.findByUserId(userId);
    },
};
