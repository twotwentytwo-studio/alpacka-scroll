import { smooth } from '../dist/index.js'

/*
 * The smooth mode's logic, checked on the hand-stepped clock of
 * smooth.html?test.
 *
 *   await runTests()   → [{ name, pass, detail }]
 *
 * Each check makes its own smooth() on the page's six 900px sections (a
 * scroll length of 5400 less the viewport) and destroys it. Wheels are
 * synthetic events, which run the handler but scroll nothing natively: what
 * is checked is what the scroller did with them. A delta under 40px is never
 * a notch, so it goes straight into the target.
 *
 * `npm test` runs this page and virtual.html, with and without reduced motion.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* long enough for the browser to deliver a scroll event or an observer */
const settle = () => sleep(150)

const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/* a wheel event on `target`, returned so its defaultPrevented can be read */
const wheel = (deltaY, target = document.body, deltaX = 0) => {
	const e = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true, composed: true })

	target.dispatchEvent(e)

	return e
}

/* console.warn's messages while `run` runs */
const warnings = async (run) => {
	const original = console.warn
	const seen = []

	console.warn = (...args) => seen.push(args.join(' '))

	try {
		await run()
	} finally {
		console.warn = original
	}

	return seen
}

const make = (t, options) => {
	const scroll = smooth(options)

	t.cleanup.push(() => scroll.destroy())

	return scroll
}

const checks = {
	async 'the wheel is eased into the page'(t) {
		const scroll = make(t)
		const events = [wheel(30), wheel(30), wheel(30)]

		if (reduced()) {
			t.expect('reduce: the wheel is left to the browser', events.every((e) => !e.defaultPrevented) && scroll.target === 0, scroll.target)
			return
		}

		t.expect('the wheel is taken', events.every((e) => e.defaultPrevented), events.map((e) => e.defaultPrevented))
		t.expect('the target has it all at once', scroll.target === 90, scroll.target)

		t.step(2)
		t.expect('the page is on its way', scroll.y > 0 && scroll.y < 90 && near(scrollY, scroll.y, 1) && !scroll.still, { y: scroll.y, scrollY })
		t.expect('velocity is px per frame, direction is down', scroll.velocity > 0 && scroll.direction === 1, { velocity: scroll.velocity, direction: scroll.direction })

		t.step(300)
		t.expect('it lands and rests', scroll.y === 90 && near(scrollY, 90) && scroll.still, { y: scroll.y, scrollY, still: scroll.still })
	},

	async 'a notch is fed out over frames'(t) {
		if (reduced()) return

		const scroll = make(t)

		/* a notch is a lone event, well clear of any stream */
		await sleep(600)
		wheel(100)
		t.expect('held back, not dropped into the target', scroll.target === 0, scroll.target)

		/* the clock's first frame has no length: it spends nothing, and must not drop the notch */
		t.step(1)
		t.expect('kept through a frame of no length', scroll.target === 0 && !scroll.still, { target: scroll.target, still: scroll.still })

		t.step(1)
		t.expect('the next frame spends a share of it', scroll.target > 0 && scroll.target < 100, scroll.target)

		t.step(300)
		t.expect('and all of it arrives', near(scroll.y, 100), scroll.y)
	},

	async 'the wheel at an end is the browser\'s'(t) {
		if (reduced()) return

		const scroll = make(t)

		t.expect('up at the top: not taken', !wheel(-30).defaultPrevented, 'prevented')

		scroll.reset(scroll.max)
		t.expect('down at the end: not taken', !wheel(30).defaultPrevented, 'prevented')
		t.expect('up from the end: taken', wheel(-30).defaultPrevented, 'not prevented')
	},

	async 'a native scroll takes over, mid-ease too'(t) {
		const scroll = make(t)

		if (!reduced()) {
			for (let i = 0; i < 10; i++) wheel(30)
			t.step(3)
		}

		window.scrollTo({ top: 2000, behavior: 'instant' })
		await settle()
		t.step(2)

		t.expect('the scroller follows it', scroll.y === 2000 && scroll.target === 2000 && scrollY === 2000, { y: scroll.y, target: scroll.target, scrollY })
	},

	async 'to() lands, and resolves when interrupted'(t) {
		const scroll = make(t)
		let landed = false
		let interrupted = false

		scroll.to(1000, { duration: 0.5 }).then(() => { landed = true })
		t.step(2)

		if (!reduced()) t.expect('on its way', scroll.y > 0 && scroll.y < 1000 && !landed, scroll.y)

		t.step(40)
		await Promise.resolve()
		t.expect('lands and resolves', scroll.y === 1000 && landed, { y: scroll.y, landed })

		if (reduced()) return

		scroll.to(3000, { duration: 2 }).then(() => { interrupted = true })
		t.step(10)
		wheel(-30)
		await Promise.resolve()
		t.expect('a wheel resolves it early', interrupted && scroll.y < 3000, { interrupted, y: scroll.y })
	},

	async 'to() takes a selector, an element and immediate'(t) {
		const scroll = make(t)
		const mark = document.querySelector('#mark')

		scroll.to('#mark', { immediate: true })
		t.expect('a selector', scroll.y === 1800 && scrollY === 1800, scroll.y)

		scroll.to(0, { immediate: true })
		scroll.to(mark, { immediate: true })
		t.expect('an element', scroll.y === 1800, scroll.y)

		scroll.to(1e6, { immediate: true })
		t.expect('clamped to the end', scroll.y === scroll.max, { y: scroll.y, max: scroll.max })

		const seen = await warnings(() => scroll.to('#nowhere', { immediate: true }))

		t.expect('a selector that matches nothing warns and stays', seen.length === 1 && seen[0].includes('#nowhere') && scroll.y === scroll.max, seen)
	},

	async 'a lock holds the wheel, not the code'(t) {
		const scroll = make(t)
		const root = document.documentElement

		scroll.lock('menu')
		scroll.lock('intro')
		t.expect('the root is clipped', root.style.overflow === 'hidden' && scroll.locks.join() === 'menu,intro', scroll.locks)

		const e = wheel(30)

		/* under reduced motion the wheel is the browser's, and the clipped root is what stops it */
		t.expect('the wheel moves nothing', (reduced() || e.defaultPrevented) && scroll.target === 0, { prevented: e.defaultPrevented, target: scroll.target })

		scroll.to(500, { immediate: true })
		t.expect('to() still moves the page', scroll.y === 500, scroll.y)

		scroll.unlock('menu')
		t.expect('one name left: still locked', root.style.overflow === 'hidden', root.style.overflow)

		scroll.unlock('intro')
		t.expect('the last name gone: unlocked', root.style.overflow === '' && !scroll.locks.length, root.style.overflow)
	},

	async 'hold() swallows the wheel until released'(t) {
		const scroll = make(t)
		const release = scroll.hold()
		const held = wheel(30)

		t.expect('held', held.defaultPrevented && scroll.target === 0, { prevented: held.defaultPrevented, target: scroll.target })

		release()
		wheel(30)
		t.expect('released', reduced() ? scroll.target === 0 : scroll.target === 30, scroll.target)
	},

	async 'a box that scrolls on its own keeps the wheel'(t) {
		if (reduced()) return

		const scroll = make(t)
		const panel = document.querySelector('#panel')

		t.cleanup.push(() => { panel.scrollTop = 0 })

		t.expect('with room to scroll: the box\'s', !wheel(30, panel.firstElementChild).defaultPrevented && scroll.target === 0, scroll.target)

		panel.scrollTop = panel.scrollHeight
		t.expect('at its end: handed on to the page', wheel(30, panel.firstElementChild).defaultPrevented && scroll.target === 30, scroll.target)
	},

	async 'scope() eases a box on the same clock'(t) {
		if (reduced()) return

		const scroll = make(t)
		const panel = document.querySelector('#panel')
		const scoped = scroll.scope(panel)

		t.cleanup.push(() => {
			scoped.destroy()
			panel.scrollTop = 0
		})

		wheel(30, panel.firstElementChild)
		t.expect('the box takes it, the page does not', scoped.target === 30 && scroll.target === 0, { box: scoped.target, page: scroll.target })

		t.step(300)
		t.expect('and eases there', near(panel.scrollTop, 30) && scoped.still, panel.scrollTop)
	},

	async 'pin() takes the leaving page out without moving it'(t) {
		const scroll = make(t)
		const page = document.querySelector('#page')
		const style = page.style.cssText

		t.cleanup.push(() => { page.style.cssText = style })

		scroll.to(1200, { immediate: true })

		const before = page.getBoundingClientRect().top

		scroll.pin(page)
		t.expect('out of flow, the scroll at the top', getComputedStyle(page).position === 'absolute' && scroll.y === 0 && scrollY === 0, { y: scroll.y, scrollY })
		t.expect('drawn where it was', near(page.getBoundingClientRect().top, before), { before, after: page.getBoundingClientRect().top })
	},

	async 'the length is re-read when the pinned page leaves'(t) {
		const scroll = make(t)
		const page = document.querySelector('#page')
		const { parentNode, nextSibling } = page
		const style = page.style.cssText
		const arriving = document.createElement('div')

		arriving.style.height = '2000px'

		t.cleanup.push(() => {
			arriving.remove()
			parentNode.insertBefore(page, nextSibling)
			page.style.cssText = style
		})

		scroll.to(1200, { immediate: true })
		page.after(arriving)
		scroll.pin(page)
		await settle()

		const pinned = scroll.max

		/* out of flow, the leaving page changes no watched box's size as it goes */
		page.remove()
		await settle()

		const real = document.documentElement.scrollHeight - innerHeight

		t.expect('the page got shorter', real < pinned, { pinned, real })
		t.expect('and max follows on its own', scroll.max === real, { max: scroll.max, real })
	},

	async 'and when the pinned page is hidden'(t) {
		const scroll = make(t)
		const page = document.querySelector('#page')
		const style = page.style.cssText
		const arriving = document.createElement('div')

		arriving.style.height = '2000px'

		t.cleanup.push(() => {
			arriving.remove()
			page.style.cssText = style
		})

		scroll.to(1200, { immediate: true })
		page.after(arriving)
		scroll.pin(page)
		await settle()

		const pinned = scroll.max

		page.style.display = 'none'
		await settle()

		const real = document.documentElement.scrollHeight - innerHeight

		t.expect('max follows', real < pinned && scroll.max === real, { pinned, max: scroll.max, real })
	},

	async 'growth no observer sees is found at the end'(t) {
		const scroll = make(t)
		const grow = document.querySelector('#grow')
		const sheet = document.createElement('style')

		/* a body of fixed height: its content can grow without any watched box changing size */
		sheet.textContent = 'html, body { height: 100%; }'
		document.head.append(sheet)

		t.cleanup.push(() => {
			sheet.remove()
			grow.style.height = ''
		})

		await settle()
		scroll.resize()

		const short = scroll.max

		scroll.reset(short)
		grow.style.height = '2900px'
		await settle()

		const real = document.documentElement.scrollHeight - innerHeight

		t.expect('the page is 2000px longer', real === short + 2000, { short, real })

		if (!reduced()) {
			const e = wheel(30)

			t.expect('the wheel at the old end is taken, and the length re-read', e.defaultPrevented && scroll.max === real && scroll.target === short + 30, { prevented: e.defaultPrevented, max: scroll.max, target: scroll.target })
		}

		scroll.to(1e6, { immediate: true })
		t.expect('to() reaches the real end', scroll.y === real && scroll.max === real, { y: scroll.y, max: scroll.max })
	},

	async 'destroy() puts back what smooth() changed'(t) {
		const root = document.documentElement

		history.scrollRestoration = 'auto'

		const scroll = smooth()

		t.expect('manual restoration and a stable gutter while live', history.scrollRestoration === 'manual' && root.style.scrollbarGutter === 'stable', { restoration: history.scrollRestoration, gutter: root.style.scrollbarGutter })

		scroll.lock('menu')
		scroll.destroy()
		t.expect('both back, and no lock left on the root', history.scrollRestoration === 'auto' && root.style.scrollbarGutter === '' && root.style.overflow === '', { restoration: history.scrollRestoration, gutter: root.style.scrollbarGutter, overflow: root.style.overflow })

		wheel(30)
		t.step(5)
		t.expect('nothing listens any more', scrollY === 0, scrollY)
	},

	async 'a second live instance warns'(t) {
		const first = smooth()
		let second = null
		const seen = await warnings(() => { second = smooth() })

		second.destroy()
		first.destroy()
		t.expect('warned once', seen.length === 1 && seen[0].includes('another instance'), seen)

		const again = await warnings(() => smooth().destroy())

		t.expect('one after the other is fine', again.length === 0, again)
	},
}

/** Run every check. `step(n)` is the hand-stepped clock. */
export const runTests = async ({ step }) => {
	const results = []

	for (const [name, check] of Object.entries(checks)) {
		const failures = []
		const cleanup = []
		const expect = (label, ok, seen) => {
			if (!ok) failures.push(`${label} — saw ${typeof seen === 'string' ? seen : JSON.stringify(seen)}`)
		}

		window.scrollTo({ top: 0, behavior: 'instant' })
		await settle()
		expect('the check starts at the top', scrollY === 0, scrollY)

		try {
			await check({ step, expect, cleanup })
		} catch (error) {
			failures.push(`threw ${error?.stack ?? error}`)
		}

		cleanup.reverse().forEach((undo) => undo())
		results.push({ name, pass: !failures.length, detail: failures })
	}

	return results
}
