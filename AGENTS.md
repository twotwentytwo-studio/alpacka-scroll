# @alpacka/scroll — for agents

## Using it in a site

Read `skills/alpacka-scroll/SKILL.md`. It has the mode choice, the wiring for a plain script, Nuxt, Astro and React / Next in `reference/`, recipes, the rules learned the hard way, and how to test scroll in headless Chrome.

The contract is `README.md` plus the docs in `dist/*.d.ts`: every public option, method and getter carries its unit and default.

To make a site's agents find this, add one line to the site's own `AGENTS.md` or `CLAUDE.md`:

```md
Scroll is @alpacka/scroll — read node_modules/@alpacka/scroll/AGENTS.md before touching it.
```

To load the skill as a skill, copy `skills/alpacka-scroll/` into the site's `.claude/skills/` (or your agent's skills folder).

## Working on the package

- `npm run typecheck` · `npm run build` · `npm test`. A site that installs the package from a local folder picks up the new `dist/` on its next reload.
- `npm test` builds, serves the folder on localhost and runs both test pages in headless Chrome, with and without reduced motion. It exits 1 on a failure. It needs Chrome: set `CHROME=/path/to/chrome` anywhere but macOS.
- The test pages are `playground/virtual.html?test` and `playground/smooth.html?test`. rAF is swapped for `step(n)`, so a check steps the clock by hand. The checks are in `playground/tests.js` (columns and the virtual input) and `playground/smooth-tests.js` (the smooth scroller). Add a check with any fix.
- In a real site: `skills/alpacka-scroll/reference/cdp.mjs` drives headless Chrome (real frames, WebGPU, real wheel and touch events).

Write for the next agent:
- **Names:** full names for state shared across a file, and for every public name. Short names only inside a few lines.
- **Docs:** a `/** */` doc on every public member, with its unit and default. It ends up in the `.d.ts`.
- **Comments:** say why, and state invariants. No history.
- **No option without a caller.** Every option is one more choice a site's agent can get wrong.
- **No tricks:** never patch methods onto an instance, and never spread one.

Keep `README.md`, `src/index.ts`'s API comment and `skills/alpacka-scroll/SKILL.md` in step with any change to the public API.
