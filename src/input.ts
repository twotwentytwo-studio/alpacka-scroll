import type { Context } from './core.js'
import { canScrollFurther, drainSpool, scrollsNatively, wheelReader } from './wheel.js'

/*
 * The virtual mode's input: wheel, finger, keys and push() turned into signed
 * deltas, positive y scrolling down, each sent with the event it came from.
 *
 * The wheel is summed through the frame and spent once, just before the
 * columns step (flush), so a trackpad's several hundred events a second cost
 * the columns one call a frame. A notch is spooled and fed out over frames
 * (see wheel.ts). A finger, a key and a push go out as they arrive.
 *
 * A finger is vertical only: a sideways swipe belongs to whatever claims it
 * (a drag, a pager). It follows ONE finger by identifier, so a second landing
 * or the first lifting never reads as a jump, and when the last finger lifts
 * its final move is thrown once, which each column's ease spends as the
 * glide. A cancelled touch throws nothing.
 *
 * A box that scrolls natively keeps its own gesture, as the browser latches
 * it: the wheel from the moment a gesture starts over a box that can still go
 * its way until the gesture ends, the finger for a whole touch that starts in
 * one. A sideways wheel that something claims (`across`) is cancelled, so a
 * trackpad's swipe never turns into the browser's back gesture.
 */

/** Every wheel delta is scaled by this. */
const WHEEL_GAIN = 1.25

/** A notch is scaled by this on top of WHEEL_GAIN: a click is a short step against a strip of full-bleed media. */
const NOTCH_GAIN = 2

/** A finger's move is scaled by this. */
const TOUCH_GAIN = 3.25

/** The last finger's final move, scaled by this, is thrown once when it lifts. */
const THROW_GAIN = 35

/** The largest one finger move is read as, so a stutter is not a fling. */
const MAX_TOUCH_MOVE_PX = 240

const ARROW_PX = 100

/** Page keys and space go this share of the viewport — the browser's own overlap. */
const PAGE_SHARE = 0.9

/** Wheel events closer together than this belong to one gesture, which stays latched to the box it started over. */
const LATCH_MS = 150

const TYPING = /^(input|textarea|select|audio|video)$/i
const PRESSABLE = /^(button|summary)$/i

/** Does the key belong to the focused element (typing in a field, space on a button) rather than to scrolling. */
export const claimed = (e: KeyboardEvent) => {
	const el = e.target

	if (!(el instanceof HTMLElement)) return false
	if (el.isContentEditable || TYPING.test(el.tagName)) return true

	return e.key === ' ' && PRESSABLE.test(el.tagName)
}

/**
 * @param locks the virtual mode's named locks
 * @param across claims on sideways wheels (see virtual().across)
 * @param send receives every delta (px) with its event
 */
export const createInput = (
	context: Context,
	locks: Set<string>,
	across: Set<() => boolean>,
	send: (x: number, y: number, e: Event | null) => void,
) => {
	const root = document.documentElement
	const readWheel = wheelReader()

	/* the wheel, summed this frame */
	let pendingX = 0
	let pendingY = 0
	let pendingEvent: Event | null = null

	/* notches still to feed out */
	let spoolX = 0
	let spoolY = 0

	/* the one finger followed */
	let fingerId: number | null = null
	let fingerY = 0
	let fingerMove = 0
	let touchIsOurs = true

	/* the box the current wheel gesture belongs to, if any */
	let latched: Element | null = null
	let latchedAt = -Infinity

	const isHeld = () => locks.size > 0 || context.holds.size > 0

	const sendNow = (dx: number, dy: number, e: Event | null) => {
		if (!isHeld()) send(dx, dy, e)
	}

	const dropAll = () => {
		pendingX = pendingY = spoolX = spoolY = fingerMove = 0
		pendingEvent = null
	}

	const onWheel = (e: WheelEvent) => {
		if (e.ctrlKey) return

		/* read even when ignored, so the notch timing stays true across a lock */
		const d = readWheel(e)

		if (e.timeStamp - latchedAt > LATCH_MS) {
			latched = null

			for (const n of e.composedPath()) {
				if (n === root) break
				if (n instanceof Element && canScrollFurther(n, d.y)) {
					latched = n
					break
				}
			}
		}

		latchedAt = e.timeStamp

		if (latched || isHeld()) return

		if (e.cancelable && Math.abs(d.x) > Math.abs(d.y) && [...across].some((claims) => claims())) e.preventDefault()

		pendingEvent = e

		if (d.notch) {
			spoolX += d.x * WHEEL_GAIN * NOTCH_GAIN
			spoolY += d.y * WHEEL_GAIN * NOTCH_GAIN
		} else {
			pendingX += d.x * WHEEL_GAIN
			pendingY += d.y * WHEEL_GAIN
		}
	}

	const findFinger = (list: TouchList) => {
		for (const t of list) if (t.identifier === fingerId) return t

		return null
	}

	const follow = (t: Touch) => {
		fingerId = t.identifier
		fingerY = t.clientY
		fingerMove = 0
	}

	const onTouchStart = (e: TouchEvent) => {
		if (e.touches.length === 1) touchIsOurs = !e.composedPath().some((n) => n instanceof Element && scrollsNatively(n))

		const t = (fingerId !== null && findFinger(e.touches)) || e.touches[0]

		if (t) follow(t)
	}

	const onTouchMove = (e: TouchEvent) => {
		const t = findFinger(e.touches)

		if (!t) {
			const other = e.touches[0]

			if (other) follow(other)
			return
		}

		fingerMove = Math.max(-MAX_TOUCH_MOVE_PX, Math.min(MAX_TOUCH_MOVE_PX, fingerY - t.clientY))
		fingerY = t.clientY

		if (touchIsOurs) sendNow(0, fingerMove * TOUCH_GAIN, e)
	}

	/* a finger still down takes over where it stands; the last one up throws */
	const onTouchEnd = (e: TouchEvent) => {
		if (findFinger(e.touches)) return

		const other = e.touches[0]

		if (other) return follow(other)

		if (touchIsOurs && fingerMove) sendNow(0, fingerMove * THROW_GAIN, e)

		fingerMove = 0
		fingerId = null
	}

	const onTouchCancel = () => {
		fingerMove = 0
		fingerId = null
	}

	const onKey = (e: KeyboardEvent) => {
		if (e.metaKey || e.ctrlKey || e.altKey || (e.shiftKey && e.key !== ' ') || claimed(e)) return

		const page = root.clientHeight * PAGE_SHARE
		const delta = ({
			ArrowDown: [0, ARROW_PX],
			ArrowUp: [0, -ARROW_PX],
			ArrowRight: [ARROW_PX, 0],
			ArrowLeft: [-ARROW_PX, 0],
			PageDown: [0, page],
			PageUp: [0, -page],
			' ': [0, e.shiftKey ? -page : page],
		} as Record<string, [number, number]>)[e.key]

		if (!delta) return

		e.preventDefault()
		sendNow(delta[0], delta[1], e)
	}

	/* before the columns step, every frame. Held, nothing moves and nothing
	   banks: a wheel rolled behind a loader is dropped, never saved up */
	const flush = (ratio: number) => {
		if (isHeld()) return dropAll()

		if (spoolX || spoolY) {
			const spendX = drainSpool(spoolX, ratio)
			const spendY = drainSpool(spoolY, ratio)

			spoolX -= spendX
			spoolY -= spendY
			pendingX += spendX
			pendingY += spendY
		}

		if (!pendingX && !pendingY) return

		send(pendingX, pendingY, pendingEvent)
		pendingX = pendingY = 0
		pendingEvent = null
	}

	const passive = { passive: true }

	addEventListener('wheel', onWheel, { passive: false })
	addEventListener('touchstart', onTouchStart, passive)
	addEventListener('touchmove', onTouchMove, passive)
	addEventListener('touchend', onTouchEnd, passive)
	addEventListener('touchcancel', onTouchCancel, passive)
	addEventListener('keydown', onKey)

	return {
		flush,

		/** Another input device — a mouse drag — into the same deltas (px, positive down / right). */
		push: (dy: number, dx = 0, e: Event | null = null) => sendNow(dx, dy, e),

		destroy() {
			removeEventListener('wheel', onWheel)
			removeEventListener('touchstart', onTouchStart)
			removeEventListener('touchmove', onTouchMove)
			removeEventListener('touchend', onTouchEnd)
			removeEventListener('touchcancel', onTouchCancel)
			removeEventListener('keydown', onKey)
		},
	}
}
