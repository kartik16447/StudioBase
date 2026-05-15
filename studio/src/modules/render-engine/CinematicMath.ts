

export interface ViewportCoords {
  x: number;
  y: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CameraTarget {
  centerX: number;
  centerY: number;
  zoomScale: number;
}

export const CinematicMath = {
  getHotspotPercent(
    coords: ViewportCoords | undefined | null,
    defaultVal = 50,
  ): { x: number; y: number } {
    if (!coords) return { x: defaultVal, y: defaultVal };
    return {
      x: (coords.x / (coords.viewportWidth || 1440)) * 100,
      y: (coords.y / (coords.viewportHeight || 900)) * 100,
    };
  },

  getTarget(step: any, renderMode: string): CameraTarget {
    const manual = step?.animationTarget;
    const coords = step?.data?.coordinates;
    const useAuto = !manual || manual.zoomScale <= 1;
    if (useAuto && coords) {
      return {
        centerX: Math.max(
          15,
          Math.min(85, (coords.x / (coords.viewportWidth || 1440)) * 100),
        ),
        centerY: Math.max(
          15,
          Math.min(85, (coords.y / (coords.viewportHeight || 900)) * 100),
        ),
        zoomScale: renderMode === "hybrid" ? 1 : 1.55,
      };
    }
    return manual || { centerX: 50, centerY: 50, zoomScale: 1 };
  },

  calculateCamera(
    target: CameraTarget,
    prevTarget: CameraTarget,
    isPlaying: boolean,
  ) {
    const hasZoom = target.zoomScale > 1;
    const scale = hasZoom || !isPlaying ? target.zoomScale : 1;
    const tx = (50 - target.centerX) * scale;
    const ty = (50 - target.centerY) * scale;

    const prevTX = (50 - prevTarget.centerX) * prevTarget.zoomScale;
    const prevTY = (50 - prevTarget.centerY) * prevTarget.zoomScale;

    const dx = tx - prevTX;
    const dy = ty - prevTY;
    const isLargeJump = Math.abs(dx) > 15 || Math.abs(dy) > 15;
    const overshootX = tx + dx * 0.08;
    const overshootY = ty + dy * 0.08;

    return {
      scale,
      tx,
      ty,
      prevTX,
      prevTY,
      dx,
      dy,
      isLargeJump,
      overshootX,
      overshootY,
      hasZoom,
      prevScale: prevTarget.zoomScale,
    };
  },

  getCinematicSequence(
    sameContext: boolean,
    isLargeJump: boolean,
    renderMode: string,
    camera: {
      tx: number;
      ty: number;
      prevTX: number;
      prevTY: number;
      scale: number;
      overshootX: number;
      overshootY: number;
      prevScale: number;
    },
  ) {
    if (sameContext) {
      if (isLargeJump && renderMode === "slideshow") {
        return {
          scale: [camera.prevScale, camera.scale, camera.scale],
          x: [`${camera.prevTX}%`, `${camera.overshootX}%`, `${camera.tx}%`],
          y: [`${camera.prevTY}%`, `${camera.overshootY}%`, `${camera.ty}%`],
        };
      }
      return { scale: camera.scale, x: `${camera.tx}%`, y: `${camera.ty}%` };
    } else {
      if (renderMode === "hybrid") {
        return { scale: 1, x: "0%", y: "0%", opacity: [0, 1, 1] };
      } else {
        return {
          scale: [1.6, 1.15, 1.45, camera.scale],
          x: ["0%", "0%", "0%", `${camera.tx}%`],
          y: ["0%", "0%", "0%", `${camera.ty}%`],
          opacity: [0, 1, 1, 1],
        };
      }
    }
  },
};
