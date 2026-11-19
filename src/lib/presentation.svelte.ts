import { browser } from '$app/environment';

/**
 * Presentation mode — the level player enlarged for a projector, for a
 * teacher showing a new concept to the class. Hidden behind a shortcut so
 * it never clutters a student's screen.
 *
 * Module state rather than component state: `LevelPlayer` is rebuilt for
 * every course item (`{#key}`), and stepping to the next level on the
 * projector should not drop back to the normal layout. Fullscreen belongs to
 * the document, so it survives the same client-side navigation.
 */
export const presentation = $state({ on: false });

/**
 * Firefox opens a private window on Ctrl/Cmd+Shift+P before the page sees
 * the key, so it gets Alt+P instead. Matched on `event.code`: Alt+P types
 * `π` on a Mac, and the letter moves on other layouts.
 */
const firefox = browser && /firefox/i.test(navigator.userAgent);

export const presentationShortcut: string[] = firefox
	? ['Alt', 'P']
	: [browser && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl', '⇧', 'P'];

export function isPresentationShortcut(event: KeyboardEvent): boolean {
	if (event.code !== 'KeyP') return false;
	return firefox
		? event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
		: (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
}

/**
 * Enters or leaves presentation mode, taking the browser into fullscreen
 * with it. A refused fullscreen request (iframe, permissions) still leaves
 * the enlarged layout on — that part is what matters.
 */
export function setPresentation(on: boolean) {
	presentation.on = on;
	if (on && !document.fullscreenElement) {
		document.documentElement.requestFullscreen?.().catch(() => {});
	} else if (!on && document.fullscreenElement) {
		document.exitFullscreen?.().catch(() => {});
	}
}

/**
 * Leaving fullscreen with Esc (the browser handles that key itself, the page
 * never sees it) also leaves presentation mode, so the two cannot drift
 * apart. Returns the cleanup for an `$effect`.
 */
export function followFullscreen(): () => void {
	const onchange = () => {
		if (!document.fullscreenElement) presentation.on = false;
	};
	document.addEventListener('fullscreenchange', onchange);
	return () => document.removeEventListener('fullscreenchange', onchange);
}
