"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders popups at the top of the page (in #strow-portal, else <body>) so no
 * animated, transformed or scrolling parent can trap or clip them — iPhone
 * Safari positions "fixed" popups inside such parents instead of the screen.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("strow-portal") ?? document.body);
  }, []);
  return target ? createPortal(children, target) : null;
}
