import { onBeforeUnmount, onMounted, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Column, ColumnOptions } from '@alpacka/scroll'

/*
 * A virtual-mode column as a Nuxt composable. `$scroll` is the virtual()
 * instance the plugin provides (see virtual-plugin.client.ts).
 *
 *   const col = useColumn(inner, outer, { loop: () => !isTouch.value, grab: true })
 *   $scroll.on('tick', () => gl.setVelocity(col.value?.gap ?? 0))
 *
 * The options that change at runtime — enabled, loop, listen, lead — take a
 * ref or a getter and are applied with column.set() when they change. The
 * rest are read once, at mount.
 *
 * Everything is created and watched from onMounted, never during setup: a
 * caller's getter can name state its component declares further down, and
 * reading it during setup throws.
 */

type Live = {
	enabled?: MaybeRefOrGetter<boolean>
	loop?: MaybeRefOrGetter<boolean>
	listen?: MaybeRefOrGetter<boolean>
	lead?: MaybeRefOrGetter<HTMLElement | null>
}

export type UseColumnOptions = Omit<ColumnOptions, 'el' | 'box' | keyof Live> & Live

export const useColumn = (el: Ref<HTMLElement | null>, box: Ref<HTMLElement | null>, options: UseColumnOptions = {}) => {
	const { $scroll } = useNuxtApp()
	const column = shallowRef<Column | null>(null)
	const stops: (() => void)[] = []
	const { enabled = true, loop = true, listen = true, lead = null, ...fixed } = options

	/* the options that need a re-measure when they change */
	const shape = () => ({ enabled: toValue(enabled), loop: toValue(loop), lead: toValue(lead) })

	onMounted(() => {
		if (!el.value) return

		column.value = $scroll.column({ ...fixed, el: el.value, box: box.value, ...shape(), listen: toValue(listen) })

		stops.push(
			watch(shape, (next) => column.value?.set(next), { flush: 'post' }),
			watch(() => toValue(listen), (on) => column.value?.set({ listen: on })),
		)
	})

	/* keep: Vue runs this at the START of a leave transition, and the element
	   stays on screen until the leave ends. Cleared, a leaving page would snap
	   to scroll 0 for the length of it; the element goes with the component,
	   so there is nothing to clear */
	onBeforeUnmount(() => {
		stops.forEach((stop) => stop())
		column.value?.destroy({ keep: true })
		column.value = null
	})

	return column
}
