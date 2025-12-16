/**
 * Coverage grid calculations
 * Functions for analyzing and initializing coverage data
 */

import { CONFIG } from '../config.js';
import { store, createEmptyCoverageGrid } from '../state/store.js';

/**
 * Initialize or reset the coverage grid
 */
export function initCoverageGrid() {
    store.set('coverageGrid', createEmptyCoverageGrid());
}

/**
 * Get the minimum observations threshold based on survey duration
 * @param {number} surveyHours - Survey duration in hours
 * @returns {number} Minimum observations for a cell to be considered valid
 */
export function getMinObservationsThreshold(surveyHours) {
    for (const threshold of CONFIG.minReportsThresholds) {
        if (surveyHours < threshold.hours) {
            return threshold.minReports;
        }
    }
    return CONFIG.minReportsThresholds[CONFIG.minReportsThresholds.length - 1].minReports;
}

/**
 * Calculate grid coverage statistics
 * @returns {Object} Coverage statistics
 */
export function calculateGridCoverage() {
    const coverageGrid = store.get('coverageGrid');
    const startTime = store.get('startTime');
    const loadedDuration = store.get('loadedDuration');

    // Calculate survey duration
    const sessionElapsed = startTime ? Date.now() - startTime : 0;
    const totalElapsed = sessionElapsed + loadedDuration;
    const surveyHours = totalElapsed / 3600000;

    const minObsForValid = getMinObservationsThreshold(surveyHours);

    let totalCells = 0;
    let cellsWithObs = 0;
    let horizonCellsTotal = 0;
    let horizonCellsWithObs = 0;

    CONFIG.azimuthSectors.forEach((_, azIdx) => {
        CONFIG.elevationBands.forEach((band, elIdx) => {
            const key = `${azIdx}_${elIdx}`;
            const cell = coverageGrid[key];

            totalCells++;
            if (cell.count >= minObsForValid) {
                cellsWithObs++;
            }

            // Track horizon bands (8-14° and 14-20°)
            if (band.horizon) {
                horizonCellsTotal++;
                if (cell.count >= minObsForValid) {
                    horizonCellsWithObs++;
                }
            }
        });
    });

    const percentage = totalCells > 0 ? Math.round(cellsWithObs / totalCells * 100) : 0;
    const horizonPercentage = horizonCellsTotal > 0
        ? Math.round(horizonCellsWithObs / horizonCellsTotal * 100) : 0;

    return {
        totalCells,
        cellsWithObs,
        percentage,
        horizonCellsTotal,
        horizonCellsWithObs,
        horizonPercentage,
        surveyHours,
        minObsForValid
    };
}

/**
 * Analyze horizon visibility per direction
 * @returns {Object} Horizon analysis results
 */
export function analyzeHorizonVisibility() {
    const coverageGrid = store.get('coverageGrid');
    const startTime = store.get('startTime');
    const loadedDuration = store.get('loadedDuration');

    // Calculate survey duration
    const sessionElapsed = startTime ? Date.now() - startTime : 0;
    const totalElapsed = sessionElapsed + loadedDuration;
    const surveyHours = totalElapsed / 3600000;

    const minObsForValid = getMinObservationsThreshold(surveyHours);

    // Find the lowest horizon band index (8-14°)
    const lowestHorizonBandIdx = CONFIG.elevationBands.findIndex(b => b.horizon);

    // Track per-direction horizon visibility
    const horizonByDir = {};
    CONFIG.azimuthSectors.forEach((_, azIdx) => {
        horizonByDir[azIdx] = {
            lowestBandCount: 0,
            totalCount: 0,
            hasBothBands: true
        };
    });

    // Analyze each direction
    CONFIG.azimuthSectors.forEach((_, azIdx) => {
        CONFIG.elevationBands.forEach((band, elIdx) => {
            if (!band.horizon) return;

            const key = `${azIdx}_${elIdx}`;
            const cell = coverageGrid[key];

            if (cell.count >= minObsForValid) {
                horizonByDir[azIdx].totalCount += cell.count;
                if (elIdx === lowestHorizonBandIdx) {
                    horizonByDir[azIdx].lowestBandCount = cell.count;
                }
            } else {
                horizonByDir[azIdx].hasBothBands = false;
            }
        });
    });

    // Calculate classification thresholds
    const maxLowestBandCount = Math.max(
        ...Object.values(horizonByDir).map(d => d.lowestBandCount)
    );

    const { clearThreshold, partialThreshold } = CONFIG.assessment;

    // Classify each direction
    let dirsClear = 0;
    let dirsPartial = 0;
    let dirsSparse = 0;
    let dirsBlocked = 0;

    const directionDetails = {};

    CONFIG.azimuthSectors.forEach((dirName, azIdx) => {
        const dir = horizonByDir[azIdx];
        let classification;

        if (!dir.hasBothBands) {
            classification = 'blocked';
            dirsBlocked++;
        } else if (maxLowestBandCount > 0) {
            const ratio = dir.lowestBandCount / maxLowestBandCount;
            if (ratio >= clearThreshold) {
                classification = 'clear';
                dirsClear++;
            } else if (ratio >= partialThreshold) {
                classification = 'partial';
                dirsPartial++;
            } else {
                classification = 'sparse';
                dirsSparse++;
            }
        } else {
            classification = 'blocked';
            dirsBlocked++;
        }

        directionDetails[dirName] = {
            classification,
            lowestBandCount: dir.lowestBandCount,
            totalCount: dir.totalCount,
            ratio: maxLowestBandCount > 0 ? dir.lowestBandCount / maxLowestBandCount : 0
        };
    });

    return {
        dirsClear,
        dirsPartial,
        dirsSparse,
        dirsBlocked,
        directionDetails,
        maxLowestBandCount
    };
}

/**
 * Get cell data for a specific grid position
 * @param {number} azIdx - Azimuth index
 * @param {number} elIdx - Elevation index
 * @returns {Object} Cell data
 */
export function getCellData(azIdx, elIdx) {
    const coverageGrid = store.get('coverageGrid');
    const key = `${azIdx}_${elIdx}`;
    return coverageGrid[key] || { count: 0, satellites: new Set() };
}

/**
 * Get CSS class for cell count visualization
 * Uses relative scaling to max count (matching v3)
 * @param {number} count - Observation count
 * @param {number} maxCount - Maximum observation count across all cells
 * @returns {string} CSS class name
 */
export function getCellClass(count, maxCount) {
    if (count === 0) return 'cell-no-data';
    // Scale relative to max observed count
    const ratio = maxCount > 0 ? count / maxCount : 0;
    if (ratio < 0.1) return 'cell-obs-1';
    if (ratio < 0.25) return 'cell-obs-2';
    if (ratio < 0.5) return 'cell-obs-3';
    if (ratio < 0.75) return 'cell-obs-4';
    return 'cell-obs-5';
}

/**
 * Get the maximum observation count across all grid cells
 * @returns {number} Maximum count
 */
export function getMaxCellCount() {
    const coverageGrid = store.get('coverageGrid');
    let maxCount = 0;
    Object.values(coverageGrid).forEach(cell => {
        if (cell.count > maxCount) maxCount = cell.count;
    });
    return maxCount;
}
