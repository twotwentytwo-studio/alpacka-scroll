# @alpacka/scroll — for agents

## Using it in a site

Read `skills/alpacka-scroll/SKILL.md`. It has the mode choice, Nuxt plugins and composables in `reference/`, recipes, the rules learned the hard way, and how to test scroll in headless Chrome.

The contract is `README.md` plus the docs in `dist/*.d.ts`: every public option, method and getter carries its unit and default.

To make a site's agents find this, add one line to the site's own `AGENTS.md` or `CLAUDE.md`:

```md
Scroll is @alpacka/scroll — read node_modules/@alpacka/scroll/AGENTS.md before touching it.
```

To load the skill as a skill, copy `skills/alpacka-scroll/` into the site's `.claude/skills/` (or your agent's skills folder).

## Working on the package

- `npm run typecheck` · `npm run build`. A site that installs the package from a local folder picks up the new `dist/` on its next reload.
- Logic without a browser frame loop: serve the folder and open `playground/virtual.html?test`. rAF is swapped for `step(n)`, so a test can step the clock by hand. The column checks in `playground/tests.js` load there as `runTests()`. Run them headless with `node skills/alpacka-scroll/reference/cdp.mjs 'http://localhost:8000/playground/virtual.html?test' playground/test-steps.mjs`, which exits 1 on a failure. Add a check with any fix to a column.
- In a real site: `skills/alpacka-scroll/reference/cdp.mjs` drives headless Chrome (real frames, WebGPU, real wheel and touch events).

Write for the next agent:
- **Names:** full names for state shared across a file, and for every public name. Short names only inside a few lines.
- **Docs:** a `/** */` doc on every public member, with its unit and default. It ends up in the `.d.ts`.
- **Comments:** say why, and state invariants. No history.
- **No option without a caller.** Every option is one more choice a site's agent can get wrong.
- **No tricks:** never patch methods onto an instance, and never spread one.

Keep `README.md`, `src/index.ts`'s API comment and `skills/alpacka-scroll/SKILL.md` in step with any change to the public API.
