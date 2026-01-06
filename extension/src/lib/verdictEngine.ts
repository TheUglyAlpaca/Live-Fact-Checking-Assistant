/**
 * Verdict Engine Module
 * 
 * Generates final verdicts based on aggregated evidence.
 * Calculates confidence scores and generates human-readable explanations.
 * 
 * Design Philosophy:
 * - Prefer INSUFFICIENT_EVIDENCE over guessing
 * - Cap confidence at 0.9 (epistemic humility)
 * - Require strong consensus for definitive verdicts
 * - Generate transparent, understandable explanations
 */

import { Claim, Verdict, VerdictLabel, Citation, AggregatedEvidence, Evidence } from './types';

// ============================================================================
// VERDICT THRESHOLDS
// ============================================================================

/**
 * Thresholds for verdict determination
 * These are intentionally conservative to avoid overconfidence
 */
const THRESHOLDS = {
    /** Minimum sources needed for any definitive verdict */
    MIN_SOURCES_FOR_VERDICT: 2,

    /** Consensus score threshold for SUPPORTED verdict */
    SUPPORTED_THRESHOLD: 0.6,

    /** Consensus score threshold for FALSE verdict (negative) */
    FALSE_THRESHOLD: -0.6,

    /** Consensus score range for MISLEADING verdict */
    MISLEADING_RANGE: { min: -0.6, max: 0.3 },

    /** Maximum confidence we'll ever assign (epistemic humility) */
    MAX_CONFIDENCE: 0.9,

    /** Minimum confidence for any claim */
    MIN_CONFIDENCE: 0.1,
};

// ============================================================================
// VERDICT GENERATION
// ============================================================================

/**
 * Generate a verdict for a claim based on aggregated evidence
 * 
 * @param claim - The claim being verified
 * @param evidence - Aggregated evidence from search results
 * @returns Final verdict with confidence and citations
 */
export function generateVerdict(claim: Claim, evidence: AggregatedEvidence): Verdict {
    const verdictLabel = determineVerdictLabel(evidence);
    const confidence = calculateConfidence(evidence, verdictLabel);
    const citations = selectCitations(evidence, verdictLabel);
    const explanation = generateExplanation(claim, evidence, verdictLabel, confidence);
    const warnings = checkSourceDiversity(evidence);
    const confidenceExplanation = generateConfidenceExplanation(evidence, verdictLabel, confidence);

    return {
        claimId: claim.id,
        verdict: verdictLabel,
        confidence,
        explanation,
        citations,
        warnings: warnings.length > 0 ? warnings : undefined,
        confidenceExplanation,
    };
}

/**
 * Determine the verdict label based on evidence consensus
 */
function determineVerdictLabel(evidence: AggregatedEvidence): VerdictLabel {
    const { supporting, contradicting, consensusScore, totalSources } = evidence;

    // Not enough evidence for any definitive verdict
    if (totalSources < THRESHOLDS.MIN_SOURCES_FOR_VERDICT) {
        return 'INSUFFICIENT_EVIDENCE';
    }

    // No supporting or contradicting evidence found
    if (supporting.length === 0 && contradicting.length === 0) {
        return 'INSUFFICIENT_EVIDENCE';
    }

    // Strong support
    if (consensusScore >= THRESHOLDS.SUPPORTED_THRESHOLD && supporting.length >= 2) {
        return 'SUPPORTED';
    }

    // Strong contradiction
    if (consensusScore <= THRESHOLDS.FALSE_THRESHOLD && contradicting.length >= 2) {
        return 'FALSE';
    }

    // Mixed evidence with contradiction leaning
    if (
        consensusScore >= THRESHOLDS.MISLEADING_RANGE.min &&
        consensusScore <= THRESHOLDS.MISLEADING_RANGE.max &&
        contradicting.length > 0 &&
        supporting.length > 0
    ) {
        return 'MISLEADING';
    }

    // Default: Not enough clear consensus
    return 'INSUFFICIENT_EVIDENCE';
}

/**
 * Calculate confidence score for a verdict
 * 
 * Confidence is based on:
 * 1. Number of sources
 * 2. Strength of consensus
 * 3. Authority of agreeing sources
 * 4. Presence of high-authority fact-checkers
 */
function calculateConfidence(evidence: AggregatedEvidence, verdict: VerdictLabel): number {
    // Insufficient evidence = low confidence by definition
    if (verdict === 'INSUFFICIENT_EVIDENCE') {
        return THRESHOLDS.MIN_CONFIDENCE;
    }

    const { supporting, contradicting, consensusScore, totalSources } = evidence;

    // Base confidence from consensus strength
    let confidence = Math.abs(consensusScore);

    // Boost for source count (more sources = more confident)
    const sourceBoost = Math.min(0.2, totalSources * 0.03);
    confidence += sourceBoost;

    // Boost for high-authority sources
    const relevantEvidence = verdict === 'FALSE' ? contradicting : supporting;
    const highAuthorityCount = relevantEvidence.filter(e => e.authority >= 0.8).length;
    const authorityBoost = Math.min(0.15, highAuthorityCount * 0.05);
    confidence += authorityBoost;

    // Penalty for MISLEADING (inherently less certain)
    if (verdict === 'MISLEADING') {
        confidence *= 0.7;
    }

    // Clamp to valid range
    confidence = Math.max(THRESHOLDS.MIN_CONFIDENCE, Math.min(THRESHOLDS.MAX_CONFIDENCE, confidence));

    // Round to 2 decimal places
    return Math.round(confidence * 100) / 100;
}

/**
 * Select the most relevant citations for the verdict
 * Prioritize high-authority sources that match the verdict stance
 */
function selectCitations(evidence: AggregatedEvidence, verdict: VerdictLabel): Citation[] {
    let relevantEvidence: Evidence[];

    switch (verdict) {
        case 'SUPPORTED':
            relevantEvidence = evidence.supporting;
            break;
        case 'FALSE':
            relevantEvidence = evidence.contradicting;
            break;
        case 'MISLEADING':
            // Include both supporting and contradicting for context
            relevantEvidence = [...evidence.contradicting, ...evidence.supporting];
            break;
        case 'INSUFFICIENT_EVIDENCE':
        default:
            // Include any relevant evidence we do have
            relevantEvidence = [...evidence.supporting, ...evidence.contradicting, ...evidence.inconclusive];
            break;
    }

    // Sort by authority and take top 3
    const sorted = relevantEvidence.sort((a, b) => b.authority - a.authority);
    const topSources = sorted.slice(0, 3);

    return topSources.map(e => ({
        source: e.source,
        url: e.url,
        snippet: e.snippet,
    }));
}

/**
 * Generate a human-readable explanation for the verdict
 */
function generateExplanation(
    _claim: Claim,
    evidence: AggregatedEvidence,
    verdict: VerdictLabel,
    confidence: number
): string {
    const { supporting, contradicting, totalSources } = evidence;
    const confidenceLevel = getConfidenceLevel(confidence);

    switch (verdict) {
        case 'SUPPORTED':
            return `This claim appears to be ${confidenceLevel} supported. ` +
                `${supporting.length} source${supporting.length > 1 ? 's' : ''} confirm this claim, ` +
                `including ${formatTopSources(supporting)}.`;

        case 'FALSE':
            return `This claim appears to be ${confidenceLevel} false. ` +
                `${contradicting.length} source${contradicting.length > 1 ? 's' : ''} contradict this claim, ` +
                `including ${formatTopSources(contradicting)}.`;

        case 'MISLEADING':
            return `This claim is misleading. While some elements may be accurate, ` +
                `${contradicting.length} source${contradicting.length > 1 ? 's' : ''} identify significant issues. ` +
                `The claim lacks important context or contains inaccuracies.`;

        case 'INSUFFICIENT_EVIDENCE':
        default:
            if (totalSources === 0) {
                return `Unable to verify this claim. No relevant sources were found.`;
            }
            return `Unable to determine the accuracy of this claim with confidence. ` +
                `${totalSources} source${totalSources > 1 ? 's were' : ' was'} analyzed, ` +
                `but the evidence is inconclusive or conflicting.`;
    }
}

/**
 * Convert numeric confidence to human-readable level
 */
function getConfidenceLevel(confidence: number): string {
    if (confidence >= 0.8) return 'very likely';
    if (confidence >= 0.6) return 'likely';
    if (confidence >= 0.4) return 'possibly';
    return 'tentatively';
}

/**
 * Format top sources for display in explanation
 */
function formatTopSources(evidence: Evidence[]): string {
    const sorted = evidence.sort((a, b) => b.authority - a.authority);
    const topTwo = sorted.slice(0, 2).map(e => e.source);

    if (topTwo.length === 0) return 'various sources';
    if (topTwo.length === 1) return topTwo[0];
    return `${topTwo[0]} and ${topTwo[1]}`;
}

// ============================================================================
// VERDICT UTILITIES
// ============================================================================

/**
 * Get the display color for a verdict
 */
export function getVerdictColor(verdict: VerdictLabel): string {
    switch (verdict) {
        case 'SUPPORTED':
            return '#22c55e'; // Green
        case 'FALSE':
            return '#ef4444'; // Red
        case 'MISLEADING':
            return '#f97316'; // Orange
        case 'INSUFFICIENT_EVIDENCE':
        default:
            return '#6b7280'; // Gray
    }
}

/**
 * Get a short label for a verdict
 */
export function getVerdictShortLabel(verdict: VerdictLabel): string {
    switch (verdict) {
        case 'SUPPORTED':
            return 'True';
        case 'FALSE':
            return 'False';
        case 'MISLEADING':
            return 'Misleading';
        case 'INSUFFICIENT_EVIDENCE':
        default:
            return 'Unverified';
    }
}

/**
 * Get an icon for a verdict (emoji for simplicity)
 */
export function getVerdictIcon(verdict: VerdictLabel): string {
    switch (verdict) {
        case 'SUPPORTED':
            return '✓';
        case 'FALSE':
            return '✗';
        case 'MISLEADING':
            return '⚠';
        case 'INSUFFICIENT_EVIDENCE':
        default:
            return '?';
    }
}

/**
 * Check for source diversity issues and return warnings
 */
function checkSourceDiversity(evidence: AggregatedEvidence): string[] {
    const warnings: string[] = [];
    const allEvidence = [...evidence.supporting, ...evidence.contradicting, ...evidence.inconclusive];

    if (allEvidence.length === 0) return warnings;

    // Check for unique domains
    const domains = new Set(allEvidence.map(e => {
        try {
            return new URL(e.url).hostname;
        } catch {
            return e.source;
        }
    }));

    if (domains.size < 3 && allEvidence.length >= 3) {
        warnings.push('Limited source diversity: Most sources are from similar domains.');
    }

    // Check for high-authority source presence
    const hasHighAuthority = allEvidence.some(e => e.authority >= 0.8);
    if (!hasHighAuthority && allEvidence.length >= 2) {
        warnings.push('No high-authority sources (e.g., .gov, major news) found.');
    }

    // Check for very low average authority
    const avgAuthority = allEvidence.reduce((sum, e) => sum + e.authority, 0) / allEvidence.length;
    if (avgAuthority < 0.4) {
        warnings.push('Source quality is below average. Verify with additional sources.');
    }

    // Check for recency
    const recentSources = allEvidence.filter(e => {
        if (!e.publishedDate) return false;
        const date = new Date(e.publishedDate);
        const monthsAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsAgo < 12;
    });

    if (recentSources.length === 0 && allEvidence.length >= 2) {
        warnings.push('No recent sources found. Information may be outdated.');
    }

    return warnings;
}

/**
 * Generate an explanation of why confidence is at a particular level
 */
function generateConfidenceExplanation(
    evidence: AggregatedEvidence,
    verdict: VerdictLabel,
    confidence: number
): string {
    const factors: string[] = [];
    const { supporting, contradicting, totalSources } = evidence;
    const allEvidence = [...supporting, ...contradicting, ...evidence.inconclusive];

    // Source count factor
    if (totalSources >= 5) {
        factors.push('multiple sources analyzed');
    } else if (totalSources <= 2) {
        factors.push('limited sources available');
    }

    // Consensus strength
    const consensusStrength = Math.abs(evidence.consensusScore);
    if (consensusStrength >= 0.8) {
        factors.push('strong consensus among sources');
    } else if (consensusStrength <= 0.3) {
        factors.push('mixed or weak consensus');
    }

    // Authority factor
    const highAuthorityCount = allEvidence.filter(e => e.authority >= 0.8).length;
    if (highAuthorityCount >= 2) {
        factors.push('includes high-authority sources');
    } else if (highAuthorityCount === 0 && allEvidence.length > 0) {
        factors.push('no high-authority sources');
    }

    // Recency factor
    const recentCount = allEvidence.filter(e => {
        if (!e.publishedDate) return false;
        const date = new Date(e.publishedDate);
        const monthsAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsAgo < 6;
    }).length;

    if (recentCount >= 2) {
        factors.push('recent sources');
    }

    // Verdict-specific factors
    if (verdict === 'MISLEADING') {
        factors.push('claim contains both accurate and inaccurate elements');
    }

    if (factors.length === 0) {
        return `Confidence of ${Math.round(confidence * 100)}% based on available evidence.`;
    }

    return `Confidence of ${Math.round(confidence * 100)}%: ${factors.join(', ')}.`;
}
