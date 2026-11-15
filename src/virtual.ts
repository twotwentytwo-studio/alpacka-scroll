import { createBus, createContext, createHold, startClock } from './core.js'
import { createColumn, type Column, type ColumnOptions } from './column.js'
import { claimed, createInput } from './input.js'

/*
 * Nothing scrolls natively. `<html>` and `<body>` are fixed, hidden and
 * `touch-action: none` — the last is the claim on the gesture, without which
 * Safari still runs its own reading of the same finger (the toolbar, the
 * bounce) beside ours. Every page is a viewport-sized stage, and what moves
 * on it is a column: scroll.column({ el, … }).
 *
 * Each frame the wheel's deltas go out once, the columns step, and 'tick'
 * fires after them, so the GL layer renders on positions already moved. A
 * finger, a key and a push go out as they arrive. Every delta reaches the
 * columns first and then 'input', with the event it came from, for anything
 * else that reads the gesture.
 *
 * Locks are named, as in the smooth mode: a loader, a drag that is navigating
 * rather than scrolling, a panel. While anything holds the input, nothing
 * moves and nothing banks.
 */

/** time in seconds; ratio is the frame's length in 60fps frames (0 on the first). */
export type VirtualTick = { time: number, ratio: number }

/** A delta in px, positive scrolling down / right, and the event it came from — null for a push without one. */
export type Input = { x: number, y: number, e: Event | null }

export type VirtualOptions = {
	/**
	 * Move every column without easing. Under reduced motion a column lands on
	 * its target each frame, so its `gap` — the momentum a deformation reads —
	 * is always 0, and a finger's throw lands in one frame. false keeps the
	 * easing for every visitor, for a site that answers reduced motion itself;
	 * true drops it for every visitor. Default: the visitor's
	 * prefers-reduced-motion, read once at start.
	 */
	reducedMotion?: boolean
}

const FIXED_DOCUMENT = { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' }

export const virtual = ({ reducedMotion }: VirtualOptions = {}) => {
	const context = createContext({ reducedMotion })
	const locks = new Set<string>()
	const across = new Set<() => boolean>()
	const events = createBus<{ tick: VirtualTick, input: Input }>()
	const root = document.documentElement
	const savedStyles = [root.style.cssText, document.body.style.cssText]

	const input = createInput(context, locks, across, (x, y, e) => {
		context.steppers.forEach((s) => s.input?.(x, y, e))
		events.emit('input', { x, y, e })
	})

	Object.assign(root.style, FIXED_DOCUMENT)
	Object.assign(document.body.style, FIXED_DOCUMENT)

	const stopClock = startClock((time, ratio) => {
		input.flush(ratio)
		context.steppers.forEach((s) => s.raf(time, ratio))
		events.emit('tick', { time, ratio })
	})

	return {
		/** 'tick' after the columns step each frame; 'input' after the columns take each delta. Returns the off. */
		on: events.on,

		/** Another input device — a mouse drag — into the same deltas, locks and columns. (dy, dx) in px, positive down / right. */
		push: input.push,

		/** Swallow input without a named lock, until the returned release is called. */
		hold: createHold(context),

		/** Hold the input under a name; it moves again when every name is unlocked. A held wheel is dropped, not saved. */
		lock(name: string) {
			locks.add(name)
		},

		unlock(name: string) {
			locks.delete(name)
		},

		/** The names currently locking it. */
		get locks() { return [...locks] },

		/** Cancel a sideways wheel while `claims()` says yes, so a trackpad swipe never becomes the browser's back gesture. Returns the off. */
		across(claims: () => boolean) {
			across.add(claims)

			return () => {
				across.delete(claims)
			}
		},

		/** Does a key belong to the focused element (typing in a field, space on a button) rather than to scrolling. */
		claimed,

		/** A column (or strip) of `el`'s children, moved by the input; see ColumnOptions. Call its destroy() when the element goes. */
		column: (options: ColumnOptions): Column => createColumn(options, context),

		destroy() {
			stopClock()
			input.destroy()
			root.style.cssText = savedStyles[0]!
			document.body.style.cssText = savedStyles[1]!
		},
	}
}

export type Virtual = ReturnType<typeof virtual>
