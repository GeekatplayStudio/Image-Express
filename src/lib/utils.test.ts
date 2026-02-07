import { cn } from './utils';

describe('cn utility', () => {
  test('should merge class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  test('should handle conditional classes', () => {
    expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
  });

  test('should resolve tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2'); // p-2 should override p-4
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  test('should handle arrays and objects', () => {
    expect(cn(['class1', 'class2'])).toBe('class1 class2');
    // clsx support for objects usually works like this, but let's stick to simple usage first
    // as we just wrap twMerge(clsx(...))
  });
});
