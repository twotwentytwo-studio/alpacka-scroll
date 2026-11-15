import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { smooth } from '@alpacka/scroll'

/*
 * plugins/scroll.client.ts — @alpacka/scroll's smooth mode, and the site's
 * one clock: smooth scroll, ScrollTrigger and every per-frame consumer step on
 * its rAF. Nothing else should call requestAnimationFrame.
 *
 *   const { $scroll } = useNuxtApp()
 *   $scroll.to(500) · $scroll.to('#section') · $scroll.to(el, { duration: 1.5 })
 *   $scroll.lock('menu') / .unlock('menu') / .hold() / .pin(el) / .reset()
 *   $scroll.on('tick', ({ y, ratio }) => …) · $scroll.velocity · .progress
 *
 * Without gsap or ScrollTrigger on the site, drop their lines: the core is
 * `provide: { scroll: smooth() }`.
 */

export default defineNuxtPlugin(() => {
	gsap.registerPlugin(ScrollTrigger)

	/* Two loops, deliberately: gsap keeps its ticker for its own tweens (it
	   drops frames at 120Hz, so nothing continuous rides it), and it must never
	   doze off or the next tween wakes into an uncorrected gap and finishes in
	   one frame. */
	gsap.config({ autoSleep: 0 })
	gsap.ticker.lagSmoothing(0)

	/* AFTER gsap is imported: rAF callbacks run in registration order, so
	   gsap's tweens advance first and a tick reads what they wrote */
	const scroll = smooth()

	scroll.on('scroll', () => ScrollTrigger.update())

	/* the package re-measures on its own (ResizeObserver); ScrollTrigger needs
	   telling */
	addEventListener('resize', () => ScrollTrigger.refresh())

	/* provided as it is — never patch methods onto it or spread it (a spread
	   freezes the getters); put site extras in functions of their own */
	return { provide: { scroll } }
})

/*
 * With ScrollTrigger on the site, a page transition refreshes it BEFORE it
 * resets the scroll: a refresh puts back the scroll position it measured
 * from, which after the reset would be the leaving page's offset.
 *
 *   ScrollTrigger.refresh()
 *   $scroll.pin(leavingPage)     // or $scroll.reset()
 */
