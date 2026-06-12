// Drag-drop regression test (cycle-2). The cycle-1 eval could not simulate an
// OS-level drag, so the drop wiring shipped uncovered. This drives the BUILT
// app in a real Chromium-engine browser and dispatches genuine DragEvents with
// a DataTransfer constructed in page context — covering the full path:
// drop event -> handleFiles -> onload -> parse -> render (+ secret scan).
//
// Run:  npm run build && npm run test:drop
// Env:  EDGE_PATH (browser executable; default = system Edge)
//       BASE_URL  (skip the built-in server start; test an already-running app)
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EDGE =
	process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 4179;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}/`;

const JSONL_PLAIN = [
	'{"type":"user","message":{"role":"user","content":"hello from the drop test"}}',
	'{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi! parsed fine."}]}}'
].join('\n');
// Secret pattern assembled at runtime — a literal credential-shaped string in
// the repo would trip secret scanners (banked rule: learned #113).
const FAKE_AWS = ['AKIA', 'X'.repeat(16)].join('');
const JSONL_SECRET = `{"type":"user","message":{"role":"user","content":"key is ${FAKE_AWS}"}}`;

let server = null;
if (!process.env.BASE_URL) {
	server = spawn('node', ['build'], {
		env: { ...process.env, PORT: String(PORT) },
		stdio: 'ignore'
	});
	await new Promise((r) => setTimeout(r, 2500));
}

const browser = await puppeteer.launch({
	executablePath: EDGE,
	headless: 'new',
	args: ['--no-sandbox']
});

const failures = [];
const check = (name, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
	if (!ok) failures.push(name);
};

async function dropFile(page, content, filename) {
	// Real DragEvents with a real DataTransfer, dispatched on the drop zone.
	return page.evaluate(
		async ([text, name]) => {
			// Svelte 5 flushes DOM updates on a microtask — wait a frame before
			// reading class state, or the assertion races the renderer.
			const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
			const zone = document.querySelector('.zone');
			if (!zone) return { error: 'no .zone element' };
			const dt = new DataTransfer();
			dt.items.add(new File([text], name, { type: 'application/x-ndjson' }));

			zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
			await frame();
			const draggingDuring = zone.classList.contains('dragging');
			zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
			await frame();
			const draggingAfter = zone.classList.contains('dragging');
			return { draggingDuring, draggingAfter };
		},
		[content, filename]
	);
}

try {
	// --- scenario 1: dragover highlight + dragleave clears it (no drop)
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });

	const hover = await page.evaluate(async () => {
		const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
		const zone = document.querySelector('.zone');
		zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: new DataTransfer() }));
		await frame();
		const during = zone.classList.contains('dragging');
		zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
		await frame();
		return { during, after: zone.classList.contains('dragging') };
	});
	check('dragover sets .dragging', hover.during === true);
	check('dragleave clears .dragging', hover.after === false);

	// --- scenario 2: drop a plain transcript -> conversation renders
	const d1 = await dropFile(page, JSONL_PLAIN, 'session.jsonl');
	check('drop clears .dragging', d1.draggingAfter === false, JSON.stringify(d1));
	await page.waitForSelector('.thread .msg', { timeout: 5000 }).catch(() => {});
	const rendered = await page.evaluate(() => ({
		msgs: document.querySelectorAll('.thread .msg').length,
		text: document.body.innerText,
		chip: [...document.querySelectorAll('.chip')].map((c) => c.textContent).join('|')
	}));
	check('messages render after drop', rendered.msgs === 2, `${rendered.msgs} msgs`);
	check('dropped content visible', rendered.text.includes('hello from the drop test'));
	check('filename chip shows dropped name', rendered.chip.includes('session.jsonl'));
	check('no secrets banner on clean file', !(await page.$('.secrets')));

	// --- scenario 3: fresh page, drop a secret-bearing transcript -> banner
	const page2 = await browser.newPage();
	page2.on('pageerror', (e) => errors.push(e.message));
	await page2.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
	await dropFile(page2, JSONL_SECRET, 'leaky.jsonl');
	await page2.waitForSelector('.secrets', { timeout: 5000 }).catch(() => {});
	const banner = await page2.evaluate(() => document.querySelector('.secrets')?.textContent ?? '');
	check('secrets banner appears for credential-bearing drop', /potential secret/.test(banner), banner.slice(0, 60));

	// --- scenario 4: empty drop (no file in DataTransfer) is a no-op
	const page3 = await browser.newPage();
	await page3.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
	await page3.evaluate(() => {
		const zone = document.querySelector('.zone');
		zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: new DataTransfer() }));
	});
	await new Promise((r) => setTimeout(r, 400));
	check('empty drop keeps the drop zone (no crash, no render)', !!(await page3.$('.zone')));

	check('zero console/page errors across scenarios', errors.length === 0, errors.join('; ').slice(0, 200));
} finally {
	await browser.close();
	server?.kill();
}

if (failures.length) {
	console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`);
	process.exit(1);
}
console.log('\nall drop-regression checks passed');
