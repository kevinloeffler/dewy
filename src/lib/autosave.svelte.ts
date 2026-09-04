import { applyAction } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Fields that save themselves.
 *
 * There is no save button in the course editor, so a rename has to reach the
 * server on its own. It does it through the form the field already sits in:
 * `requestSubmit()` on a timer, which means the server contract does not change
 * and every one of these forms still works with JavaScript switched off.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Submits `node`'s form a beat after the typing stops.
 *
 * Blur flushes immediately rather than waiting out the timer: clicking one of
 * the row's buttons blurs the field first, so the rename is always on its way
 * before the click that reorders or deletes the row arrives.
 */
export function autosave(node: Field, delay = 700) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let last = node.value;

	function flush() {
		clearTimeout(timer);
		if (node.disabled || node.value === last) return;
		last = node.value;
		node.form?.requestSubmit();
	}

	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(flush, delay);
	}

	// Typed as `Event` because `node` is a union of two element types, which
	// costs `addEventListener` its per-event overload.
	function onkeydown(event: Event) {
		// Enter in a single-line field means "I'm done", not "insert a newline".
		if ((event as KeyboardEvent).key === 'Enter' && node.tagName === 'INPUT') {
			event.preventDefault();
			flush();
		}
	}

	node.addEventListener('input', schedule);
	node.addEventListener('blur', flush);
	node.addEventListener('keydown', onkeydown);

	return {
		destroy() {
			clearTimeout(timer);
			node.removeEventListener('input', schedule);
			node.removeEventListener('blur', flush);
			node.removeEventListener('keydown', onkeydown);
		}
	};
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Where each autosaving form is in its save cycle, so the page can say so.
 *
 * Keyed by form — a course editor has one for the course and one per stage, and
 * they save independently. Statuses fall back to `idle`, so a key only exists
 * once its form has actually saved something.
 */
export class SaveTracker {
	#status = $state<Record<string, SaveStatus>>({});
	#timers: Record<string, ReturnType<typeof setTimeout>> = {};

	status(key: string): SaveStatus {
		return this.#status[key] ?? 'idle';
	}

	/** True while any form is in flight — enough for one indicator per page. */
	get busy(): boolean {
		return Object.values(this.#status).includes('saving');
	}

	get settled(): boolean {
		return !this.busy && Object.values(this.#status).includes('saved');
	}

	#set(key: string, status: SaveStatus, clearAfter?: number) {
		clearTimeout(this.#timers[key]);
		this.#status[key] = status;
		if (clearAfter === undefined) return;
		this.#timers[key] = setTimeout(() => (this.#status[key] = 'idle'), clearAfter);
	}

	/**
	 * `use:enhance={tracker.enhance('stage-x')}`.
	 *
	 * Deliberately does not call `update()`. That would re-run `load` and push
	 * the stored title back into the input, overwriting anything typed while the
	 * request was in flight — and the field already shows what we just sent.
	 * Only a failure applies the result, to surface the message.
	 */
	enhance = (key: string): SubmitFunction => {
		return () => {
			this.#set(key, 'saving');
			return async ({ result }) => {
				if (result.type === 'failure' || result.type === 'error') {
					this.#set(key, 'error');
					await applyAction(result);
					return;
				}
				this.#set(key, 'saved', 1800);
			};
		};
	};
}
