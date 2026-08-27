// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldIgnoreContentAck } from '../hooks/useTextEditing'

describe('shouldIgnoreContentAck', () => {
  it('ignores a CONTENT_EDIT_SUCCEEDED ack whose commitId does not match the pending save', () => {
    expect(shouldIgnoreContentAck('CONTENT_EDIT_SUCCEEDED', 'other-commit', 'pending-commit')).toBe(true)
  })

  it('ignores a CONTENT_EDIT_FAILED ack whose commitId does not match the pending save', () => {
    expect(shouldIgnoreContentAck('CONTENT_EDIT_FAILED', 'other-commit', 'pending-commit')).toBe(true)
  })

  it('does not ignore a content ack whose commitId matches the pending save', () => {
    expect(shouldIgnoreContentAck('CONTENT_EDIT_SUCCEEDED', 'commit-1', 'commit-1')).toBe(false)
  })

  it('does not ignore a non-content event type even with a mismatched commitId (guard is scoped to the content path)', () => {
    expect(shouldIgnoreContentAck('TEXT_EDIT_SUCCEEDED', 'other-commit', 'pending-commit')).toBe(false)
  })

  it('does not ignore TEXT_EDIT_DELEGATED even with a mismatched commitId', () => {
    expect(shouldIgnoreContentAck('TEXT_EDIT_DELEGATED', 'other-commit', 'pending-commit')).toBe(false)
  })
})
