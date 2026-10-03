"use client";

import { useEffect, useState } from "react";

export const DESKTOP_BREAKPOINT = 768;
export const SIDEBAR_WIDTH = 240;
export const MIN_DRAWER_WIDTH = 448;
export const RESIZE_STEP = 32;

export function getWorkspaceWidth(viewportWidth: number) {
  return viewportWidth >= DESKTOP_BREAKPOINT
    ? viewportWidth - SIDEBAR_WIDTH
    : viewportWidth;
}

export function clampDrawerWidth(width: number, maximum: number) {
  return Math.min(maximum, Math.max(MIN_DRAWER_WIDTH, width));
}

export function getPointerDrawerWidth(viewportWidth: number, clientX: number) {
  return clampDrawerWidth(
    viewportWidth - clientX,
    getWorkspaceWidth(viewportWidth),
  );
}

export function getKeyboardDrawerWidth(
  event: { key: string },
  currentWidth: number,
  maximum: number,
): number | null {
  if (event.key === "ArrowLeft") {
    return clampDrawerWidth(currentWidth + RESIZE_STEP, maximum);
  }
  if (event.key === "ArrowRight") {
    return clampDrawerWidth(currentWidth - RESIZE_STEP, maximum);
  }
  if (event.key === "Home") return MIN_DRAWER_WIDTH;
  if (event.key === "End") return maximum;
  return null;
}

type UseResizableDrawerOptions = {
  selectedQueueName: string | null;
};

export function useResizableDrawer({
  selectedQueueName,
}: UseResizableDrawerOptions) {
  const [drawerWidth, setDrawerWidth] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!isResizing || !selectedQueueName) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      setDrawerWidth(getPointerDrawerWidth(window.innerWidth, event.clientX));
    };
    const stopResizing = () => setIsResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizing, selectedQueueName]);

  const maximumDrawerWidth = viewportWidth
    ? getWorkspaceWidth(viewportWidth)
    : null;
  const activeDrawerWidth = drawerWidth ?? maximumDrawerWidth;

  function startResizing() {
    setIsResizing(true);
  }

  function maximizeDrawer() {
    setDrawerWidth(null);
  }

  function resizeDrawerForKey(event: { key: string }) {
    if (!maximumDrawerWidth) return false;
    const currentWidth = drawerWidth ?? maximumDrawerWidth;
    const nextWidth = getKeyboardDrawerWidth(
      event,
      currentWidth,
      maximumDrawerWidth,
    );
    if (nextWidth === null) return false;
    setDrawerWidth(nextWidth);
    return true;
  }

  return {
    activeDrawerWidth,
    maximizeDrawer,
    resizeDrawerForKey,
    setDrawerWidth,
    setIsResizing,
    startResizing,
  };
}
