# @alpacka/scroll

Scroll in two modes, both on one `requestAnimationFrame`:

- `smooth()` keeps the browser's scroll and eases the mouse wheel. It adds named locks, scroll-to and a pin for page transitions.
- `virtual()` turns native scroll off. Wheel, touch and keys become deltas, and the deltas move columns: clamped, looping or horizontal. Made for pages drawn in WebGL.

No dependencies and no framework code. Types included.

```bash
npm i @alpacka/scroll
```

## Frameworks

It runs anywhere there is a document. Make one instance per page, in the browser, and destroy it when the page goes. Importing the package on a server is safe. Calling `smooth()` or `virtual()` there is not.

- Plain script: the examples below, as they are.
- Nuxt: a client plugin that provides the instance, and composables for a column and a scoped panel.
- Astro: a script module. With `<ClientRouter />` it makes a new instance on every navigation.
- React and Next: a provider, `useScroll()` and `useColumn()`. Works under StrictMode and the App Router.

The files are in `skills/alpacka-scroll/reference/`. Copy the one for your framework.

## smooth

```js
import { smooth } from '@alpacka/scroll'

const scroll = smooth({ ease: 0.1 })

scroll.on('tick', ({ y, time, ratio, still }) => {})   // every frame
scroll.on('scroll', ({ y, direction }) => {})          // when the position changes

scroll.to(500)                         // px, a selector or an element
scroll.to('#work', { duration: 1, ease, immediate: false })
scroll.reset(0)                        // jump there, no travel
scroll.resize()                        // re-measure the scroll length
scroll.lock('menu')                    // stop the visitor scrolling
scroll.unlock('menu')
const release = scroll.hold()          // the same, without a name
scroll.pin(leavingPage, 0)             // page transitions, see below
const panel = scroll.scope(box)        // the same scroller on an overflow box
scroll.destroy()
```

Read-only: `y`, `target`, `velocity`, `direction`, `max`, `progress`, `still`, `locks`.

- Only the wheel is eased. Touch, keys, the scrollbar, anchors and find-in-page scroll natively.
- If anything else moves the page, the scroller follows it at once, even mid-ease.
- A mouse wheel notch is spread over a few frames, so the page ramps into it.
- A nested box that can scroll takes the wheel while the pointer is over it and passes it on at its end. It needs no markup.
- `smooth()` sets `history.scrollRestoration` to `'manual'` and `scrollbar-gutter: stable` on the root, and `destroy()` puts both back. If your router leaves back and forward to the browser (Next does), set it to `'auto'` after the call: the scroller follows a restored position like any other native scroll.
- The scroll length is re-read when the page or `<body>` changes size, when a pinned page leaves, on `resize()`, on `to()`, and when the wheel reaches the end, so content that grows inside a `<body>` of fixed height is still reached.
- `lock(name)` sets `overflow: hidden` on the root. The page scrolls again when every name is unlocked. A lock stops the visitor only: `to()`, `reset()` and `pin()` still move the page.
- `to()` returns a Promise. It resolves when it lands, and also when a wheel, a lock or a native scroll interrupts it, so awaiting it never hangs. `duration` is in seconds.
- `velocity` is px per 60fps frame, at any refresh rate. Multiply by the tick's `ratio` for px moved this frame.
- `ratio` is the frame's length in 60fps frames. `time` is in seconds.

### pin

For a page transition with both pages on screen. `pin(el, y = 0)` takes the leaving page out of flow and resets the scroll in the same call, so neither page jumps. The leaving page becomes `position: absolute`, offset by the scroll it had.

- If the page has a `[data-pin]` wrapper, the wrapper is pinned, and fixed elements outside it stay on the viewport.
- A page that is already `position: fixed` only has the scroll reset.
- To land anywhere but the top, pin after the new page is in.
- The scroll length is re-read when the pinned element is removed or hidden, so nothing needs calling once the transition ends.

## virtual

```js
import { virtual } from '@alpacka/scroll'

const scroll = virtual()

scroll.on('tick', ({ time, ratio }) => {})     // every frame, after the columns step
scroll.on('input', ({ x, y, e }) => {})        // every delta, with its event

scroll.lock('loader')
scroll.unlock('loader')
const release = scroll.hold()
scroll.push(dy, dx, e)                         // feed it a delta, e.g. from a mouse drag
const off = scroll.across(() => true)          // cancel sideways wheels (the back gesture)
scroll.claimed(keyEvent)                       // is this key for a focused field, not for scrolling
scroll.destroy()

const col = scroll.column({
	el,                // its children move
	box,               // what counts as on screen. Default: the viewport
	x: false,          // horizontal. A vertical wheel drives it too
	loop: true,        // wrap for ever. false: stop at the ends
	whole: false,      // move el itself in one transform, between ends
	lead: null,        // an element outside el that moves with the children
	line: null,        // () => viewport px a re-measure holds still. Default: the box's middle
	ease: 0.1,         // share of the remaining distance per 60fps frame
	reach: 0,          // soft limit on target minus position, in box sizes. 0: none
	overscan: 0.5,     // how far past the box a child stays live, in box sizes
	bleed: null,       // (box) => px a child travels past the leading edge before it wraps
	grab: false,       // a press stops a coasting column
	enabled: true,     // false: frozen
	listen: true,      // false: ignores input, still eases
	transforms: true,  // false: writes nothing to the DOM
})

col.to(px, { immediate })       // set the target. immediate: be there with no travel
col.add(px)                     // move the target by code, along the column's axis. Ignores listen
col.center(i, { line, force })  // child i in the middle, no travel
col.seek(i, { line })           // the same, eased, by the nearest lap. Returns the distance
col.measure()                   // re-read the layout
col.set({ listen: false })      // change options
col.destroy({ keep: false })
```

Read-only on a column: `y`, `target`, `gap`, `max`, `span`, `progress`, `caught`.

- `virtual()` sets `position: fixed; overflow: hidden; touch-action: none` on `<html>` and `<body>`.
- Input sizes: wheel ×1.25 (a mouse notch ×2 on top, spread over frames), arrow keys 100px, page keys and space 0.9 of the viewport. Touch is vertical only, ×3.25, with one throw when the finger lifts.
- While locked or held, input is dropped, not saved.
- An element that scrolls natively keeps its own wheel and touch.
- The target is clamped, not the eased position, so overscroll stores nothing. `gap` is target minus position: use it as the speed signal for a deformation.
- With `loop`, each child wraps on its own around the content's length. Nothing is cloned.
- With `whole`, one transform goes on `el` and its children are left alone, free to be animated by something else.
- An element focused with the keyboard is brought into view by moving its column, by the nearest lap in a loop.
- A native scroll on a box around a column (the browser showing a focused element, `scrollIntoView()`, find-in-page) is put back at once, so the DOM never drifts from the column. An axis with `overflow: auto` or `scroll` is left alone.
- A column measures itself when its element or box resizes. A re-measure keeps whatever is on the reading line in place, and a column resting at an end stays at that end.

### For a WebGL layer

Each child gets two properties to read instead of the DOM:

- `_vrect`: the child's on-screen rect, `{ left, top, width, height }`.
- `_parked`: true once the child is past the overscan and can be skipped.

`transforms: false` is for a page drawn entirely in WebGL. The column still steps, wraps and sets `_vrect` and `_parked`, but writes no transform, so the elements stay where the layout put them. That means no hit testing on the children and nothing to show without the WebGL layer. With `whole` there is no `_vrect`: place the element from `col.y`.

### Unmounting

`destroy()` clears every transform the column wrote. `destroy({ keep: true })` stops the column and leaves them. Use it when the element stays on screen for a while after unmount, such as a page leaving under a transition.

### Upgrading from 0.3

Four column methods changed shape, so that every option has a name:

- `col.add(dx, dy)` is `col.add(px)`, along the column's own axis. For an `x` strip that read both, pass `dx + dy`.
- `col.to(px, true)` is `col.to(px, { immediate: true })`.
- `col.center(i, line, force)` is `col.center(i, { line, force })`.
- `col.seek(i, line)` is `col.seek(i, { line })`.

`raf` and `input` are gone from a column, and `raf` from a scroller. They were the clock's, never the site's.

## Reduced motion

Under `prefers-reduced-motion`, smooth leaves the wheel to the browser and `to()` lands at once. A virtual column moves without easing, so its `gap` stays 0.

`virtual({ reducedMotion: false })` keeps the easing for everyone, for a site that handles reduced motion itself. `true` removes it for everyone.

## Mistakes it tells you about

- Calling `smooth()` or `virtual()` on a server throws, with a message that says where to call it.
- `virtual()` before `<body>` exists throws.
- `column()` without an element throws.
- A second `smooth()` while one is live warns in the console.
- `to()` with a selector that matches nothing warns, and the scroll stays where it is.

## Playground and tests

`npm test` builds the package and runs every check in headless Chrome, with and without reduced motion. It needs Chrome: set `CHROME=/path/to/chrome` anywhere but macOS.

To look at a mode, serve the folder and open `playground/virtual.html` (a looping column, a clamped one and a strip) or `playground/smooth.html`. With `?test` the clock is stepped by hand (`step(n)`) and `runTests()` runs that page's checks.

## Agent skill

The package ships `AGENTS.md` and a skill in `skills/alpacka-scroll/`: which mode to pick, the wiring for a plain script, Nuxt, Astro and React, recipes, and a headless Chrome test driver. Copy the folder into a project's `.claude/skills/` to use it.

Every option, method and getter is documented in `dist/*.d.ts` with its unit and default.

## License

MIT
