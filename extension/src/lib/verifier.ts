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
        domains: [
            '.gov', '.edu', '.mil',
            // Fact-checkers
            'snopes.com', 'politifact.com', 'factcheck.org', 'fullfact.org',
            'africacheck.org', 'chequeado.com', 'verificat.cat',
            // Wire services
            'reuters.com', 'apnews.com', 'afp.com',
            // Scientific/medical
            'nature.com', 'science.org', 'thelancet.com', 'nejm.org',
            'who.int', 'cdc.gov', 'nih.gov', 'pubmed.ncbi.nlm.nih.gov',
        ],
        score: 0.95,
    },
    {
        // Tier 2: Major news organizations with strong editorial standards
        domains: [
            'nytimes.com', 'washingtonpost.com', 'wsj.com',
            'bbc.com', 'bbc.co.uk', 'theguardian.com', 'economist.com',
            'npr.org', 'pbs.org', 'c-span.org',
            'propublica.org', 'theatlantic.com', 'newyorker.com',
            'ft.com', 'bloomberg.com', 'politico.com',
            // International
            'dw.com', 'france24.com', 'aljazeera.com', 'scmp.com',
            'abc.net.au', 'cbc.ca', 'globalnews.ca',
        ],
        score: 0.85,
    },
    {
        // Tier 3: Established news sources
        domains: [
            'cnn.com', 'usatoday.com', 'latimes.com', 'chicagotribune.com',
            'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
            'time.com', 'forbes.com', 'businessinsider.com', 'fortune.com',
            'newsweek.com', 'thehill.com', 'axios.com', 'vox.com',
            'slate.com', 'salon.com', 'thedailybeast.com',
            // Tech
            'wired.com', 'arstechnica.com', 'theverge.com', 'techcrunch.com',
            // Sports
            'espn.com', 'sports.yahoo.com',
            // Regional
            'bostonglobe.com', 'sfchronicle.com', 'dallasnews.com',
            'seattletimes.com', 'denverpost.com', 'miamiherald.com',
        ],
        score: 0.75,
    },
    {
        // Tier 4: Wikipedia and reference sources
        domains: [
            'wikipedia.org', 'britannica.com', 'encyclopedia.com',
            'merriam-webster.com', 'dictionary.com', 'oxforddictionaries.com',
            'investopedia.com', 'webmd.com', 'mayoclinic.org', 'healthline.com',
            'history.com', 'biography.com', 'imdb.com',
            'statista.com', 'worldbank.org', 'data.gov',
        ],
        score: 0.70,
    },
    {
        // Tier 5: General news/blogs
        domains: ['.com', '.org', '.net', '.io'],
        score: 0.50,
    },
];

/**
 * Domains to penalize (less reliable for factual claims)
 */
const LOW_AUTHORITY_DOMAINS = [
    // Social media
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'threads.net',
    'reddit.com', 'tiktok.com', 'snapchat.com', 'pinterest.com',
    'linkedin.com', 'tumblr.com', 'discord.com',
    // Video platforms (user-generated)
    'youtube.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
    // Blogging platforms
    'medium.com', 'substack.com', 'wordpress.com', 'blogspot.com',
    'blogger.com', 'wix.com', 'squarespace.com', 'ghost.io',
    // Forums/Q&A
    'quora.com', 'answers.yahoo.com', 'stackexchange.com',
    // Partisan/opinion sites (both sides)
    'breitbart.com', 'infowars.com', 'dailywire.com', 'theblaze.com',
    'huffpost.com', 'rawstory.com', 'dailykos.com', 'motherjones.com',
    // Tabloids
    'dailymail.co.uk', 'nypost.com', 'thesun.co.uk', 'mirror.co.uk',
    'tmz.com', 'pagesix.com', 'eonline.com', 'usmagazine.com',
    // Content farms/aggregators
    'buzzfeed.com', 'boredpanda.com', 'distractify.com',
    // Known misinformation sources
    'naturalnews.com', 'globalresearch.ca', 'zerohedge.com',
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
    const normalizedClaim = claim.text.toLowerCase();
    const claimKeywords = extractKeywords(claim.text);

    // First check if content is even relevant to the claim
    const relevanceScore = calculateRelevance(claimKeywords, normalizedContent);
    if (relevanceScore < 0.2) {
        return 'INCONCLUSIVE';
    }

    // Check for numeric contradictions FIRST
    // This catches cases like "Trump is 30" vs sources saying "Trump is 78"
    const numericContradiction = detectNumericContradiction(normalizedClaim, normalizedContent);
    if (numericContradiction === 'CONTRADICTS') {
        return 'CONTRADICTS';
    }

    // Check for semantic content matching (source restates the claim)
    // This is crucial for facts like "X founded Y" where the source says the same thing
    const semanticMatch = detectSemanticMatch(normalizedClaim, normalizedContent);
    if (semanticMatch === 'SUPPORTS') {
        return 'SUPPORTS';
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
 * Detect if source content semantically matches/supports the claim
 * 
 * This catches cases where the source simply restates the same fact
 * without using explicit "true/confirmed" language.
 * 
 * Handles negated claims - if claim says "X was NOT founded by Y"
 * and source confirms "Y founded X", that's a CONTRADICTION.
 */
function detectSemanticMatch(claim: string, content: string): EvidenceStance | null {
    // Check if the claim is negated
    const isNegated = /\b(not|never|wasn't|weren't|isn't|aren't|didn't|doesn't|don't|hasn't|haven't|hadn't|cannot|can't|won't|wouldn't)\b/i.test(claim);

    // Try each semantic pattern
    const patterns: SemanticPattern[] = [
        // Founder/CEO/Creator patterns - now extracts both entity and person
        {
            claimPattern: /([a-z\s\-']+) (?:was |is )?(?:founded|created|started|established|built|launched) by ([a-z\s\-']+)/i,
            contentIndicators: ['founded', 'founder', 'co-founder', 'ceo', 'creator', 'started', 'built', 'established', 'launched'],
            extractName: (match) => match[2].trim(), // Person name
            extractEntity: (match) => match[1].trim(), // Company/entity name
        },
        {
            claimPattern: /([a-z\s\-']+) (?:is|was|became) (?:the )?(?:ceo|founder|co-founder|creator|president|chairman) (?:of |at )?([a-z\s\-']*)/i,
            contentIndicators: ['ceo', 'founder', 'co-founder', 'creator', 'president', 'chairman', 'chief executive'],
            extractName: (match) => match[1].trim(), // Person name
            extractEntity: (match) => match[2]?.trim() || '', // Company (optional)
        },
        // Authorship/Invention patterns
        {
            claimPattern: /(?:written|wrote|authored|penned) by ([a-z\s\-']+)/i,
            contentIndicators: ['wrote', 'written', 'author', 'authored', 'penned', 'writer'],
            extractName: (match) => match[1].trim(),
        },
        {
            claimPattern: /([a-z\s\-']+) (?:invented|discovered|created|developed|designed) ([a-z\s\-']+)/i,
            contentIndicators: ['invented', 'invented by', 'discovered', 'created', 'developed', 'designed', 'inventor', 'discoverer'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        // Ownership/Acquisition patterns
        {
            claimPattern: /([a-z\s\-']+) (?:owns|owned|acquired|bought|purchased) ([a-z\s\-']+)/i,
            contentIndicators: ['owns', 'owned', 'acquired', 'bought', 'purchased', 'acquisition', 'owner'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        // Awards/Achievements patterns
        {
            claimPattern: /([a-z\s\-']+) (?:won|received|earned|awarded|got) (?:the )?([a-z\s\-']+)/i,
            contentIndicators: ['won', 'winner', 'received', 'awarded', 'earned', 'recipient', 'laureate'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        // Employment patterns
        {
            claimPattern: /([a-z\s\-']+) (?:works|worked|employed) (?:at|by|for) ([a-z\s\-']+)/i,
            contentIndicators: ['works', 'worked', 'employee', 'employed', 'staff', 'team'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        // Relationship patterns
        {
            claimPattern: /([a-z\s\-']+) (?:is|was) (?:married to|the (?:wife|husband|spouse|partner) of) ([a-z\s\-']+)/i,
            contentIndicators: ['married', 'wife', 'husband', 'spouse', 'partner', 'wedding'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        // Birth/Death patterns
        {
            claimPattern: /([a-z\s\-']+) (?:was )?born (?:in|on) ([a-z0-9\s,\-]+)/i,
            contentIndicators: ['born', 'birth', 'birthday', 'birthplace', 'native'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
        {
            claimPattern: /([a-z\s\-']+) died (?:in|on) ([a-z0-9\s,\-]+)/i,
            contentIndicators: ['died', 'death', 'passed away', 'deceased'],
            extractName: (match) => match[1].trim(),
            extractEntity: (match) => match[2].trim(),
        },
    ];

    // Try each pattern
    for (const pattern of patterns) {
        const match = claim.match(pattern.claimPattern);
        if (match) {
            const name = pattern.extractName(match);
            const entity = pattern.extractEntity?.(match);

            const nameParts = name.toLowerCase().split(/\s+/).filter(p => p.length > 2);
            const entityParts = entity?.toLowerCase().split(/\s+/).filter(p => p.length > 2) || [];

            // Check if content has the name
            const contentHasName = nameParts.length > 0 && nameParts.every(part => content.includes(part));

            // Check if content has any indicator
            const contentHasIndicator = pattern.contentIndicators.some(ind =>
                content.includes(ind.toLowerCase())
            );

            // Check if content has entity - REQUIRE ALL entity parts to match
            // This prevents "Facebook founded by X" matching sources about "Tavily founded by X"
            const contentHasEntity = entityParts.length === 0 || entityParts.every(part => content.includes(part));

            if (contentHasName && contentHasIndicator && contentHasEntity) {
                return isNegated ? 'CONTRADICTS' : 'SUPPORTS';
            }
        }
    }

    // Location claims: "X is located/based/headquartered in Y"
    const locationMatch = claim.match(/([a-z\s\-']+) (?:is|are|was|were) (?:located |based |headquartered )?in ([a-z\s,\-']+)/i);
    if (locationMatch) {
        const entity = locationMatch[1].trim().toLowerCase();
        const location = locationMatch[2].trim().toLowerCase();
        const entityParts = entity.split(/\s+/).filter(p => p.length > 2);
        const locationParts = location.split(/\s+/).filter(p => p.length > 2);

        const hasEntity = entityParts.every(part => content.includes(part));
        const hasLocation = locationParts.some(part => content.includes(part));

        if (hasEntity && hasLocation) {
            return isNegated ? 'CONTRADICTS' : 'SUPPORTS';
        }
    }

    // Quantity claims: "X has Y employees/users/members"
    const quantityMatch = claim.match(/([a-z\s\-']+) has (\d+[\d,]*)\s*(employees|users|members|customers|subscribers|followers)/i);
    if (quantityMatch) {
        const entity = quantityMatch[1].trim().toLowerCase();
        const quantity = quantityMatch[2].replace(/,/g, '');
        const unit = quantityMatch[3].toLowerCase();

        const entityParts = entity.split(/\s+/).filter(p => p.length > 2);
        const hasEntity = entityParts.every(part => content.includes(part));
        const hasUnit = content.includes(unit) || content.includes(unit.replace(/s$/, ''));

        if (hasEntity && hasUnit) {
            // Check if the same quantity appears
            if (content.includes(quantity)) {
                return isNegated ? 'CONTRADICTS' : 'SUPPORTS';
            }
        }
    }

    // General "X is/was a/an Y" identity claims (catch-all, less strict)
    const identityMatch = claim.match(/([a-z\s\-']+) (?:is|was|are|were) (?:a |an |the )?([a-z\s\-']+)/i);
    if (identityMatch) {
        const subject = identityMatch[1].trim().toLowerCase();
        const predicate = identityMatch[2].trim().toLowerCase();

        // Filter out very common/short words
        const subjectParts = subject.split(/\s+/).filter(p => p.length > 2 && !['the', 'and', 'for'].includes(p));
        const predicateParts = predicate.split(/\s+/).filter(p => p.length > 2 && !['the', 'and', 'for', 'who', 'that'].includes(p));

        // Require substantial overlap
        if (subjectParts.length > 0 && predicateParts.length > 0) {
            const hasSubject = subjectParts.every(part => content.includes(part));
            const hasPredicate = predicateParts.some(part => content.includes(part));

            if (hasSubject && hasPredicate) {
                // Only count as support if no contradiction signals present in source
                if (!CONTRADICT_PATTERNS.some(p => p.test(content))) {
                    return isNegated ? 'CONTRADICTS' : 'SUPPORTS';
                }
            }
        }
    }

    return null;
}

/**
 * Semantic pattern definition for claim matching
 */
interface SemanticPattern {
    claimPattern: RegExp;
    contentIndicators: string[];
    extractName: (match: RegExpMatchArray) => string;
    extractEntity?: (match: RegExpMatchArray) => string;
}

/**
 * Detect numeric contradictions between claim and source
 * 
 * If the claim states a number (age, year, amount, etc.) and the source
 * states a DIFFERENT number for the same entity/context, that's a contradiction.
 * 
 * Examples:
 * - Claim: "Trump is 30 years old" + Source: "Trump is 78" → CONTRADICTS
 * - Claim: "The tower is 300m tall" + Source: "330 meters" → CONTRADICTS
 */
function detectNumericContradiction(claim: string, content: string): EvidenceStance | null {
    // Extract numbers from the claim
    const claimNumbers = extractNumbersWithContext(claim);

    if (claimNumbers.length === 0) {
        return null; // No numbers in claim, can't detect numeric contradiction
    }

    // For each number in the claim, check if the content has a different number
    // in a similar context (age, year, height, etc.)
    for (const claimNum of claimNumbers) {
        const contentNumbers = extractNumbersWithContext(content);

        for (const contentNum of contentNumbers) {
            // Check if they're discussing the same type of quantity
            if (claimNum.context && contentNum.context &&
                contextsMatch(claimNum.context, contentNum.context)) {
                // If the numbers are significantly different, it's a contradiction
                if (claimNum.value !== contentNum.value &&
                    Math.abs(claimNum.value - contentNum.value) > 1) {
                    return 'CONTRADICTS';
                }
            }
        }
    }

    return null;
}

/**
 * Extract numbers with their surrounding context (age, year, height, etc.)
 */
function extractNumbersWithContext(text: string): { value: number; context: string | null }[] {
    const results: { value: number; context: string | null }[] = [];

    // Pattern for age: "X years old", "age X", "aged X", "X-year-old"
    const agePattern = /(\d+)[\s-]*(years?\s*old|year[\s-]old)|age[d]?\s*(\d+)/gi;
    let match;
    while ((match = agePattern.exec(text)) !== null) {
        const num = parseInt(match[1] || match[3], 10);
        if (!isNaN(num)) {
            results.push({ value: num, context: 'age' });
        }
    }

    // Pattern for year: "in YYYY", "born YYYY", "since YYYY"
    const yearPattern = /\b(in|born|since|from|year)\s*(1[89]\d{2}|20\d{2})\b/gi;
    while ((match = yearPattern.exec(text)) !== null) {
        const num = parseInt(match[2], 10);
        if (!isNaN(num)) {
            results.push({ value: num, context: 'year' });
        }
    }

    // Pattern for height: "X meters", "X feet", "X cm", "X ft"
    const heightPattern = /(\d+(?:\.\d+)?)\s*(meters?|metres?|feet|foot|ft|cm|m)\b/gi;
    while ((match = heightPattern.exec(text)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
            results.push({ value: num, context: 'height' });
        }
    }

    // Pattern for percentage: "X%", "X percent"
    const percentPattern = /(\d+(?:\.\d+)?)\s*(%|percent)/gi;
    while ((match = percentPattern.exec(text)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
            results.push({ value: num, context: 'percentage' });
        }
    }

    // Pattern for generic large numbers (millions, billions)
    const largeNumPattern = /(\d+(?:\.\d+)?)\s*(million|billion|trillion)/gi;
    while ((match = largeNumPattern.exec(text)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
            results.push({ value: num, context: 'amount' });
        }
    }

    return results;
}

/**
 * Check if two numeric contexts are discussing the same type of quantity
 */
function contextsMatch(context1: string, context2: string): boolean {
    return context1 === context2;
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
