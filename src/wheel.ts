/*
 * Reading the wheel, shared by both modes: a wheel event as signed pixels,
 * whether it was a notch, how a held notch is fed out, and whether a box
 * under the pointer should keep the gesture for itself.
 *
 * A trackpad sends a dense stream; a mouse wheel sends lone steps of a
 * hundred pixels or so. A step dropped into the target whole starts the page
 * at full speed and decays from there — a kick per notch. So a notch is told
 * apart here and spooled: held, and fed out over the following frames by
 * drainSpool(), which ramps the page into it and lets consecutive clicks
 * overlap into one movement. A notch is a lone event, big, and well clear of
 * any stream: a trackpad's momentum thins out into lone events at its tail,
 * and NOTCH_AFTER_STREAM_MS keeps those out.
 */

/** px per line, for deltaMode 1 (Firefox's mouse wheel). */
const LINE_PX = 16

/** A lone event smaller than this is a trackpad's tail, not a notch. */
const NOTCH_MIN_PX = 40

/** Wheel events closer together than this are one stream. */
const STREAM_GAP_MS = 30

/** After a stream, how long before a lone event can count as a notch again. */
const NOTCH_AFTER_STREAM_MS = 500

/** Share of a spool spent per 60fps frame. */
const SPOOL_DRAIN = 0.22

/** Longest frame a spool drains over, in 60fps frames: the first frame back from a hidden tab must not spend it all at once. */
const SPOOL_MAX_RATIO = 4

/** A wheel event in px (positive: down / right), and whether it was a notch. */
export type WheelDelta = { x: number, y: number, notch: boolean }

/**
 * Make a reader for one stream of wheel events. It keeps the timing it needs
 * to tell a notch from a trackpad, so call it for EVERY wheel event — even
 * ones that are then ignored — or the timing goes stale.
 */
export const wheelReader = () => {
	let lastAt = -Infinity
	let streamAt = -Infinity

	return (e: WheelEvent): WheelDelta => {
		const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? innerHeight : 1

		let x = e.deltaX * scale
		let y = e.deltaY * scale

		/* shift turns a vertical wheel sideways, as the browser does */
		if (e.shiftKey && !x) [x, y] = [y, 0]

		const gap = e.timeStamp - lastAt

		lastAt = e.timeStamp
		if (gap < STREAM_GAP_MS) streamAt = lastAt

		const notch = Math.max(Math.abs(x), Math.abs(y)) >= NOTCH_MIN_PX
			&& gap >= STREAM_GAP_MS
			&& lastAt - streamAt >= NOTCH_AFTER_STREAM_MS

		return { x, y, notch }
	}
}

/** How much of `spool` (px) to spend this frame. The last sliver goes whole, so a spool always empties. */
export const drainSpool = (spool: number, ratio: number) =>
	Math.abs(spool) < 0.05 ? spool : spool * (1 - (1 - SPOOL_DRAIN) ** Math.min(ratio, SPOOL_MAX_RATIO))

/** Does `n` scroll natively on y: overflow auto or scroll, with something to scroll. */
export const scrollsNatively = (n: Element) => {
	if (n.scrollHeight <= n.clientHeight + 1) return false

	const overflow = getComputedStyle(n).overflowY

	return overflow === 'auto' || overflow === 'scroll'
}

/** Can `n` scroll natively any further in the direction of `dy` (px, positive down). */
export const canScrollFurther = (n: Element, dy: number) =>
	scrollsNatively(n) && (dy < 0 ? n.scrollTop > 0 : n.scrollTop < n.scrollHeight - n.clientHeight - 1)
