/**
 * Evidence Verifier Module
 * 
 * Analyzes search results to determine how they relate to a claim.
 * Classifies evidence as supporting, contradicting, or inconclusive.
 * 
 * Design Philosophy:
 * - Use keyword/semantic matching for stance detection
 * - Weight sources by authority and recency
 * - Be conservative - when uncertain, mark as inconclusive
 * - Aggregate evidence to find consensus across sources
 */

import { Claim, Evidence, EvidenceStance, AggregatedEvidence, TavilySearchResult } from './types';
import { extractSourceName } from './tavily';

// ============================================================================
// AUTHORITY SCORING
// ============================================================================

/**
 * Domain authority tiers for source credibility
 * Higher tier = more credible for factual claims
 */
const AUTHORITY_TIERS: { domains: string[]; score: number }[] = [
    {
        // Tier 1: Government, academic, major fact-checkers
        domains: ['.gov', '.edu', 'snopes.com', 'politifact.com', 'factcheck.org', 'reuters.com', 'apnews.com'],
        score: 0.95,
    },
    {
        // Tier 2: Major news organizations with editorial standards
        domains: ['nytimes.com', 'washingtonpost.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com', 'npr.org', 'pbs.org'],
        score: 0.85,
    },
    {
        // Tier 3: Established news sources
        domains: ['cnn.com', 'usatoday.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'time.com', 'forbes.com'],
        score: 0.75,
    },
    {
        // Tier 4: Wikipedia and reference sources
        domains: ['wikipedia.org', 'britannica.com', 'encyclopedia.com'],
        score: 0.70,
    },
    {
        // Tier 5: General news/blogs
        domains: ['.com', '.org', '.net'],
        score: 0.50,
    },
];

/**
 * Domains to penalize (less reliable for factual claims)
 */
const LOW_AUTHORITY_DOMAINS = [
    'twitter.com', 'x.com', 'facebook.com', 'reddit.com', 'tiktok.com',
    'youtube.com', 'medium.com', 'substack.com', 'wordpress.com', 'blogspot.com',
];

/**
 * Calculate authority score for a source URL
 * 
 * @param url - Source URL
 * @returns Authority score between 0 and 1
 */
export function calculateAuthority(url: string): number {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        // Check for low-authority domains first
        for (const domain of LOW_AUTHORITY_DOMAINS) {
            if (hostname.includes(domain)) {
                return 0.25;
            }
        }

        // Check authority tiers
        for (const tier of AUTHORITY_TIERS) {
            for (const domain of tier.domains) {
                if (hostname.includes(domain) || hostname.endsWith(domain)) {
                    return tier.score;
                }
            }
        }

        // Default for unknown domains
        return 0.40;
    } catch {
        return 0.30;
    }
}

// ============================================================================
// STANCE DETECTION
// ============================================================================

/**
 * Keywords/patterns that suggest SUPPORT for a claim
 */
const SUPPORT_PATTERNS = [
    /\b(confirmed?|verified|true|correct|accurate|factual|valid)\b/i,
    /\b(is|are|was|were|has been) (indeed|in fact|actually)\b/i,
    /\b(evidence shows|research confirms|data supports|studies show)\b/i,
    /\b(according to official|officially confirmed)\b/i,
];

/**
 * Keywords/patterns that suggest CONTRADICTION of a claim
 */
const CONTRADICT_PATTERNS = [
    /\b(false|incorrect|inaccurate|wrong|untrue|debunked|disproven)\b/i,
    /\b(myth|hoax|fake|fabricated|misleading|misinformation)\b/i,
    /\b(no evidence|lacks evidence|unsubstantiated|unverified)\b/i,
    /\b(contrary to|contradicts|refutes|disputes)\b/i,
    /\b(not true|isn't true|wasn't true|weren't true)\b/i,
];

/**
 * Determine how a piece of evidence relates to a claim
 * 
 * This uses keyword matching as a heuristic. For production use,
 * you might want to use a more sophisticated NLI model.
 * 
 * @param claim - The claim being verified
 * @param content - The content from the search result
 * @returns The stance of this evidence
 */
export function detectStance(claim: Claim, content: string): EvidenceStance {
    const normalizedContent = content.toLowerCase();
    const claimKeywords = extractKeywords(claim.text);

    // First check if content is even relevant to the claim
    const relevanceScore = calculateRelevance(claimKeywords, normalizedContent);
    if (relevanceScore < 0.2) {
        return 'INCONCLUSIVE';
    }

    // Count support and contradict signals
    let supportScore = 0;
    let contradictScore = 0;

    for (const pattern of SUPPORT_PATTERNS) {
        if (pattern.test(normalizedContent)) {
            supportScore += 1;
        }
    }

    for (const pattern of CONTRADICT_PATTERNS) {
        if (pattern.test(normalizedContent)) {
            contradictScore += 1;
        }
    }

    // Check for explicit verdict patterns (e.g., from fact-check sites)
    const explicitVerdict = detectExplicitVerdict(normalizedContent);
    if (explicitVerdict) {
        return explicitVerdict;
    }

    // Determine stance based on signal balance
    const signalDifference = supportScore - contradictScore;

    if (signalDifference >= 2) {
        return 'SUPPORTS';
    } else if (signalDifference <= -2) {
        return 'CONTRADICTS';
    } else if (supportScore > 0 && contradictScore === 0) {
        return 'SUPPORTS';
    } else if (contradictScore > 0 && supportScore === 0) {
        return 'CONTRADICTS';
    }

    // When signals are mixed or absent, be conservative
    return 'INCONCLUSIVE';
}

/**
 * Detect explicit verdicts from fact-checking sites
 * These often have clear verdict labels we can extract
 */
function detectExplicitVerdict(content: string): EvidenceStance | null {
    // PolitiFact-style verdicts
    if (/\b(true|mostly true)\b/i.test(content) && /\b(rating|verdict|ruling)\b/i.test(content)) {
        return 'SUPPORTS';
    }
    if (/\b(false|pants on fire|mostly false)\b/i.test(content) && /\b(rating|verdict|ruling)\b/i.test(content)) {
        return 'CONTRADICTS';
    }

    // Snopes-style verdicts
    if (/\b(verdict|rating|status)[:\s]*(true|correct|confirmed)/i.test(content)) {
        return 'SUPPORTS';
    }
    if (/\b(verdict|rating|status)[:\s]*(false|incorrect|fake|hoax)/i.test(content)) {
        return 'CONTRADICTS';
    }

    return null;
}

/**
 * Extract meaningful keywords from claim text
 */
function extractKeywords(text: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
        'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
        'that', 'which', 'who', 'whom', 'this', 'these', 'those', 'it',
        'and', 'but', 'or', 'not', 'no', 'yes', 'all', 'each', 'every',
    ]);

    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate how relevant content is to claim keywords
 */
function calculateRelevance(claimKeywords: string[], content: string): number {
    if (claimKeywords.length === 0) return 0;

    let matches = 0;
    for (const keyword of claimKeywords) {
        if (content.includes(keyword)) {
            matches++;
        }
    }

    return matches / claimKeywords.length;
}

// ============================================================================
// EVIDENCE CLASSIFICATION
// ============================================================================

/**
 * Convert a Tavily search result into an Evidence object
 * 
 * @param claim - The claim being verified
 * @param result - Raw search result from Tavily
 * @returns Classified evidence object
 */
export function classifyEvidence(claim: Claim, result: TavilySearchResult): Evidence {
    // Use raw content if available, otherwise fall back to snippet
    const analysisContent = result.raw_content || result.content;

    const stance = detectStance(claim, analysisContent);
    const authority = calculateAuthority(result.url);

    return {
        source: extractSourceName(result.url),
        url: result.url,
        snippet: result.content.slice(0, 300), // Limit snippet length for display
        rawContent: result.raw_content,
        stance,
        authority,
        publishedDate: result.published_date || null,
    };
}

/**
 * Rank evidence by authority and recency
 * Higher ranked evidence should be weighted more heavily in verdict
 */
export function rankEvidence(evidence: Evidence[]): Evidence[] {
    return [...evidence].sort((a, b) => {
        // Primary sort: Authority score (higher is better)
        const authorityDiff = b.authority - a.authority;
        if (Math.abs(authorityDiff) > 0.1) {
            return authorityDiff;
        }

        // Secondary sort: Recency (null dates go last)
        if (a.publishedDate && b.publishedDate) {
            return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime();
        }
        if (a.publishedDate) return -1;
        if (b.publishedDate) return 1;

        return 0;
    });
}

// ============================================================================
// EVIDENCE AGGREGATION
// ============================================================================

/**
 * Aggregate all evidence for a claim into a summary
 * 
 * @param evidence - Array of classified evidence
 * @returns Aggregated evidence with consensus metrics
 */
export function aggregateEvidence(evidence: Evidence[]): AggregatedEvidence {
    const supporting = evidence.filter(e => e.stance === 'SUPPORTS');
    const contradicting = evidence.filter(e => e.stance === 'CONTRADICTS');
    const inconclusive = evidence.filter(e => e.stance === 'INCONCLUSIVE');

    // Calculate weighted consensus score
    // Positive = more support, Negative = more contradiction
    let weightedSupport = 0;
    let weightedContradict = 0;
    let totalWeight = 0;

    for (const e of evidence) {
        if (e.stance === 'SUPPORTS') {
            weightedSupport += e.authority;
            totalWeight += e.authority;
        } else if (e.stance === 'CONTRADICTS') {
            weightedContradict += e.authority;
            totalWeight += e.authority;
        }
        // Inconclusive evidence doesn't contribute to consensus
    }

    // Consensus score: -1 (all contradict) to +1 (all support)
    let consensusScore = 0;
    if (totalWeight > 0) {
        consensusScore = (weightedSupport - weightedContradict) / totalWeight;
    }

    return {
        supporting,
        contradicting,
        inconclusive,
        consensusScore,
        totalSources: evidence.length,
    };
}

/**
 * Process all search results for a claim
 * 
 * @param claim - The claim being verified
 * @param searchResults - Raw results from Tavily
 * @returns Aggregated evidence
 */
export function processSearchResults(
    claim: Claim,
    searchResults: TavilySearchResult[]
): AggregatedEvidence {
    // Classify each search result
    const evidence = searchResults.map(result => classifyEvidence(claim, result));

    // Rank by authority and recency
    const ranked = rankEvidence(evidence);

    // Aggregate into summary
    return aggregateEvidence(ranked);
}
