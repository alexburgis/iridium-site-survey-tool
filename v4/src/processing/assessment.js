/**
 * Assessment and verdict calculations
 * Service uptime, horizon analysis, and overall site verdict
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { calculateGridCoverage, analyzeHorizonVisibility } from './coverage.js';

/**
 * Calculate service uptime statistics
 * Uses actual survey duration (excluding gaps between sessions) as the time base
 * @returns {Object|null} Service statistics or null if insufficient data
 */
export function calculateServiceUptime() {
    const serviceEvents = store.get('serviceEvents');
    const startTime = store.get('startTime');
    const loadedDuration = store.get('loadedDuration') || 0;
    const loadedUptime = store.get('loadedUptime') || 0;
    const loadedOutageCount = store.get('loadedOutageCount') || 0;

    // Calculate uptime from current session's service events only
    const sortedEvents = [...serviceEvents].sort((a, b) => a.timestamp - b.timestamp);

    let sessionUptimeMs = 0;
    let lastOnTime = null;
    let sessionOutageCount = 0;

    for (const event of sortedEvents) {
        if (event.available) {
            // Service came online
            lastOnTime = event.timestamp;
        } else {
            // Service went offline
            if (lastOnTime !== null) {
                sessionUptimeMs += event.timestamp - lastOnTime;
                lastOnTime = null;
                sessionOutageCount++;
            }
        }
    }

    // If still online, count time until now
    if (lastOnTime !== null) {
        sessionUptimeMs += Date.now() - lastOnTime;
    }

    // Use actual survey duration as the time base (not event timestamps)
    // This excludes gaps between sessions when a saved session is loaded and continued
    const currentSessionMs = startTime ? Date.now() - startTime : 0;
    const totalMs = loadedDuration + currentSessionMs;

    // Combine loaded uptime with current session uptime
    const totalUptimeMs = loadedUptime + sessionUptimeMs;
    const totalOutageCount = loadedOutageCount + sessionOutageCount;

    // Need either loaded data or current session data
    if (totalMs <= 0 && loadedDuration === 0) return null;
    if (totalMs <= 0) return null;

    return {
        uptimeMs: totalUptimeMs,
        totalMs,
        percentage: (totalUptimeMs / totalMs) * 100,
        outageCount: totalOutageCount
    };
}

/**
 * Get score CSS class based on percentage (matching v3 thresholds)
 * @param {number} percentage - Score percentage
 * @returns {string} CSS class name
 */
export function getScoreClass(percentage) {
    if (percentage >= 80) return 'score-excellent';
    if (percentage >= 65) return 'score-good';
    if (percentage >= 45) return 'score-moderate';
    if (percentage >= 25) return 'score-poor';
    return 'score-fail';
}

/**
 * Calculate horizon score based on direction classifications
 * @param {Object} horizonAnalysis - Result from analyzeHorizonVisibility
 * @returns {number} Weighted score 0-100
 */
export function calculateHorizonScore(horizonAnalysis) {
    const { dirsClear, dirsPartial, dirsSparse, dirsBlocked } = horizonAnalysis;
    const totalDirs = dirsClear + dirsPartial + dirsSparse + dirsBlocked;

    if (totalDirs === 0) return 0;

    // Weight: clear=1.0, partial=0.7, sparse=0.3, blocked=0.0
    const score = (dirsClear * 1.0 + dirsPartial * 0.7 + dirsSparse * 0.3) / totalDirs;
    return Math.round(score * 100);
}

/**
 * Get overall site verdict (matching v3 logic exactly)
 * @param {Object} options - Assessment data
 * @returns {Object} Verdict with short, class, and detail fields
 */
export function getVerdict(options = {}) {
    const serviceStats = options.serviceStats || calculateServiceUptime();
    const gridCoverage = options.gridCoverage || calculateGridCoverage();
    const horizonAnalysis = options.horizonAnalysis || analyzeHorizonVisibility();

    // Not enough data
    if (!serviceStats || serviceStats.totalMs < 60000) {
        return {
            short: '--',
            class: '',
            detail: 'Collecting data...'
        };
    }

    const uptime = serviceStats.percentage;
    const horizonPct = calculateHorizonScore(horizonAnalysis);
    const { dirsClear, dirsPartial, dirsSparse, dirsBlocked } = horizonAnalysis;

    // v3 exact verdict logic:
    // EXCELLENT: All or nearly all clear, no blocked, high uptime
    if (uptime >= 95 && dirsClear >= 7 && dirsBlocked === 0 && dirsSparse === 0) {
        return { short: '✓ EXCELLENT', class: 'score-excellent', detail: 'High uptime, clear horizon' };
    }

    // GOOD: Mostly clear, minor degradation acceptable
    if (uptime >= 90 && dirsClear >= 5 && dirsBlocked === 0 && dirsSparse <= 1) {
        return { short: '✓ GOOD', class: 'score-good', detail: 'Reliable connectivity expected' };
    }

    // ADEQUATE: Usable but has notable partial/sparse directions
    if (uptime >= 80 && dirsBlocked <= 1 && horizonPct >= 50) {
        return { short: '⚠ ADEQUATE', class: 'score-moderate', detail: 'Usable with occasional dropouts' };
    }

    // MARGINAL: Significant obstructions or low uptime
    if (uptime >= 60 && dirsBlocked <= 2) {
        return { short: '⚠ MARGINAL', class: 'score-poor', detail: 'Frequent connectivity gaps likely' };
    }

    return { short: '✗ POOR', class: 'score-fail', detail: 'Unreliable - consider different location' };
}

/**
 * Calculate complete assessment summary
 * @returns {Object} Full assessment data
 */
export function calculateAssessment() {
    const serviceStats = calculateServiceUptime();
    const gridCoverage = calculateGridCoverage();
    const horizonAnalysis = analyzeHorizonVisibility();
    const horizonScore = calculateHorizonScore(horizonAnalysis);
    const verdict = getVerdict({ serviceStats, gridCoverage, horizonAnalysis });

    return {
        serviceStats,
        gridCoverage,
        horizonAnalysis,
        horizonScore,
        verdict
    };
}
