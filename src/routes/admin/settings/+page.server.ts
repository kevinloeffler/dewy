import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { roleOf } from '$lib/roles';
import { actorOf } from '$lib/server/users';
import {
	clearAppConfig,
	getAppConfigView,
	saveAppConfig,
	secretKeyConfigured,
	testAppConfig
} from '$lib/server/llm/config';
import { llmAction, llmInputFrom } from '$lib/server/llm/actions';

/**
 * The school's own settings. For now, the default LLM provider.
 *
 * The `/admin` layout lets teachers in, so this page shuts them out itself.
 * `config.ts` checks the role again on every write, so an action reached
 * without this load still refuses.
 */
export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);
	if (roleOf(actor.user) !== 'admin') error(403, 'Diese Einstellungen sind der Administration vorbehalten.');

	return {
		llm: await getAppConfigView(actor),
		secretKeyConfigured: secretKeyConfigured()
	};
};

export const actions: Actions = {
	saveLlm: async (event) => {
		const formData = await event.request.formData();
		return llmAction(async () => {
			await saveAppConfig(actorOf(event), llmInputFrom(formData));
			return { ok: true, message: 'Gespeichert. Der Test war erfolgreich.' };
		});
	},

	testLlm: (event) =>
		llmAction(async () =>
			(await testAppConfig(actorOf(event)))
				? { ok: true, message: 'Der Test war erfolgreich.' }
				: { ok: false, message: 'Der Test ist fehlgeschlagen. Details siehe oben.' }
		),

	clearLlm: (event) =>
		llmAction(async () => {
			await clearAppConfig(actorOf(event));
			return { ok: true, message: 'Der Standard-Anbieter wurde entfernt. KI-Funktionen sind ausgeschaltet.' };
		})
};
