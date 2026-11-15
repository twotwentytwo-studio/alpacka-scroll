'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { smooth, type Scroller, type Smooth } from '@alpacka/scroll'

/*
 * @alpacka/scroll's smooth mode for React, and the site's one clock. Wrap the
 * app once. In Next's App Router that is the root layout, which stays a
 * server component:
 *
 *   // app/layout.tsx
 *   import { ScrollProvider } from './scroll'
 *   <body><ScrollProvider>{children}</ScrollProvider></body>
 *
 *   // any client component
 *   const scroll = useScroll()
 *
 *   useEffect(() => scroll?.on('tick', ({ y, ratio }) => …), [scroll])
 *   <button onClick={() => scroll?.to('#work')} />
 *
 * useScroll() returns null on the server and on the first client render. The
 * instance is made in an effect, because smooth() reads the document, and a
 * child's effects run before the provider's. So every effect that uses it
 * lists it as a dependency and returns early without it. on() returns its
 * off, which is the effect's cleanup.
 *
 * A route change needs nothing here: the router moves the page natively, the
 * scroller follows any scroll it did not write, and it re-measures when
 * <body> changes size.
 */

const ScrollContext = createContext<Smooth | null>(null)

export const ScrollProvider = ({ children }: { children: ReactNode }) => {
	const [scroll, setScroll] = useState<Smooth | null>(null)

	/* destroyed in the cleanup, so StrictMode's second mount starts clean */
	useEffect(() => {
		const instance = smooth()

		/* smooth() sets this to 'manual', for a router that restores the scroll
		   itself. Next's does not: back and forward rely on the browser, and
		   without this line they land wherever the page left was scrolled. The
		   scroller follows the restored position like any native scroll. Drop
		   the line under a router with its own scroll restoration. */
		history.scrollRestoration = 'auto'

		setScroll(instance)

		return () => instance.destroy()
	}, [])

	/* the instance as it is: never spread it (a spread freezes the getters) */
	return <ScrollContext.Provider value={scroll}>{children}</ScrollContext.Provider>
}

/** The smooth() instance, or null until the provider has mounted. */
export const useScroll = () => useContext(ScrollContext)

/**
 * Smooth-mode scroll for a box that scrolls on its own, such as a panel over
 * the page. The box's first child is its content. Wheel only, like the page.
 *
 *   const box = useRef<HTMLDivElement>(null)
 *   const scroller = useScopedScroll(box)
 *
 *   scroller.current?.to(0, { immediate: true })
 */
export const useScopedScroll = (box: RefObject<HTMLElement | null>) => {
	const scroll = useScroll()
	const scroller = useRef<Scroller | null>(null)

	useEffect(() => {
		if (!scroll || !box.current) return

		const scoped = scroll.scope(box.current)

		scroller.current = scoped

		return () => {
			scoped.destroy()
			scroller.current = null
		}
	}, [scroll, box])

	return scroller
}
