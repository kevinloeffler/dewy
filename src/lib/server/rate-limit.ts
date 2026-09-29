/**
 * Counting failed sign-ins, so a password cannot be guessed at full speed.
 *
 * Needed because better-auth's own rate limiter only guards its HTTP endpoints,
 * and `/login` calls `auth.api` directly, which skips it. In memory, since the
 * app is a single `node build` process: a restart forgets every count, which
 * is fine for a limiter whose windows are minutes long.
 *
 * Only failures count, and the windows are short on purpose. A classroom signs
 * in all at once from one school IP, and a student who knows a classmate's
 * username can lock them out by typing it wrong — so a lock must be brief
 * enough to be a nuisance rather than a lesson lost.
 */
export class FailureLimiter {
	private readonly failures = new Map<string, number[]>();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now
	) {}

	/** Milliseconds until `key` may try again; `0` means go ahead. */
	retryAfter(key: string): number {
		const recent = this.recent(key);
		if (recent.length < this.limit) return 0;
		return recent[recent.length - this.limit] + this.windowMs - this.now();
	}

	fail(key: string): void {
		const recent = this.recent(key);
		recent.push(this.now());
		this.failures.set(key, recent);

		// Keys nobody retries would otherwise pile up forever.
		if (this.failures.size > 10_000) this.sweep();
	}

	reset(key: string): void {
		this.failures.delete(key);
	}

	private recent(key: string): number[] {
		const cutoff = this.now() - this.windowMs;
		const recent = (this.failures.get(key) ?? []).filter((at) => at > cutoff);
		if (recent.length === 0) this.failures.delete(key);
		return recent;
	}

	private sweep(): void {
		for (const key of [...this.failures.keys()]) this.recent(key);
	}
}
