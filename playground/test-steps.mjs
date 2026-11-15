// Steps for cdp.mjs: run playground/tests.js twice, under no motion preference
// and under prefers-reduced-motion: reduce. Exits 1 when anything fails.
//   node skills/alpacka-scroll/reference/cdp.mjs 'http://localhost:8000/playground/virtual.html?test' playground/test-steps.mjs
export default async ({ evaluate, send, sleep }) => {
	for (let i = 0; i < 50 && (await evaluate('typeof runTests')) !== 'function'; i++) await sleep(100)

	let failed = 0

	for (const [label, value] of [['no motion preference', 'no-preference'], ['prefers-reduced-motion: reduce', 'reduce']]) {
		await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] })

		const results = await evaluate('runTests()')

		console.log(`--- ${label} ---`)

		if (!Array.isArray(results)) {
			console.log(results)
			failed++
			continue
		}

		for (const result of results) {
			console.log(`${result.pass ? 'pass' : 'FAIL'}  ${result.name}`)
			for (const line of result.detail) console.log(`      ${line}`)
			if (!result.pass) failed++
		}
	}

	console.log(failed ? `${failed} failed` : 'all passed')
	process.exitCode = failed ? 1 : 0
}
