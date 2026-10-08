// Drives the interface in headless Chromium against two real nodes.
// Needs a `chromium` binary on PATH. Screenshots land in a temp dir
// (printed at the end).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVoid, sleep } from './helpers.js';

const DEBUG_PORT = 9334;
const out = mkdtempSync(path.join(tmpdir(), 'ghost_net-e2e-'));
const void_ = createVoid();
const log = (message) => console.log('✓', message);

const chromium = spawn(process.env.CHROMIUM || 'chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${out}/profile`, `--remote-debugging-port=${DEBUG_PORT}`, 'about:blank'
], { stdio: 'ignore' });

let failed = false;
const errors = [];

try {
  const a = await void_.start({ TRANSMISSION_LIFETIME: '3600' });
  const b = await void_.start({ TRANSMISSION_LIFETIME: '3600', BOOTSTRAP_NODES: a.peerUrl });
  await void_.entangled(b, 1);

  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const pages = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      target = pages.find((page) => page.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('chromium did not start');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });

  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id) pending.get(data.id)?.(data);
    if (data.method === 'Runtime.exceptionThrown') {
      errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      errors.push('console: ' + data.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
      errors.push(`log: ${data.params.entry.text} ${data.params.entry.url ?? ''}`);
    }
  };

  const cdp = (method, params = {}) => new Promise((resolve) => {
    pending.set(++nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
  const evaluate = async (expression) => {
    const reply = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result.exceptionDetails) {
      throw new Error(`${expression} → ${reply.result.exceptionDetails.exception?.description}`);
    }
    return reply.result.result.value;
  };
  const wait = async (expression, what = expression) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error('timeout: ' + what);
  };
  const shot = async (name) => {
    await sleep(600);
    const reply = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}.png`, Buffer.from(reply.result.data, 'base64'));
  };
  const viewport = (width, height, mobile = false) =>
    cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent.trim()`);

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Log.enable');
  await viewport(1280, 900);

  // --- node B's interface -------------------------------------------------
  await cdp('Page.navigate', { url: b.http });
  await wait(`document.querySelector('#linkStatus')?.dataset.state === 'open'`, 'tunnel open');
  await wait(`document.querySelector('#nodeId').textContent.includes(${JSON.stringify(b.id.slice(0, 8))})`, 'node id shown');
  log(`identity rendered: ${await text('#nodeId')}`);

  const sigil = await text('#nodeSigil');
  if (sigil.replace(/\s/g, '').length < 9) throw new Error('sigil not drawn: ' + JSON.stringify(sigil));
  log('sigil drawn from the node id');

  await wait(`document.querySelectorAll('#peerGrid .peer').length === 1`, 'one peer card');
  await wait(`/\\d ms/.test(document.querySelector('#peerGrid .peer').textContent)`, 'measured latency on the peer card');
  log(`peer card: ${(await text('#peerGrid .peer')).replace(/\s+/g, ' ')}`);

  await wait(`Number(document.querySelector('#entanglementValue').textContent) > 0`, 'entanglement reading');
  await wait(`Number(document.querySelector('#resonanceValue').textContent) > 0`, 'resonance reading');
  log(`metrics live: consciousness ${await text('#consciousnessValue')}, stability ${await text('#stabilityValue')}, resonance ${await text('#resonanceValue')}, entanglement ${await text('#entanglementValue')}`);

  const painted = await evaluate(`(() => {
    const canvas = document.querySelector('#consciousnessCanvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
    return lit;
  })()`);
  if (painted < 50) throw new Error('consciousness chart is blank');
  log(`consciousness chart drawn (${painted} lit pixels)`);

  if (!(await text('#transmissions')).includes('silent')) throw new Error('expected the empty-stream message');
  log('empty stream says so');

  // --- post from the textarea --------------------------------------------
  const payload = '<img src=x onerror="window.__pwned=1"> hello <b>void</b>';
  await evaluate(`(() => {
    const input = document.querySelector('#transmissionInput');
    input.value = ${JSON.stringify(payload)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#transmitButton').click();
  })()`);
  await wait(`document.querySelectorAll('#transmissions .transmission').length === 1`, 'own transmission rendered');

  if ((await text('#transmissions .transmission-content')) !== payload) throw new Error('content not shown verbatim');
  const injected = await evaluate(`!!window.__pwned || document.querySelectorAll('#transmissions img, #transmissions b').length > 0`);
  if (injected) throw new Error('transmission content was interpreted as HTML');
  log('posted from the textarea; markup shown as text, not executed');

  if ((await evaluate(`document.querySelector('#transmissionInput').value`)) !== '') throw new Error('input not cleared');
  if (!(await evaluate(`document.querySelector('#transmissions .transmission').classList.contains('own')`))) throw new Error('own transmission not marked');
  await sleep(2300);
  if ((await evaluate(`document.querySelectorAll('#transmissions .transmission').length`)) !== 1) throw new Error('own transmission duplicated by the live feed');
  log('input cleared, marked as this node, not duplicated by the live feed');

  // --- a transmission from the other node arrives live --------------------
  const remote = (await void_.transmit(a, 'an echo from another node')).body.transmission;
  await wait(`document.querySelectorAll('#transmissions .transmission').length === 2`, 'relayed transmission rendered');
  const first = await text('#transmissions .transmission:first-child .transmission-content');
  if (first !== remote.content) throw new Error('newest transmission is not on top');
  if (!(await text('#transmissions .transmission:first-child .transmission-author')).startsWith(a.id.slice(0, 8))) throw new Error('wrong author shown');
  await wait(`Number(document.querySelector('#voidEchoValue').textContent) === 0.5`, 'void echo = 0.500');
  log('relayed transmission from node A appeared live, newest first, void echo 0.500');
  await shot('1-desktop');

  // --- enter key, limits, error overlay -----------------------------------
  await evaluate(`(() => {
    const input = document.querySelector('#transmissionInput');
    input.value = 'sent with enter';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
  await wait(`document.querySelectorAll('#transmissions .transmission').length === 3`, 'enter sends');
  log('enter key sends');

  await void_.stop(b);
  await wait(`document.querySelector('#linkStatus').dataset.state === 'severed'`, 'severed status');
  await evaluate(`(() => {
    document.querySelector('#transmissionInput').value = 'into nothing';
    document.querySelector('#transmitButton').click();
  })()`);
  await wait(`!document.querySelector('#quantumError').hidden`, 'error overlay');
  log(`node stopped: status "${await text('#linkStatus')}", overlay "${await text('#quantumErrorMessage')}"`);
  await evaluate(`document.querySelector('.error-dismiss').click()`);
  await wait(`document.querySelector('#quantumError').hidden`, 'overlay dismissed');
  errors.length = 0; // failed requests against a stopped node are expected here

  // --- reload on node A: history comes from the node -----------------------
  await cdp('Page.navigate', { url: a.http });
  await wait(`document.querySelector('#linkStatus')?.dataset.state === 'open'`, 'tunnel open on A');
  await wait(`document.querySelectorAll('#transmissions .transmission').length === 3`, 'history on A');
  const order = await evaluate(`[...document.querySelectorAll('#transmissions .transmission-content')].map(e => e.textContent)`);
  if (order[0] !== 'sent with enter' || order[2] !== payload) throw new Error('history out of order: ' + JSON.stringify(order));
  await wait(`document.querySelector('#peerGrid').textContent.includes('alone')`, 'no-peer message');
  log('node A shows all three transmissions in order, and that it is alone now');

  // --- phone width ---------------------------------------------------------
  await viewport(390, 800, true);
  await sleep(300);
  const overflow = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  if (overflow > 0) throw new Error(`page overflows horizontally by ${overflow}px at 390px`);
  log('no horizontal overflow at 390px');
  await shot('2-phone');

  if (errors.length > 0) throw new Error('page errors:\n  ' + errors.join('\n  '));
  log('no console errors or page exceptions');
} catch (error) {
  failed = true;
  console.error('✗', error.message);
  if (errors.length > 0) console.error('  page errors:\n  ' + errors.join('\n  '));
} finally {
  chromium.kill();
  await void_.close();
  console.log(`screenshots: ${out}`);
  process.exit(failed ? 1 : 0);
}
