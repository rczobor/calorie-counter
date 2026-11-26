import { mealCardMessages } from './mcpMealCard.messages'

/**
 * The meal preview card, an MCP App (https://modelcontextprotocol.io/extensions/apps):
 * hosts that support apps fetch this HTML once and show it in a sandboxed frame
 * beside each meal preview, filled from the tool's structured result. The
 * assistant then no longer has to draw the preview itself.
 *
 * The script is a string, not a stringified function: Convex bundles with
 * keepNames and minified identifiers, which would leave references to bundle
 * helpers in a function's source. Data reaches the page only through
 * `textContent`, never as markup: food and person names are typed by people.
 */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'

const script = String.raw`
const MESSAGES = ${JSON.stringify(mealCardMessages)};
const root = document.getElementById('card');
let context = {};
let result = null;
let failed = false;
let nextId = 1;
const pending = new Map();

function post(message) {
  window.parent.postMessage(Object.assign({ jsonrpc: '2.0' }, message), '*');
}
function request(method, params) {
  const id = nextId++;
  post({ id: id, method: method, params: params });
  return new Promise(function (resolve, reject) {
    pending.set(id, { resolve: resolve, reject: reject });
  });
}

// Most hosts send hostContext.locale; ChatGPT also mirrors the chat's
// language onto the frame's <html lang>.
function locale() {
  return context.locale || document.documentElement.lang || '';
}
function language() {
  return /^hu\b/i.test(locale()) ? 'hu' : 'en';
}
function intlTag() {
  if (language() === 'hu') return 'hu-HU';
  return /^en\b/i.test(locale()) ? locale() : 'en-US';
}
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, function (_, key) {
    return String(values[key]);
  });
}
function kcal(value) {
  return String(Math.round(value));
}
// The app's one date format: "Sun, Nov 8" or "nov. 8., vasárnap".
function formatDate(isoDate) {
  const parts = isoDate.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat(intlTag(), {
    weekday: language() === 'hu' ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyContext(next) {
  context = next;
  const html = document.documentElement;
  if (context.theme) html.dataset.theme = context.theme;
  html.lang = language();
  const variables = (context.styles && context.styles.variables) || {};
  for (const name in variables) {
    if (variables[name]) html.style.setProperty(name, variables[name]);
  }
  const fonts = context.styles && context.styles.css && context.styles.css.fonts;
  if (fonts && !document.getElementById('host-fonts')) {
    const style = el('style', '', fonts);
    style.id = 'host-fonts';
    document.head.appendChild(style);
  }
  render();
}

function render() {
  const t = MESSAGES[language()];
  root.replaceChildren();
  const preview = result && result.structuredContent;
  if (failed || (result && (result.isError || !preview))) {
    root.appendChild(el('p', 'status', t.failed));
    return;
  }
  if (!preview) {
    root.appendChild(el('p', 'status', t.loading));
    return;
  }
  const day = preview.projectedDailySummary;
  const header = el('header');
  const titles = el('div', 'titles');
  titles.appendChild(el('h1', '', preview.input.name || t.meal));
  const subtitle = [day && day.person, formatDate(preview.input.eatenOn)]
    .filter(Boolean)
    .join(' · ');
  titles.appendChild(el('p', 'subtitle', subtitle));
  header.appendChild(titles);
  const total = el('p', 'total');
  total.appendChild(el('span', 'figure', kcal(preview.totalCalories)));
  total.appendChild(el('span', 'unit', ' kcal'));
  header.appendChild(total);
  root.appendChild(header);

  const list = el('ul', 'items');
  for (const item of preview.items) {
    const row = el('li');
    const name = el('span', 'name');
    name.appendChild(el('span', '', item.name));
    if (item.nutritionProvenance && item.nutritionProvenance.kind === 'estimate')
      name.appendChild(el('span', 'tag estimate', t.estimated));
    if (item.missingMacros) name.appendChild(el('span', 'tag warning', t.noMacros));
    row.appendChild(name);
    row.appendChild(
      el('span', 'amount', item.consumedWeightGrams === undefined
        ? ''
        : Math.round(item.consumedWeightGrams) + ' g'),
    );
    row.appendChild(el('span', 'kcal', kcal(item.calories)));
    list.appendChild(row);
  }
  root.appendChild(list);

  const macros = preview.macros;
  if (macros && macros.coveredCalories > 0) {
    const line = el('p', 'macros');
    line.textContent = [
      t.protein + ' ' + Math.round(macros.proteinG) + ' g',
      t.carbs + ' ' + Math.round(macros.carbsG) + ' g',
      t.fat + ' ' + Math.round(macros.fatG) + ' g',
    ].join(' · ');
    root.appendChild(line);
  }

  if (day && day.goalKcal > 0) {
    // The app's day bar: the day so far in the left colour, this meal at full
    // strength after the earlier meals, and only the part over the goal in
    // berry, with a tick at the goal.
    const goal = day.goalKcal;
    const after = day.consumedCalories;
    const before = Math.min(
      after,
      preview.dailySummary ? preview.dailySummary.consumedCalories : 0,
    );
    const scale = Math.max(goal, after);
    const section = el('section', 'day');
    const bar = el('div', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    const track = el('div', 'track');
    function stretch(className, from, to) {
      const group = el('span', className);
      group.style.width = (100 * (to - from)) / scale + '%';
      const left = Math.max(0, Math.min(to, goal) - from);
      if (left > 0) group.appendChild(el('span', 'left')).style.flexGrow = left;
      if (to > goal)
        group.appendChild(el('span', 'over')).style.flexGrow = to - Math.max(from, goal);
      return group;
    }
    if (before > 0) track.appendChild(stretch('earlier', 0, before));
    if (after > before) track.appendChild(stretch('meal', before, after));
    bar.appendChild(track);
    if (after > goal) {
      const tick = el('span', 'tick');
      tick.style.left = (100 * goal) / scale + '%';
      bar.appendChild(tick);
    }
    section.appendChild(bar);
    const line = el('p', 'day-line');
    line.appendChild(
      el('span', '', fill(t.dayTotal, {
        consumed: kcal(day.consumedCalories),
        goal: kcal(day.goalKcal),
      })),
    );
    line.appendChild(
      el('span', day.remainingCalories < 0 ? 'remaining over' : 'remaining',
        day.remainingCalories < 0
          ? fill(t.over, { n: kcal(-day.remainingCalories) })
          : fill(t.left, { n: kcal(day.remainingCalories) })),
    );
    section.appendChild(line);
    root.appendChild(section);
  }
}

window.addEventListener('message', function (event) {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.id !== undefined && !message.method) {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(message.error);
    else waiting.resolve(message.result);
    return;
  }
  switch (message.method) {
    case 'ui/notifications/tool-result':
      result = message.params || null;
      render();
      break;
    case 'ui/notifications/tool-cancelled':
      failed = true;
      render();
      break;
    case 'ui/notifications/host-context-changed':
      applyContext(Object.assign({}, context, message.params));
      break;
    case 'ui/resource-teardown':
    case 'ping':
      if (message.id !== undefined) post({ id: message.id, result: {} });
      break;
  }
});

let lastSize = '';
new ResizeObserver(function () {
  const box = document.documentElement.getBoundingClientRect();
  const size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
  if (JSON.stringify(size) === lastSize) return;
  lastSize = JSON.stringify(size);
  post({ method: 'ui/notifications/size-changed', params: size });
}).observe(document.documentElement);

render();
request('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: { name: 'calorie-counter-meal-card', version: '1.0.0' },
  appCapabilities: { availableDisplayModes: ['inline'] },
}).then(
  function (initialized) {
    applyContext((initialized && initialized.hostContext) || {});
    post({ method: 'ui/notifications/initialized', params: {} });
  },
  function () {
    failed = true;
    render();
  },
);
`

// Host variables win where a host sends them; the fallbacks are the app's own
// tokens (src/styles.css), so the card still looks like the app elsewhere.
const style = `
:root {
  color-scheme: light dark;
  --caution: light-dark(oklch(0.52 0.11 85), oklch(0.85 0.13 92));
  --left: light-dark(oklch(0.5 0.09 192), oklch(0.8 0.11 188));
  --left-bar: light-dark(oklch(0.58 0.1 192), oklch(0.72 0.11 190));
  --over: light-dark(oklch(0.5 0.13 5), oklch(0.8 0.085 5));
  --over-bar: light-dark(oklch(0.6 0.11 5), oklch(0.8 0.11 5));
  --danger: var(--color-text-danger, light-dark(oklch(0.55 0.21 27), oklch(0.7 0.18 22)));
  --text: var(--color-text-primary, light-dark(oklch(0.17 0.004 286), oklch(0.98 0.002 286)));
  --muted: var(--color-text-secondary, light-dark(oklch(0.47 0.008 286), oklch(0.75 0.008 286)));
  --line: var(--color-border-tertiary, light-dark(oklch(0.885 0.005 286), oklch(0.34 0.0034 286)));
  --track: light-dark(oklch(0.925 0.006 286), oklch(0.349 0.0034 286));
}
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: transparent;
  color: var(--text);
  font: 15px/1.35 var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif);
  font-variant-numeric: tabular-nums;
}
#card { max-width: 520px; padding: 14px 16px; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
h1 { font-size: 17px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.subtitle, .status, .macros, .day-line { color: var(--muted); font-size: 13px; }
.subtitle { margin-top: 2px; }
.total { white-space: nowrap; }
.total .figure { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.total .unit { color: var(--muted); font-size: 13px; }
.items { list-style: none; margin-top: 10px; border-top: 1px solid var(--line); }
.items li {
  display: grid; grid-template-columns: 1fr auto 4ch; gap: 12px; align-items: baseline;
  padding: 8px 0; border-bottom: 1px solid var(--line);
}
.name { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; overflow-wrap: anywhere; }
.amount { color: var(--muted); font-size: 13px; text-align: right; }
.kcal { text-align: right; }
.tag { font-size: 12px; font-weight: 500; }
.tag.estimate { color: var(--caution); }
.tag.warning { color: var(--danger); }
.macros { margin-top: 10px; }
.day { margin-top: 12px; }
.bar { position: relative; }
.track { display: flex; gap: 2px; height: 6px; border-radius: 999px; overflow: hidden; background: var(--track); }
.track > span { display: flex; min-width: 4px; }
.track .left { background: var(--left-bar); }
.track .over { background: var(--over-bar); min-width: 6px; }
.track .earlier .left { opacity: 0.4; }
.tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 999px; background: var(--muted); }
.day-line { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; }
.remaining { color: var(--left); font-weight: 500; }
.remaining.over { color: var(--over); }
`

export const mealCardHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${style}</style>
</head>
<body>
<main id="card" aria-live="polite"></main>
<script>${script}</script>
</body>
</html>
`

// Hosts cache the card by its URI (ChatGPT: "treat the resource URI as a
// cache key"), so the URI carries a hash of the HTML and changes with it.
function fnv1a(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(36)
}
export const MEAL_CARD_URI = `ui://calorie-counter/meal-card-${fnv1a(mealCardHtml)}.html`
