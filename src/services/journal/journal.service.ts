import { journalRepository } from '../../repositories';
import { ConflictError } from '../../utils/errors';

export interface CreateJournalInput {
    content: string;
    photoUrl?: string;
    audioUrl?: string;
}

export const journalService = {
    async createEntry(userId: string, input: CreateJournalInput) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if entry already exists for today
        const existing = await journalRepository.findByUserIdAndDate(userId, today);
        if (existing) {
            throw ConflictError.journalEntryExists(today);
        }

        return journalRepository.create({
            userId,
            content: input.content,
            photoUrl: input.photoUrl,
            audioUrl: input.audioUrl,
            entryDate: today,
        });
    },

    async getAllEntries(userId: string) {
        return journalRepository.findByUserId(userId);
    },
};
