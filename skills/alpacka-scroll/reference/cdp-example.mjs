// Steps for cdp.mjs: wait for the boot lock, wheel a column, read it back.
//   node cdp.mjs http://localhost:3000/ cdp-example.mjs <outDir>
// Everything inside evaluate() runs in the page; the rest runs in node.
export default async ({ evaluate, wheel, shot, sleep, send }) => {
	const S = `document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$scroll`

	/* the boot lock lifts when the intro ends */
	for (let i = 0; i < 60; i++) {
		await sleep(500)
		if ((await evaluate(`(${S})?.locks?.join(',')`)) === '') break
	}

	/* real frames? (a hidden in-app browser pane runs none) */
	console.log('frame:', await evaluate(`new Promise((r) => { let n = 0; const t = performance.now(); const f = () => (++n < 30 ? requestAnimationFrame(f) : r(((performance.now() - t) / 30).toFixed(1) + 'ms')); requestAnimationFrame(f) })`))

	/* a column's first children, by their transforms */
	const read = `[...document.querySelectorAll('[data-column] > *')].slice(0, 3).map((n) => n.style.transform + (n._parked ? ' parked' : ''))`

	console.log('before:', JSON.stringify(await evaluate(read)))

	/* a trackpad stream: small deltas, a few ms apart */
	for (let i = 0; i < 20; i++) {
		await wheel(720, 450, 12)
		await sleep(8)
	}

	/* a mouse wheel: lone notches */
	for (let i = 0; i < 3; i++) {
		await wheel(720, 450, 100)
		await sleep(90)
	}

	await sleep(2000)
	console.log('after:', JSON.stringify(await evaluate(read)))

	/* a finger: moves, then the release throws */
	const touch = (type, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 720, y, id: 1 }] })

	await touch('touchStart', 600)
	for (let y = 590; y >= 500; y -= 10) {
		await touch('touchMove', y)
		await sleep(16)
	}
	await touch('touchEnd')

	console.log('shot:', await shot('after'))
}
