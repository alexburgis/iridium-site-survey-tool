/**
 * Chart.js management
 * Initialize and update charts for signal distribution, azimuth, and elevation
 */

import { CONFIG, CHART_COLORS } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';

// Chart instances
let signalChart = null;
let azimuthChart = null;
let elevationChart = null;

/**
 * Initialize all charts
 * Must be called after DOM is ready
 */
export function initCharts() {
    initSignalChart();
    initAzimuthChart();
    initElevationChart();

    // Subscribe to data changes
    events.on(EVENT_TYPES.DATA_RSSI, updateSignalChart);
    events.on(EVENT_TYPES.DATA_SV_BEAM, updateDirectionCharts);
}

/**
 * Initialize signal distribution chart
 */
function initSignalChart() {
    const ctx = document.getElementById('signalChart')?.getContext('2d');
    if (!ctx) return;

    signalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0', '1', '2', '3', '4', '5'],
            datasets: [{
                label: 'Reports',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: CHART_COLORS.rssi,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: CHART_COLORS.grid },
                    ticks: { color: CHART_COLORS.text }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Initialize azimuth radar chart
 */
function initAzimuthChart() {
    const ctx = document.getElementById('azimuthChart')?.getContext('2d');
    if (!ctx) return;

    azimuthChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: CONFIG.azimuthSectors,
            datasets: [{
                label: 'Observations',
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                borderColor: CHART_COLORS.primaryBorder,
                backgroundColor: CHART_COLORS.primaryBg,
                pointBackgroundColor: CHART_COLORS.primaryBorder,
                pointRadius: 5,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: {
                        color: CHART_COLORS.text,
                        backdropColor: 'transparent'
                    },
                    grid: { color: CHART_COLORS.gridLines },
                    angleLines: { color: CHART_COLORS.gridLines },
                    pointLabels: {
                        color: CHART_COLORS.textLight,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

/**
 * Initialize elevation bar chart
 */
function initElevationChart() {
    const ctx = document.getElementById('elevationChart')?.getContext('2d');
    if (!ctx) return;

    elevationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: CONFIG.elevationBands.map(b => b.label),
            datasets: [{
                label: 'Observations',
                data: CONFIG.elevationBands.map(() => 0),
                backgroundColor: CHART_COLORS.primary,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: CHART_COLORS.grid },
                    ticks: { color: CHART_COLORS.text }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Update signal distribution chart
 */
export function updateSignalChart() {
    if (!signalChart) return;

    const rssiReports = store.get('rssiReports');
    const counts = [0, 0, 0, 0, 0, 0];

    rssiReports.forEach(r => {
        if (r.rssi >= 0 && r.rssi <= 5) {
            counts[r.rssi]++;
        }
    });

    signalChart.data.datasets[0].data = counts;
    signalChart.update('none');
}

/**
 * Update azimuth and elevation charts
 */
export function updateDirectionCharts() {
    updateAzimuthChart();
    updateElevationChart();
}

/**
 * Update azimuth radar chart
 */
function updateAzimuthChart() {
    if (!azimuthChart) return;

    const coverageGrid = store.get('coverageGrid');

    const azCounts = CONFIG.azimuthSectors.map((_, azIdx) => {
        let total = 0;
        CONFIG.elevationBands.forEach((_, elIdx) => {
            const cell = coverageGrid[`${azIdx}_${elIdx}`];
            total += cell.count;
        });
        return total;
    });

    azimuthChart.data.datasets[0].data = azCounts;
    azimuthChart.update('none');
}

/**
 * Update elevation bar chart
 */
function updateElevationChart() {
    if (!elevationChart) return;

    const coverageGrid = store.get('coverageGrid');

    const elCounts = CONFIG.elevationBands.map((_, elIdx) => {
        let total = 0;
        CONFIG.azimuthSectors.forEach((_, azIdx) => {
            const cell = coverageGrid[`${azIdx}_${elIdx}`];
            total += cell.count;
        });
        return total;
    });

    elevationChart.data.datasets[0].data = elCounts;
    elevationChart.update('none');
}

/**
 * Update all charts
 */
export function updateAllCharts() {
    updateSignalChart();
    updateAzimuthChart();
    updateElevationChart();
}

/**
 * Destroy all charts (for cleanup)
 */
export function destroyCharts() {
    signalChart?.destroy();
    azimuthChart?.destroy();
    elevationChart?.destroy();
    signalChart = null;
    azimuthChart = null;
    elevationChart = null;
}
