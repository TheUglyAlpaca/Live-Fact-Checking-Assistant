/**
 * Header Component
 * 
 * Top bar with branding and settings access.
 */

interface HeaderProps {
    onSettingsClick: () => void;
    showBack?: boolean;
}

export function Header({ onSettingsClick, showBack }: HeaderProps) {
    return (
        <header className="header">
            <div className="header-left">
                <div className="logo">
                    <span className="logo-icon">🔍</span>
                    <span className="logo-text">Fact Checker</span>
                </div>
            </div>
            <button
                className="settings-button"
                onClick={onSettingsClick}
                title={showBack ? 'Back' : 'Settings'}
            >
                {showBack ? '←' : '⚙️'}
            </button>
        </header>
    );
}
