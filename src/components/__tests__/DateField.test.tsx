import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DateField from '@/components/DateField';

describe('DateField', () => {
  it('uses the native date input on phone and web', () => {
    const { container } = render(
      <DateField label="Start date" value="2026-09-16" onChange={() => undefined} />,
    );

    expect(container.querySelector('input[type="date"]')).toHaveValue('2026-09-16');
  });

  it('keeps quick actions beside the native date input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField label="Due date" value="" onChange={onChange} quickActions />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });
});
