'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { virtual, type Column, type ColumnOptions, type Virtual } from '@alpacka/scroll'

/*
 * @alpacka/scroll's virtual mode for React, and the site's one clock. Nothing
 * scrolls natively: the package fixes <html> and <body>, and every page is a
 * `fixed inset-0` stage. Wrap the app once (in Next's App Router, in the root
 * layout, which stays a server component):
 *
 *   <body><ScrollProvider>{children}</ScrollProvider></body>
 *
 *   // a client component
 *   const el = useRef<HTMLDivElement>(null)
 *   const column = useColumn(el, null, { loop: !isTouch, grab: true })
 *   const scroll = useScroll()
 *
 *   useEffect(() => scroll?.on('tick', () => gl.setVelocity(column.current?.gap ?? 0)), [scroll])
 *
 * useScroll() returns null on the server and on the first client render: the
 * instance is made in an effect, and a child's effects run before the
 * provider's. Every effect that uses it lists it as a dependency and returns
 * early without it.
 */

const ScrollContext = createContext<Virtual | null>(null)

export const ScrollProvider = ({ children }: { children: ReactNode }) => {
	const [scroll, setScroll] = useState<Virtual | null>(null)

	/* destroy() puts <html> and <body> back, so StrictMode's second mount
	   starts clean. To keep the easing under prefers-reduced-motion and answer
	   it in the site instead: virtual({ reducedMotion: false }) */
	useEffect(() => {
		const instance = virtual()

		setScroll(instance)

		return () => instance.destroy()
	}, [])

	/* the instance as it is: never spread it */
	return <ScrollContext.Provider value={scroll}>{children}</ScrollContext.Provider>
}

/** The virtual() instance, or null until the provider has mounted. */
export const useScroll = () => useContext(ScrollContext)

export type UseColumnOptions = Omit<ColumnOptions, 'el' | 'box' | 'lead'> & {
	/** An element outside `el` that moves with the children. Read once, when the column is made. */
	lead?: RefObject<HTMLElement | null>
}

/**
 * A virtual-mode column. `el` is the element whose children move; `box` is
 * what counts as on screen (null: the viewport). Returns a ref that holds the
 * column once it exists.
 *
 * `enabled`, `loop` and `listen` follow the props and are applied with
 * column.set(). The other options are read once, when the column is made.
 */
export const useColumn = (el: RefObject<HTMLElement | null>, box: RefObject<HTMLElement | null> | null = null, options: UseColumnOptions = {}) => {
	const scroll = useScroll()
	const column = useRef<Column | null>(null)
	const { enabled = true, loop = true, listen = true, lead, ...fixed } = options
	const atMount = useRef({ fixed, lead })

	/* Layout effects run before the effect below, so these do nothing on the
	   mount that makes the column, which already has the values. Later, a
	   change lands before the column's ResizeObserver measures the new layout.
	   For two columns over the same children, call set({ enabled }) straight
	   from the media query's listener instead: a state update gets here a task
	   later, after both have measured. */
	useLayoutEffect(() => column.current?.set({ enabled, loop }), [enabled, loop])
	useLayoutEffect(() => column.current?.set({ listen }), [listen])

	useEffect(() => {
		if (!scroll || !el.current) return

		const { fixed, lead } = atMount.current
		const created = scroll.column({ ...fixed, el: el.current, box: box?.current ?? null, lead: lead?.current ?? null, enabled, loop, listen })

		column.current = created

		/* A plain destroy(): React has removed the element by now, and a column
		   made on an element that still carries another column's transforms
		   would measure them (StrictMode makes it twice). Under an exit
		   animation that keeps the element on screen, pass { keep: true }. */
		return () => {
			created.destroy()
			column.current = null
		}

		/* made once per instance: the live options go through set() above */
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scroll])

	return column
}
