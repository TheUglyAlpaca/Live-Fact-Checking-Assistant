/**
 * Tavily API Wrapper
 * 
 * Handles all communication with the Tavily search API.
 * Implements multi-query strategy for comprehensive evidence gathering.
 * 
 * Design Philosophy:
 * - Generate multiple query variations to avoid search bias
 * - Use advanced search depth for better source coverage
 * - Always request raw content for transparent citation
 * - Never rely on Tavily's generated answer field
 */

import { Claim, TavilySearchRequest, TavilySearchResponse, TavilySearchResult } from './types';

const TAVILY_API_URL = 'https://api.tavily.com/search';

// ============================================================================
// QUERY GENERATION
// ============================================================================

/**
 * Generate multiple search queries for a claim
 * 
 * We use three query strategies:
 * 1. Neutral: Direct statement of the claim
 * 2. Alternative: Rephrased with synonyms/alternative wording
 * 3. Negated: Explicitly search for contradicting evidence
 * 
 * This helps avoid confirmation bias in search results.
 */
export function generateSearchQueries(claim: Claim): string[] {
    const queries: string[] = [];

    // 1. Neutral phrasing - the claim as stated
    queries.push(claim.text);

    // 2. Alternative wording - verify with fact-check framing
    // This helps find fact-check articles specifically about this claim
    const factCheckQuery = `fact check: ${claim.text.replace(/\.$/, '')}`;
    queries.push(factCheckQuery);

    // 3. Negated form - explicitly search for contradicting evidence
    const negatedQuery = generateNegatedQuery(claim.text);
    if (negatedQuery) {
        queries.push(negatedQuery);
    }

    return queries;
}

/**
 * Generate a negated version of a claim for searching contradicting evidence
 * 
 * Examples:
 * - "The Earth is round" → "The Earth is not round" OR "Earth flat"
 * - "Biden won the election" → "Biden did not win" OR "election fraud"
 */
function generateNegatedQuery(claimText: string): string | null {

    // Pattern 1: Negate "is/are/was/were"
    const negatedBe = claimText.replace(
        /\b(is|are|was|were)\b/i,
        (match) => `${match} not`
    );

    if (negatedBe !== claimText) {
        return negatedBe;
    }

    // Pattern 2: Negate "has/have/had"
    const negatedHave = claimText.replace(
        /\b(has|have|had)\b/i,
        (match) => `${match} not`
    );

    if (negatedHave !== claimText) {
        return negatedHave;
    }

    // Pattern 3: Add "false" or "debunked" prefix
    return `debunked: ${claimText.replace(/\.$/, '')}`;
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

/**
 * Search Tavily for evidence related to a claim
 * 
 * @param claim - The claim to search for
 * @param apiKey - Tavily API key (passed from background worker)
 * @returns Array of search results from all queries
 */
export async function searchForEvidence(
    claim: Claim,
    apiKey: string
): Promise<TavilySearchResult[]> {
    const queries = generateSearchQueries(claim);
    const allResults: TavilySearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
        try {
            const results = await executeTavilySearch(query, apiKey);

            // Deduplicate by URL
            for (const result of results) {
                if (!seenUrls.has(result.url)) {
                    seenUrls.add(result.url);
                    allResults.push(result);
                }
            }
        } catch (error) {
            // Log but continue - one failed query shouldn't stop verification
            console.error(`Search failed for query "${query}":`, error);
        }
    }

    return allResults;
}

/**
 * Execute a single Tavily search request
 */
async function executeTavilySearch(
    query: string,
    apiKey: string
): Promise<TavilySearchResult[]> {
    const requestBody: TavilySearchRequest = {
        query,
        search_depth: 'advanced',
        include_raw_content: true,
        max_results: 6,
        include_answer: false, // We don't use Tavily's answer - only raw sources
    };

    const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            api_key: apiKey,
            ...requestBody,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new TavilyError(
            `Tavily API error: ${response.status} ${response.statusText}`,
            response.status,
            errorText
        );
    }

    const data: TavilySearchResponse = await response.json();
    return data.results || [];
}

/**
 * Verify that an API key is valid
 */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(TAVILY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: 'test',
                search_depth: 'basic',
                max_results: 1,
            }),
        });

        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Custom error class for Tavily API errors
 */
export class TavilyError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly responseBody: string
    ) {
        super(message);
        this.name = 'TavilyError';
    }

    /**
     * Check if error is due to rate limiting
     */
    isRateLimited(): boolean {
        return this.statusCode === 429;
    }

    /**
     * Check if error is due to invalid API key
     */
    isAuthError(): boolean {
        return this.statusCode === 401 || this.statusCode === 403;
    }
}

// ============================================================================
// SOURCE METADATA EXTRACTION
// ============================================================================

/**
 * Extract the source name from a URL
 * 
 * Examples:
 * - https://www.nytimes.com/... → "New York Times"
 * - https://en.wikipedia.org/... → "Wikipedia"
 */
export function extractSourceName(url: string): string {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace(/^www\./, '');

        // Known source mappings
        const sourceMap: Record<string, string> = {
            'nytimes.com': 'New York Times',
            'washingtonpost.com': 'Washington Post',
            'bbc.com': 'BBC',
            'bbc.co.uk': 'BBC',
            'reuters.com': 'Reuters',
            'apnews.com': 'Associated Press',
            'cnn.com': 'CNN',
            'theguardian.com': 'The Guardian',
            'wikipedia.org': 'Wikipedia',
            'en.wikipedia.org': 'Wikipedia',
            'snopes.com': 'Snopes',
            'politifact.com': 'PolitiFact',
            'factcheck.org': 'FactCheck.org',
            'usatoday.com': 'USA Today',
            'npr.org': 'NPR',
            'pbs.org': 'PBS',
        };

        // Check direct match
        if (sourceMap[hostname]) {
            return sourceMap[hostname];
        }

        // Check subdomain match (e.g., en.wikipedia.org)
        const baseDomain = hostname.split('.').slice(-2).join('.');
        if (sourceMap[baseDomain]) {
            return sourceMap[baseDomain];
        }

        // Fallback: capitalize the domain name
        return hostname
            .split('.')[0]
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    } catch {
        return 'Unknown Source';
    }
}
