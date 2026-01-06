/**
 * Verdict Badge Component
 * 
 * Color-coded indicator for claim verification verdict.
 */

import { VerdictLabel } from '../../lib/types';
import { getVerdictColor, getVerdictShortLabel, getVerdictIcon } from '../../lib/verdictEngine';

interface VerdictBadgeProps {
    verdict: VerdictLabel;
    size?: 'small' | 'medium' | 'large';
}

export function VerdictBadge({ verdict, size = 'medium' }: VerdictBadgeProps) {
    const color = getVerdictColor(verdict);
    const label = getVerdictShortLabel(verdict);
    const icon = getVerdictIcon(verdict);

    return (
        <span
            className={`verdict-badge verdict-badge-${size}`}
            style={{
                backgroundColor: color,
                color: '#ffffff',
            }}
        >
            <span className="verdict-icon">{icon}</span>
            <span className="verdict-label">{label}</span>
        </span>
    );
}
