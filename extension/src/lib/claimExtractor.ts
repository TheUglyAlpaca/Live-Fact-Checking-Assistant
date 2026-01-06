/**
 * Claim Extractor Module
 * 
 * Extracts atomic, verifiable claims from user-provided text.
 * Uses heuristic rules for deterministic classification.
 * 
 * Design Philosophy:
 * - Prefer false negatives over false positives (don't claim to verify opinions)
 * - Split compound claims for precision
 * - Rephrase to neutral form for unbiased searching
 */

import { Claim, ClaimClassification } from './types';

// ============================================================================
// CLASSIFICATION PATTERNS
// ============================================================================

/**
 * Patterns indicating subjective opinions
 * These claims cannot be objectively verified
 */
const OPINION_MARKERS = [
    /\b(i think|i believe|i feel|in my opinion|personally|arguably|seems to me)\b/i,
    /\b(best|worst|greatest|terrible|amazing|horrible|beautiful|ugly)\b/i,
    /\b(should|ought to|must|need to)\b/i,
    /\b(love|hate|like|dislike|prefer)\b/i,
    /\b(overrated|underrated)\b/i,
];

/**
 * Patterns indicating predictions about the future
 * These cannot be verified until the predicted time passes
 */
const PREDICTION_MARKERS = [
    /\b(will|going to|gonna|about to)\b.*\b(be|become|happen|occur)\b/i,
    /\b(by \d{4}|in the future|next year|soon|eventually)\b/i,
    /\b(predict|forecast|expect|anticipate)\b/i,
    /\b(likely to|probably will|might|could potentially)\b/i,
];

/**
 * Patterns indicating ambiguous or context-dependent claims
 */
const AMBIGUITY_MARKERS = [
    /\b(this|that|it|they|them|he|she)\b(?! is| are| was| were| has| have| had)/i, // Pronouns without context
    /\b(some|many|few|several|various|certain)\b/i, // Vague quantifiers
    /\b(stuff|things|something|somewhere)\b/i, // Vague nouns
    /^(and|but|or|so|because|however)\b/i, // Sentence fragments
];

/**
 * Patterns indicating likely factual claims
 * These should be verifiable with public sources
 */
const FACTUAL_INDICATORS = [
    /\b(is|are|was|were|has been|have been)\b/i, // State of being
    /\b(in \d{4}|on \d+\/\d+\/\d+|born|died|founded|established)\b/i, // Dates
    /\b(located in|capital of|population of|invented|discovered)\b/i, // Facts
    /\b(\d+%|\d+ percent|\d+ million|\d+ billion)\b/i, // Statistics
    /\b(according to|research shows|studies show|data shows)\b/i, // Citations
];

// ============================================================================
// CLAIM EXTRACTION
// ============================================================================

/**
 * Extract atomic claims from a block of text
 * 
 * @param text - Raw text input from user
 * @returns Array of classified claims
 */
export function extractClaims(text: string): Claim[] {
    if (!text || text.trim().length === 0) {
        return [];
    }

    // Step 1: Split into sentences
    const sentences = splitIntoSentences(text);

    // Step 2: Split compound sentences into atomic claims
    const atomicClaims: string[] = [];
    for (const sentence of sentences) {
        atomicClaims.push(...splitIntoAtomicClaims(sentence));
    }

    // Step 3: Filter and classify each claim
    const claims: Claim[] = [];

    for (const claimText of atomicClaims) {
        // Skip very short or meaningless fragments
        if (claimText.length < 10 || !containsSubjectAndVerb(claimText)) {
            continue;
        }

        // Skip rhetorical questions
        if (isRhetoricalQuestion(claimText)) {
            continue;
        }

        const classification = classifyClaim(claimText);
        const neutralText = rephraseToNeutral(claimText);

        claims.push({
            id: generateClaimId(),
            text: neutralText,
            originalText: claimText.trim(),
            classification,
        });
    }

    return claims;
}

/**
 * Split text into individual sentences
 */
function splitIntoSentences(text: string): string[] {
    // Handle common abbreviations that shouldn't split sentences
    const preserved = text
        .replace(/Mr\./g, 'Mr⁘')
        .replace(/Mrs\./g, 'Mrs⁘')
        .replace(/Dr\./g, 'Dr⁘')
        .replace(/Prof\./g, 'Prof⁘')
        .replace(/vs\./g, 'vs⁘')
        .replace(/etc\./g, 'etc⁘')
        .replace(/U\.S\./g, 'U⁘S⁘')
        .replace(/(\d)\./g, '$1⁘'); // Numbers with periods

    // Split on sentence-ending punctuation
    const sentences = preserved.split(/(?<=[.!?])\s+/);

    // Restore abbreviations
    return sentences
        .map(s => s.replace(/⁘/g, '.').trim())
        .filter(s => s.length > 0);
}

/**
 * Split a compound sentence into atomic claims
 * 
 * Example: "The sky is blue and grass is green" 
 * becomes: ["The sky is blue", "grass is green"]
 */
function splitIntoAtomicClaims(sentence: string): string[] {
    // Don't split short sentences
    if (sentence.length < 50) {
        return [sentence];
    }

    // Split on coordinating conjunctions (and, but, or) and semicolons
    // Only split if each part is substantial
    const parts = sentence.split(/(?:,?\s+(?:and|but|or|yet)\s+|;\s*)/i);

    const validParts = parts.filter(part => {
        const trimmed = part.trim();
        return trimmed.length >= 10 && containsSubjectAndVerb(trimmed);
    });

    // If splitting created invalid fragments, return original
    if (validParts.length < 2) {
        return [sentence];
    }

    return validParts.map(p => p.trim());
}

/**
 * Classify a claim into one of four categories
 */
export function classifyClaim(text: string): ClaimClassification {
    const normalizedText = text.toLowerCase();

    // Check for opinion markers first (subjective statements)
    for (const pattern of OPINION_MARKERS) {
        if (pattern.test(normalizedText)) {
            return 'OPINION';
        }
    }

    // Check for prediction markers (future claims)
    for (const pattern of PREDICTION_MARKERS) {
        if (pattern.test(normalizedText)) {
            return 'PREDICTION';
        }
    }

    // Check for ambiguity markers
    for (const pattern of AMBIGUITY_MARKERS) {
        if (pattern.test(normalizedText)) {
            // Only mark as ambiguous if no strong factual indicators
            const hasFactualIndicator = FACTUAL_INDICATORS.some(p => p.test(normalizedText));
            if (!hasFactualIndicator) {
                return 'AMBIGUOUS';
            }
        }
    }

    // Check for factual indicators
    for (const pattern of FACTUAL_INDICATORS) {
        if (pattern.test(normalizedText)) {
            return 'FACTUAL';
        }
    }

    // Default: If it's a clear declarative statement, assume factual
    // Otherwise mark as ambiguous
    if (isDeclarativeStatement(text)) {
        return 'FACTUAL';
    }

    return 'AMBIGUOUS';
}

/**
 * Rephrase a claim into neutral, declarative form
 * 
 * Examples:
 * - "Trump claimed that..." → "..." (remove attribution wrapper)
 * - "It's obvious that X" → "X" (remove editorial framing)
 */
export function rephraseToNeutral(text: string): string {
    let neutralized = text.trim();

    // Remove common attribution prefixes
    neutralized = neutralized.replace(
        /^(it is (said|claimed|reported|alleged|believed) that\s*)/i,
        ''
    );
    neutralized = neutralized.replace(
        /^(according to [^,]+,\s*)/i,
        ''
    );
    neutralized = neutralized.replace(
        /^(some (people |experts )?say (that\s*)?)/i,
        ''
    );
    neutralized = neutralized.replace(
        /^(it'?s? (obvious|clear|evident) that\s*)/i,
        ''
    );

    // Remove trailing attribution
    neutralized = neutralized.replace(
        /,?\s*(according to [^.]+|experts say|sources report)\.?$/i,
        ''
    );

    // Capitalize first letter if we removed a prefix
    if (neutralized.length > 0 && neutralized !== text.trim()) {
        neutralized = neutralized.charAt(0).toUpperCase() + neutralized.slice(1);
    }

    // Ensure it ends with proper punctuation
    if (neutralized.length > 0 && !/[.!?]$/.test(neutralized)) {
        neutralized += '.';
    }

    return neutralized;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if text contains both a subject and a verb (basic sentence structure)
 */
function containsSubjectAndVerb(text: string): boolean {
    // Simple heuristic: must have at least 2 words and contain a verb-like word
    const words = text.split(/\s+/);
    if (words.length < 2) return false;

    // Check for common verbs
    const verbPattern = /\b(is|are|was|were|has|have|had|do|does|did|can|could|will|would|should|may|might|been|being|made|said|went|came|took|gave|found|thought|knew|saw|got|became|let|began|put|run|bring|become|grow|draw|show|hear|play|move|live|die|work|use|seem|feel|try|leave|call|keep|hold|turn|allow|start|stand|lose|pay|meet|include|continue|set|learn|change|lead|understand|watch|follow|stop|create|speak|read|spend|win|happen|provide|sit|buy|send|build|stay|fall|cut|reach|kill|raise|pass|sell|decide|return|explain|hope|develop|carry|break|receive|agree|support|hit|produce|eat|cover|catch|require|believe|die|remember|love|consider|appear|walk|wait|serve|remain|offer|fight|throw|accept|save|perform|act|add|cause|grow|point|suggest|answer|charge|join|enjoy|teach|enter|fear)\b/i;

    return verbPattern.test(text);
}

/**
 * Check if text is a rhetorical question
 * These should not be treated as claims
 */
function isRhetoricalQuestion(text: string): boolean {
    if (!text.includes('?')) return false;

    // Common rhetorical question patterns
    const rhetoricalPatterns = [
        /^(who|what|where|when|why|how) (cares|knows|would|could|can)\?/i,
        /^isn't it (obvious|clear|true)/i,
        /\?{2,}/,  // Multiple question marks = rhetorical
        /^(really|seriously|honestly)\?/i,
    ];

    return rhetoricalPatterns.some(p => p.test(text));
}

/**
 * Check if text is a declarative statement (not a question or command)
 */
function isDeclarativeStatement(text: string): boolean {
    // Not a question
    if (text.trim().endsWith('?')) return false;

    // Not an imperative (command)
    const imperative = /^(do|don't|please|let's|go|come|stop|start|make|take|give|put|get|try|look|think|be|have)\b/i;
    if (imperative.test(text.trim())) return false;

    return true;
}

/**
 * Generate a unique ID for a claim
 */
function generateClaimId(): string {
    return `claim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get only the factual claims from a list
 * These are the only claims that should be verified
 */
export function getFactualClaims(claims: Claim[]): Claim[] {
    return claims.filter(claim => claim.classification === 'FACTUAL');
}
