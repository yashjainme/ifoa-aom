import { computeHash } from './fetcher.js';

/**
 * Compare two hashes to determine if content changed
 */
export function hasContentChanged(oldHash: string, newHash: string): boolean {
    return oldHash !== newHash;
}

/**
 * Compute hash for text content
 */
export function hashText(text: string): string {
    return computeHash(text);
}

/**
 * Compare two text contents and return if they differ
 */
export function diffTexts(oldText: string, newText: string): {
    changed: boolean;
    oldHash: string;
    newHash: string;
} {
    const oldHash = computeHash(oldText);
    const newHash = computeHash(newText);

    return {
        changed: oldHash !== newHash,
        oldHash,
        newHash
    };
}
