"use client";

import React from "react";

/** One bad chart/table must never take the whole app down. */
export class BlockBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ai block]", e);
  }
  render() {
    if (this.state.failed)
      return <p className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-500">Couldn’t draw this part — ask again and it will be redrawn.</p>;
    return this.props.children;
  }
}
