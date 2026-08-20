import { safePostMessage } from "./postMessage";
import { type ConformTarget } from "./element-detection";

/**
 * Cross-iframe `eventBus` — sender side.
 *
 * `BusEventMap` is the single source of truth for every message that
 * crosses the preview ↔ builder iframe boundary. Sender (dev-tools) and
 * receiver (builder) both compile against it, so payload-shape mismatches
 * surface at typecheck.
 *
 * **Keep `BusEventMap` (and the payload interfaces above it) in sync with
 * `app/src/utils/eventBus.ts`.** The dev-tools package is excluded from
 * the pnpm workspace so the contract is duplicated; both copies must stay
 * structurally identical. When adding/changing an event, edit both copies
 * in the same change.
 */

// ── Payload shapes ────────────────────────────────────────────────────────

export const TextEditErrorCode = {
  UnsupportedDynamicTextContent: "UNSUPPORTED_DYNAMIC_TEXT_CONTENT",
} as const;

export type TextEditErrorCodeValue = (typeof TextEditErrorCode)[keyof typeof TextEditErrorCode];

export interface BusDevContext {
  fileName: string;
  componentName: string;
  lineNumber: number;
  devId?: string;
}

export interface BusElementInfo {
  tagName: string;
  className: string;
  id?: string;
  dataId?: string;
  textContent: string;
  selector: string;
  preciseSelector?: string;
  rect: { top: number; left: number; width: number; height: number };
  computedStyles: Record<string, string>;
  devContext?: BusDevContext;
}

export interface BusAiEditContextPayload {
  elementInfo: BusElementInfo;
  selector: string;
  devContext?: BusDevContext;
  screenshot?: string | null;
  isImageReplacement?: boolean;
  imageInfo?: {
    type: "img" | "background" | "contains-img" | "sibling-img";
    currentUrl: string | null;
    /** <img alt="..."> when type === "img" — agent uses this to identify the
     *  matching data entry in loop-rendered cases. */
    alt?: string;
  };
  number?: number;
  selectionNumber?: number | null;
}

export interface BusMediaSlotForkContext {
  selector: string;
  devContext: BusDevContext;
  elementInfo: {
    tagName: string;
    className: string;
    id?: string;
    selector: string;
    devContext: BusDevContext;
  };
  imageInfo: {
    type: "img" | "background" | "contains-img" | "sibling-img";
    currentUrl: string | null;
    /** img alt — matches name/label/title in data collections for per-item forks */
    alt?: string | null;
  };
}

export interface BusRuntimeErrorPayload {
  message: string;
  name: string;
  cycleId: number;
  stack?: string;
  componentStack?: string;
  url?: string;
  timestamp?: number;
  attemptNumber?: number;
}

export interface BusTextUpdatePayload {
  selector?: string;
  preciseSelector: string;
  oldText: string;
  newText: string;
  newHtml?: string;
  devContext?: BusDevContext;
  newTag?: string;
  /**
   * Serialized attribute string (e.g. `class="…" data-x="…"`), not an
   * object — matches what `htmlToJsxStructured` produces.
   */
  newAttributes?: string | null;
}

export interface BusStyleUpdatePayload {
  commitId?: string;
  selector: string;
  property: string;
  value: string;
  newClassName: string;
  elementInfo: BusElementInfo;
}

export interface BusFormatOverrideTarget {
  file: string;
  tagName: string;
  sourceKind: "bound-expression" | "content-key" | "content-key-template";
  contentKey: string | null;
  contentKeyTemplate: string | null;
  expressionHash: string | null;
}

export interface BusFormatOverrideMarks {
  bold?: boolean;
  italic?: boolean;
  color?: string | null;
  fontSize?: string;
}

export interface BusFormatOverrideUpdatePayload {
  commitId?: string;
  devId: string;
  target: BusFormatOverrideTarget;
  marks: BusFormatOverrideMarks;
}

export interface BusMediaDeletePayload {
  selector: string;
  preciseSelector: string;
  devContext?: BusDevContext;
  elementInfo: BusElementInfo;
  /** true when the deleted media is a <video>; drives the modal copy. */
  isVideo: boolean;
  /** Current src — shown as a thumbnail in the confirmation modal. */
  imageUrl: string | null;
  alt?: string;
}

export interface BusMediaRepositionPayload {
  selector: string;
  preciseSelector: string;
  devContext?: BusDevContext;
  elementInfo: BusElementInfo;
  /** Image src attribute for per-instance CSS targeting (loop-rendered images) */
  imageSrc: string;
  /** 0–100, percentage horizontal offset */
  panX: number;
  /** 0–100, percentage vertical offset */
  panY: number;
  /** 1.0–5.0, scale factor */
  zoom: number;
}

export interface BusVisualContextPayload {
  page?: string;
  scroll_position?: { x: number; y: number };
  active_section?: string;
  viewport?: { width: number; height: number };
  timestamp?: number;
  error?: string;
}

export type ComplianceDocumentType = 'privacy-policy' | 'terms-of-use';

export interface BusComplianceFieldUpdatePayload {
  documentType: ComplianceDocumentType;
  fieldKey: string;
  newValue: string;
}

export interface BusComplianceSectionTogglePayload {
  documentType: ComplianceDocumentType;
  sectionKey: string;
  value: boolean;
}

/** One captured route in a multi-page DOM snapshot walk. */
export interface RouteSnapshot {
  route: string;
  status: number;
  snapshot: unknown;
}

/** Serializable identity of the element under an annotation box. The media
 *  slot path disambiguates repeated elements (e.g. mapped cards sharing a
 *  source line). `resolved: false` means nothing was found under the box. */
export interface ResolvedAnnotationElement {
  resolved: boolean;
  kind: "image" | "content" | null;
  elementInfo: { tagName: string; className: string; id: string; textContent: string; selector: string };
  devContext: { fileName: string; componentName: string; lineNumber: number };
  imageInfo?: { type: "img" | "background"; currentUrl: string; alt: string; slotPath: string | null; isMediaSlot: boolean };
}

// ── Event map ─────────────────────────────────────────────────────────────

export interface BusEventMap {
  TRACK_EVENT: {
    kind: "click" | "impression";
    eid: string;
    properties?: Record<string, string | number | boolean>;
  };
  TEXT_UPDATED: { data: BusTextUpdatePayload };
  COMPLIANCE_FIELD_UPDATED: { data: BusComplianceFieldUpdatePayload };
  COMPLIANCE_SECTION_TOGGLED: { data: BusComplianceSectionTogglePayload };
  TEXT_FIX_REQUESTED: { data: { requestId: string; oldText: string } };
  TEXT_FIX_ACCEPTED: { data: { oldLength: number; newLength: number } };
  TEXT_FIX_REJECTED: { data: { oldLength: number; newLength: number } };
  STYLE_UPDATED: { data: BusStyleUpdatePayload };
  FORMAT_OVERRIDE_UPDATED: { data: BusFormatOverrideUpdatePayload };
  EDIT_WITH_AI: { data: BusAiEditContextPayload };
  REMOVE_SELECTION_FROM_PREVIEW: { data: { number: number } };
  CLEAR_AI_EDIT_CONTEXT: object;
  SELECTIONS_CLEARED_BY_NAVIGATION: object;
  QUICK_EDIT_SEND: { data: { prompt: string; selectionNumber?: number | null } };
  REPLACE_IMAGE: { data?: BusAiEditContextPayload };
  DELETE_MEDIA_ELEMENT: { data: BusMediaDeletePayload };
  REPOSITION_MEDIA_ELEMENT: { data: BusMediaRepositionPayload };
  SCROLL_POSITION_UPDATE: { scrollX?: number; scrollY?: number };
  VISUAL_CONTEXT_RESPONSE: { context: BusVisualContextPayload };
  URL_CHANGE: { url: string };
  MESSAGE_COMPLETE: { source?: "agent" | "websocket" };
  SCREENSHOT_RESPONSE: { screenshot: string };
  VIEWPORT_SCREENSHOT_RESPONSE: { screenshot: string };
  OPEN_MEDIA_SLOT_DIALOG: { slotName: string; forkContext?: BusMediaSlotForkContext; occurrenceIndex?: number | null; skipPreviewScroll?: boolean; carouselSlotEdit?: boolean };
  OPEN_IMAGE_EDITOR: { slotName: string };
  MEDIA_SLOT_SCROLL_RESULT: { slotPath: string; totalMatches: number; currentIndex: number };
  AUTO_IMPORT_MEDIA_SLOT: {
    imageUrl: string;
    devContext?: BusDevContext;
    imageType: "img" | "background";
    imageAlt?: string;
    openEditor?: boolean;
  };
  "error-fix-request": { errorData: BusRuntimeErrorPayload };
  "error-platform-report": { errorData: BusRuntimeErrorPayload };
  "runtime-errors-cycle": { cycleId: number };
  "error-fix-user-requested": { errorData: BusRuntimeErrorPayload };
  "request-processing-state": object;
  "request-media-edit-lock": object;
  "build-page-request": { pathToBuild: string };
  "build-error-fix-request": {
    appId: string;
    errorMessage: string;
    errorDetails: string;
    exitCode?: number;
  };
  "seo-quality-fix-request": {
    appId: string;
    regression: SeoRegressionEventData;
  };
  SPEECH_QUERY_SUPPORT: object;
  SPEECH_START: object;
  SPEECH_STOP: object;
  EDITABLE_ELEMENT_CLICKED_IN_PREVIEW: { tagName: string };
  /** Preview-mode click on an external (cross-origin) link. The sandboxed
   *  preview iframe can't escape to a real top-level tab, so the builder opens
   *  the URL in a new browser tab from the un-sandboxed top window. */
  OPEN_EXTERNAL_URL: { url: string };
  PREVIEW_UNSUPPORTED_FEATURE: { feature: BusUnsupportedFeature };
  ANNOTATION_SELECTION_CREATED: {
    data: {
      number: number;
      rect: { x: number; y: number; width: number; height: number };
      prompt: string;
      // Absent on older dev-tools bundles (version skew).
      resolvedElement?: ResolvedAnnotationElement | null;
    };
  };
  /** PNG data URL of the page cropped to every current annotation box, boxes and
   *  number badges included. Re-sent on each add/remove so the attachment in chat
   *  always matches the live set of selections. */
  ANNOTATION_SCREENSHOT_RESPONSE: { screenshot: string };
  /** Sent when the user clicks a `.map`-backed element that is not yet content-backed.
   *  The builder runs the heal conform and replies with CONFORM_SUCCEEDED or
   *  CONFORM_FAILED via raw window 'message' (not the bus — outbound-to-iframe only). */
  CONFORM_REQUEST: { data: ConformTarget; requestId: string };
  DOM_SNAPSHOT_RESPONSE: { requestId: string; routes: RouteSnapshot[] };
  HMR_EVENT: { kind: "update" | "full-reload" | "error"; timestamp: number; paths?: string[]; reason?: string; error?: string };
}

export type BusUnsupportedFeature = "payment" | "push-notification" | "oauth-popup";

export type SeoRegressionEventData = {
  scoreDelta: number;
  currentScore: number;
  regressions: Array<{ path: string; newIssues: string[] }>;
};

export type BusEventType = keyof BusEventMap;
export type BusMessage<K extends BusEventType = BusEventType> = { type: K } & BusEventMap[K];

// ── Sender primitive ──────────────────────────────────────────────────────

export function send<K extends BusEventType>(msg: BusMessage<K>): void {
  safePostMessage(window.parent, msg);
}

// ── Tracking event family ─────────────────────────────────────────────────

export const TRACK_EVENT_TYPE = "TRACK_EVENT" as const;

type TrackProperties = Record<string, string | number | boolean>;

export const trackEventBus = {
  click(eid: string, properties?: TrackProperties): void {
    send({ type: TRACK_EVENT_TYPE, kind: "click", eid, properties });
  },
  impression(eid: string, properties?: TrackProperties): void {
    send({ type: TRACK_EVENT_TYPE, kind: "impression", eid, properties });
  },
};
