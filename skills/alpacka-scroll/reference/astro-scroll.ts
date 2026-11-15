import { smooth } from '@alpacka/scroll'

/*
 * src/scripts/scroll.ts: @alpacka/scroll in an Astro site, smooth mode, and
 * the site's one clock. Import it from a <script> in the layout. Every other
 * script imports `getScroll` from here: Astro bundles them into one module
 * graph, so the page has one instance and one requestAnimationFrame.
 *
 * Without <ClientRouter />, each page is a fresh document and a script runs
 * once per page:
 *
 *   <script>
 *       import { getScroll } from '../scripts/scroll'
 *
 *       getScroll().on('tick', ({ y, ratio }) => …)
 *   </script>
 *
 * With <ClientRouter />, a script runs once per VISIT and the pages change
 * under it, so set a page up on `astro:page-load` (it fires on the first load
 * and after every navigation) and ask for the instance there, never at the
 * top of the script:
 *
 *   <script>
 *       import { getScroll } from '../scripts/scroll'
 *
 *       document.addEventListener('astro:page-load', () => {
 *           const scroll = getScroll()
 *
 *           scroll.on('tick', ({ y, ratio }) => …)
 *           document.querySelector('[data-menu]')?.addEventListener('click', () => scroll.lock('menu'))
 *       })
 *   </script>
 *
 * Virtual mode is the same file with virtual() for smooth(). Create a page's
 * columns on `astro:page-load` and destroy them on `astro:before-swap`:
 *
 *   document.addEventListener('astro:page-load', () => {
 *       const el = document.querySelector<HTMLElement>('[data-column]')
 *       if (!el) return
 *
 *       const column = getScroll().column({ el })
 *
 *       document.addEventListener('astro:before-swap', () => column.destroy({ keep: true }), { once: true })
 *   })
 */

let scroll = smooth()

/** The page's scroll instance. Under <ClientRouter /> it is a new one after every navigation, so do not keep it across pages. */
export const getScroll = () => scroll

/* <ClientRouter /> replaces <body> and every attribute on <html> when it
   swaps pages. Both modes keep state there: the element whose size is watched
   for the scroll length, a lock's `overflow: hidden`, the virtual mode's fixed
   document. So the instance goes with the page it was made for, and listeners
   added with on() go with it. Neither event fires without the router. */
document.addEventListener('astro:before-swap', () => scroll.destroy())
document.addEventListener('astro:after-swap', () => { scroll = smooth() })
