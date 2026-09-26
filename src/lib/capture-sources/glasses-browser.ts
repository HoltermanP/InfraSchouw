import type { CaptureSourceKind } from "../domain";
import { PhoneCameraSource } from "./phone-camera";

/** Android smart glasses that run the PWA in their browser (RealWear, Vuzix, …). */
export function isGlassesDevice(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /(RealWear|HMT-1|HMT-1Z1|Navigator[- ]?5|Vuzix|Blade|M400|M4000|Glass Enterprise|Moverio)/i.test(userAgent);
}

export class GlassesBrowserSource extends PhoneCameraSource {
  override readonly kind: CaptureSourceKind = "glasses-browser";
  override readonly label: string = "Smart glasses (browser)";

  protected override constraints(): MediaStreamConstraints {
    // Glasses cameras are head-mounted: default camera, 1080p keeps the device responsive.
    return { video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
  }
}
