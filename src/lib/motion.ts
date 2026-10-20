"use client";

/**
 * GSAP for the whole app, registered once. Every animation checks
 * reducedMotion() first: with "Reduce motion" on, the screen just shows its
 * final state. Animations only move things that are already on the screen in
 * their final place, so nothing depends on an animation finishing.
 */
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

let registered = false;

export function motion() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(Flip, useGSAP);
    registered = true;
  }
  return { gsap, Flip };
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, Flip, useGSAP };
