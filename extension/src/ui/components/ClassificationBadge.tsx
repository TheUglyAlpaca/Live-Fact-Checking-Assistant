/**
 * Classification Badge Component
 * 
 * Visual indicator for claim classification type.
 */

import { ClaimClassification } from '../../lib/types';

interface ClassificationBadgeProps {
    classification: ClaimClassification;
}

export function ClassificationBadge({ classification }: ClassificationBadgeProps) {
    const config = getClassificationConfig(classification);

    return (
        <span
            className="classification-badge"
            style={{
                backgroundColor: config.backgroundColor,
                color: config.textColor,
            }}
        >
            {config.icon} {config.label}
        </span>
    );
}

interface ClassificationConfig {
    label: string;
    icon: string;
    backgroundColor: string;
    textColor: string;
}

function getClassificationConfig(classification: ClaimClassification): ClassificationConfig {
    switch (classification) {
        case 'FACTUAL':
            return {
                label: 'Factual',
                icon: '📋',
                backgroundColor: '#dbeafe',
                textColor: '#1e40af',
            };
        case 'OPINION':
            return {
                label: 'Opinion',
                icon: '💭',
                backgroundColor: '#fef3c7',
                textColor: '#92400e',
            };
        case 'PREDICTION':
            return {
                label: 'Prediction',
                icon: '🔮',
                backgroundColor: '#e9d5ff',
                textColor: '#6b21a8',
            };
        case 'AMBIGUOUS':
        default:
            return {
                label: 'Unclear',
                icon: '❓',
                backgroundColor: '#f3f4f6',
                textColor: '#4b5563',
            };
    }
}
