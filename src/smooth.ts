import { createBus, createContext, createHold, startClock } from './core.js'
import { createScroller, type Scroller } from './scroller.js'

/*
 * The browser's own scroll with a smooth wheel over it: the page scroller,
 * the clock, and what a page transition needs from the scroll.
 *
 * Locks are named. Several things hold the page still at once — a panel, an
 * intro, a transition — and the page moves again only when the last of them
 * lets go, so none needs to know about the others. A lock holds the
 * visitor's input only: to(), reset() and pin() still move the page.
 *
 * hold() swallows the wheel without locking — for a swap the page must not
 * move under, where a trackpad's momentum would otherwise outlast the swap
 * and open the next page part-scrolled.
 *
 * pin() takes a leaving page out of flow and moves the scroll in the same
 * breath, so the page arriving lays out at the top and the leaving one does
 * not move by a pixel. The offset goes in `top`, leaving `transform` to the
 * transition. The page's `[data-pin]` wrapper is what moves when it has one,
 * so fixed chrome kept outside it stays on the viewport; a page that is
 * already `position: fixed` only has the scroll moved. To land somewhere
 * other than the top, pin once the arriving page is in — the landing is
 * clamped to what can be scrolled.
 */

/** time in seconds; ratio is the frame's length in 60fps frames (0 on the first). */
export type Tick = { y: number, time: number, ratio: number, still: boolean }

/** direction: 1 down, −1 up. */
export type Move = { y: number, direction: number }

export type SmoothOptions = {
	/** Share of the remaining distance the wheel eases per 60fps frame. Default 0.1. */
	ease?: number
}

/* how many smooth() are live: two would each ease the same wheel into the same page */
let live = 0

export const smooth = ({ ease = 0.1 }: SmoothOptions = {}) => {
	const context = createContext({ ease })

	if (live++) console.warn('@alpacka/scroll: smooth() was called while another instance is live. Call destroy() on the old one first, or make it once and share it: two instances both ease the same wheel.')

	const events = createBus<{ tick: Tick, scroll: Move }>()
	const page = createScroller(null, context, (y, direction) => events.emit('scroll', { y, direction }))
	const root = document.documentElement

	/* what destroy() puts back */
	const before = { restoration: history.scrollRestoration, gutter: root.style.scrollbarGutter }

	/* The scroller owns the position; the browser restoring one too would land
	   before it and show as a jump. A site whose router leaves back and
	   forward to the browser sets this back to 'auto' after the call: the
	   scroller follows a restored position like any native scroll. */
	history.scrollRestoration = 'manual'

	/* a lock hides the scrollbar; the gutter keeps the page from widening */
	root.style.scrollbarGutter = 'stable'

	const stopClock = startClock((time, ratio) => {
		context.steppers.forEach((s) => s.raf(time, ratio))
		events.emit('tick', { y: page.y, time, ratio, still: page.still })
	})

	return {
		/** 'tick' every frame, after the scrollers stepped; 'scroll' whenever the position changes. Returns the off. */
		on: events.on,

		to: page.to,
		reset: page.reset,
		resize: page.resize,
		lock: page.lock,
		unlock: page.unlock,

		/** Swallow the wheel without a named lock, until the returned release is called. */
		hold: createHold(context),

		/**
		 * Take a leaving page out of flow and reset the scroll to `y` (px) in the
		 * same call, so neither page moves. Pins the page's `[data-pin]` wrapper
		 * if it has one; a `position: fixed` page only has the scroll moved.
		 */
		pin(el: HTMLElement, y = 0) {
			const pinned = el.querySelector<HTMLElement>('[data-pin]') ?? el
			const fixed = getComputedStyle(pinned).position === 'fixed'
			const from = page.y

			if (!fixed) Object.assign(pinned.style, { position: 'absolute', left: '0', right: '0', pointerEvents: 'none' })

			page.reset(y)

			if (!fixed) pinned.style.top = `${page.y - from}px`
		},

		/** The same scroller on a box that scrolls on its own (a panel), stepped on this clock. Call its destroy() when the box goes. */
		scope: (box: HTMLElement): Scroller => createScroller(box, context),

		/** Stop the clock and the listeners, and put back the scroll restoration and scrollbar gutter it found. */
		destroy() {
			stopClock()
			page.destroy()
			history.scrollRestoration = before.restoration
			root.style.scrollbarGutter = before.gutter
			live--
		},

		/** Where the page is drawn, px. */
		get y() { return page.y },
		/** Where the wheel has sent it, px. */
		get target() { return page.target },
		/** px per 60fps frame, signed, whatever the display's refresh rate. Multiply by the tick's ratio for px this frame. */
		get velocity() { return page.velocity },
		/** 1 down, −1 up — the last way it moved. */
		get direction() { return page.direction },
		/** The scrollable length, px. */
		get max() { return page.max },
		/** 0..1. A page too short to scroll reads 0. */
		get progress() { return page.progress },
		/** Nothing moving and nothing owed. */
		get still() { return page.still },
		/** The names currently locking it. */
		get locks() { return page.locks },
	}
}

export type Smooth = ReturnType<typeof smooth>
