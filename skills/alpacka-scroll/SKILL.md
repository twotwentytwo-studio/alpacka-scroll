---
name: alpacka-scroll
description: How to wire @alpacka/scroll into a site — a smooth-wheel replacement for Lenis and a virtual scroll for full-WebGL pages, on one rAF clock. SMOOTH is the browser's native scroll with only the wheel eased, plus named locks, hold(), pin() for page transitions, scope() for panels and to() returning a Promise. VIRTUAL is a fixed document where wheel, finger, keys and push() become deltas driving columns; one column() covers infinite columns, clamped panels, finite walls and horizontal strips, with _vrect/_parked for a DOM-mirrored GL layer. Use when adding smooth or virtual scroll to a site (recipes for a plain script, Nuxt, Astro and React / Next), replacing Lenis, building a scrolling column or strip of GL planes, locking scroll under a panel or intro, pinning a leaving page in a page transition, or testing scroll in headless Chrome.
---

# What it is

`@alpacka/scroll` has no dependencies and is framework-free. It offers two modes, `smooth()` and `virtual()`, which share one `requestAnimationFrame` clock.

```bash
npm i @alpacka/scroll
```

The API contract lives in two places:
- **`README.md`:** what each mode does and why.
- **`dist/*.d.ts`:** every public option, method and getter, with its unit and default.

The code is in `src/`; see the source map at the end. This skill is the wiring.

# Pick the mode

- **`smooth()`**: a normal document that the browser scrolls. Use it for ordinary sites, including a WebGL layer drawn over a native scroll. Find-in-page, anchors, `position: sticky`, keyboard, scrollbar and touch all stay native. Only the wheel is eased.
- **`virtual()`**: nothing scrolls natively, and every page is a fixed `inset-0` stage. Use it for full-WebGL sites, and for anything infinite: a wrapping column or strip of GL planes, where a cloned item would mean a second plane and a second texture.

Either mode owns the page's single `requestAnimationFrame`. Run everything continuous on its `tick`, and do not start another rAF loop.

# Pick the wiring

The package has no framework code. Each framework needs the same three things: one instance per page, made in the browser, and destroyed when its page or component goes. Importing the package on a server is safe. Calling `smooth()` or `virtual()` there is not: both read the document.

- **Plain script.** Make the instance in one module and import it everywhere else:

  ```ts
  // scroll.ts
  import { smooth } from '@alpacka/scroll'

  export const scroll = smooth()
  ```

  Load it from a module script, which runs once the document is parsed. A classic script in `<head>` runs before `<body>` exists.
- **Nuxt.** `reference/smooth-plugin.client.ts` or `reference/virtual-plugin.client.ts`, with `reference/useColumn.ts` and `reference/useScopedScroll.ts`. The instance is `$scroll`.
- **Astro.** `reference/astro-scroll.ts`. Scripts ask for the instance with `getScroll()`. Under `<ClientRouter />` the recipe makes a new instance on every navigation, because the router replaces `<body>` and every attribute on `<html>`, where both modes keep state. Set each page up on `astro:page-load`. A lock held across a navigation is dropped with the old instance.
- **React and Next.** `reference/react-smooth.tsx` or `reference/react-virtual.tsx`: a `ScrollProvider`, `useScroll()`, and `useScopedScroll()` or `useColumn()`. `useScroll()` is null until the provider has mounted, so every effect that uses it lists it as a dependency. The smooth recipe sets `history.scrollRestoration` back to `'auto'`: Next leaves back and forward to the browser, and `smooth()` sets it to `'manual'`.

The Vue rules below have a React and an Astro side:

- **Unmounting a column.** The Vue and Astro recipes pass `{ keep: true }`: the element leaves with its page. React has removed the element by the time an effect cleans up, and StrictMode makes the column twice on the same element, so the React recipe calls a plain `destroy()`. A column made on an element that still carries another column's transforms would measure them.
- **Two columns over the same children.** In React, call `set({ enabled })` straight from the media query's listener. A state update lands a task later, after both columns have measured.

# Smooth mode

Nuxt plugin: `reference/smooth-plugin.client.ts` (includes gsap and ScrollTrigger). Other frameworks: see Pick the wiring. The core:

```ts
const scroll = smooth()                        // { ease = 0.1 }
scroll.on('tick', ({ y, time, ratio, still }) => {})
scroll.on('scroll', ({ y, direction }) => {})
```

Recipes:

- **Scroll somewhere.** Use `scroll.to(500 | '#id' | el, { duration, ease, immediate })`. It returns a Promise that resolves on landing, and also when a wheel, a lock or a native scroll interrupts it, so awaiting it never hangs. It works through locks. Under reduced motion it is always immediate.
- **A panel over the page.** Call `scroll.lock('menu')` when it opens and `scroll.unlock('menu')` as it STARTS to close, not once it is gone, so the page answers the wheel under the closing wipe. Locks are named, and the page moves again only when the last name is gone, so an intro, a panel and a transition can overlap without knowing about each other. A lock sets `overflow: hidden` on `<html>` (with `scrollbar-gutter: stable`, set for you), so a native-scrolling panel over a locked page needs no marker attributes.
- **A panel that scrolls itself, smoothed.** Use `scroll.scope(box)`. It is the same scroller on the box (the box's first child is the content), stepped on the same clock. Call its `destroy()` when the box goes. For Vue: `reference/useScopedScroll.ts`. For React: `useScopedScroll` in `reference/react-smooth.tsx`.
- **A page transition with both pages on screen.** Call `scroll.pin(leavingEl, y = 0)` in `onBeforeLeave`. It takes the leaving page out of flow (its `[data-pin]` wrapper when it has one, so fixed chrome outside the wrapper stays on the viewport) and resets the scroll in one call. The offset goes in `top`, leaving `transform` to the transition, so neither page moves. When the pinned element is removed or hidden, the scroll length is re-read on its own: do not call `resize()` after the transition. Keep the leave callback's `done` until your exit animation finishes. Expose a `flush()` that your route middleware calls before every navigation, and have it call `done` and unlock, or an interrupted transition strands a pinned page on screen.
- **A swap the trackpad must not scroll through.** Call `const release = scroll.hold()` and release it when the swap is done. It swallows the wheel without a named lock.
- **GL that reads scroll speed.** `velocity` is px per 60fps frame, the same at any refresh rate. For px moved this frame, use `velocity * ratio` inside a tick.
- **ScrollTrigger.** Call `ScrollTrigger.update()` on `'scroll'`. Call `ScrollTrigger.refresh()` on resize, and before `reset()` or `pin()`: a refresh puts back the scroll position it measured from.
- **Getters:** `y`, `target`, `velocity`, `direction`, `max`, `progress` (0 when the page is too short to scroll), `still`, `locks`.

`smooth()` sets `history.scrollRestoration` to `'manual'`, for a router that restores the scroll itself (vue-router, Nuxt and Astro's `<ClientRouter />` all do). Under a router that leaves back and forward to the browser, set it back to `'auto'` after the call, as the React recipe does. `destroy()` puts back the value it found, and the scrollbar gutter.

The scroll length is re-read when the page or `<body>` changes size, when a pinned page leaves, on `resize()`, on `to()`, and when the wheel reaches the end. Under `html, body { height: 100% }` no box changes size when the content grows, so `max` and `progress` can read short until one of those happens. Call `scroll.resize()` after such a change if something reads them.

Touch is never listened to in this mode, and must not be smoothed. On touch the compositor owns the scroll, and anything written from the scroll position on the main thread lags it by a frame.

# Virtual mode

Nuxt plugin: `reference/virtual-plugin.client.ts` (includes an optional bridge for a site that already has an event bus). Other frameworks: see Pick the wiring. The core:

```ts
const scroll = virtual()                       // fixes <html>/<body> itself; { reducedMotion } overrides the media query
scroll.on('tick', ({ time, ratio }) => {})     // after the columns stepped
scroll.on('input', ({ x, y, e }) => {})        // every delta, after the columns took it
```

What the input does:
- **Wheel:** ×1.25. A notch gets another ×2 and is spooled over frames.
- **Finger:** vertical only, ×3.25, with one throw ×35 when the last finger lifts. It follows one finger by identifier.
- **Keys:** arrows 100px; page keys and space 0.9 of the viewport.
- **`push(dy, dx, e?)`:** any other input device, such as a mouse drag.

Locked or held, nothing moves and nothing is saved up. A gesture that starts over a box that scrolls natively stays with that box.

Under `prefers-reduced-motion` every column moves without easing: `gap` is always 0, so a GL deformation that reads it never moves, and a finger's throw lands in one frame. That is a choice about the whole site's motion, so make it on purpose. Either leave the default, or pass `virtual({ reducedMotion: false })` to keep the easing for everyone, and answer reduced motion in the site itself.

`across(claims)` cancels sideways wheels while `claims()` returns true, so a trackpad swipe that something on the page uses never turns into the browser's back gesture. `claimed(keyEvent)` says whether a key belongs to a focused field rather than to scrolling.

## Columns

```ts
const col = scroll.column({ el, box })         // el's children move; box is "on screen" (default: the viewport)
```

For Vue, use `reference/useColumn.ts`. Its runtime options take refs or getters. For React, use `useColumn` in `reference/react-virtual.tsx`. Its `enabled`, `loop` and `listen` follow the props.

Configurations:

| want | options |
| --- | --- |
| infinite column (wraps, no clones) | default (`loop: true`) |
| finite column, children still parked for GL | `loop: false` |
| clamped panel: one transform on `el`, children untouched | `whole: true` |
| horizontal strip that a vertical wheel drives too | `x: true`, often `reach: 1` |
| walls on a mouse, a loop on a finger | `loop` from a getter (useColumn) or `set({ loop })` |
| copy that moves with the pictures without being one | `lead: el` |
| re-measure keeps the item under a line, not the middle | `line: () => viewportPx` |
| tap catches a coasting column; a re-flick on touch resumes it | `grab: true`, then read `col.caught` to refuse that tap's click |
| a deformed surface that bends what is past the edge into view | raise `overscan`; `bleed: (box) => px` |
| freeze it (another column owns the same children) | `set({ enabled: false })`; switched back on, it resumes where it stands |
| input passes by, it still eases | `set({ listen: false })` |
| a page drawn wholly in GL: no transforms written, `_vrect` and `_parked` still published | `transforms: false` |

Methods:
- `col.to(px, { immediate })`: set a position. With `immediate` there is no travel.
- `col.add(px)`: move it by code along its own axis, such as a drift. It ignores `listen`.
- `col.center(i, { line, force })`: put child `i` in the middle, or its leading edge `line` px in, with no travel. `force` places it while the column is disabled.
- `col.seek(i, { line })`: the same, but glided to, and at the nearest lap. It returns the distance added.

Only `scroll.push(dy, dx, e)` takes two deltas, vertical first. Everything on a column is one number along its axis.

Upgrading a site from 0.3: `col.add(dx, dy)` is now `col.add(px)`, and `to`, `center` and `seek` take their extras as named options (`col.to(px, true)` is `col.to(px, { immediate: true })`). An old call does not throw in plain JS: it eases where it used to jump, or adds 0. Search the site for `.add(`, `.to(`, `.center(` and `.seek(` on columns when you upgrade.
- `col.measure()`, `col.set({ … })`.
- `col.destroy({ keep? })`: stop listening, observing and stepping. A plain `destroy()` clears every transform, `_vrect` and `_parked` it wrote. With `keep: true` it leaves them as they stand, which is what an unmount wants (see the rules).

A re-measure keeps whatever sits on the reading line in place. Between ends a wall wins: a column resting at its top or far end, or coasting into one, stays there through a rotation or a resize. After `measure()`, `to(px, { immediate: true })` or `center()`, children past the overscan park two frames later, as they do when the column moves them out.

Getters: `y`, `target`, `gap` (target − current, the momentum a deformation reads), `max`, `span`, `progress`, `caught`.

Focus goes through the column. Tab to a link in a child that is off screen, and the column moves to show it, by the nearest lap in a loop. It answers `:focus-visible` only, so a click moves nothing. The browser's own attempt, a native scroll on an `overflow: hidden` box around the column, is put back at once: it would move the DOM away from `_vrect`. That covers `scrollIntoView()`, hash links and find-in-page too, so none of them moves a virtual page. Use `col.seek(i)` or `col.to(px)`. An axis with `overflow: auto` or `scroll` is left alone.

Two expandos go to a DOM-mirrored GL layer:
- **`el._vrect`:** each child's on-screen rect, derived rather than read, so the mirror never reads layout straight after these writes.
- **`el._parked`:** raised one frame after a child's last transform past the overscan.

# Rules — each one broke something

- **Read the console.** The package throws when `smooth()` or `virtual()` runs on a server, when `virtual()` runs before `<body>` exists and when `column()` gets no element. It warns when a second `smooth()` starts while one is live, and when `to()` gets a selector that matches nothing. Each message starts with `@alpacka/scroll:` and says what to do.

- **Watch a component's reactive state from `onMounted`, never during setup.** A getter can name state the component declares further down, and evaluating it early throws (a TDZ error), which takes the whole page down.
- **Never patch methods onto an instance, and never spread one.** `Object.assign(scroll, { resize })`, where the new `resize` calls `scroll.resize()`, calls itself forever. `{ ...scroll }` freezes every getter at its value at that moment. Provide the instance as it is, and put site extras in their own functions.
- **Use `whole: true` for a panel whose children something else animates.** Per-child transforms would overwrite the children's own (e.g. gsap) transforms.
- **A column measures itself** when its element or box resizes, on a ResizeObserver. Children that change while the element keeps its size (cards growing inside a fixed-width track) need a manual `col.measure()`.
- **`velocity` (smooth) is a rate; `gap` (column) is a distance still owed.** Neither is "px this frame". In smooth mode, multiply by `ratio` for that.
- **Locks hold input, not code.** `to()`, `reset()`, `pin()`, `col.to()`, `col.add()` and `col.center()` all still move things while locked.
- **A boot lock needs its unlock.** If the plugin calls `lock('boot')`, the end of the intro must call `unlock('boot')`, or nothing ever scrolls.
- **Destroy on unmount with `{ keep: true }`.** Vue runs `onBeforeUnmount` at the START of a leave transition, while the leaving page is still on screen. A plain `destroy()` there clears every transform, so the leaving page snaps back to scroll 0 for the whole transition. The element goes with the component anyway, so there is nothing to clear.
- **Two columns over the same children** (a strip on a desktop, a stack on a phone): flip `enabled` synchronously, in the same task as the layout change, before either column measures. Each column re-measures from its own ResizeObserver and window `resize` the moment the layout changes. A column still enabled under the other's layout measures it along its own axis, where every child starts at the same place. Switched back on, it seats from those collapsed slots and lands on the last child. A debounced flag or a `flush: 'post'` watch is too late.
- **Pose from `_vrect` on `'tick'`, never in a gsap `onUpdate`.** gsap's ticker runs before the columns step. A tween's `onUpdate` therefore reads last frame's `_vrect`, while the mirror around it reads this frame's. A plane flying onto a moving card trails it by a frame, then hops when it lands. Keep the tween as a clock, and write the pose on `'tick'`.

# Testing

An in-app or background browser pane often runs no animation frames, and then no scroll events or ResizeObserver callbacks either. A scroll test there proves nothing. Drive headless Chrome over the DevTools protocol:

```bash
node reference/cdp.mjs http://localhost:3000/ reference/cdp-example.mjs ./out
```

`cdp.mjs` needs Node 22 (for its built-in WebSocket) and Chrome. Run it with `QUIET=1` on a page that floods the console: dev-mode framework warnings can carry whole component trees, and capturing them can stall the script. Then catch errors in the page yourself, with an `error` listener read back through `evaluate`. Set `CHROME=/path/to/chrome` on a platform other than macOS. The steps file can be a relative or an absolute path. There are no npm installs. Headless runs real frames and has WebGPU. Steps get `evaluate`, `wheel(x, y, dy, dx)`, `shot(name)` (a PNG), `send` (raw CDP, e.g. `Input.dispatchTouchEvent`) and `sleep`. The run prints page exceptions and console errors at the end.

What to check:
- For an A/B check against the old scroll, run the same steps file against a `git worktree` of the previous branch on a second port.
- Chrome holds back touch moves that stay within its touch slop, and merges events sent with no gap. Space touch steps about 16–40ms apart.
- For package logic alone, run `npm test` in the package folder. It serves the folder on localhost and runs `playground/virtual.html?test` and `playground/smooth.html?test`, where rAF is swapped for a hand-stepped clock, `step(n)`. Every check runs with and without reduced motion, and a failure exits 1.
- Beside another agent's Chrome, give the driver a port of its own: `CDP_PORT=9811 node cdp.mjs …`. Two drivers on one port talk to the same browser.

`cdp.mjs` closes its Chrome on exit, Ctrl+C included. Check for leftovers anyway: a headless Chrome still running makes macOS refuse to open the normal Chrome, because it brings the invisible instance to the front instead of opening a window. To list them, run `pgrep -fl "Google Chrome.*--headless"`. To close them, run `pkill -f "Google Chrome.*--headless"`.

# Source map

| file | what |
| --- | --- |
| `src/index.ts` | exports, and the whole API in one comment |
| `src/core.ts` | context, `startClock`, `createBus`, `createHold` |
| `src/wheel.ts` | `wheelReader` (px + notch), `drainSpool`, `scrollsNatively`, `canScrollFurther` |
| `src/scroller.ts` | the native scroller: wheel easing, taking over from foreign scrolls, `to` / `reset` / locks |
| `src/smooth.ts` | `smooth()`: the page scroller, clock, `pin`, `scope`, `hold` |
| `src/input.ts` | the virtual input: wheel sum and spool, finger, keys, latch, `across`, `claimed` |
| `src/column.ts` | `createColumn`: wrap, ends, `whole`, parking, the reading line, grab, `seek` |
| `src/virtual.ts` | `virtual()`: the fixed document, input → columns → `'input'`, clock, locks, `reducedMotion` |
| `playground/tests.js` | the column and virtual-input checks, `runTests()` on `virtual.html?test` |
| `playground/smooth-tests.js` | the smooth scroller's checks, `runTests()` on `smooth.html?test` |
| `playground/run-tests.mjs` | `npm test`: serves the folder and runs both pages through `cdp.mjs` and `playground/test-steps.mjs` |

# Reference

- `reference/smooth-plugin.client.ts`: Nuxt plugin, smooth mode, with gsap and ScrollTrigger
- `reference/virtual-plugin.client.ts`: Nuxt plugin, virtual mode, with a boot lock and an optional bus bridge
- `reference/useColumn.ts`: a virtual column as a Vue composable, with reactive options
- `reference/useScopedScroll.ts`: `scope()` for a panel, as a Vue composable
- `reference/astro-scroll.ts`: Astro, either mode, with and without `<ClientRouter />`
- `reference/react-smooth.tsx`: React and Next, smooth mode: provider, `useScroll`, `useScopedScroll`
- `reference/react-virtual.tsx`: React and Next, virtual mode: provider, `useScroll`, `useColumn`
- `reference/cdp.mjs`, `reference/cdp-example.mjs`: the headless driver and a steps file
