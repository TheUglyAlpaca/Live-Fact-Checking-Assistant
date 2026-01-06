/**
 * Citation List Component
 * 
 * Displays sources used to verify a claim.
 * Provides transparency into the evidence.
 */

import { Citation } from '../../lib/types';

interface CitationListProps {
    citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
    if (citations.length === 0) {
        return null;
    }

    return (
        <div className="citations-list">
            <h4 className="citations-heading">Sources</h4>
            {citations.map((citation, index) => (
                <div key={index} className="citation-item">
                    <div className="citation-header">
                        <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="citation-source"
                        >
                            {citation.source}
                        </a>
                        <span className="citation-link-icon">↗</span>
                    </div>
                    <p className="citation-snippet">"{citation.snippet}"</p>
                </div>
            ))}
        </div>
    );
}
