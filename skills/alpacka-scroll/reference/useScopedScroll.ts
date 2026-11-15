import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import type { Scroller, ScrollTarget, ToOptions } from '@alpacka/scroll'

/*
 * Smooth-mode scroll for a box that scrolls on its own — a panel over the
 * page — with the page's feel: the page's scroller, scoped to the box and
 * stepped on the same clock. The box's first child is its content, watched for
 * growing (pictures decoding). `$scroll` is the smooth() instance the plugin
 * provides (see smooth-plugin.client.ts).
 *
 *   const scroller = useScopedScroll(box)
 *   scroller.to(0, { immediate: true })   // a reset nobody should see
 *
 * Nothing to mark: a page locked under the panel is `overflow: hidden` and
 * leaves the wheel alone, and an unlocked one hands the wheel to any box under
 * the pointer that can still scroll. Wheel only, like the page; under reduced
 * motion the box scrolls natively.
 */
export const useScopedScroll = (box: Ref<HTMLElement | null>) => {
	const { $scroll } = useNuxtApp()

	let scroller: Scroller | null = null

	onMounted(() => {
		if (box.value) scroller = $scroll.scope(box.value)
	})

	onBeforeUnmount(() => {
		scroller?.destroy()
		scroller = null
	})

	return {
		/** Scroll the box to a position, selector or element: the scroller's own to(), with its options. */
		to: (where: ScrollTarget, options?: ToOptions) => scroller?.to(where, options),
	}
}
