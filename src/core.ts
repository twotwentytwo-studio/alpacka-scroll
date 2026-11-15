/*
 * What both modes share: the context every scroller and column is stepped
 * from, the clock, the event bus, and hold().
 */

/** Anything the clock steps each frame. `input` is how the virtual mode hands it a delta. */
export type Stepper = {
	raf: (time: number, ratio: number) => void
	input?: (x: number, y: number, e: Event | null) => void
}

export type Context = {
	/** The smooth mode's wheel ease: share of the remaining distance per 60fps frame. */
	ease: number
	/** Whether motion is reduced: prefers-reduced-motion read once at start, unless the mode was told otherwise. */
	reducedMotion: boolean
	/** Live hold() tokens; while any exist, input is swallowed. */
	holds: Set<object>
	/** Everything the clock steps, in the order it was created. */
	steppers: Set<Stepper>
}

export const createContext = ({ ease = 0.1, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}): Context => ({
	ease,
	reducedMotion,
	holds: new Set(),
	steppers: new Set(),
})

/**
 * The page's one requestAnimationFrame. `step` gets the time in seconds and
 * `ratio`, the frame's length in 60fps frames (0 on the very first), so a
 * lerp scaled by it keeps its feel at any refresh rate. Returns the stop.
 */
export const startClock = (step: (time: number, ratio: number) => void) => {
	let previous = 0
	let id = 0

	const frame = (ms: number) => {
		id = requestAnimationFrame(frame)

		const ratio = previous ? (ms - previous) / (1000 / 60) : 0

		previous = ms
		step(ms / 1000, ratio)
	}

	id = requestAnimationFrame(frame)

	return () => cancelAnimationFrame(id)
}

/** A typed event bus: on() returns the off. */
export const createBus = <Events>() => {
	const listeners = new Map<keyof Events, Set<(e: never) => void>>()

	return {
		on<K extends keyof Events>(name: K, listener: (e: Events[K]) => void) {
			const set = listeners.get(name) ?? listeners.set(name, new Set()).get(name)!

			set.add(listener)

			return () => {
				set.delete(listener)
			}
		},

		emit<K extends keyof Events>(name: K, e: Events[K]) {
			listeners.get(name)?.forEach((listener) => (listener as (e: Events[K]) => void)(e))
		},
	}
}

/** Build hold(): swallow input without a named lock, until the returned release is called. */
export const createHold = (context: Context) => () => {
	const token = {}

	context.holds.add(token)

	return () => {
		context.holds.delete(token)
	}
}
