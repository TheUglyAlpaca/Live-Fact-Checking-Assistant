/**
 * API Key Input Component
 * 
 * Secure input for Tavily API key configuration.
 */

import { useState, useEffect } from 'react';
import { storage } from '../../utils/messaging';

interface ApiKeyInputProps {
    onSave: (apiKey: string) => void;
}

export function ApiKeyInput({ onSave }: ApiKeyInputProps) {
    const [apiKey, setApiKey] = useState('');
    const [storedKey, setStoredKey] = useState<string | null>(null);
    const [showStoredKey, setShowStoredKey] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Load stored API key on mount
    useEffect(() => {
        storage.getApiKey().then((key: string | null) => {
            if (key) {
                setStoredKey(key);
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim()) return;

        setIsSaving(true);
        try {
            await onSave(apiKey.trim());
            setStoredKey(apiKey.trim());
            setApiKey('');
        } finally {
            setIsSaving(false);
        }
    };

    const maskKey = (key: string) => {
        if (key.length <= 8) return '••••••••';
        return key.slice(0, 4) + '••••••••' + key.slice(-4);
    };

    return (
        <div className="api-key-section">
            <h2>Configure API Key</h2>
            <p className="api-key-description">
                This extension uses the Tavily API for web search.
            </p>

            {storedKey && (
                <div className="stored-key-section">
                    <h3>Current API Key</h3>
                    <div className="stored-key-display">
                        <code className="stored-key">
                            {showStoredKey ? storedKey : maskKey(storedKey)}
                        </code>
                        <button
                            type="button"
                            className="toggle-visibility"
                            onClick={() => setShowStoredKey(!showStoredKey)}
                            title={showStoredKey ? 'Hide key' : 'Show key'}
                        >
                            {showStoredKey ? '👁️' : '👁️‍🗨️'}
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="api-key-form">
                <h3>{storedKey ? 'Update API Key' : 'Enter API Key'}</h3>
                <div className="input-wrapper">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={storedKey ? 'Enter new API key' : 'Enter your Tavily API key'}
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
                    {isSaving ? 'Saving...' : storedKey ? 'Update API Key' : 'Save API Key'}
                </button>
            </form>

            <div className="security-note">
                <span className="security-icon">🔒</span>
                <span>Your API key is stored locally and never sent to our servers.</span>
            </div>
        </div>
    );
}
