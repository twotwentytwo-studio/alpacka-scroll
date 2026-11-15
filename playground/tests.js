import { virtual } from '../dist/index.js'

/*
 * The column's logic, checked on the hand-stepped clock of virtual.html?test.
 *
 *   await runTests()   → [{ name, pass, detail }]
 *
 * Each check builds its own box and column (hidden, at the page's corner),
 * waits once for the browser to deliver the column's first ResizeObserver
 * measure, and from then on runs synchronously — step(n) included — so no
 * late measure can land in the middle of it.
 *
 * Headless, from the package folder, with the folder served on :8000:
 *   node skills/alpacka-scroll/reference/cdp.mjs 'http://localhost:8000/playground/virtual.html?test' playground/test-steps.mjs
 */

/* every fixture: a 300px-wide box, 400px tall unless asked, holding a column
   of 100px children 10px apart with 10px of padding — child i starts at
   10 + 110i, the span is 1120, and the far end is 710 */
const ITEM_PX = 100
const GAP_PX = 10
const BOX_PX = 400

const settle = () => new Promise((resolve) => setTimeout(resolve, 150))
const near = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance
const REDUCE = '(prefers-reduced-motion: reduce)'

const build = ({ items = 10, height = BOX_PX, leadPx = 0 } = {}) => {
	const box = document.createElement('div')
	const el = document.createElement('div')
	const lead = leadPx ? document.createElement('div') : null

	box.style.cssText = `position: absolute; left: 0; top: 0; width: 300px; height: ${height}px; overflow: hidden; visibility: hidden;`
	el.style.cssText = `display: flex; flex-direction: column; gap: ${GAP_PX}px; padding: ${GAP_PX}px;`

	for (let i = 0; i < items; i++) {
		const item = document.createElement('div')

		item.style.cssText = `flex: none; height: ${ITEM_PX}px;`
		el.append(item)
	}

	if (lead) {
		lead.style.cssText = `height: ${leadPx}px;`
		box.append(lead)
	}

	box.append(el)
	document.body.append(box)

	return { box, el, lead, kids: [...el.children] }
}

/* a column on a fresh fixture, its first observer measure delivered */
const make = async ({ scroll, cleanup }, columnOptions = {}, fixtureOptions = {}) => {
	const fixture = build(fixtureOptions)
	const col = scroll.column({ el: fixture.el, box: fixture.box, lead: fixture.lead, ...columnOptions })

	cleanup.push(() => {
		col.destroy()
		fixture.box.remove()
	})

	await settle()

	return { ...fixture, col }
}

/* Make a fixture's children take focus: a hidden element takes none, and a
   page without focus fires no focus events (in a browser tab, click the page
   first; test-steps.mjs emulates it). */
const focusable = (t, { box, kids }) => {
	box.style.visibility = 'visible'
	kids.forEach((k) => { k.tabIndex = 0 })
	t.expect('the page has focus', document.hasFocus(), 'no focus: click the page, then run again')
}

/* what the GL mirror would read off each child, as plain values */
const snapshot = (kids) => JSON.stringify(kids.map((k) => [k.style.transform, k._vrect ? { ...k._vrect } : null, !!k._parked]))

/* a parked child's resting rect does not touch the box (overscan 0) */
const offBox = (k, height = BOX_PX) => k._vrect && (k._vrect.bottom <= 0 || k._vrect.top >= height)

/* the top wall, with or without a lead above the children (the folio's
   project page: the copy leads the pictures) */
const topWall = async (t, leadPx) => {
	const { col, box, kids, lead } = await make(t, { loop: false }, { leadPx })
	const atTop = (label) => t.expect(label, col.y === 0 && col.target === 0, { y: col.y, target: col.target, max: col.max })

	box.style.height = '401px'
	col.measure()
	atTop('the box grows 1px')

	t.step(60)
	atTop('the box grows 1px, frames later')

	box.style.height = '300px'
	col.measure()
	atTop('the box shrinks')

	kids[0].style.height = '130px'
	col.measure()
	atTop('the first child grows')

	kids[0].style.height = '70px'
	col.measure()
	atTop('the first child shrinks')

	if (lead) {
		lead.style.height = `${leadPx - 30}px`
		col.measure()
		atTop('the lead shrinks')
	}

	/* coasting up into the top: the wall holds, and so does the momentum */
	col.to(500, { immediate: true })
	col.to(0)
	t.step(4)

	const gap = col.gap

	box.style.height = '360px'
	col.measure()
	t.expect('coasting into the top: the target stays on it', col.target === 0, col.target)
	t.expect('coasting into the top: the momentum is kept', gap < 0 && near(col.gap, gap), { gap: col.gap, was: gap })
}

const checks = {
	/* the GL-only page: nothing goes on the DOM, and the mirror reads the
	   same rects as it would off a column that wrote its transforms */
	async 'transforms off: the same _vrect, and no transform written'(t) {
		const on = await make(t, { overscan: 3 })
		const off = await make(t, { overscan: 3, transforms: false })

		const rects = (kids) => JSON.stringify(kids.map((k) => (k._vrect ? [k._vrect.top, k._vrect.bottom] : null)))
		const bare = (kids) => kids.every((k) => k.style.transform === '')

		t.expect('at rest: nothing written', bare(off.kids), off.kids.map((k) => k.style.transform))
		t.expect('at rest: the same rects', rects(on.kids) === rects(off.kids), { on: rects(on.kids), off: rects(off.kids) })

		on.col.add(730)
		off.col.add(730)
		t.step(120)

		t.expect('moved, past a wrap: nothing written', bare(off.kids), off.kids.map((k) => k.style.transform))
		t.expect('moved, past a wrap: the same rects', rects(on.kids) === rects(off.kids), { on: rects(on.kids), off: rects(off.kids) })
		t.expect('and it did move', near(off.col.y, on.col.y) && off.col.y > 700, { on: on.col.y, off: off.col.y })

		/* a transform somebody else put there is not this column's to clear */
		off.kids[2].style.transform = 'scale(0.5)'
		off.col.measure()
		t.expect('a foreign transform survives a measure', off.kids[2].style.transform === 'scale(0.5)', off.kids[2].style.transform)
		off.kids[2].style.transform = ''
	},

	async 'transforms turned off and on: taken off, then put back'(t) {
		const { col, kids } = await make(t, { overscan: 3 })

		col.add(240)
		t.step(120)

		const before = JSON.stringify(kids.map((k) => (k._vrect ? k._vrect.top : null)))

		t.expect('on: written', kids.some((k) => k.style.transform !== ''), kids.map((k) => k.style.transform))

		col.set({ transforms: false })
		t.expect('turned off: taken off', kids.every((k) => k.style.transform === ''), kids.map((k) => k.style.transform))
		t.expect('turned off: the rects hold', JSON.stringify(kids.map((k) => (k._vrect ? k._vrect.top : null))) === before, { before, after: kids.map((k) => k._vrect?.top) })
		t.expect('turned off: it stands where it stood', near(col.y, 240, 0.5), col.y)

		col.set({ transforms: true })
		t.expect('turned on: written again', kids.some((k) => k.style.transform !== ''), kids.map((k) => k.style.transform))
	},

	async 'destroy({ keep: true }) leaves every child where it stands'(t) {
		const { col, box, kids } = await make(t, { loop: false, overscan: 0 })

		col.to(300, { immediate: true })
		t.step(3)

		const before = snapshot(kids)

		t.expect('something to keep', kids.some((k) => k.style.transform) && kids.some((k) => k._parked), before)

		col.destroy({ keep: true })
		t.scroll.push(200, 0)
		t.step(30)

		t.expect('it no longer listens or steps', col.y === 300 && col.target === 300, { y: col.y, target: col.target })
		t.expect('every transform, _vrect and _parked is as it was', snapshot(kids) === before, snapshot(kids))

		box.style.height = '350px'
		await settle()

		t.expect('nothing re-measures it after a resize', snapshot(kids) === before, snapshot(kids))

		col.destroy()

		t.expect('a later destroy() still clears', kids.every((k) => k.style.transform === '' && k._vrect === null && !k._parked), snapshot(kids))
	},

	async 'destroy({ keep: true }) on a whole column leaves its transform'(t) {
		const { col, el } = await make(t, { whole: true })

		col.to(200, { immediate: true })

		const transform = el.style.transform

		col.destroy({ keep: true })
		t.expect('kept', transform !== '' && el.style.transform === transform, el.style.transform)

		col.destroy()
		t.expect('a later destroy() still clears', el.style.transform === '', el.style.transform)
	},

	async 'a forced placement parks what is past the overscan two frames later'(t) {
		for (const loop of [true, false]) {
			const { col, kids } = await make(t, { loop, overscan: 0 }, { items: 14 })
			const placements = [['center(6)', () => col.center(6)], ['to(700, { immediate: true })', () => col.to(700, { immediate: true })], ['measure()', () => col.measure()]]

			for (const [how, place] of placements) {
				const label = `loop: ${loop}, ${how}`

				place()
				t.expect(`${label}: every child live straight after`, kids.every((k) => !k._parked), kids.filter((k) => k._parked).length)

				t.step(1)
				t.expect(`${label}: none parked on the first frame`, kids.every((k) => !k._parked), kids.filter((k) => k._parked).length)

				t.step(1)

				const parked = kids.filter((k) => k._parked)

				t.expect(`${label}: those past the overscan parked on the second`, parked.length > 0, parked.length)
				t.expect(`${label}: only those`, parked.every((k) => offBox(k)), parked.map((k) => k._vrect))
				t.expect(`${label}: what is on screen stays live`, kids.some((k) => !k._parked && !offBox(k)), snapshot(kids))
			}
		}
	},

	async 'a column with ends at its top stays there through a re-measure'(t) {
		await topWall(t, 0)
	},

	async 'a column with ends and a lead at its top stays there through a re-measure'(t) {
		await topWall(t, 150)
	},


	async 'a column with ends at its far end stays there through a re-measure'(t) {
		const { col, box } = await make(t, { loop: false })

		col.to(col.max, { immediate: true })
		box.style.height = '350px'
		col.measure()
		t.expect('the box shrinks at the end', col.max === 760 && col.target === col.max && col.y === col.max, { y: col.y, target: col.target, max: col.max })

		box.style.height = '420px'
		col.measure()
		t.expect('the box grows at the end', col.max === 690 && col.target === col.max && col.y === col.max, { y: col.y, target: col.target, max: col.max })

		col.to(100, { immediate: true })
		col.to(col.max)
		t.step(4)

		const gap = col.gap

		box.style.height = '380px'
		col.measure()
		t.expect('coasting into the end: the target is the new end', col.target === col.max && col.max === 730, { target: col.target, max: col.max })
		t.expect('coasting into the end: the momentum is kept', gap > 0 && near(col.gap, gap), { gap: col.gap, was: gap })
	},

	async 'between the walls a re-measure keeps the reader in place'(t) {
		const { col, kids } = await make(t, { loop: false })

		/* the reading line, 200px down the box, sits 50px into child 4 */
		col.to(300, { immediate: true })
		kids[0].style.height = '160px'
		col.measure()
		t.expect('the child on the reading line stays put', near(col.y, 360) && near(col.target, 360), { y: col.y, target: col.target })
	},

	async 'turning the loop off brings a value laps away into the first lap'(t) {
		const { col } = await make(t, { loop: true })

		col.to(300 + 2 * col.span, { immediate: true })
		col.set({ loop: false })
		t.expect('the same place, one lap in', near(col.y, 300) && near(col.target, 300), { y: col.y, target: col.target, span: col.span })
	},

	async 'virtual({ reducedMotion }) overrides the media query'(t) {
		for (const reducedMotion of [false, true]) {
			const instance = virtual({ reducedMotion })
			const fixture = build()
			const col = instance.column({ el: fixture.el, box: fixture.box, loop: false })

			/* a new clock's first frame has ratio 0 */
			col.add(300)
			t.step(2)

			if (reducedMotion) t.expect('true: lands at once', col.y === 300 && col.gap === 0, { y: col.y, gap: col.gap })
			else t.expect('false: eases, and the gap carries momentum', col.y > 0 && col.y < 300 && col.gap > 0, { y: col.y, gap: col.gap })

			col.destroy()
			instance.destroy()
			fixture.box.remove()
		}
	},

	async 'a native scroll on the box is put back'(t) {
		const { col, box, kids } = await make(t, { loop: false })

		kids[9].scrollIntoView()
		t.expect('the browser scrolls an overflow: hidden box', box.scrollTop > 0, box.scrollTop)

		/* the scroll event is the browser's to deliver */
		await settle()
		t.step(2)
		t.expect('put back, and the column has not moved', box.scrollTop === 0 && col.y === 0 && col.target === 0, { scrollTop: box.scrollTop, y: col.y, target: col.target })
	},

	async 'a focused child is brought into the box'(t) {
		const fixture = await make(t, { loop: false })
		const { col, box, kids } = fixture
		const top = (k) => k.getBoundingClientRect().top - box.getBoundingClientRect().top

		focusable(t, fixture)

		/* travel first, so child 9 is parked under a transform 300px old: read
		   off the DOM alone it would land at the far end, 710 */
		col.to(300)
		t.step(300)
		kids[9].focus()
		t.step(300)
		t.expect('below the box: its far edge on the box\'s', near(col.y, 700, 0.5) && near(top(kids[9]), 300, 0.5), { y: col.y, top: top(kids[9]) })
		t.expect('the box is not left scrolled', box.scrollTop === 0, box.scrollTop)

		/* above the box, where no native scroll can reach */
		kids[0].focus()
		t.step(300)
		t.expect('above the box: its leading edge on the box\'s', near(col.y, 10, 0.5) && near(top(kids[0]), 0, 0.5), { y: col.y, top: top(kids[0]) })

		/* in the box already: nothing moves */
		kids[1].focus()
		t.step(300)
		t.expect('in view: stays', near(col.y, 10, 0.5), col.y)
	},

	async 'a focused child in a loop comes by the nearest lap'(t) {
		const fixture = await make(t)
		const { col, box, kids } = fixture
		const top = (k) => k.getBoundingClientRect().top - box.getBoundingClientRect().top

		focusable(t, fixture)

		/* child 9 stands 1000px down, or 120px up: up is nearer */
		kids[9].focus()
		t.step(300)
		t.expect('came from above', near(col.y, 1000, 0.5) && near(top(kids[9]), 0, 0.5), { y: col.y, top: top(kids[9]) })
		t.expect('the box is not left scrolled', box.scrollTop === 0, box.scrollTop)
	},

	async 'a focused element in a whole column is brought into the box'(t) {
		const fixture = await make(t, { whole: true })
		const { col, box, kids } = fixture
		const top = (k) => k.getBoundingClientRect().top - box.getBoundingClientRect().top

		focusable(t, fixture)

		kids[9].focus()
		t.step(300)
		t.expect('its far edge on the box\'s', near(col.y, 700, 0.5) && near(top(kids[9]), 300, 0.5), { y: col.y, top: top(kids[9]) })
		t.expect('the box is not left scrolled', box.scrollTop === 0, box.scrollTop)

		kids[0].focus()
		t.step(300)
		t.expect('back up', near(col.y, 10, 0.5) && near(top(kids[0]), 0, 0.5), { y: col.y, top: top(kids[0]) })
	},

	async 'virtual() follows prefers-reduced-motion'(t) {
		const reduce = matchMedia(REDUCE).matches
		const instance = virtual()
		const fixture = build()
		const col = instance.column({ el: fixture.el, box: fixture.box, loop: false })

		col.add(300)
		t.step(2)

		if (reduce) t.expect('reduce: lands at once', col.y === 300 && col.gap === 0, { y: col.y, gap: col.gap })
		else t.expect('no preference: eases', col.y > 0 && col.y < 300, { y: col.y, gap: col.gap })

		col.destroy()
		instance.destroy()
		fixture.box.remove()
	},
}

/** Run every check. `scroll` is the page's virtual() instance, `step(n)` the hand-stepped clock. */
export const runTests = async ({ scroll, step }) => {
	const results = []

	for (const [name, check] of Object.entries(checks)) {
		const failures = []
		const cleanup = []
		const expect = (label, ok, seen) => {
			if (!ok) failures.push(`${label} — saw ${typeof seen === 'string' ? seen : JSON.stringify(seen)}`)
		}

		try {
			await check({ scroll, step, expect, cleanup })
		} catch (error) {
			failures.push(`threw ${error?.stack ?? error}`)
		}

		cleanup.forEach((undo) => undo())
		results.push({ name, pass: !failures.length, detail: failures })
	}

	return results
}
