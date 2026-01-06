import { Icons } from '../icons';

interface HeaderProps {
    onSettingsClick: () => void;
    showBack?: boolean;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

export function Header({ onSettingsClick, showBack, theme, onToggleTheme }: HeaderProps) {
    return (
        <header className="header">
            <div className="header-left">
                <div className="logo">
                    <Icons.Logo width={24} height={24} className="logo-icon-svg" />
                    <span className="logo-text">Tavily Fact Checker</span>
                </div>
            </div>
            <div className="header-actions">
                <button
                    className="theme-toggle"
                    onClick={onToggleTheme}
                    title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
                >
                    {theme === 'light' ? <Icons.Moon width={20} height={20} /> : <Icons.Sun width={20} height={20} />}
                </button>
                <button
                    className="settings-button"
                    onClick={onSettingsClick}
                    title={showBack ? 'Back' : 'Settings'}
                >
                    {showBack ? <Icons.Back width={20} height={20} /> : <Icons.Settings width={20} height={20} />}
                </button>
            </div>
        </header>
    );
}
