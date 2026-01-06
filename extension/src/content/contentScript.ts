/**
 * Content Script
 * 
 * Injected into web pages to handle text selection.
 * Communicates with the background worker for verification.
 * 
 * Security Note:
 * - This script runs in the page context but isolated from page scripts
 * - Never handle API keys or sensitive data here
 * - Only sends selected text to background worker
 */

import { ExtensionMessage } from '../lib/types';

// ============================================================================
// TEXT SELECTION
// ============================================================================

/**
 * Get the currently selected text on the page
 */
function getSelectedText(): string | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return null;
    }

    const text = selection.toString().trim();
    return text.length > 0 ? text : null;
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Listen for messages from the popup or background worker
 */
chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
        switch (message.type) {
            case 'GET_SELECTED_TEXT':
                const selectedText = getSelectedText();
                sendResponse({
                    type: 'SELECTED_TEXT_RESPONSE',
                    text: selectedText
                } as ExtensionMessage);
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }

        // Synchronous response
        return false;
    }
);

// ============================================================================
// SELECTION CHANGE LISTENER (Optional Enhancement)
// ============================================================================

/**
 * Track text selection changes
 * This could be used to show an inline "Verify" button near selected text
 */
let lastSelection: string | null = null;

document.addEventListener('selectionchange', () => {
    const currentSelection = getSelectedText();

    if (currentSelection !== lastSelection) {
        lastSelection = currentSelection;

        // Could emit an event or show UI here
        // For MVP, we just track the selection for when popup opens
        if (currentSelection && currentSelection.length > 20) {
            console.log('[FactChecker] Text selected, length:', currentSelection.length);
        }
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('[FactChecker] Content script loaded');
