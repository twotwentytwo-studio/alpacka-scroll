import type { Context } from './core.js'

/*
 * A column — or, with `x`, a strip — moved by the virtual mode's deltas.
 *
 * Two numbers: `target`, which the deltas move and the walls clamp, and
 * `current`, which eases toward it and is what gets drawn. Clamping the TARGET
 * is why overscroll banks nothing. Their gap is the momentum: honest, and zero
 * the moment they meet.
 *
 * Every child is placed on its own, by transform. With `loop` each wraps
 * around the content's span at its own moment, so there is no cloned content:
 * every slot is a live GL plane, and a clone would be a second plane and a
 * second texture. Without `loop` the same children stop at the content's
 * ends. With `whole` the element itself moves in one transform instead,
 * between ends — the clamped column, which leaves its children's transforms
 * to whoever animates them.
 *
 * Two expandos go out for the GL mirror, and only this can publish them,
 * because this is the one place that knows the wrap:
 *
 *   _vrect  the child's on-screen rect, DERIVED — its natural layout plus the
 *           offset — so the mirror never reads the DOM straight after these
 *           transforms are written. The transform still goes on, for hit
 *           testing — unless `transforms` is off, for a page where the
 *           mirror is all there is to see and nothing is hit in the DOM.
 *   _parked a child past the overscan gets one last transform at its resting
 *           place, and the flag goes up a frame LATER: the GL tick runs
 *           before the columns, and needs one pass to take the resting rect.
 *
 * The span is the element's own scroll size plus its gap, so its padding
 * repeats on every cycle as authored; the far end includes the padding no
 * child's rect can see.
 *
 * A re-measure keeps whatever sits on the reading line — the box's middle,
 * or `line` — where it was, as a share of its own pitch, laps and momentum
 * included. Pictures decoding, a font swapping in, a box settling late: the
 * reader stays on the same thing. Between ends a wall wins over the reader: a
 * column resting at its top or its far end, or coasting into one, is still
 * there afterwards, with its momentum. A seat that lands past an end is
 * clamped like any other position; only a value that has just come out of a
 * loop can be laps away, and only that one is brought back into the first lap.
 *
 * With `grab`, a press on the box catches a coasting column where it stands,
 * and on touch keeps what it was still owed for a moment: a second flick the
 * same way picks the momentum back up, as a native list does.
 *
 * Nothing scrolls natively, but the browser still tries: focus,
 * scrollIntoView() and find-in-page scroll an `overflow: hidden` box to show
 * what they want, and the DOM then stands somewhere `current` and every
 * `_vrect` know nothing of. Such a scroll on a box around the column is put
 * back at once. Focus is the one of them the column answers itself: an
 * element the keyboard focuses is brought into the box by moving the target,
 * from where its child truly stands rather than where a parked child's last
 * transform left it. That also reaches a child before the leading edge, where
 * no native scroll can go. In a loop it goes by the nearest lap.
 */

export type ColumnOptions = {
	/** The element whose children move (or, with `whole`, that moves itself). */
	el: HTMLElement
	/** What "on screen" means for overscan, centring and the walls. Default: the viewport. */
	box?: HTMLElement | null
	/** A horizontal strip. A vertical wheel drives it too (it reads dy + dx). Default false. */
	x?: boolean
	/** Wrap the children endlessly. false: they stop at the content's ends. Default true. */
	loop?: boolean
	/** Move `el` itself in one transform, between ends, and never touch its children. Ignores `loop` and `lead`. Default false. */
	whole?: boolean
	/** An element outside `el` that moves with the children, first in the cycle. Default null. */
	lead?: HTMLElement | null
	/** The reading line a re-measure holds, as a viewport px. Default: the box's middle. */
	line?: (() => number) | null
	/** Share of the remaining distance eased per 60fps frame. Default 0.1. */
	ease?: number
	/** Soft ceiling on target − current, in box sizes (tanh). 0 is none. Default 0. */
	reach?: number
	/** How far past the box a child stays live (not parked), in box sizes. Default 0.5. */
	overscan?: number
	/** Px past the box's leading edge a child travels before it wraps, from the box's size. Default none. */
	bleed?: ((box: { width: number, height: number }) => number) | null
	/** A press on the box catches the column where it stands; see `caught`. Read once, at creation. Default false. */
	grab?: boolean
	/** Off: frozen — no input, no easing, no measuring. Turned back on, resumes where it stands. Default true. */
	enabled?: boolean
	/** Off: input passes it by, but it still eases, and add() / to() still move it. Default true. */
	listen?: boolean
	/**
	 * Off: nothing is written to the DOM. Each child still gets its `_vrect`
	 * and `_parked`, so a GL mirror that reads those draws the column exactly
	 * as before, and the elements themselves stay where the layout put them.
	 * For a page drawn wholly in GL, where a child's transform moves nothing
	 * anyone sees and its hit box is not used. With `whole` there is no
	 * `_vrect` to read: the caller places the element from `y`. Default true.
	 */
	transforms?: boolean
}

/** What destroy() leaves behind. */
export type DestroyOptions = {
	/**
	 * Leave every child's transform, `_vrect` and `_parked` (with `whole`, the
	 * element's transform) as the last frame drew them, instead of clearing
	 * them. For a column whose element is going anyway but stays on screen a
	 * while first — a page leaving under a transition, which Vue unmounts at
	 * the START of its leave: cleared, the leaving page would snap back to
	 * scroll 0 for the length of the transition. Default false.
	 */
	keep?: boolean
}

type Rect = { left: number, top: number, width: number, height: number, right: number, bottom: number }
type Child = HTMLElement & { _vrect?: Rect | null, _parked?: boolean }

/* a child's natural place: `from` and `to` are the range of positions over
   which it is on screen, `out` whether it went past the overscan last pass */
type Slot = { el: Child, from: number, to: number, out: boolean, rect: DOMRect }

/* what sits on the reading line: which child, how far through its pitch,
   how many laps round, and the momentum, in pitches */
type Mark = { el: Child, through: number, laps: number, owed: number }

/* ms a caught flick's momentum waits for the next one, and the least gap
   (px) that counts as coasting */
const BANK_MS = 350
const COAST_PX = 2

/* an overflow that scrolls on purpose */
const SCROLLS = new Set(['auto', 'scroll'])

/* options that change nothing a measure would */
const QUIET = new Set(['listen', 'ease', 'reach'])

const wrap = (min: number, max: number, v: number) => {
	const range = max - min

	return min + ((((v - min) % range) + range) % range)
}

/* `styled`: this column wrote the transform that is on it. One it did not
   write is not its to take off (see `transforms`) */
const clear = (n: Child, styled: boolean) => {
	if (styled) n.style.transform = ''
	n._vrect = null
	n._parked = false
}

export type Column = ReturnType<typeof createColumn>

export const createColumn = (initial: ColumnOptions, context: Context) => {
	const options = {
		box: null, x: false, loop: true, whole: false, lead: null, line: null, ease: 0.1,
		reach: 0, overscan: 0.5, bleed: null, grab: false, enabled: true, listen: true, transforms: true, ...initial,
	}

	const root = document.documentElement

	let target = 0
	let current = 0
	let lastDrawn = NaN
	let span = 0
	let max = 0
	let boxStart = 0
	let boxSize = 0

	/* the element's own start as laid out, with nothing of this column's on it */
	let elStart = 0
	let linePx = 0
	let bleedPx = 0
	let parkingPending = false
	let slots: Slot[] = []
	let transformed: Child[] = []

	/* whether any transform now on the DOM is this column's: false for as
	   long as `transforms` is off, and true until the next measure after it
	   is turned off, which takes them back off */
	let written = false
	let bank: { owed: number, at: number } | null = null
	let caught = false

	/* what the keyboard has just focused in this column, until the next frame brings it into the box */
	let focused: Element | null = null

	/* whether the column had ends at its last measure, null before the first:
	   only a column that has just switched from loop to ends can hold values
	   laps away */
	let hadEnds: boolean | null = null

	const hasEnds = () => options.whole || !options.loop
	const clamp = (n: number) => Math.min(max, Math.max(0, n))
	const startOf = (r: { left: number, top: number }) => (options.x ? r.left : r.top)
	const sizeOf = (r: { width: number, height: number }) => (options.x ? r.width : r.height)
	const translate = (p: number) => (options.x ? `translate3d(${-p}px, 0px, 0px)` : `translate3d(0px, ${-p}px, 0px)`)
	const starts = () => slots.map((s) => startOf(s.rect) - boxStart)

	/* how far a child is moved from its natural place: each on its own lap in a loop */
	const offsetOf = (s: Slot) => (options.loop ? wrap(s.to + bleedPx - span, s.to + bleedPx, current) : current)

	/* from one child's start to the next's, the last one's to the first's a lap on */
	const pitch = (p: number[], i: number) => Math.max(1, (i + 1 < p.length ? p[i + 1]! : p[0]! + span) - p[i]!)

	const mark = (): Mark | null => {
		if (!slots.length || span <= 0) return null

		const p = starts()
		const u = current + linePx
		const u0 = hasEnds() ? u : wrap(p[0]!, p[0]! + span, u)

		let i = 0

		while (i + 1 < p.length && p[i + 1]! <= u0) i++

		const h = pitch(p, i)

		return { el: slots[i]!.el, through: (u0 - p[i]!) / h, laps: (u - u0) / span, owed: (target - current) / h }
	}

	const seat = (m: Mark) => {
		const i = slots.findIndex((s) => s.el === m.el)

		if (i < 0) return

		const p = starts()
		const h = pitch(p, i)

		current = p[i]! + m.through * h + m.laps * span - linePx
		target = current + m.owed * h
	}

	const apply = (all = false) => {
		if (options.whole) {
			if (options.transforms) {
				options.el.style.transform = translate(current)
				written = true
			}

			return
		}

		const pad = boxSize * options.overscan

		/* a forced pass (measure, to(v, true), center) lays every child out
		   live, unparking whatever is past the overscan, and leaves current
		   where it drew it — so raf would never pass again until the column
		   moved, and nothing would park. One ordinary pass follows every
		   forced one instead: it gives each child past the overscan its
		   resting transform, and the pass after raises _parked — the same two
		   frames a child gets when the column moves it out. */
		parkingPending = all

		for (const s of slots) {
			const p = offsetOf(s)

			if (all || (p > s.from - pad && p < s.to + pad)) {
				s.out = false
				s.el._parked = false
			} else if (s.out) {
				s.el._parked = true
				continue
			} else {
				s.out = true
				parkingPending = true
			}

			const v = s.el._vrect ?? (s.el._vrect = {} as Rect)

			v.left = s.rect.left - (options.x ? p : 0)
			v.top = s.rect.top - (options.x ? 0 : p)
			v.width = s.rect.width
			v.height = s.rect.height
			v.right = v.left + v.width
			v.bottom = v.top + v.height

			if (options.transforms) s.el.style.transform = translate(p)
		}

		if (options.transforms) written = true
	}

	const measure = () => {
		if (!options.enabled) return

		/* the walls and the momentum as they stood, before the layout is re-read */
		const fromLoop = hadEnds === false && hasEnds()
		const wall = !hasEnds() || fromLoop ? null : target <= 0 ? 'top' : max > 0 && target >= max ? 'end' : null
		const momentum = target - current
		const was = mark()
		const { el, lead } = options
		const children = [...el.children] as Child[]
		const own = options.whole ? [] : [...(lead ? [lead as Child] : []), ...children]

		/* the last set too: a lead that left the cycle keeps nothing */
		for (const n of new Set([...transformed, ...own])) clear(n, written)

		transformed = own
		if (options.whole && written) el.style.transform = ''

		/* the layout is now read with nothing of this column's on it; the
		   pass at the end of this puts back whatever `transforms` allows */
		written = false

		const box = options.box?.getBoundingClientRect() ?? { left: 0, top: 0, width: root.clientWidth, height: root.clientHeight }
		const elRect = el.getBoundingClientRect()
		const style = getComputedStyle(el)
		const full = options.x ? el.scrollWidth : el.scrollHeight

		boxStart = startOf(box)
		boxSize = sizeOf(box)
		elStart = startOf(elRect)
		linePx = options.line ? options.line() - boxStart : boxSize / 2
		bleedPx = options.bleed ? options.bleed(box) : 0

		slots = (options.whole ? children : own).map((n) => {
			const rect = n.getBoundingClientRect()
			const start = startOf(rect) - boxStart

			return { el: n, from: start - boxSize, to: start + sizeOf(rect), out: true, rect }
		})

		span = full + (parseFloat(options.x ? style.columnGap : style.rowGap) || 0)
		if (lead && !options.whole) span += startOf(elRect) - startOf(lead.getBoundingClientRect())

		max = Math.max(0, startOf(elRect) - boxStart + full - boxSize)

		if (was) seat(was)

		if (fromLoop) {
			/* straight out of the loop, a value laps away comes back into the
			   first lap. Never otherwise: a seat a pixel above the top would
			   wrap to the far end */
			if (target < 0 || target > span) target = wrap(0, span, target)
			if (current < 0 || current > span) current = wrap(0, span, current)
			target = clamp(target)
		} else if (hasEnds()) {
			if (wall) {
				/* resting at a wall, or coasting into one: still there, still coasting */
				target = wall === 'top' ? 0 : max
				current = clamp(target - momentum)
			} else {
				target = clamp(target)
				current = clamp(current)
			}
		}

		hadEnds = hasEnds()
		lastDrawn = current
		apply(true)
	}

	const move = (d: number) => {
		target += d

		if (options.reach) {
			const r = options.reach * boxSize

			target = current + Math.tanh((target - current) / r) * r
		}

		if (hasEnds()) target = clamp(target)
	}

	/* Put back a native scroll on a box that is not meant to scroll. An axis
	   that scrolls on purpose (auto, scroll) is left as it is. */
	const unscroll = (n: Element) => {
		if (!n.scrollTop && !n.scrollLeft) return

		const style = getComputedStyle(n)

		if (n.scrollTop && !SCROLLS.has(style.overflowY)) n.scrollTop = 0
		if (n.scrollLeft && !SCROLLS.has(style.overflowX)) n.scrollLeft = 0
	}

	const onNativeScroll = (e: Event) => {
		const n = e.target === document ? root : e.target

		if (options.enabled && n instanceof Element && n.contains(options.el)) unscroll(n)
	}

	/* :focus-visible is the keyboard's focus, and a script's after it. A
	   click's is not: what was clicked is on screen already, and the browser
	   does not scroll for it either */
	const onFocus = (e: FocusEvent) => {
		const n = e.target

		if (!options.enabled || !(n instanceof Element) || !n.matches(':focus-visible')) return
		if (options.el.contains(n) || (!options.whole && options.lead?.contains(n))) focused = n
	}

	/* Bring a focused element into the box by the shortest move, as the
	   browser's own focus scroll does. Its rect is read off the DOM, then
	   corrected by how far its child (or, with `whole`, the element) is drawn
	   from where it stands: a parked child is drawn where it was parked. */
	const reveal = (n: Element) => {
		if (!n.isConnected) return

		/* first, so the rects below are read with no native scroll on them:
		   the scroll's own event may not have been delivered yet */
		for (let a: Element | null = options.el; a; a = a.parentElement) unscroll(a)

		const slot = options.whole ? null : slots.find((s) => s.el.contains(n))

		if (!options.whole && !slot) return

		const drawn = slot ? startOf(slot.el.getBoundingClientRect()) - startOf(slot.rect) : startOf(options.el.getBoundingClientRect()) - elStart
		const stands = -(slot ? offsetOf(slot) : current)
		const rect = n.getBoundingClientRect()

		const size = sizeOf(rect)

		/* past the leading edge when negative; past the far edge when positive */
		let before = startOf(rect) + stands - drawn - boxStart

		/* in a loop, the lap of it nearest the box */
		if (!hasEnds()) before = wrap(-span / 2, span / 2, before + (size - boxSize) / 2) - (size - boxSize) / 2

		const after = before + size - boxSize
		const d = before < 0 ? (after > 0 ? 0 : before) : after > 0 ? Math.min(before, after) : 0

		/* from `current`, where the rects were read; `reach` does not apply,
		   or a far child would never arrive */
		if (d) target = hasEnds() ? clamp(current + d) : current + d
	}

	/* the virtual input's way in */
	const input = (dx: number, dy: number) => {
		if (!options.enabled || !options.listen) return

		let d = options.x ? dx + dy : dy

		if (d && bank) {
			if (performance.now() - bank.at < BANK_MS && Math.sign(d) === Math.sign(bank.owed)) d += bank.owed
			bank = null
		}

		move(d)
	}

	const startFor = (i: number, line: number | null) => {
		const s = slots[i + (options.lead && !options.whole ? 1 : 0)]

		if (!s) return null

		const start = startOf(s.rect) - boxStart

		return line === null ? start + (sizeOf(s.rect) - boxSize) / 2 : start - line
	}

	const column = {
		/** Called by the clock every frame. Not for site code. */
		raf(_: number, ratio: number) {
			const reveals = focused

			focused = null

			if (!options.enabled || !span) return
			if (reveals) reveal(reveals)

			if (target !== current) {
				current += (target - current) * (context.reducedMotion ? 1 : 1 - (1 - options.ease) ** Math.min(ratio, 2))
				if (Math.abs(target - current) < 0.1) current = target
			}

			/* laps folded away, so the numbers stay small however far it runs */
			if (!hasEnds()) {
				const laps = Math.floor(current / span)

				if (laps) {
					current -= laps * span
					target -= laps * span
				}
			}

			if (current !== lastDrawn || parkingPending) {
				lastDrawn = current
				apply()
			}
		},

		/** Called by the virtual input with each delta. Not for site code — use add() to move it by code. */
		input,

		/** Re-read the layout. Automatic when the element or box resizes; call it after anything else that moves the children. */
		measure,

		/** Move the target by code (a drift, an autoplay). Ignores `listen`, respects `enabled`. */
		add(dx: number, dy: number) {
			if (options.enabled) move(options.x ? dx + dy : dy)
		},

		/** Set the target to a position (px). With `now`, be there with no travel. */
		to(v: number, now = false) {
			target = hasEnds() ? clamp(v) : v

			if (!now) return

			current = lastDrawn = target
			apply(true)
		},

		/** Child i in the box's middle, or its leading edge `line` px in, with no travel. `force` places it while disabled. */
		center(i: number, line: number | null = null, force = false) {
			if (!force && !options.enabled) return

			const p = startFor(i, line)

			if (p !== null) column.to(p, true)
		},

		/** Glide to the same place as center() — the nearest lap of it. Returns the distance added to the target. */
		seek(i: number, line: number | null = null) {
			let p = options.enabled ? startFor(i, line) : null

			if (p === null) return 0
			if (hasEnds()) p = clamp(p)
			else p += Math.round((current - p) / span) * span

			const d = p - target

			target = p

			return d
		},

		/** Change options in place. Re-measures unless only `listen`, `ease` or `reach` changed. */
		set(n: Partial<ColumnOptions>) {
			if (n.enabled && !options.enabled) target = current

			Object.assign(options, n)

			if (Object.keys(n).some((key) => !QUIET.has(key))) measure()
		},

		/** Stop listening, observing and stepping, and clear every transform this column wrote — unless `keep`; see DestroyOptions. Default: clear. */
		destroy({ keep = false }: DestroyOptions = {}) {
			ro.disconnect()
			removeEventListener('resize', measure)
			document.removeEventListener('scroll', onNativeScroll, true)
			document.removeEventListener('focusin', onFocus)
			;(options.box ?? options.el).removeEventListener('pointerdown', press)
			context.steppers.delete(column)

			if (keep) return

			for (const n of transformed) clear(n, written)
			if (options.whole && written) options.el.style.transform = ''
		},

		/** The eased position, px. */
		get y() { return current },
		/** Where the input has sent it, px. */
		get target() { return target },
		/** target − current: the momentum, px. */
		get gap() { return target - current },
		/** The far end, px (with ends). */
		get max() { return max },
		/** One lap, px. */
		get span() { return span },
		/** Whether the last press on the box caught it coasting (with `grab`) — for refusing that press's click. */
		get caught() { return caught },

		/** 0..1 off the eased value; with a loop it starts again each lap. */
		get progress() {
			if (!hasEnds()) return span ? wrap(0, span, current) / span : 0

			return max ? Math.min(1, Math.max(0, current / max)) : 0
		},
	}

	const press = (e: PointerEvent) => {
		caught = false

		if (e.button !== 0 || !options.enabled) return

		const owed = target - current

		caught = Math.abs(owed) > COAST_PX
		bank = e.pointerType !== 'mouse' && caught ? { owed, at: performance.now() } : null
		target = current
	}

	const ro = new ResizeObserver(() => measure())

	ro.observe(options.el)
	if (options.box) ro.observe(options.box)
	else addEventListener('resize', measure)

	if (options.grab) (options.box ?? options.el).addEventListener('pointerdown', press)

	/* capture: an element's scroll event does not bubble */
	document.addEventListener('scroll', onNativeScroll, { capture: true, passive: true })
	document.addEventListener('focusin', onFocus)

	/* now, so center() works straight after; the observer keeps it true */
	measure()
	context.steppers.add(column)

	return column
}
