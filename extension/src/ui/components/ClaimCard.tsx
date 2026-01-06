/**
 * Claim Card Component
 * 
 * Displays an individual claim with its classification and verdict.
 * Includes expandable citation list for transparency.
 */

import { useState } from 'react';
import { Claim, Verdict } from '../../lib/types';
import { VerdictBadge } from './VerdictBadge';
import { CitationList } from './CitationList';
import { ClassificationBadge } from './ClassificationBadge';

interface ClaimCardProps {
    claim: Claim;
    verdict?: Verdict;
}

export function ClaimCard({ claim, verdict }: ClaimCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const isFactual = claim.classification === 'FACTUAL';
    const hasVerdict = isFactual && verdict;

    return (
        <div className={`claim-card ${isExpanded ? 'expanded' : ''}`}>
            {/* Claim Header */}
            <div className="claim-header">
                <ClassificationBadge classification={claim.classification} />
                {hasVerdict && <VerdictBadge verdict={verdict.verdict} />}
            </div>

            {/* Claim Text */}
            <div className="claim-text">
                <p>{claim.text}</p>
                {claim.originalText !== claim.text && (
                    <p className="original-text">
                        <span className="original-label">Original:</span> {claim.originalText}
                    </p>
                )}
            </div>

            {/* Verdict Details (only for factual claims with verdicts) */}
            {hasVerdict && (
                <>
                    {/* Confidence Meter */}
                    <div className="confidence-section">
                        <div className="confidence-label">
                            <span>Confidence</span>
                            <span className="confidence-value">{Math.round(verdict.confidence * 100)}%</span>
                        </div>
                        <div className="confidence-bar">
                            <div
                                className="confidence-fill"
                                style={{
                                    width: `${verdict.confidence * 100}%`,
                                    backgroundColor: getConfidenceColor(verdict.confidence)
                                }}
                            />
                        </div>
                    </div>

                    {/* Explanation */}
                    <div className="explanation">
                        <p>{verdict.explanation}</p>
                    </div>

                    {/* Citations Toggle */}
                    {verdict.citations.length > 0 && (
                        <button
                            className="citations-toggle"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? '▼' : '▶'} {verdict.citations.length} source{verdict.citations.length > 1 ? 's' : ''}
                        </button>
                    )}

                    {/* Citations List */}
                    {isExpanded && (
                        <CitationList citations={verdict.citations} />
                    )}
                </>
            )}

            {/* Non-factual claim message */}
            {!isFactual && (
                <div className="not-factual-message">
                    <p>
                        {claim.classification === 'OPINION' &&
                            'This appears to be an opinion and cannot be objectively verified.'}
                        {claim.classification === 'PREDICTION' &&
                            'This is a prediction about the future and cannot yet be verified.'}
                        {claim.classification === 'AMBIGUOUS' &&
                            'This claim is too vague or lacks context for verification.'}
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * Get color for confidence level
 */
function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.7) return '#22c55e';
    if (confidence >= 0.4) return '#f59e0b';
    return '#6b7280';
}
