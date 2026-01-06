/**
 * Core type definitions for the Fact-Checking Extension
 * 
 * These types define the data structures used throughout the verification pipeline:
 * Text → Claims → Evidence → Verdicts
 */

// ============================================================================
// CLAIM TYPES
// ============================================================================

/**
 * Classification of a claim's verifiability
 * - FACTUAL: Objective, can be verified with public sources
 * - OPINION: Subjective statement, reflects personal views
 * - PREDICTION: Future-oriented claim, cannot be verified yet
 * - AMBIGUOUS: Lacks context or is too vague to classify
 */
export type ClaimClassification = 'FACTUAL' | 'OPINION' | 'PREDICTION' | 'AMBIGUOUS';

/**
 * An atomic claim extracted from user-provided text
 */
export interface Claim {
    /** Unique identifier for tracking through the pipeline */
    id: string;
    /** Neutrally-phrased, atomic claim text */
    text: string;
    /** Original text before rephrasing (for user reference) */
    originalText: string;
    /** Classification determining whether verification is appropriate */
    classification: ClaimClassification;
}

// ============================================================================
// EVIDENCE TYPES
// ============================================================================

/**
 * How a piece of evidence relates to a claim
 * - SUPPORTS: Evidence confirms the claim
 * - CONTRADICTS: Evidence refutes the claim
 * - INCONCLUSIVE: Evidence is tangentially related but not definitive
 */
export type EvidenceStance = 'SUPPORTS' | 'CONTRADICTS' | 'INCONCLUSIVE';

/**
 * A single piece of evidence from a search result
 */
export interface Evidence {
    /** Name of the source (e.g., "Reuters", "Wikipedia") */
    source: string;
    /** URL to the original content */
    url: string;
    /** Relevant excerpt from the source */
    snippet: string;
    /** Full content if available (for deeper analysis) */
    rawContent?: string;
    /** How this evidence relates to the claim */
    stance: EvidenceStance;
    /** Authority score 0-1 based on source credibility */
    authority: number;
    /** Publication date if available */
    publishedDate: string | null;
}

/**
 * Aggregated evidence summary for verdict generation
 */
export interface AggregatedEvidence {
    /** All evidence classified as supporting */
    supporting: Evidence[];
    /** All evidence classified as contradicting */
    contradicting: Evidence[];
    /** All inconclusive evidence */
    inconclusive: Evidence[];
    /** Overall consensus strength (-1 to 1, negative = contradicting) */
    consensusScore: number;
    /** Total number of sources analyzed */
    totalSources: number;
}

// ============================================================================
// VERDICT TYPES
// ============================================================================

/**
 * Final verdict label for a verified claim
 * - SUPPORTED: Strong evidence confirms the claim
 * - FALSE: Strong evidence contradicts the claim
 * - MISLEADING: Claim contains some truth but is deceptive overall
 * - INSUFFICIENT_EVIDENCE: Not enough reliable sources to determine
 */
export type VerdictLabel = 'SUPPORTED' | 'FALSE' | 'MISLEADING' | 'INSUFFICIENT_EVIDENCE';

/**
 * A citation for a verdict
 */
export interface Citation {
    /** Source name */
    source: string;
    /** Direct URL to the source */
    url: string;
    /** Relevant quote from the source */
    snippet: string;
}

/**
 * Final verdict for a claim after verification
 */
export interface Verdict {
    /** ID of the claim this verdict applies to */
    claimId: string;
    /** The verdict label */
    verdict: VerdictLabel;
    /** Confidence score 0-1 (capped at 0.9 for epistemic humility) */
    confidence: number;
    /** Human-readable explanation of the verdict */
    explanation: string;
    /** Sources used to reach this verdict */
    citations: Citation[];
    /** Warnings about the verification (e.g., source diversity issues) */
    warnings?: string[];
    /** Explanation of why confidence is at this level */
    confidenceExplanation?: string;
}

// ============================================================================
// TAVILY API TYPES
// ============================================================================

/**
 * Tavily search request configuration
 */
export interface TavilySearchRequest {
    query: string;
    search_depth: 'basic' | 'advanced';
    include_raw_content: boolean;
    max_results: number;
    include_answer: boolean;
}

/**
 * Individual result from Tavily search
 */
export interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    raw_content?: string;
    score: number;
    published_date?: string;
}

/**
 * Tavily search response
 */
export interface TavilySearchResponse {
    results: TavilySearchResult[];
    query: string;
}

// ============================================================================
// MESSAGE TYPES (Chrome Extension Communication)
// ============================================================================

/**
 * Message types for communication between extension components
 */
export type ExtensionMessage =
    | { type: 'VERIFY_TEXT'; text: string }
    | { type: 'VERIFY_SELECTED_TEXT' }
    | { type: 'GET_SELECTED_TEXT' }
    | { type: 'SELECTED_TEXT_RESPONSE'; text: string | null }
    | { type: 'VERIFICATION_STARTED' }
    | { type: 'VERIFICATION_PROGRESS'; stage: string; progress: number }
    | { type: 'VERIFICATION_COMPLETE'; claims: Claim[]; verdicts: Verdict[] }
    | { type: 'VERIFICATION_ERROR'; error: string }
    | { type: 'SET_API_KEY'; apiKey: string }
    | { type: 'GET_API_KEY' }
    | { type: 'API_KEY_RESPONSE'; hasKey: boolean };

/**
 * Verification pipeline state
 */
export interface VerificationState {
    status: 'idle' | 'extracting' | 'searching' | 'analyzing' | 'complete' | 'error';
    progress: number;
    claims: Claim[];
    verdicts: Verdict[];
    error?: string;
}
