/**
 * Background Service Worker
 * 
 * Handles all API calls and orchestrates the verification pipeline.
 * This is the only place where the Tavily API key is used.
 * 
 * Security Model:
 * - API key is stored in chrome.storage.local (never in content)
 * - All Tavily API calls happen here, not in content script or popup
 * - Rate limiting is enforced at this layer
 */

import { extractClaims, getFactualClaims } from '../lib/claimExtractor';
import { searchForEvidence, TavilyError } from '../lib/tavily';
import { processSearchResults } from '../lib/verifier';
import { generateVerdict } from '../lib/verdictEngine';
import {
    checkRateLimit,
    recordRequest,
    getRemainingRequests,
    RateLimitError
} from '../utils/rateLimiter';
import { storage } from '../utils/messaging';
import { Claim, Verdict, ExtensionMessage } from '../lib/types';

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handle incoming messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    // Handle async operations
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
            console.error('Background worker error:', error);
            sendResponse({ error: error.message });
        });

    // Return true to indicate we'll respond asynchronously
    return true;
});

/**
 * Process incoming messages
 */
async function handleMessage(
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender
): Promise<unknown> {
    switch (message.type) {
        case 'VERIFY_TEXT':
            return await verifyText(message.text);

        case 'SET_API_KEY':
            await storage.setApiKey(message.apiKey);
            return { success: true };

        case 'GET_API_KEY':
            const hasKey = await storage.hasApiKey();
            return { hasKey };

        default:
            return { error: 'Unknown message type' };
    }
}

// ============================================================================
// VERIFICATION PIPELINE
// ============================================================================

/**
 * Main verification function
 * Orchestrates the full pipeline: extract → search → analyze → verdict
 * 
 * @param text - Raw text to verify
 * @returns Object with extracted claims and verdicts
 */
async function verifyText(text: string): Promise<{
    claims: Claim[];
    verdicts: Verdict[];
    error?: string;
}> {
    try {
        // Step 1: Check for API key
        const apiKey = await storage.getApiKey();
        if (!apiKey) {
            return {
                claims: [],
                verdicts: [],
                error: 'No API key configured. Please add your Tavily API key in settings.',
            };
        }

        // Step 2: Extract claims from text
        console.log('[Background] Extracting claims from text...');
        const allClaims = extractClaims(text);

        if (allClaims.length === 0) {
            return {
                claims: [],
                verdicts: [],
                error: 'No verifiable claims found in the text.',
            };
        }

        // Step 3: Filter to factual claims only
        const factualClaims = getFactualClaims(allClaims);
        console.log(`[Background] Found ${allClaims.length} claims, ${factualClaims.length} are factual`);

        // Step 4: Verify each factual claim
        const verdicts: Verdict[] = [];

        for (const claim of factualClaims) {
            try {
                // Check rate limit before each search
                checkRateLimit();

                console.log(`[Background] Verifying claim: "${claim.text.substring(0, 50)}..."`);

                // Search for evidence
                const searchResults = await searchForEvidence(claim, apiKey);
                recordRequest();

                console.log(`[Background] Found ${searchResults.length} sources`);

                // Process and aggregate evidence
                const aggregatedEvidence = processSearchResults(claim, searchResults);

                // Generate verdict
                const verdict = generateVerdict(claim, aggregatedEvidence);
                verdicts.push(verdict);

                console.log(`[Background] Verdict: ${verdict.verdict} (${verdict.confidence})`);

            } catch (error) {
                if (error instanceof RateLimitError) {
                    console.warn('[Background] Rate limited, skipping remaining claims');
                    // Add placeholder verdict for remaining claims
                    verdicts.push({
                        claimId: claim.id,
                        verdict: 'INSUFFICIENT_EVIDENCE',
                        confidence: 0,
                        explanation: `Rate limited. Please wait ${error.waitSeconds} seconds before trying again.`,
                        citations: [],
                    });
                } else if (error instanceof TavilyError) {
                    console.error('[Background] Tavily API error:', error.message);
                    verdicts.push({
                        claimId: claim.id,
                        verdict: 'INSUFFICIENT_EVIDENCE',
                        confidence: 0,
                        explanation: error.isAuthError()
                            ? 'API authentication failed. Please check your Tavily API key.'
                            : 'Search failed. Please try again later.',
                        citations: [],
                    });
                } else {
                    throw error;
                }
            }
        }

        return {
            claims: allClaims, // Return all claims (including non-factual)
            verdicts,
        };

    } catch (error) {
        console.error('[Background] Verification failed:', error);
        return {
            claims: [],
            verdicts: [],
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

/**
 * Create context menu item for text selection
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'fact-check-selection',
        title: 'Fact-Check Selection',
        contexts: ['selection'],
    });

    console.log('[Background] Extension installed, context menu created');
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'fact-check-selection' && info.selectionText) {
        console.log('[Background] Context menu clicked, selected text:', info.selectionText.substring(0, 50));

        // Store the selected text for the popup to access
        await chrome.storage.session.set({
            pendingVerification: {
                text: info.selectionText,
                tabId: tab?.id,
                timestamp: Date.now(),
            },
        });

        // Open the popup (this doesn't work directly, so we'll handle it in the popup)
        // The popup will check for pendingVerification on open
    }
});

// ============================================================================
// STARTUP
// ============================================================================

console.log('[Background] Service worker started');
console.log(`[Background] Rate limit: ${getRemainingRequests()} requests remaining`);
