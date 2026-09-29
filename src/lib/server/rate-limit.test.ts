import { describe, expect, it } from 'vitest';
import { FailureLimiter } from './rate-limit';

function clock(start = 0) {
	let time = start;
	return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('FailureLimiter', () => {
	it('allows attempts until the limit is reached', () => {
		const time = clock();
		const limiter = new FailureLimiter(3, 1000, time.now);

		limiter.fail('a');
		limiter.fail('a');
		expect(limiter.retryAfter('a')).toBe(0);

		limiter.fail('a');
		expect(limiter.retryAfter('a')).toBe(1000);
	});

	it('frees a key once its oldest counted failure leaves the window', () => {
		const time = clock();
		const limiter = new FailureLimiter(2, 1000, time.now);

		limiter.fail('a');
		time.advance(400);
		limiter.fail('a');
		expect(limiter.retryAfter('a')).toBe(600);

		time.advance(600);
		expect(limiter.retryAfter('a')).toBe(0);
	});

	it('keeps keys apart', () => {
		const limiter = new FailureLimiter(1, 1000, clock().now);
		limiter.fail('a');
		expect(limiter.retryAfter('a')).toBeGreaterThan(0);
		expect(limiter.retryAfter('b')).toBe(0);
	});

	it('forgets a key on reset', () => {
		const limiter = new FailureLimiter(1, 1000, clock().now);
		limiter.fail('a');
		limiter.reset('a');
		expect(limiter.retryAfter('a')).toBe(0);
	});
});
