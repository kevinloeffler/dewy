import type { auth } from '$lib/server/auth';

// The session type is *inferred* from the auth config rather than imported from
// better-auth, so the fields the plugins add — `role`, `username`, `banned`,
// `archivedAt` — are visible on `locals.user` everywhere. A static
// `User` import would silently hide all of them.
type AuthSession = typeof auth.$Infer.Session;

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AuthSession['user'];
			session?: AuthSession['session'];
		}

		// interface Error {}
		interface PageData {
			/** Who is signed in, trimmed to what the navbar shows. Set by the root layout. */
			viewer: { name: string } | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
