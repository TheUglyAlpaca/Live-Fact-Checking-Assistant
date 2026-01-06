/**
 * API Key Input Component
 * 
 * Secure input for Tavily API key configuration.
 */

import { useState } from 'react';

interface ApiKeyInputProps {
    onSave: (apiKey: string) => void;
}

export function ApiKeyInput({ onSave }: ApiKeyInputProps) {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim()) return;

        setIsSaving(true);
        try {
            await onSave(apiKey.trim());
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="api-key-section">
            <h2>Configure API Key</h2>
            <p className="api-key-description">
                This extension uses the Tavily API for web search.
                Get your free API key at{' '}
                <a
                    href="https://tavily.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                >
                    tavily.com
                </a>
            </p>

            <form onSubmit={handleSubmit} className="api-key-form">
                <div className="input-wrapper">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Tavily API key"
                        className="api-key-input"
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        className="toggle-visibility"
                        onClick={() => setShowKey(!showKey)}
                        title={showKey ? 'Hide key' : 'Show key'}
                    >
                        {showKey ? '👁️' : '👁️‍🗨️'}
                    </button>
                </div>

                <button
                    type="submit"
                    className="save-button"
                    disabled={!apiKey.trim() || isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save API Key'}
                </button>
            </form>

            <div className="security-note">
                <span className="security-icon">🔒</span>
                <span>Your API key is stored locally and never sent to our servers.</span>
            </div>
        </div>
    );
}
