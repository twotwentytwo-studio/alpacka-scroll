// Headless Chrome over CDP: open a URL, run steps, print results.
// usage: [CDP_PORT=9333] [CHROME=/path/to/chrome] node cdp.mjs <url> <steps.mjs> [outDir]
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [url, stepsFile, out = tmpdir()] = process.argv.slice(2)
/* CHROME: the browser to run, anywhere but macOS's default install */
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
/* CDP_PORT: a port of its own, for running beside another agent's Chrome */
const PORT = Number(process.env.CDP_PORT) || 9333
const dir = mkdtempSync(join(tmpdir(), 'cdp-'))

const chrome = spawn(CHROME, [
	'--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
	'--window-size=1440,900', '--enable-unsafe-webgpu', '--no-first-run', 'about:blank',
], { stdio: 'ignore' })

// a headless Chrome left running makes macOS refuse to open the normal one
// (it "activates" the invisible instance instead), so it dies with this script
process.on('exit', () => chrome.kill())
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let list = []
for (let i = 0; i < 50 && !list.length; i++) {
	await sleep(200)
	try { list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page') } catch {}
}

const ws = new WebSocket(list[0].webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))

let id = 0
const pending = new Map()
const logs = []

ws.addEventListener('message', ({ data }) => {
	const m = JSON.parse(data)
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m)
		pending.delete(m.id)
	} else if (m.method === 'Runtime.exceptionThrown') {
		logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
	} else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
		logs.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
	}
})

const send = (method, params = {}) => new Promise((r) => {
	pending.set(++id, r)
	ws.send(JSON.stringify({ id, method, params }))
})

const evaluate = async (expression) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
	return r.result?.exceptionDetails ? 'THREW ' + r.result.exceptionDetails.exception?.description : r.result?.result?.value
}

const wheel = async (x, y, deltaY, deltaX = 0) =>
	send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY })

const shot = async (name) => {
	const r = await send('Page.captureScreenshot', { format: 'png' })
	const file = join(out, name + '.png')
	writeFileSync(file, Buffer.from(r.result.data, 'base64'))
	return file
}

// QUIET=1: no console capture — a page that floods warnings with large objects
// (dev-mode Vue warnings carry whole component trees) can choke this script
if (!process.env.QUIET) await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url })

/* relative to where it is run from, or absolute */
const steps = (await import(pathToFileURL(resolve(stepsFile)).href)).default

try {
	await steps({ evaluate, wheel, shot, sleep, send, logs })
} finally {
	console.log('--- page errors/warnings ---')
	console.log(logs.slice(0, 30).join('\n') || '(none)')
	ws.close()
	chrome.kill()
}
