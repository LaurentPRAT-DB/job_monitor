/**
 * Tests for utils.ts
 *
 * Tests:
 * - cn function for className merging
 */

import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active')).toBe('base active');
    expect(cn('base', false && 'inactive')).toBe('base');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('merges tailwind classes correctly', () => {
    // tailwind-merge should dedupe conflicting classes
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles array of classes', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles object syntax', () => {
    expect(cn({ active: true, disabled: false })).toBe('active');
  });

  it('handles mixed inputs', () => {
    expect(cn('base', ['array'], { object: true })).toBe('base array object');
  });
});
