/**
 * Feature flags — flip here to enable/disable pilot features.
 *
 * JOB_CARD_PHOTO_EDITOR_ENABLED
 *   When true: admins (role='admin' or permAdmin=true) see the full
 *   PhotoEditor on Job Card photos instead of the read-only viewer.
 *   When false: existing Job Card photo interface is completely unchanged.
 *
 *   Do not enable globally until pilot acceptance testing is complete.
 */
export const JOB_CARD_PHOTO_EDITOR_ENABLED = true;
