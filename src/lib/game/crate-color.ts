export const CRATE_COLORS = {
	grey:   0x8A9099,
	red:    0xE85D3A,
	green:  0x4CAF82,
	blue:   0x3A8FD4,
	purple: 0x7B5EA7,
	pink:   0xE06090,
	yellow: 0xF0A500,
} as const;

export type CrateColor = keyof typeof CRATE_COLORS;

/** What each colour is called in the UI. The stored keys stay English. */
export const CRATE_COLOR_NAMES: Record<CrateColor, string> = {
	grey: 'Grau',
	red: 'Rot',
	green: 'Grün',
	blue: 'Blau',
	purple: 'Lila',
	pink: 'Pink',
	yellow: 'Gelb',
};
