// Renders the 1200x630 share image (the size X, LinkedIn and WhatsApp use
// for link previews). Layout reads like a git diffstat.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { cardTools, headlineTool } from './tools.js';

const require = createRequire(import.meta.url);
const font = (pkg, file) => fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
const fonts = [
  { name: 'Bricolage', data: font('bricolage-grotesque', 'bricolage-grotesque-latin-400-normal.woff'), weight: 400 },
  { name: 'Bricolage', data: font('bricolage-grotesque', 'bricolage-grotesque-latin-700-normal.woff'), weight: 700 },
  { name: 'Bricolage', data: font('bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff'), weight: 800 },
  { name: 'Mono', data: font('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400 },
  { name: 'Mono', data: font('jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'), weight: 700 },
];

const C = {
  bg: '#141612',
  panel: '#1c1f1a',
  line: '#2b3029',
  text: '#ecebe4',
  muted: '#8f958a',
  add: '#5fd38d',
  del: '#f07167',
};

const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children },
});
const fmt = (n) => n.toLocaleString('en-US');
const MONTHS = 'JFMAMJJASOND'.split('');

async function avatarData(url) {
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}s=160`);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Stacked bar of lines per tool, plus a legend with the top tools.
function toolSplit(card, width = 600) {
  const list = cardTools(card);
  const shown = list.slice(0, 4);
  const rest = list.slice(4);
  if (rest.length) {
    shown.push({ id: 'other', name: `+${rest.length} more`, color: C.muted, share: rest.reduce((s, t) => s + t.share, 0) });
  }
  const gap = 3;
  const usable = width - gap * (shown.length - 1);
  return h(
    'div',
    { flexDirection: 'column', gap: 12 },
    h('div', { gap, width }, ...shown.map((t) => h('div', { width: Math.max(6, Math.round(usable * t.share)), height: 22, borderRadius: 4, background: t.color }))),
    h(
      'div',
      { gap: 22, fontFamily: 'Mono', fontSize: 19 },
      ...shown.map((t) =>
        h('div', { alignItems: 'center', gap: 8 }, h('div', { width: 12, height: 12, borderRadius: 3, background: t.color }), h('div', {}, `${t.name} ${Math.max(1, Math.round(t.share * 100))}%`)),
      ),
    ),
  );
}

// The four "Wrapped" stats. Cards saved before these existed show none.
export function statColumns(card) {
  const cols = [];
  if (card.totalCommits) cols.push([`${Math.max(1, Math.round((card.commits / card.totalCommits) * 100))}%`, 'of my commits had AI']);
  if (card.activeDays) cols.push([fmt(card.activeDays), card.activeDays === 1 ? 'active day' : 'active days']);
  if (card.longestStreak) cols.push([`${card.longestStreak} ${card.longestStreak === 1 ? 'day' : 'days'}`, 'longest streak']);
  if (card.busiestDay) cols.push([shortDate(card.busiestDay.date), `best day, +${fmt(card.busiestDay.additions)}`]);
  return cols;
}

export function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1]}`;
}

export async function renderCard(card, siteHost) {
  const avatar = card.avatarUrl ? await avatarData(card.avatarUrl) : null;
  const max = Math.max(...card.months, 1);
  const thisMonth = card.year === new Date().getUTCFullYear() ? new Date().getUTCMonth() : 11;

  const tree = h(
    'div',
    { width: 1072, height: 518, margin: '56px 64px', color: C.text, fontFamily: 'Bricolage', flexDirection: 'column' },
    // Header: who
    h(
      'div',
      { alignItems: 'center', justifyContent: 'space-between' },
      h(
        'div',
        { alignItems: 'center', gap: 20 },
        avatar
          ? { type: 'img', props: { src: avatar, width: 72, height: 72, style: { borderRadius: 36, border: `2px solid ${C.line}` } } }
          : h('div', { width: 72, height: 72, borderRadius: 36, background: C.panel }),
        h(
          'div',
          { flexDirection: 'column' },
          h('div', { fontSize: 34, fontWeight: 700 }, card.name || card.login),
          h('div', { fontSize: 22, color: C.muted, fontFamily: 'Mono' }, `@${card.handle || card.login}`),
        ),
      ),
      h(
        'div',
        { gap: 12, alignItems: 'center' },
        ...(card.rank
          ? [h('div', { fontFamily: 'Mono', fontSize: 22, fontWeight: 700, color: C.bg, background: C.add, borderRadius: 8, padding: '8px 14px' }, `Top ${card.rank}%`)]
          : []),
        h('div', { fontFamily: 'Mono', fontSize: 22, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 14px' }, `${card.year} Wrapped`),
      ),
    ),
    // Hero number
    h(
      'div',
      { flexDirection: 'column', marginTop: 22 },
      h('div', { fontSize: 140, fontWeight: 800, color: C.add, lineHeight: 1, letterSpacing: -5 }, `+${fmt(card.additions)}`),
      h('div', { fontSize: 30, fontWeight: 400, marginTop: 8 }, `lines of code shipped with ${headlineTool(card)} in ${card.year}`),
    ),
    // Wrapped-style stats
    ...(statColumns(card).length
      ? [h('div', { marginTop: 26, gap: 48 }, ...statColumns(card).map(([value, label]) =>
          h('div', { flexDirection: 'column', gap: 2 },
            h('div', { fontSize: 40, fontWeight: 700, lineHeight: 1.1 }, value),
            h('div', { fontFamily: 'Mono', fontSize: 17, color: C.muted }, label)),
        ))]
      : []),
    // Footer: diffstat + monthly bars
    h(
      'div',
      { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' },
      h(
        'div',
        { flexDirection: 'column', gap: 14 },
        h(
          'div',
          { fontFamily: 'Mono', fontSize: 20, gap: 18 },
          h('div', {}, `${fmt(card.commits)} commits`),
          h('div', { color: C.muted }, '·'),
          h('div', {}, `${fmt(card.repos)} ${card.repos === 1 ? 'repo' : 'repos'}`),
          h('div', { color: C.muted }, '·'),
          h('div', { color: C.del }, `-${fmt(card.deletions)}`),
        ),
        toolSplit(card),
      ),
      h(
        'div',
        { flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
        h(
          'div',
          { gap: 6, alignItems: 'flex-end', height: 90 },
          ...card.months.map((v, i) =>
            h(
              'div',
              { flexDirection: 'column', alignItems: 'center', gap: 6 },
              h('div', {
                width: 18,
                height: Math.max(3, Math.round((v / max) * 64)),
                borderRadius: 3,
                background: i > thisMonth ? C.line : v ? C.add : C.line,
                opacity: i > thisMonth ? 0.4 : 1,
              }),
              h('div', { fontFamily: 'Mono', fontSize: 13, color: C.muted }, MONTHS[i]),
            ),
          ),
        ),
        h('div', { fontFamily: 'Mono', fontSize: 18, color: C.muted }, `${card.selfCounted ? 'incl. self-counted repos · ' : ''}${siteHost}`),
      ),
    ),
  );

  const frame = h('div', { width: 1200, height: 630, background: C.bg }, tree);
  const svg = await satori(frame, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
