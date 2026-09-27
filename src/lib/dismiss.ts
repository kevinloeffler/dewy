import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` for a form inside a `Modal`: runs the default update, then
 * closes the dialog.
 *
 * An action that redirects takes the dialog with it; one that answers in place
 * — adding a chapter, deleting a row from a list — leaves it standing unless
 * something shuts it. It closes on a refusal too, because the refusal's message
 * renders on the page behind the backdrop, where it cannot be read otherwise.
 */
export function dismiss(close: () => void): SubmitFunction {
	return () =>
		async ({ update }) => {
			await update();
			close();
		};
}
