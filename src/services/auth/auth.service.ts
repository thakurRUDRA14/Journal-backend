import bcrypt from 'bcrypt';
import {
    generateAccessToken,
    generateRefreshToken,
    validateRefreshToken,
    hashRefreshToken,
    verifyRefreshTokenHash,
    getRefreshTokenExpiresIn,
    getAccessTokenExpiresIn,
} from './token.utils';
import { sessionRepository } from '../../repositories/session.repository';
import { userRepository } from '../../repositories/user.repository';
import { AuthError, ConflictError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import type { TokenPair, LoginCredentials, PremiumStatus, TrialInfo } from '../../types';

const SALT_ROUNDS = 10;
const TRIAL_DURATION_DAYS = parseInt(process.env.TRIAL_DURATION_DAYS ?? '21', 10);

export interface SignupInput {
    email: string;
    password: string;
    termsAccepted: boolean;
    privacyAccepted: boolean;
    recordingAccepted: boolean;
}

/**
 * Authentication service for user login, logout, and token management
 */
export const authService = {
    /**
     * Registers a new user with consent
     * Returns access and refresh token pair
     */
    async signup(input: SignupInput): Promise<TokenPair> {
        const { email, password, termsAccepted, privacyAccepted, recordingAccepted } = input;

        // Check if user already exists
        const existingUser = await userRepository.findByEmail(email);
        if (existingUser) {
            throw new ConflictError('User with this email already exists', 'USER_ALREADY_EXISTS');
        }

        // Validate consent
        if (!termsAccepted || !privacyAccepted || !recordingAccepted) {
            throw new AuthError('Terms and privacy policy must be accepted', 'AUTH_CONSENT_REQUIRED');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Calculate trial end date
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

        // Create user and consent in a transaction
        const user = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email: email.toLowerCase(),
                    passwordHash,
                    role: 'USER',
                    plan: 'TRIAL',
                    trialEndsAt,
                },
            });

            await tx.consent.create({
                data: {
                    userId: newUser.id,
                    termsAccepted,
                    privacyAccepted,
                    recordingAccepted
                },
            });

            return newUser;
        });

        // Generate tokens
        const refreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: '',
        });

        const expiresAt = new Date(Date.now() + getRefreshTokenExpiresIn() * 1000);

        // Create session
        const session = await sessionRepository.create({
            userId: user.id,
            refreshToken,
            expiresAt,
        });

        // Generate final tokens with session ID
        const accessToken = generateAccessToken({
            userId: user.id,
            sessionId: session.id,
            isPremium: true, // Trial users have premium access
        });

        const finalRefreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: session.id,
        });

        await sessionRepository.updateRefreshToken(session.id, finalRefreshToken, expiresAt);

        return {
            accessToken,
            refreshToken: finalRefreshToken,
            expiresIn: getAccessTokenExpiresIn(),
        };
    },

    /**
     * Authenticates a user with email and password
     * Returns access and refresh token pair
     */
    async login(credentials: LoginCredentials): Promise<TokenPair> {
        const { email, password } = credentials;

        // Find user by email
        const user = await userRepository.findByEmail(email);
        if (!user) {
            throw AuthError.invalidCredentials();
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            throw AuthError.invalidCredentials();
        }

        // Check if user is active
        if (!user.isActive) {
            throw new AuthError('Account is deactivated', 'AUTH_ACCOUNT_DEACTIVATED');
        }

        // Check premium status
        const isPremium = await userRepository.hasPremiumAccess(user.id);

        // Generate tokens
        const refreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: '', // Will be set after session creation
        });

        // Calculate expiration
        const expiresAt = new Date(Date.now() + getRefreshTokenExpiresIn() * 1000);

        // Create session
        const session = await sessionRepository.create({
            userId: user.id,
            refreshToken,
            expiresAt,
        });

        // Generate access token with session ID
        const accessToken = generateAccessToken({
            userId: user.id,
            sessionId: session.id,
            isPremium,
        });

        // Generate new refresh token with session ID
        const finalRefreshToken = generateRefreshToken({
            userId: user.id,
            sessionId: session.id,
        });

        // Update session with correct refresh token
        await sessionRepository.updateRefreshToken(session.id, finalRefreshToken, expiresAt);

        return {
            accessToken,
            refreshToken: finalRefreshToken,
            expiresIn: getAccessTokenExpiresIn(),
        };
    },

    /**
     * Refreshes tokens using a valid refresh token
     * Implements token rotation - old refresh token is invalidated
     */
    async refreshToken(refreshToken: string): Promise<TokenPair> {
        // Validate the refresh token
        let tokenPayload;
        try {
            tokenPayload = validateRefreshToken(refreshToken);
        } catch {
            throw AuthError.refreshTokenInvalid();
        }

        // Find the session
        const session = await sessionRepository.findById(tokenPayload.sessionId);
        if (!session) {
            throw AuthError.refreshTokenInvalid();
        }

        // Verify the refresh token matches the stored hash
        if (!verifyRefreshTokenHash(refreshToken, session.refreshTokenHash)) {
            // Token doesn't match - possible token reuse attack
            // Invalidate all sessions for this user as a security measure
            await sessionRepository.deleteAllForUser(session.userId);
            throw AuthError.refreshTokenInvalid();
        }

        // Check if session is expired
        if (session.expiresAt < new Date()) {
            await sessionRepository.delete(session.id);
            throw AuthError.sessionExpired();
        }

        // Get user for premium status
        const user = await userRepository.findById(session.userId);
        if (!user || !user.isActive) {
            await sessionRepository.delete(session.id);
            throw new AuthError('Account is deactivated', 'AUTH_ACCOUNT_DEACTIVATED');
        }

        const isPremium = await userRepository.hasPremiumAccess(user.id);

        // Generate new tokens (rotation)
        const newRefreshToken = generateRefreshToken({
            userId: session.userId,
            sessionId: session.id,
        });

        const newAccessToken = generateAccessToken({
            userId: session.userId,
            sessionId: session.id,
            isPremium,
        });

        // Update session with new refresh token
        const newExpiresAt = new Date(Date.now() + getRefreshTokenExpiresIn() * 1000);
        await sessionRepository.updateRefreshToken(session.id, newRefreshToken, newExpiresAt);

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresIn: getAccessTokenExpiresIn(),
        };
    },

    /**
     * Logs out a user by invalidating their session
     */
    async logout(userId: string, sessionId: string): Promise<void> {
        // Verify the session belongs to the user
        const session = await sessionRepository.findById(sessionId);
        if (!session || session.userId !== userId) {
            // Session doesn't exist or doesn't belong to user
            // Still return success to prevent information leakage
            return;
        }

        await sessionRepository.delete(sessionId);
    },

    /**
     * Logs out a user from all sessions
     */
    async logoutAll(userId: string): Promise<number> {
        return sessionRepository.deleteAllForUser(userId);
    },

    /**
     * Validates if a session is still active
     */
    async validateSession(sessionId: string): Promise<boolean> {
        return sessionRepository.isValid(sessionId);
    },

    /**
     * Checks premium access status for a user
     */
    async checkPremiumAccess(userId: string): Promise<PremiumStatus> {
        const user = await userRepository.findById(userId);
        if (!user) {
            return { isPremium: false, source: 'none', expiresAt: null };
        }

        if (user.plan === 'PREMIUM') {
            return { isPremium: true, source: 'subscription', expiresAt: null };
        }

        if (user.plan === 'TRIAL' && user.trialEndsAt && user.trialEndsAt > new Date()) {
            return { isPremium: true, source: 'trial', expiresAt: user.trialEndsAt };
        }

        return { isPremium: false, source: 'none', expiresAt: null };
    },

    /**
     * Gets remaining trial days for a user
     */
    async getRemainingTrialDays(userId: string): Promise<number> {
        return userRepository.getRemainingTrialDays(userId);
    },

    /**
     * Initializes a trial for a new user
     */
    async initializeTrial(userId: string): Promise<TrialInfo> {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AuthError('User not found', 'AUTH_USER_NOT_FOUND');
        }

        const trialStartDate = new Date();
        const trialEndDate = new Date(trialStartDate);
        trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DURATION_DAYS);

        await userRepository.update(userId, {
            plan: 'TRIAL',
            trialEndsAt: trialEndDate,
        });

        return {
            userId,
            trialStartDate,
            trialEndDate,
            remainingDays: TRIAL_DURATION_DAYS,
        };
    },

    /**
     * Hashes a password for storage
     */
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, SALT_ROUNDS);
    },

    /**
     * Verifies a password against a hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    },
};
