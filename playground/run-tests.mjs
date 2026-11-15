// npm test: serve the package folder on localhost, run every test page in
// headless Chrome through cdp.mjs, and exit 1 when a check fails.
//   [CDP_PORT=9333] [CHROME=/path/to/chrome] node playground/run-tests.mjs
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PAGES = ['playground/virtual.html?test', 'playground/smooth.html?test']
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json' }

/* a URL's pathname is absolute, so normalising it cannot climb out of the folder */
const server = createServer(async (request, response) => {
	const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))

	try {
		const body = await readFile(join(root, path))

		response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
	} catch {
		response.writeHead(404).end()
	}
})

await new Promise((listening) => server.listen(0, '127.0.0.1', listening))

const { port } = server.address()
const firstCdpPort = Number(process.env.CDP_PORT) || 9333
let failed = 0

for (const [i, page] of PAGES.entries()) {
	console.log(`\n=== ${page}`)

	/* a port each: the Chrome before this one may not have let go of its own yet */
	const run = spawn(process.execPath, ['skills/alpacka-scroll/reference/cdp.mjs', `http://127.0.0.1:${port}/${page}`, 'playground/test-steps.mjs'], {
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, CDP_PORT: String(firstCdpPort + i) },
	})

	if (await new Promise((exited) => run.on('exit', exited))) failed++
}

server.close()
process.exit(failed ? 1 : 0)
