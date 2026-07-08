import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names and skips falsy values', () => {
    expect(cn('base', false, null, undefined, 'active')).toBe('base active');
  });

  it('merges tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
