/**
 * Chrome Extension Messaging Utilities
 * 
 * Provides type-safe wrappers for Chrome extension message passing.
 * Handles communication between popup, content script, and background worker.
 */

import { ExtensionMessage } from '../lib/types';

/**
 * Send a message to the background service worker
 * 
 * @param message - The message to send
 * @returns Promise that resolves with the response
 */
export async function sendToBackground<T = unknown>(message: ExtensionMessage): Promise<T> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response as T);
            }
        });
    });
}

/**
 * Send a message to the active tab's content script
 * 
 * @param message - The message to send
 * @returns Promise that resolves with the response
 */
export async function sendToContentScript<T = unknown>(message: ExtensionMessage): Promise<T> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
        throw new Error('No active tab found');
    }

    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id!, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response as T);
            }
        });
    });
}

/**
 * Register a message handler in the background worker or content script
 * 
 * @param handler - Function to handle incoming messages
 */
export function onMessage(
    handler: (
        message: ExtensionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: unknown) => void
    ) => boolean | void
): void {
    chrome.runtime.onMessage.addListener(handler);
}

/**
 * Storage utilities for API key management
 */
export const storage = {
    /**
     * Get the stored API key
     */
    async getApiKey(): Promise<string | null> {
        const result = await chrome.storage.local.get('tavilyApiKey');
        return result.tavilyApiKey || null;
    },

    /**
     * Store the API key
     */
    async setApiKey(apiKey: string): Promise<void> {
        await chrome.storage.local.set({ tavilyApiKey: apiKey });
    },

    /**
     * Remove the stored API key
     */
    async removeApiKey(): Promise<void> {
        await chrome.storage.local.remove('tavilyApiKey');
    },

    /**
     * Check if an API key is stored
     */
    async hasApiKey(): Promise<boolean> {
        const key = await this.getApiKey();
        return key !== null && key.length > 0;
    },
};
