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

/**
 * The colours a crate can be delivered in — every one but grey. A grey crate
 * is a tool (something to push onto a belt or a plate), never a delivery, so
 * no picker offers grey for a coloured crate, a bay or a goal.
 */
export const DELIVERY_COLORS = (Object.keys(CRATE_COLORS) as CrateColor[]).filter(
	(color) => color !== 'grey',
);

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
