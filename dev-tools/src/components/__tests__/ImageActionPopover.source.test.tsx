/**
 * @vitest-environment jsdom
 *
 * structured link/page/clear submissions from ImageActionPopover pass a
 * client-synthesized `source` label to onSubmit.
 * The freeform composer path does NOT, user-typed prompts stay charged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';

import { ImageActionPopover, IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE } from '../ImageActionPopover';

vi.mock('../../utils/translations', () => ({
  t: vi.fn((_: string, fallback: string) => fallback),
}));

vi.mock('../../route-discovery', () => ({
  // Return no routes so the popover falls back to a text input we can drive.
  discoverRoutes: vi.fn(async () => ({ routes: [] })),
}));

beforeEach(() => {
  cleanup();
});

describe('ImageActionPopover onSubmit source label', () => {
  it('link edit passes IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE', () => {
    const onSubmit = vi.fn();
    render(
      createElement(ImageActionPopover, {
        onSubmit,
        onDismiss: () => {},
        targetAlt: 'hero',
        targetSrc: '/img/hero.png',
      }),
    );

    fireEvent.click(screen.getByTestId('image-action-set-link'));
    const input = screen.getByTestId('image-action-link-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByTestId('image-action-link-send'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),
      IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE,
      expect.objectContaining({ actionType: 'set_link' }),
    );
    expect(onSubmit.mock.calls[0]).toHaveLength(3);
  });

  it('page edit passes IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE', async () => {
    const onSubmit = vi.fn();
    render(
      createElement(ImageActionPopover, {
        onSubmit,
        onDismiss: () => {},
        targetAlt: 'hero',
        targetSrc: '/img/hero.png',
      }),
    );

    fireEvent.click(screen.getByTestId('image-action-set-page'));
    // discoverRoutes returned no routes → the text-input fallback renders.
    const pageInput = await waitFor(() => screen.getByTestId('image-action-page-input'));
    fireEvent.change(pageInput, { target: { value: '/contact' } });
    fireEvent.click(screen.getByTestId('image-action-page-send'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),
      IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE,
      expect.objectContaining({ actionType: 'set_page' }),
    );
    expect(onSubmit.mock.calls[0]).toHaveLength(3);
  });

  it('clear passes IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE when an existing link is present', () => {
    const onSubmit = vi.fn();
    render(
      createElement(ImageActionPopover, {
        onSubmit,
        onDismiss: () => {},
        // existingLink present makes the Clear button render.
        existingLink: { href: 'https://old.example.com', isInternal: false },
        targetAlt: 'hero',
        targetSrc: '/img/hero.png',
      }),
    );

    fireEvent.click(screen.getByTestId('image-action-clear'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),
      IMAGE_ACTION_POPOVER_MANUAL_EDIT_SOURCE,
      expect.objectContaining({ actionType: 'clear_action' }),
    );
    expect(onSubmit.mock.calls[0]).toHaveLength(3);
  });

  it('freeform submission does NOT pass a source (user-typed prompts stay charged)', () => {
    const onSubmit = vi.fn();
    render(
      createElement(ImageActionPopover, {
        onSubmit,
        onDismiss: () => {},
        targetAlt: 'hero',
        targetSrc: '/img/hero.png',
      }),
    );

    const freeform = screen.getByTestId('image-action-freeform') as HTMLTextAreaElement;
    fireEvent.change(freeform, { target: { value: 'toggle black and white on click' } });
    fireEvent.click(screen.getByTestId('image-action-freeform-send'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Second arg omitted for freeform — the server won't absorb the cost.
    expect(onSubmit).toHaveBeenCalledWith(expect.any(String));
    expect(onSubmit.mock.calls[0]).toHaveLength(1);
  });
});
