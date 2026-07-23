import { useScroll, useTransform } from "framer-motion";
import type { RefObject } from "react";

// Scroll-linked "hero → thumbnail" morph, shared by every attach-products flow
// (single pin + board). As the user scrolls the results down, the big pin
// preview shrinks, fades and rises out of the way, while a small thumbnail
// fades/scales in at the top-left header — and the whole thing reverses,
// smoothly, the instant they scroll back up. It's driven directly by scroll
// position (not a one-shot threshold) so the pin tracks the finger/wheel.
//
// Pass the scrollable element's ref for a container that scrolls internally
// (e.g. a modal body); omit it to track the window/viewport scroll for a
// normal full-page flow. `distance` is how many px of scroll fully completes
// the morph.
export function useScrollMorph(
  scrollRef?: RefObject<HTMLElement | null>,
  opts?: { distance?: number; heroMaxHeight?: number; heroMinHeight?: number },
) {
  const { distance = 200, heroMaxHeight = 288, heroMinHeight = 0 } = opts ?? {};
  const { scrollY } = useScroll(scrollRef ? { container: scrollRef } : undefined);

  // Big hero preview: collapse its reserved height so content below rises to
  // fill the gap, and shrink/fade/lift the image itself for the "flies away"
  // feel. heroMaxHeight matches the preview's `max-h-72` (18rem = 288px).
  // heroMinHeight 0 makes it vanish (a separate header thumb takes over);
  // a non-zero value makes it shrink into a pinned thumbnail in place.
  const heroHeight = useTransform(scrollY, [0, distance], [heroMaxHeight, heroMinHeight]);
  const heroScale = useTransform(scrollY, [0, distance], [1, 0.7]);
  const heroOpacity = useTransform(scrollY, [0, distance * 0.85], [1, 0]);
  const heroY = useTransform(scrollY, [0, distance], [0, -24]);

  // Top-left thumbnail: absent while the hero is full, pops in as it collapses.
  const thumbOpacity = useTransform(scrollY, [distance * 0.35, distance * 0.8], [0, 1]);
  const thumbScale = useTransform(scrollY, [distance * 0.35, distance * 0.8], [0.4, 1]);

  return { scrollY, heroHeight, heroScale, heroOpacity, heroY, thumbOpacity, thumbScale };
}
