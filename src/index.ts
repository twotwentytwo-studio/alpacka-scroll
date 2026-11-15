/*
 * @alpacka/scroll — two modes on one clock.
 *
 * SMOOTH: the browser's own scroll, with the wheel eased over it.
 *
 *   const scroll = smooth()                          { ease = 0.1 }
 *
 *   scroll.on('tick', ({ y, time, ratio, still }) => …)
 *   scroll.on('scroll', ({ y, direction }) => …)
 *   scroll.y · target · velocity · direction · max · progress · still · locks
 *   scroll.to(500 | '#id' | el, { duration, ease, immediate })   → Promise
 *   scroll.reset(y = 0) · resize()
 *   scroll.lock('panel') · unlock('panel') · hold() → release
 *   scroll.pin(leavingPage, y = 0)
 *   scroll.scope(box)                                the same scroller on a box
 *
 * VIRTUAL: nothing scrolls natively; input becomes deltas, and columns move.
 *
 *   const scroll = virtual()                         { reducedMotion = the visitor's setting }
 *
 *   scroll.on('tick', ({ time, ratio }) => …)
 *   scroll.lock('loader') · unlock('loader') · hold() → release · locks
 *   scroll.push(dy, dx)                              a mouse drag, as input
 *
 *   scroll.on('input', ({ x, y, e }) => …)            every delta, after the columns
 *   scroll.across(() => claims)                      cancel sideways wheels (back gesture)
 *   scroll.claimed(keyEvent)                         is the key the focused field's
 *
 *   const col = scroll.column({ el, box, x, loop, whole, lead, line, ease, reach,
 *                               overscan, bleed, grab, enabled, listen,
 *                               transforms })
 *   col.y · target · gap · max · span · progress · caught
 *   col.to(px, now?) · add(dx, dy) · center(i, line?, force?) · seek(i, line?)
 *   col.measure() · set({ … }) · destroy({ keep? })  keep: leave every transform as it stands
 *
 * A column wraps by default — the infinite scroll. `loop: false` gives its
 * children ends; `whole` moves the element itself in one transform between
 * ends — the clamped column. `x` makes it a strip. `gap` is the momentum every
 * deformation reads.
 *
 * An element the keyboard focuses is brought into view by its column. A
 * native scroll on a box around a column (focus, scrollIntoView(),
 * find-in-page) is put back at once, so the DOM never drifts from `_vrect`.
 *
 * The clock is the page's one requestAnimationFrame. Everything steps on it,
 * then 'tick' goes out with `ratio`, the frame's length in 60fps frames, so a
 * lerp keeps its feel at any refresh rate. Under prefers-reduced-motion the
 * smooth mode leaves the wheel to the browser and every to() lands at once,
 * and a column moves without easing — unless virtual({ reducedMotion: false })
 * keeps it, for a site that answers reduced motion itself.
 */

export { smooth, type Smooth, type SmoothOptions, type Tick, type Move } from './smooth.js'
export { virtual, type Virtual, type VirtualOptions, type VirtualTick, type Input } from './virtual.js'
export { expo, type Ease, type ScrollTarget, type ToOptions, type Scroller } from './scroller.js'
export type { Column, ColumnOptions, DestroyOptions } from './column.js'
