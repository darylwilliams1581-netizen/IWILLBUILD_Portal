import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
}));

vi.mock('@/lib/capacitor-plugins', () => ({ isNative: mocks.isNative }));

import DateField from '@/components/DateField';

describe('DateField', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
  });

  it('shows a compact Australian date without an iOS date input', () => {
    const { container } = render(
      <DateField label="Start date" value="2026-09-16" onChange={() => undefined} />,
    );

    expect(screen.getByRole('button', { name: 'Start date: 16 Sep 2026' })).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it('uses a numeric text field for manual native entry', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField label="Finish date" value="" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finish date: No date selected' }));
    const input = screen.getByRole('textbox', { name: 'Finish date, yyyy-mm-dd' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(container.querySelector('input[type="date"]')).toBeNull();

    fireEvent.change(input, { target: { value: '20260916' } });
    expect(onChange).toHaveBeenCalledWith('2026-09-16');
  });

  it('keeps the quick actions and uses a small date input on web', () => {
    mocks.isNative.mockReturnValue(false);
    const onChange = vi.fn();
    const { container } = render(
      <DateField label="Due date" value="" onChange={onChange} quickActions />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });
});
