import { gsap } from 'gsap'
import { virtual } from '@alpacka/scroll'

/*
 * plugins/scroll.client.ts — @alpacka/scroll's virtual mode, and the site's
 * one clock. Nothing scrolls natively: the package fixes <html> and <body>,
 * turns the wheel, a finger, the keys and push() into deltas, and steps every
 * column before each tick.
 *
 *   const { $scroll } = useNuxtApp()
 *   $scroll.column({ el, box, … })   — or useColumn() (see useColumn.ts)
 *   $scroll.lock('boot') / unlock('boot') · push(dy, dx) · across(claims)
 *   $scroll.on('tick', ({ time, ratio }) => …) · $scroll.on('input', ({ x, y, e }) => …)
 *
 * A GL layer that draws per frame should draw on 'tick' (it fires after the
 * columns moved), or later in the frame if DOM writes in other tick
 * listeners must land first — see the bus variant below.
 */

export default defineNuxtPlugin(() => {
	/* Two loops, deliberately: gsap keeps its ticker for its own tweens and
	   must never doze off (see the smooth plugin). */
	gsap.config({ autoSleep: false })
	gsap.ticker.lagSmoothing(0)

	/* Under prefers-reduced-motion columns move without easing, so `gap` (the
	   momentum a GL deformation reads) stays 0. To keep the easing and answer
	   reduced motion in the site instead: virtual({ reducedMotion: false }) */
	const scroll = virtual()

	/* only with an intro or loader: hold the input until it is done, and call
	   $scroll.unlock('boot') when it ends — or the page never scrolls */
	scroll.lock('boot')

	return { provide: { scroll } }
})

/*
 * A site with an event bus (mitt as $event) and listeners already written
 * against `vs` / `tick` / `render` keeps them by bridging:
 *
 *   scroll.on('input', ({ x, y, e }) => $event.emit('vs', { deltaY: y, deltaX: x, event: e }))
 *   scroll.on('tick', ({ time, ratio }) => {
 *       const frame = { time: time * 1000, ratio }
 *       $event.emit('tick', frame)
 *       $event.emit('render', frame)     // after every 'tick' listener: draw GL here
 *   })
 */
