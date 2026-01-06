/**
 * Rate Limiter Utility
 * 
 * Prevents excessive API calls to Tavily.
 * Implements a sliding window rate limiter.
 * 
 * Design Philosophy:
 * - Protect both the user (from excessive costs) and the API
 * - Provide clear feedback when rate limited
 * - Allow burst usage but enforce overall limits
 */

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
    /** Maximum requests allowed in the window */
    maxRequests: number;
    /** Time window in milliseconds */
    windowMs: number;
}

/**
 * Default configuration: 10 requests per minute
 * This is conservative to stay within typical API limits
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
};

/**
 * Rate limiter state
 */
interface RateLimiterState {
    requests: number[];
    config: RateLimiterConfig;
}

// In-memory state (reset on service worker restart)
let state: RateLimiterState = {
    requests: [],
    config: DEFAULT_CONFIG,
};

/**
 * Check if a new request is allowed
 * 
 * @returns true if request is allowed, false if rate limited
 */
export function canMakeRequest(): boolean {
    cleanupOldRequests();
    return state.requests.length < state.config.maxRequests;
}

/**
 * Record a new request
 * Call this after successfully making an API call
 */
export function recordRequest(): void {
    state.requests.push(Date.now());
}

/**
 * Get the number of remaining requests in the current window
 */
export function getRemainingRequests(): number {
    cleanupOldRequests();
    return Math.max(0, state.config.maxRequests - state.requests.length);
}

/**
 * Get the time until the next request slot opens up
 * 
 * @returns Milliseconds until a request slot is available, or 0 if available now
 */
export function getTimeUntilNextSlot(): number {
    if (canMakeRequest()) {
        return 0;
    }

    // Find the oldest request that's still in the window
    const oldestRequest = Math.min(...state.requests);
    const expiryTime = oldestRequest + state.config.windowMs;

    return Math.max(0, expiryTime - Date.now());
}

/**
 * Remove requests that are outside the current time window
 */
function cleanupOldRequests(): void {
    const cutoff = Date.now() - state.config.windowMs;
    state.requests = state.requests.filter(time => time > cutoff);
}

/**
 * Reset the rate limiter (for testing or manual reset)
 */
export function resetRateLimiter(): void {
    state.requests = [];
}

/**
 * Update rate limiter configuration
 */
export function updateConfig(config: Partial<RateLimiterConfig>): void {
    state.config = { ...state.config, ...config };
}

/**
 * Check rate limit and throw if exceeded
 * Convenience function for use in API calls
 */
export function checkRateLimit(): void {
    if (!canMakeRequest()) {
        const waitTime = Math.ceil(getTimeUntilNextSlot() / 1000);
        throw new RateLimitError(
            `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`,
            waitTime
        );
    }
}

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
    constructor(
        message: string,
        public readonly waitSeconds: number
    ) {
        super(message);
        this.name = 'RateLimitError';
    }
}
