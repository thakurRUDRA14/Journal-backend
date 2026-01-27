import { prisma } from '../lib/prisma';
import type { Plan, Role } from '../../generated/prisma/enums';

export interface UserData {
    id: string;
    email: string;
    passwordHash: string;
    role: Role;
    plan: Plan;
    trialEndsAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateUserInput {
    email: string;
    passwordHash: string;
    role?: Role;
    plan?: Plan;
    trialEndsAt?: Date;
}

/**
 * Checks if a role is admin
 */
export function isAdmin(role: Role): boolean {
    return role === 'ADMIN';
}

/**
 * User repository for managing users in the database
 */
export const userRepository = {
    /**
     * Creates a new user
     */
    async create(input: CreateUserInput): Promise<UserData> {
        const user = await prisma.user.create({
            data: {
                email: input.email.toLowerCase(),
                passwordHash: input.passwordHash,
                role: input.role,
                plan: input.plan,
                trialEndsAt: input.trialEndsAt,
            },
        });

        return user;
    },

    /**
     * Finds a user by ID
     */
    async findById(userId: string): Promise<UserData | null> {
        return prisma.user.findUnique({
            where: { id: userId },
        });
    },

    /**
     * Finds a user by email
     */
    async findByEmail(email: string): Promise<UserData | null> {
        return prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });
    },

    /**
     * Finds an admin user by email
     */
    async findAdminByEmail(email: string): Promise<UserData | null> {
        return prisma.user.findFirst({
            where: {
                email: email.toLowerCase(),
                role: 'ADMIN',
            },
        });
    },

    /**
     * Updates a user
     */
    async update(userId: string, data: Partial<Omit<UserData, 'id' | 'createdAt'>>): Promise<UserData> {
        return prisma.user.update({
            where: { id: userId },
            data,
        });
    },

    /**
     * Checks if a user has premium access (active trial or premium plan)
     */
    async hasPremiumAccess(userId: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user || !user.isActive) return false;

        // Admins always have premium access
        if (user.role === 'ADMIN') return true;

        // Premium plan always has access
        if (user.plan === 'PREMIUM') return true;

        // Trial plan has access if trial hasn't expired
        if (user.plan === 'TRIAL' && user.trialEndsAt) {
            return user.trialEndsAt > new Date();
        }

        return false;
    },

    /**
     * Gets remaining trial days for a user
     */
    async getRemainingTrialDays(userId: string): Promise<number> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user || !user.trialEndsAt) return 0;

        const now = new Date();
        if (user.trialEndsAt <= now) return 0;

        const diffMs = user.trialEndsAt.getTime() - now.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    },

    /**
     * Checks if a user exists by email
     */
    async existsByEmail(email: string): Promise<boolean> {
        const count = await prisma.user.count({
            where: { email: email.toLowerCase() },
        });
        return count > 0;
    },

    /**
     * Checks if a user is an admin
     */
    async isUserAdmin(userId: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        return user?.role === 'ADMIN';
    },
};
