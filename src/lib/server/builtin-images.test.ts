import { describe, expect, it } from 'vitest';
import { builtinId } from './builtin-images';

describe('builtinId', () => {
	it('names an image after its file', () => {
		expect(builtinId('/src/lib/assets/builtin/robot-happy.png')).toBe('builtin-robot-happy');
	});

	it('refuses names that would not pass the markdown image rule', () => {
		expect(builtinId('/src/lib/assets/builtin/robot happy.png')).toBeNull();
		expect(builtinId('/src/lib/assets/builtin/robot_happy.png')).toBeNull();
		expect(builtinId('/src/lib/assets/builtin/robot.v2.png')).toBeNull();
	});
});
