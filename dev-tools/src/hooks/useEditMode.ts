import { useTextEditing } from "./useTextEditing";
import { useHoverHint } from "./useHoverHint";
import { useImageHoverDetection } from "./useImageHoverDetection";

/**
 * Orchestrator hook for edit mode. Composes three focused hooks:
 *
 * - useTextEditing — inline click-to-edit with contentEditable
 * - useHoverHint — AI sparkle button, selection overlay, scroll tracking
 * - useImageHoverDetection — image hover state for ImageHoverBar
 */
export function useEditMode(
  isEditModeActive: boolean,
  cmsInlineEditEnabled: boolean,
  isMultiSelectActive: boolean = false,
) {
  const { editingElement, saveStatus, stateRef, stopEditing, startEditing } =
    useTextEditing(isEditModeActive, cmsInlineEditEnabled);

  useHoverHint(isEditModeActive, stateRef, isMultiSelectActive);

  const {
    hoveredImage,
    hoveredElement,
    toolbarMode,
    setToolbarMode,
    handleBarMouseEnter,
    handleBarMouseLeave,
    openToolbarFor,
  } = useImageHoverDetection(isEditModeActive, stateRef);

  return {
    isEditModeActive,
    editingElement,
    saveStatus,
    hoveredImage,
    hoveredElement,
    toolbarMode,
    setToolbarMode,
    handleBarMouseEnter,
    handleBarMouseLeave,
    stopEditing,
    startEditing,
    openToolbarFor,
  };
}
