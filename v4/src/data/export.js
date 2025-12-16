/**
 * Export functionality
 * CSV, JSON, and text report generation
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { downloadFile, formatTimestamp } from '../utils/helpers.js';
import { calculateAssessment, getVerdict, calculateServiceUptime } from '../processing/assessment.js';
import { calculateGridCoverage, analyzeHorizonVisibility, getMinObservationsThreshold } from '../processing/coverage.js';

/**
 * Export data as CSV
 */
export function exportCSV() {
    const rssiReports = store.get('rssiReports');
    const svBeamReports = store.get('svBeamReports');
    const serviceEvents = store.get('serviceEvents');

    let csv = 'timestamp,type,value,sv_id,beam_id,elevation,azimuth,x,y,z\n';

    rssiReports.forEach(r => {
        csv += `${r.timestamp},rssi,${r.rssi},,,,,,\n`;
    });

    svBeamReports.forEach(r => {
        csv += `${r.timestamp},svbeam,,${r.svId},${r.beamId},${r.elevation.toFixed(1)},${r.azimuth.toFixed(1)},${r.x},${r.y},${r.z}\n`;
    });

    serviceEvents.forEach(r => {
        csv += `${r.timestamp},service,${r.available ? 1 : 0},,,,,,\n`;
    });

    downloadFile(csv, `survey_${Date.now()}.csv`, 'text/csv');
    events.emit(EVENT_TYPES.TOAST, { message: 'CSV exported', type: 'success' });
}

/**
 * Export data as JSON
 */
export function exportJSON() {
    const observer = store.get('observer');
    const rssiReports = store.get('rssiReports');
    const svBeamReports = store.get('svBeamReports');
    const serviceEvents = store.get('serviceEvents');
    const coverageGrid = store.get('coverageGrid');
    const satellites = store.get('satellites');

    const serviceStats = calculateServiceUptime();
    const summary = calculateSummary();

    // Serialize coverage grid (convert Sets to Arrays)
    const coverageGridExport = {};
    Object.entries(coverageGrid).forEach(([key, cell]) => {
        coverageGridExport[key] = {
            count: cell.count,
            satellites: Array.from(cell.satellites)
        };
    });

    const exportData = {
        exportTime: new Date().toISOString(),
        location: observer,
        config: CONFIG,
        summary: summary,
        serviceStats: serviceStats,
        coverageGrid: coverageGridExport,
        satellites: Array.from(satellites.entries()).map(([id, sat]) => ({
            svId: id,
            reportCount: sat.reports.length,
            beamCount: sat.beams.size
        })),
        rssiReports: rssiReports,
        svBeamReports: svBeamReports,
        serviceEvents: serviceEvents
    };

    downloadFile(JSON.stringify(exportData, null, 2), `survey_${Date.now()}.json`, 'application/json');
    events.emit(EVENT_TYPES.TOAST, { message: 'JSON exported', type: 'success' });
}

/**
 * Calculate summary statistics for export
 * @returns {Object} Summary data
 */
function calculateSummary() {
    const rssiReports = store.get('rssiReports');
    const svBeamReports = store.get('svBeamReports');
    const satellites = store.get('satellites');
    const startTime = store.get('startTime');
    const loadedDuration = store.get('loadedDuration');

    const sessionElapsed = startTime ? Date.now() - startTime : 0;
    const totalElapsed = sessionElapsed + loadedDuration;
    const surveyHours = totalElapsed / 3600000;

    const gridCoverage = calculateGridCoverage();
    const horizonAnalysis = analyzeHorizonVisibility();
    const serviceStats = calculateServiceUptime();

    // Calculate weighted horizon visibility
    const { dirsClear, dirsPartial, dirsSparse, dirsBlocked } = horizonAnalysis;
    const totalDirs = CONFIG.azimuthSectors.length;
    const effectiveVisible = dirsClear + (dirsPartial * 0.7) + (dirsSparse * 0.3);
    const horizonVisibility = Math.round(effectiveVisible / totalDirs * 100);

    // Calculate average RSSI
    const avgRssi = rssiReports.length > 0
        ? (rssiReports.reduce((a, b) => a + b.rssi, 0) / rssiReports.length).toFixed(2)
        : null;

    return {
        serviceUptime: serviceStats?.percentage?.toFixed(1) || null,
        gridCoverage: gridCoverage.percentage,
        horizonVisibility: horizonVisibility,
        dirsClear: dirsClear,
        dirsPartial: dirsPartial,
        dirsSparse: dirsSparse,
        dirsBlocked: dirsBlocked,
        totalObservations: svBeamReports.length,
        rssiReadings: rssiReports.length,
        satellitesTracked: satellites.size,
        avgRssi: avgRssi,
        surveyHours: surveyHours.toFixed(1),
        minObsThreshold: gridCoverage.minObsForValid
    };
}

/**
 * Export detailed text report
 */
export function exportReport() {
    const observer = store.get('observer');
    const coverageGrid = store.get('coverageGrid');
    const satellites = store.get('satellites');

    const summary = calculateSummary();
    const isAdvanced = localStorage.getItem('advancedMode') === 'true';

    // Only calculate assessment in advanced mode
    let verdict = null;
    if (isAdvanced) {
        const assessment = calculateAssessment();
        verdict = assessment.verdict;
    }

    // Build per-direction analysis
    const lowestHorizonBandIdx = CONFIG.elevationBands.findIndex(b => b.horizon);
    const directionAnalysis = [];
    let maxLowestBandCount = 0;

    CONFIG.azimuthSectors.forEach((dir, azIdx) => {
        const lowestBandCell = coverageGrid[`${azIdx}_${lowestHorizonBandIdx}`];
        const secondBandCell = coverageGrid[`${azIdx}_${lowestHorizonBandIdx + 1}`];
        const count = lowestBandCell?.count || 0;
        if (count > maxLowestBandCount) maxLowestBandCount = count;
        directionAnalysis.push({
            dir,
            azIdx,
            lowestCount: count,
            secondCount: secondBandCell?.count || 0,
            hasBothBands: count >= summary.minObsThreshold && (secondBandCell?.count || 0) >= summary.minObsThreshold
        });
    });

    // Classify each direction (only used in advanced mode)
    if (isAdvanced) {
        directionAnalysis.forEach(d => {
            if (!d.hasBothBands) {
                d.tier = 'BLOCKED';
                d.ratio = 0;
            } else if (maxLowestBandCount > 0) {
                d.ratio = d.lowestCount / maxLowestBandCount;
                if (d.ratio >= 0.70) d.tier = 'CLEAR';
                else if (d.ratio >= 0.40) d.tier = 'PARTIAL';
                else d.tier = 'SPARSE';
            } else {
                d.tier = 'CLEAR';
                d.ratio = 1.0;
            }
        });
    }

    // Find best direction
    const bestDir = directionAnalysis.reduce((a, b) => a.lowestCount > b.lowestCount ? a : b);

    let report = `
IRIDIUM SITE SURVEY REPORT
==========================
Generated: ${new Date().toISOString()}
Location: ${observer.lat.toFixed(5)}, ${observer.lon.toFixed(5)}
Survey Duration: ${summary.surveyHours} hours
`;

    // Include verdict only in advanced mode
    if (isAdvanced && verdict) {
        report += `
VERDICT: ${verdict.short}
${verdict.detail}
`;
    }

    report += `
KEY METRICS
-----------
Service Uptime: ${summary.serviceUptime || 'N/A'}%
Average RSSI (site-level): ${summary.avgRssi || 'N/A'} bars
Satellites Tracked: ${summary.satellitesTracked}
Total Observations: ${summary.totalObservations}
RSSI Readings: ${summary.rssiReadings}
`;

    // Include scoring metrics only in advanced mode
    if (isAdvanced) {
        report += `Grid Coverage: ${summary.gridCoverage}%
Horizon Score: ${summary.horizonVisibility}% (weighted)
Horizon Breakdown: ${summary.dirsClear} clear, ${summary.dirsPartial} partial, ${summary.dirsSparse} sparse, ${summary.dirsBlocked} blocked

HORIZON ANALYSIS (8-14 Critical Band)
--------------------------------------
Reference: ${bestDir.dir} direction has ${bestDir.lowestCount} observations (100%)
Thresholds: Clear >=70%, Partial 40-70%, Sparse <40%, Blocked = missing data

`;
    } else {
        report += '\n';
    }

    // Per-direction breakdown (advanced mode only)
    if (isAdvanced) {
        directionAnalysis.forEach(d => {
            const pct = maxLowestBandCount > 0 ? Math.round(d.ratio * 100) : 100;
            const tierIcon = d.tier === 'CLEAR' ? '[OK]' : d.tier === 'PARTIAL' ? '[--]' : d.tier === 'SPARSE' ? '[**]' : '[XX]';
            report += `  ${d.dir.padEnd(3)} ${tierIcon} ${d.tier.padEnd(7)} - ${d.lowestCount.toString().padStart(4)} obs (${pct.toString().padStart(3)}%)`;
            if (d.tier === 'PARTIAL') report += ' - minor obstruction likely';
            if (d.tier === 'SPARSE') report += ' - significant blocking detected';
            if (d.tier === 'BLOCKED') report += ' - severe obstruction or no data';
            report += '\n';
        });

        report += `
DETAILED ASSESSMENT
-------------------
`;

        // Service uptime assessment
        const uptime = parseFloat(summary.serviceUptime) || 0;
        if (uptime >= 95) {
            report += `Service: EXCELLENT - ${uptime}% uptime indicates highly reliable connectivity.\n`;
        } else if (uptime >= 90) {
            report += `Service: GOOD - ${uptime}% uptime should provide reliable service with rare dropouts.\n`;
        } else if (uptime >= 80) {
            report += `Service: ADEQUATE - ${uptime}% uptime will have occasional connectivity gaps.\n`;
        } else if (uptime >= 60) {
            report += `Service: MARGINAL - ${uptime}% uptime indicates frequent connectivity issues.\n`;
        } else {
            report += `Service: POOR - ${uptime}% uptime is unreliable for operational use.\n`;
        }

        // Horizon assessment
        if (summary.dirsBlocked > 0) {
            const blockedDirs = directionAnalysis.filter(d => d.tier === 'BLOCKED').map(d => d.dir).join(', ');
            report += `Horizon: ${summary.dirsBlocked} BLOCKED direction(s): ${blockedDirs}. Severe obstruction detected.\n`;
        }
        if (summary.dirsSparse > 0) {
            const sparseDirs = directionAnalysis.filter(d => d.tier === 'SPARSE').map(d => `${d.dir} (${Math.round(d.ratio * 100)}%)`).join(', ');
            report += `Horizon: ${summary.dirsSparse} SPARSE direction(s): ${sparseDirs}. Significant partial blocking.\n`;
        }
        if (summary.dirsPartial > 0) {
            const partialDirs = directionAnalysis.filter(d => d.tier === 'PARTIAL').map(d => `${d.dir} (${Math.round(d.ratio * 100)}%)`).join(', ');
            report += `Horizon: ${summary.dirsPartial} PARTIAL direction(s): ${partialDirs}. Minor obstruction possible.\n`;
        }
        if (summary.dirsClear === 8) {
            report += `Horizon: All 8 directions CLEAR - excellent unobstructed sky view.\n`;
        } else if (summary.dirsClear >= 6 && summary.dirsBlocked === 0) {
            report += `Horizon: ${summary.dirsClear}/8 directions clear with no blocked sectors - good visibility.\n`;
        }

        // Survey duration warning
        if (parseFloat(summary.surveyHours) < 48) {
            report += `\nWARNING: Survey duration (${summary.surveyHours}hrs) is below recommended 48 hours.\n`;
            report += `Results are preliminary - intermittent issues may not be captured.\n`;
        }

        // Recommendations
        report += `
RECOMMENDATIONS
---------------
`;
        if (verdict.short.includes('EXCELLENT')) {
            report += `This site is excellent for Iridium installation. No action needed.\n`;
        } else if (verdict.short.includes('GOOD')) {
            report += `This site should provide reliable service. Minor improvements optional.\n`;
        } else if (verdict.short.includes('ADEQUATE')) {
            report += `Site is usable but consider:\n`;
            if (summary.dirsSparse > 0 || summary.dirsPartial > 2) {
                const problemDirs = directionAnalysis.filter(d => d.tier === 'SPARSE' || d.tier === 'PARTIAL').map(d => d.dir).join(', ');
                report += `  - Investigate obstructions in: ${problemDirs}\n`;
            }
            report += `  - Ensure antenna has clearest possible sky view\n`;
        } else if (verdict.short.includes('MARGINAL')) {
            report += `Site has significant issues. Consider:\n`;
            if (summary.dirsBlocked > 0 || summary.dirsSparse > 0) {
                const problemDirs = directionAnalysis.filter(d => d.tier === 'BLOCKED' || d.tier === 'SPARSE').map(d => d.dir).join(', ');
                report += `  - Clear obstructions in: ${problemDirs}\n`;
            }
            report += `  - Relocate antenna to position with better sky view\n`;
            report += `  - Higher mounting may improve horizon visibility\n`;
        } else {
            report += `Site is NOT RECOMMENDED for reliable Iridium operation.\n`;
            report += `  - Find alternative location with unobstructed sky view\n`;
            report += `  - Minimum 6 clear horizon directions needed for reliable service\n`;
        }
    }

    report += `
OBSERVATION COUNTS BY SKY CELL
------------------------------
`;
    // Add coverage grid with counts
    report += '        ' + CONFIG.azimuthSectors.join('    ') + '\n';
    for (let elIdx = CONFIG.elevationBands.length - 1; elIdx >= 0; elIdx--) {
        const band = CONFIG.elevationBands[elIdx];
        report += band.label.padEnd(8);
        CONFIG.azimuthSectors.forEach((_, azIdx) => {
            const cell = coverageGrid[`${azIdx}_${elIdx}`];
            const val = cell.count > 0 ? cell.count.toString() : ' -- ';
            report += val.toString().padStart(5) + ' ';
        });
        report += '\n';
    }

    report += `
SATELLITES OBSERVED
-------------------
`;
    satellites.forEach((sat, svId) => {
        if (sat.reports.length >= 5) {
            report += `SV ${svId}: ${sat.reports.length} observations, ${sat.beams.size} beams\n`;
        }
    });

    report += `
METHODOLOGY NOTES
-----------------
`;
    if (isAdvanced) {
        report += `Horizon Classification: Each compass direction's 8-14 elevation band observation count
is compared to the best direction. Clear >=70%, Partial 40-70%, Sparse <40%, Blocked = missing.

Weighted Score: Clear=100%, Partial=70%, Sparse=30%, Blocked=0%. The horizon score
represents effective visibility accounting for degraded directions.

`;
    }
    report += `Data Honesty: RSSI readings cannot be attributed to specific sky positions. The modem
reports RSSI for its current lock while simultaneously reporting ALL visible satellites.
Service uptime is the most honest metric - it directly measures connectivity.

Survey Duration: 48-72 hours recommended for confident results. Shorter surveys may
miss intermittent obstructions or connectivity issues.
`;

    downloadFile(report, `survey_report_${Date.now()}.txt`, 'text/plain');
    events.emit(EVENT_TYPES.TOAST, { message: 'Report exported', type: 'success' });
}
