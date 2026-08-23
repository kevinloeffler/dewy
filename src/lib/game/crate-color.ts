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
