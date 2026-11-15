import type { Context, Stepper } from './core.js'
import { canScrollFurther, drainSpool, wheelReader } from './wheel.js'

/*
 * One native scroller — the window, or a box that scrolls on its own. The
 * browser keeps the scroll; this only eases the wheel into it.
 *
 * Two numbers: `current`, where the page is, and `target`, where it is going.
 * The wheel moves `target` (a notch through the spool, so it ramps), each
 * frame `current` eases toward it and is written, and nothing is written once
 * the two meet.
 *
 * Everything that is not the wheel stays the browser's. Touch is never
 * listened to. Keys, the scrollbar, find-in-page, focus, anchors and scroll
 * anchoring all scroll natively, and are told from this scroller's own writes
 * by VALUE: a position that is not the one last written was somebody else,
 * and `current` and `target` follow it at once — mid-ease too, so a key
 * pressed while the page glides takes over rather than being written over.
 *
 * A box under the pointer that can still scroll the wheel's way is left to
 * scroll natively, and one at its end hands the wheel on, as the browser
 * chains it. No markers. A lock is `overflow: hidden` on the root, so a
 * panel over a locked page scrolls with nothing said either.
 *
 * Under a lock the root's wheel is swallowed, not let through. The browser
 * dispatches the rest of a gesture uncancelable when its first wheel is not
 * cancelled, so a trackpad gesture let through under a lock, and still
 * running when the lock lifts, would scroll the page natively to its end.
 */

/** An easing curve over 0..1. */
export type Ease = (p: number) => number

/** Where to() goes: a position in px, a selector, or an element (its top). */
export type ScrollTarget = number | string | Element

export type ToOptions = {
	/** Seconds. Default 1. 0 lands at once. */
	duration?: number
	/** Default expo in-out. */
	ease?: Ease
	/** Land at once. Default false; always true under prefers-reduced-motion. */
	immediate?: boolean
}

export type Scroller = ReturnType<typeof createScroller>

/** Expo in-out, exact at both ends. */
export const expo: Ease = (p) =>
	p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (10 - 20 * p)) / 2

/** A difference smaller than this (px) is landed. */
const SETTLE_PX = 0.5

/** Every wheel delta is scaled by this. 1 is Lenis's default `wheelMultiplier`. */
const WHEEL_GAIN = 1

/** A native position this close (px) to the last write is our own write coming back. */
const OWN_WRITE_PX = 1

/**
 * @param element the box that scrolls, or null for the window
 * @param onMove called with the position and direction whenever it changes
 */
export const createScroller = (element: HTMLElement | null, context: Context, onMove?: (y: number, direction: number) => void) => {
	const root = element ?? document.documentElement
	const events: EventTarget = element ?? window
	const readWheel = wheelReader()
	const locks = new Set<string>()

	const readNative = () => (element ? element.scrollTop : scrollY)

	let current = readNative()
	let target = current
	let previous = current
	let written = current
	let velocity = 0
	let direction = 0
	let max = 0
	let spool = 0
	let tween: { from: number, to: number, duration: number, ease: Ease, start: number, done: () => void } | null = null

	const clamp = (n: number) => Math.min(max, Math.max(0, n))

	/* 'instant', so a `scroll-behavior: smooth` in the CSS cannot animate it */
	const write = (n: number) => {
		written = n

		const options: ScrollToOptions = { top: n, behavior: 'instant' }

		if (element) element.scrollTo(options)
		else window.scrollTo(options)
	}

	/* a running to() resolves when anything takes over — never left hanging */
	const endTween = () => {
		tween?.done()
		tween = null
	}

	/* `previous` moves with it: a jump is not a speed, and must not read as one */
	const jump = (n: number) => {
		endTween()
		spool = 0
		current = target = previous = clamp(n)
		write(current)
		onMove?.(current, direction)
	}

	const resize = () => {
		max = Math.max(0, root.scrollHeight - root.clientHeight)
		target = clamp(target)
	}

	const reset = (n = 0) => {
		resize()
		jump(n)
	}

	const positionOf = (where: ScrollTarget) => {
		if (typeof where === 'number') return where

		const el = typeof where === 'string' ? document.querySelector(where) : where

		if (!el) return current

		return el.getBoundingClientRect().top - (element?.getBoundingClientRect().top ?? 0) + readNative()
	}

	/* goes through locks: a lock holds the visitor's input, not the code's */
	const to = (where: ScrollTarget, { duration = 1, ease = expo, immediate }: ToOptions = {}) =>
		new Promise<void>((done) => {
			const end = clamp(positionOf(where))

			if (immediate || context.reducedMotion || !duration) {
				jump(end)
				return done()
			}

			endTween()
			spool = 0
			tween = { from: current, to: end, duration, ease, start: -1, done }
		})

	const lock = (name: string) => {
		if (!locks.size) {
			endTween()
			spool = 0
			target = current
			root.style.overflow = 'hidden'
		}

		locks.add(name)
	}

	const unlock = (name: string) => {
		if (locks.delete(name) && !locks.size) root.style.overflow = ''
	}

	const onWheel = (e: WheelEvent) => {
		if (e.ctrlKey || e.defaultPrevented) return

		const d = readWheel(e)

		if (context.holds.size) return e.preventDefault()
		if (context.reducedMotion || Math.abs(d.x) > Math.abs(d.y)) return

		for (const n of e.composedPath()) {
			if (n === root) break
			if (n instanceof Element && canScrollFurther(n, d.y)) return
		}

		/* locked: cancelled, so a gesture still running when the lock lifts stays this scroller's */
		if (locks.size) return e.preventDefault()

		/* at the end it is heading for: the browser's, to chain or to bounce */
		if (!spool && !tween && (d.y > 0 ? current >= max - SETTLE_PX : current <= SETTLE_PX)) return

		e.preventDefault()
		endTween()

		if (d.notch) spool += d.y * WHEEL_GAIN
		else target = clamp(target + d.y * WHEEL_GAIN)
	}

	const onNativeScroll = () => {
		const native = readNative()

		if (Math.abs(native - written) < OWN_WRITE_PX) return

		endTween()
		spool = 0
		current = target = written = native
	}

	const raf = (time: number, ratio: number) => {
		if (tween) {
			if (tween.start < 0) tween.start = time

			const progress = Math.min(1, (time - tween.start) / tween.duration)

			current = target = tween.from + (tween.to - tween.from) * tween.ease(progress)
			if (progress === 1) endTween()
		} else {
			if (spool) {
				const spend = drainSpool(spool, ratio)

				spool -= spend
				target = clamp(target + spend)
				if (target === (spend > 0 ? max : 0)) spool = 0
			}

			if (target !== current) {
				current += (target - current) * (1 - (1 - context.ease) ** ratio)
				if (Math.abs(target - current) < SETTLE_PX) current = target
			}
		}

		if (current !== written) write(current)

		velocity = ratio ? (current - previous) / ratio : 0

		if (current !== previous) {
			direction = Math.sign(current - previous)
			onMove?.(current, direction)
		}

		previous = current
	}

	const observer = new ResizeObserver(() => resize())
	const content = element ? element.firstElementChild : document.body

	observer.observe(root)
	if (content) observer.observe(content)

	events.addEventListener('wheel', onWheel as EventListener, { passive: false })
	events.addEventListener('scroll', onNativeScroll, { passive: true })
	if (!element) addEventListener('resize', resize)

	resize()

	/* what the clock calls: kept off the scroller, which is the site's */
	const stepper: Stepper = { raf }

	const scroller = {
		/** Scroll to a position, selector or element. Resolves on landing, and also when anything interrupts it. Works through locks. */
		to,

		/** Re-measure, then jump to `y` (px, default 0) with no travel and no velocity. Works through locks. */
		reset,

		/** Re-measure the scrollable length. Automatic on resize and on content changes; call it after anything else that changes the length. */
		resize,

		/** Hold the visitor's input under a name (the root goes `overflow: hidden`); it moves again when every name is unlocked. */
		lock,

		unlock,

		destroy() {
			endTween()
			observer.disconnect()
			events.removeEventListener('wheel', onWheel as EventListener)
			events.removeEventListener('scroll', onNativeScroll)
			if (!element) removeEventListener('resize', resize)
			root.style.overflow = ''
			context.steppers.delete(stepper)
		},

		/** Where the page is drawn, px. */
		get y() { return current },
		/** Where the wheel has sent it, px. */
		get target() { return target },
		/** px per 60fps frame, signed, whatever the display's refresh rate. Multiply by the tick's ratio for px this frame. */
		get velocity() { return velocity },
		/** 1 down, −1 up — the last way it moved. */
		get direction() { return direction },
		/** The scrollable length, px. */
		get max() { return max },
		/** 0..1. A page too short to scroll reads 0. */
		get progress() { return max ? current / max : 0 },
		/** Nothing moving and nothing owed. */
		get still() { return !tween && !spool && target === current && !velocity },
		/** The names currently locking it. */
		get locks() { return [...locks] },
	}

	context.steppers.add(stepper)

	return scroller
}
