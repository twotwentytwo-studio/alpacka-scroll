# @alpacka/scroll

Two scroll modes on one clock.

- **smooth**: the browser's own scroll, with the wheel eased over it, plus named locks and a pin for page transitions.
- **virtual**: nothing scrolls natively. Input becomes deltas, and columns move: clamped, infinite, or horizontal strips of GL planes.

## For agents

The package ships its own agent docs:
- **`AGENTS.md`**: where to start, and how to point a site's agents at it.
- **`skills/alpacka-scroll/`**: a skill with the mode choice, Nuxt plugins and composables, recipes, rules, and a headless-Chrome test driver. Copy it into a site's `.claude/skills/` to load it as a skill.

Every public option, method and getter carries its unit and default in `dist/*.d.ts`.

## smooth

```js
import { smooth } from '@alpacka/scroll'

const scroll = smooth()            // { ease = 0.1 }

scroll.on('tick', ({ y, time, ratio, still }) => {})
scroll.on('scroll', ({ y, direction }) => {})

scroll.y · target · velocity · direction · max · progress · still · locks

scroll.to(500 | '#id' | el, { duration, ease, immediate })   // → Promise
scroll.reset(y = 0)
scroll.resize()
scroll.lock('panel') / unlock('panel')
scroll.hold()                      // → release
scroll.pin(leavingPage, y = 0)
scroll.scope(box)                  // the same scroller on a box → .destroy()
```

- **Only the wheel is smoothed.** Touch is never listened to; keys, the scrollbar, find-in-page, focus, anchors and scroll anchoring scroll natively.
- **Foreign scrolls take over.** A position that is not the one last written was somebody else, and the scroller follows it at once, even mid-ease.
- **Notches ramp.** A mouse wheel's lone step is spooled into the target over frames instead of landing whole, so the page ramps into it instead of kicking off at full speed.
- **Nested boxes need no markers.** A box under the pointer that can still scroll the wheel's way scrolls natively. At its end it hands the wheel on, as the browser chains it. At the page's own ends the wheel is the browser's too, so it bounces.
- **Locks are named.** The page moves again when the last owner lets go. A lock is `overflow: hidden` on the root, so a panel over a locked page scrolls without being marked. It holds only the visitor's input: `to()`, `reset()` and `pin()` still move the page.
- **A locked page's wheel is cancelled, not let through.** A box under the pointer that can scroll still takes it. The browser dispatches the rest of a gesture uncancelable when its first wheel is not cancelled, so a trackpad gesture let through under a lock and still running when the lock lifts would scroll natively; cancelled, it stays the scroller's and eases on.
- **`to()` returns a Promise.** It resolves when it lands, and also when anything interrupts it (a wheel, a lock, a foreign scroll), so nothing waits forever.
- **`velocity` is px per 60fps frame**, measured once a frame for every source, whatever the display's refresh rate. Multiply by `ratio` for the pixels moved this frame.
- **`pin(el, y = 0)`** takes a leaving page out of flow and resets the scroll in the same breath, so neither page moves. The leaving page ends up `absolute` at `top: landing − scroll`. It pins the page's `[data-pin]` wrapper when it has one, so fixed chrome kept outside the wrapper stays on the viewport. A page that is already `position: fixed` only has the scroll moved. To land anywhere but the top, pin once the arriving page is in.

## virtual

```js
import { virtual } from '@alpacka/scroll'

const scroll = virtual()                         // { reducedMotion = the visitor's prefers-reduced-motion }

scroll.on('tick', ({ time, ratio }) => {})       // after the columns step
scroll.on('input', ({ x, y, e }) => {})          // every delta, after the columns, with its event
scroll.lock('loader') / unlock('loader')
scroll.hold()                                    // → release
scroll.push(dy, dx, e?)                          // another input device — a mouse drag
scroll.across(() => claims)                      // cancel sideways wheels (the back gesture) → off
scroll.claimed(keyEvent)                         // is the key the focused field's

const col = scroll.column({
	el,                // whose children move
	box,               // what "on screen" means — the viewport without one
	x: false,          // a strip; a vertical wheel drives it too
	loop: true,        // wrap; false: the children stop at the ends
	whole: false,      // move el itself in one transform between ends — the clamped column
	lead: null,        // moves WITH the children, first in the cycle
	line: null,        // () => viewport px of the reading line a re-measure holds; the box's middle without
	ease: 0.1,
	reach: 0,          // soft ceiling on the gap, in box sizes
	overscan: 0.5,     // how far past the box a child stays live, in box sizes
	bleed: null,       // (box) => px past the leading edge a child travels before it wraps
	grab: false,       // a press catches it coasting; on touch, a second flick the same way resumes
	enabled: true,     // off: frozen; back on, resumes where it stands
	listen: true,      // off: input passes it by, it still eases
	transforms: true,  // off: nothing is written to the DOM; _vrect and _parked still go out
})

col.y · target · gap · max · span · progress · caught
col.to(px, now?)                  // a position; with now, no travel
col.add(dx, dy)                   // move it by code — a drift; ignores listen
col.center(i, line?, force?)      // child i in the middle (or `line` px in), no travel
col.seek(i, line?)                // the same, glided to, the nearest lap → distance added
col.measure() · set({ … })
col.destroy({ keep? })            // stop; keep: leave every transform, _vrect and _parked as it stands
```

- **The document is fixed.** `<html>` and `<body>` are `position: fixed; overflow: hidden; touch-action: none`. The last is what claims the gesture from Safari.
- **Input becomes deltas.** Wheel ×1.25 (a notch ×2 on top, spooled), arrow keys 100px, page keys and space 0.9 viewport. A finger is vertical only, ×3.25, with one throw ×35 when the last finger lifts. It follows one finger by identifier, so a second landing never jumps. The wheel is summed through the frame and spent once, before the columns step; a finger, a key and a push go out as they arrive. A cancelled touch throws nothing.
- **Locked or held, nothing moves and nothing banks.** A wheel rolled behind a loader is dropped.
- **A box that scrolls natively keeps its gesture**, latched the way the browser latches: the wheel for a whole gesture that starts over a box that can still go its way, and the finger for a whole touch that starts in one.
- **A column clamps its target, never the eased value**, so overscroll banks nothing. `gap` (target − eased) is the momentum every deformation reads.
- **Every child moves on its own.** With `loop` each child wraps around the content's span (scroll size plus gap, padding included), so there is no cloned content and no second plane or texture. With `whole` the element moves instead, and its children's transforms stay free for whatever animates them.
- **The GL mirror gets two expandos.** `_vrect` is each child's on-screen rect, derived rather than read back. `_parked` is raised one frame after a child's last transform past the overscan, so the mirror takes the resting rect first.
- **`transforms: false` is for a page drawn wholly in GL.** The column still steps, wraps and parks, and still publishes `_vrect` and `_parked`, but writes no transform: the elements stay where the layout put them and only the mirror moves. Nothing in the DOM follows the column then, so there is no hit testing on the children and no fallback to show without the GL layer. A transform somebody else put on a child is left alone. With `whole` there is no `_vrect`: place the element yourself from `y`.
- **A re-measure keeps the reader in place.** Whatever sits on the reading line stays there, as a share of its pitch, with laps and momentum included. That covers pictures decoding, a font swapping, and a box settling late.
- **Between ends, a wall wins over the reader.** A column resting at its top or far end, or coasting into one, is still there after a re-measure, still coasting; a rotation or a taller box never moves it off. Any other seat past an end is clamped to it. Only a column just switched from `loop` to ends brings a value laps away back into the first lap.
- **A forced placement parks two frames later.** `measure()`, `to(px, true)` and `center()` lay every child out live; the next frame gives each child past the overscan its resting transform, and the one after raises `_parked`, as when the column moves it out.
- **`destroy({ keep: true })` leaves the children where they stand.** It stops listening, observing and stepping without clearing a transform, `_vrect` or `_parked`. Use it when the element is going anyway but stays on screen a while first: a page leaving under a transition, which Vue unmounts at the start of its leave. A plain `destroy()` clears, and can follow a kept one.
- **Turning a column back on** (`set({ enabled: true })`) resumes from where it stands, so a target that arrived while it was off does not ease in.

## Both

The clock is the page's one `requestAnimationFrame`. Everything steps on it, then `tick` goes out with `ratio`, the frame's length in 60fps frames. Under `prefers-reduced-motion`, smooth leaves the wheel to the browser and lands every `to()` at once, and a column moves without easing: its `gap` stays 0 and a finger's throw lands in one frame. `virtual({ reducedMotion: false })` keeps the easing for every visitor, for a site that answers reduced motion itself; `true` drops it for every visitor.

`playground/virtual.html` (serve the folder) has a looping column, a clamped one and a strip. Add `?test` to step the clock by hand with `step(n)`, and to load the column checks in `playground/tests.js` as `runTests()`. `playground/test-steps.mjs` runs them headless through `skills/alpacka-scroll/reference/cdp.mjs`, with and without reduced motion.
