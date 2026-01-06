/**
 * Main App Component
 * 
 * Root component for the fact-checking extension popup.
 * Manages the overall verification flow and state.
 */

import { useState, useEffect, useCallback } from 'react';
import { Claim, Verdict, VerificationState } from '../lib/types';
import { sendToBackground, sendToContentScript } from '../utils/messaging';
import { ClaimCard } from './components/ClaimCard';
import { ApiKeyInput } from './components/ApiKeyInput';
import { Header } from './components/Header';

/**
 * Main application state
 */
const initialState: VerificationState = {
    status: 'idle',
    progress: 0,
    claims: [],
    verdicts: [],
};

type Theme = 'light' | 'dark';

export default function App() {
    const [state, setState] = useState<VerificationState>(initialState);
    const [inputText, setInputText] = useState('');
    const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // Theme state initialization
    const [theme, setTheme] = useState<Theme>(() => {
        // Check local storage
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('theme') as Theme;
            if (saved === 'dark' || saved === 'light') return saved;
        }
        // Fallback to system preference
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    });

    // Apply theme effect
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Check for API key on mount
    useEffect(() => {
        checkApiKey();
        checkForPendingVerification();
        loadSelectedText();
    }, []);

    /**
     * Check if API key is configured
     */
    const checkApiKey = async () => {
        try {
            const response = await sendToBackground<{ hasKey: boolean }>({ type: 'GET_API_KEY' });
            setHasApiKey(response.hasKey);
            if (!response.hasKey) {
                setShowSettings(true);
            }
        } catch (error) {
            console.error('Failed to check API key:', error);
            setHasApiKey(false);
            setShowSettings(true);
        }
    };

    /**
     * Check for pending verification from context menu
     */
    const checkForPendingVerification = async () => {
        try {
            const result = await chrome.storage.session.get('pendingVerification');
            if (result.pendingVerification) {
                const { text, timestamp } = result.pendingVerification;
                // Only use if less than 30 seconds old
                if (Date.now() - timestamp < 30000) {
                    setInputText(text);
                    // Clear the pending verification
                    await chrome.storage.session.remove('pendingVerification');
                    // Auto-start verification
                    handleVerify(text);
                }
            }
        } catch (error) {
            console.error('Failed to check pending verification:', error);
        }
    };

    /**
     * Load selected text from the active tab
     */
    const loadSelectedText = async () => {
        try {
            const response = await sendToContentScript<{ text: string | null }>({
                type: 'GET_SELECTED_TEXT'
            });
            if (response.text) {
                setInputText(response.text);
            }
        } catch (error) {
            // Content script might not be loaded yet, ignore
            console.log('Could not get selected text:', error);
        }
    };

    /**
     * Handle verification request
     */
    const handleVerify = useCallback(async (text?: string) => {
        const textToVerify = text || inputText;

        if (!textToVerify.trim()) {
            setState(prev => ({ ...prev, error: 'Please enter some text to verify' }));
            return;
        }

        setState({
            status: 'extracting',
            progress: 10,
            claims: [],
            verdicts: [],
        });

        try {
            // Send to background for verification
            setState(prev => ({ ...prev, status: 'searching', progress: 30 }));

            const response = await sendToBackground<{
                claims: Claim[];
                verdicts: Verdict[];
                error?: string;
            }>({ type: 'VERIFY_TEXT', text: textToVerify });

            if (response.error) {
                setState({
                    status: 'error',
                    progress: 0,
                    claims: [],
                    verdicts: [],
                    error: response.error,
                });
                return;
            }

            setState({
                status: 'complete',
                progress: 100,
                claims: response.claims,
                verdicts: response.verdicts,
            });

        } catch (error) {
            setState({
                status: 'error',
                progress: 0,
                claims: [],
                verdicts: [],
                error: error instanceof Error ? error.message : 'Verification failed',
            });
        }
    }, [inputText]);

    /**
     * Handle API key save
     */
    const handleApiKeySave = async (apiKey: string) => {
        try {
            await sendToBackground({ type: 'SET_API_KEY', apiKey });
            setHasApiKey(true);
            setShowSettings(false);
        } catch (error) {
            console.error('Failed to save API key:', error);
        }
    };

    /**
     * Get verdict for a specific claim
     */
    const getVerdictForClaim = (claimId: string): Verdict | undefined => {
        return state.verdicts.find(v => v.claimId === claimId);
    };

    /**
     * Reset to initial state
     */
    const handleReset = () => {
        setState(initialState);
        setInputText('');
    };

    // Show loading state while checking API key
    if (hasApiKey === null) {
        return (
            <div className="app">
                <Header
                    onSettingsClick={() => setShowSettings(true)}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                />
                <div className="loading">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    // Show settings if no API key or settings requested
    if (showSettings) {
        return (
            <div className="app">
                <Header
                    onSettingsClick={() => setShowSettings(false)}
                    showBack={hasApiKey === true}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                />
                <ApiKeyInput onSave={handleApiKeySave} />
            </div>
        );
    }

    return (
        <div className="app">
            <Header
                onSettingsClick={() => setShowSettings(true)}
                theme={theme}
                onToggleTheme={toggleTheme}
            />

            {/* Input Section */}
            {state.status === 'idle' && (
                <div className="input-section">
                    <textarea
                        className="text-input"
                        placeholder="Paste text to fact-check, or select text on a webpage and click the extension icon..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        rows={6}
                    />
                    <button
                        className="verify-button"
                        onClick={() => handleVerify()}
                        disabled={!inputText.trim()}
                    >
                        Verify Claims
                    </button>
                </div>
            )}

            {/* Loading State */}
            {(state.status === 'extracting' || state.status === 'searching' || state.status === 'analyzing') && (
                <div className="loading-section">
                    <div className="spinner" />
                    <p className="loading-text">
                        {state.status === 'extracting' && 'Extracting claims...'}
                        {state.status === 'searching' && 'Searching for evidence...'}
                        {state.status === 'analyzing' && 'Analyzing sources...'}
                    </p>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${state.progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Error State */}
            {state.status === 'error' && (
                <div className="error-section">
                    <div className="error-icon">⚠️</div>
                    <p className="error-message">{state.error}</p>
                    <button className="retry-button" onClick={handleReset}>
                        Try Again
                    </button>
                </div>
            )}

            {/* Results Section */}
            {state.status === 'complete' && (
                <div className="results-section">
                    <div className="results-header">
                        <h2>Results</h2>
                        <div className="results-actions">
                            <button className="new-check-button" onClick={handleReset}>
                                New Check
                            </button>
                        </div>
                    </div>

                    {state.claims.length === 0 ? (
                        <div className="no-claims">
                            <p>No verifiable claims found in the text.</p>
                        </div>
                    ) : (
                        <div className="claims-list">
                            {state.claims.map((claim) => (
                                <ClaimCard
                                    key={claim.id}
                                    claim={claim}
                                    verdict={getVerdictForClaim(claim.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
