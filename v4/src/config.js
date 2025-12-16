/**
 * Application configuration constants
 * All survey parameters, thresholds, and settings in one place
 */

export const CONFIG = Object.freeze({
    // Elevation bands for coverage grid (7 bands)
    elevationBands: Object.freeze([
        { min: 8, max: 14, label: '8-14°', weight: 3.5, critical: true, horizon: true },
        { min: 14, max: 20, label: '14-20°', weight: 3.0, critical: true, horizon: true },
        { min: 20, max: 35, label: '20-35°', weight: 2.5, critical: true, horizon: false },
        { min: 35, max: 50, label: '35-50°', weight: 1.5, critical: false, horizon: false },
        { min: 50, max: 65, label: '50-65°', weight: 1.0, critical: false, horizon: false },
        { min: 65, max: 80, label: '65-80°', weight: 0.5, critical: false, horizon: false },
        { min: 80, max: 90, label: '80-90°', weight: 0.25, critical: false, horizon: false }
    ]),

    // Azimuth sectors (8 compass directions)
    azimuthSectors: Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),

    // Minimum observations threshold scales with survey duration
    minReportsThresholds: Object.freeze([
        { hours: 2, minReports: 3 },
        { hours: 8, minReports: 10 },
        { hours: 24, minReports: 20 },
        { hours: Infinity, minReports: 30 }
    ]),

    // Serial communication settings
    serial: Object.freeze({
        baudRate: 19200
    }),

    // Iridium minimum functional elevation
    minFunctionalElevation: 8,

    // Assessment thresholds
    assessment: Object.freeze({
        clearThreshold: 0.70,      // >= 70% of best direction = clear
        partialThreshold: 0.40,    // 40-70% = partial
        // < 40% = sparse, no observations = blocked

        // Uptime verdict thresholds
        uptimeExcellent: 95,
        uptimeGood: 90,
        uptimeAdequate: 80,
        uptimeMarginal: 60
    }),

    // Default observer location (Cardiff, UK)
    defaultLocation: Object.freeze({
        lat: 51.4953,
        lon: -3.17047
    }),

    // Session format version
    sessionVersion: 3
});

// Chart colors matching the original theme
export const CHART_COLORS = Object.freeze({
    rssi: Object.freeze([
        'rgba(110, 118, 129, 0.8)',  // 0 bars
        'rgba(248, 81, 73, 0.8)',    // 1 bar
        'rgba(219, 109, 40, 0.8)',   // 2 bars
        'rgba(210, 153, 34, 0.8)',   // 3 bars
        'rgba(63, 185, 80, 0.8)',    // 4 bars
        'rgba(88, 166, 255, 0.8)'    // 5 bars
    ]),
    primary: 'rgba(88, 166, 255, 0.7)',
    primaryBorder: '#58a6ff',
    primaryBg: 'rgba(88, 166, 255, 0.25)',
    grid: 'rgba(255,255,255,0.05)',
    gridLines: 'rgba(139, 148, 158, 0.2)',
    text: '#8b949e',
    textLight: '#c9d1d9'
});

// CSS variable references for consistent theming
export const THEME = Object.freeze({
    bgPrimary: 'var(--bg-primary)',
    bgSecondary: 'var(--bg-secondary)',
    bgTertiary: 'var(--bg-tertiary)',
    bgCard: 'var(--bg-card)',
    borderColor: 'var(--border-color)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    accentBlue: 'var(--accent-blue)',
    accentGreen: 'var(--accent-green)',
    accentYellow: 'var(--accent-yellow)',
    accentOrange: 'var(--accent-orange)',
    accentRed: 'var(--accent-red)',
    accentPurple: 'var(--accent-purple)',
    accentCyan: 'var(--accent-cyan)'
});
