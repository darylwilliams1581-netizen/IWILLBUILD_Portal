import { registerPlugin } from '@capacitor/core';

export interface NativeLensStartOptions {
  /** CSS-point bounds returned by #iwb-native-lens.getBoundingClientRect(). */
  x: number;
  y: number;
  width: number;
  height: number;
  position: 'rear' | 'front';
}

interface NativeLensPreviewPlugin {
  start(options: NativeLensStartOptions): Promise<void>;
  stop(): Promise<void>;
  capture(options?: { quality?: number }): Promise<{ value: string }>;
  flip(): Promise<void>;
  getSupportedFlashModes(): Promise<{ result: string[] }>;
  setFlashMode(options: { flashMode: 'auto' | 'on' | 'off' }): Promise<void>;
  isCameraStarted(): Promise<{ value: boolean }>;
}

/** App-local AVFoundation Lens bridge. It is registered by IWBBridgeViewController. */
export const NativeLensPreview = registerPlugin<NativeLensPreviewPlugin>('IWBNativeLens');
