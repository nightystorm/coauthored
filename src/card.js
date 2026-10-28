// Renders the 1200x630 share image (the size X, LinkedIn and WhatsApp use
// for link previews). Layout reads like a git diffstat.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

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

function diffstat(add, del, cells = 30) {
  const total = add + del || 1;
  const plus = Math.max(add ? 1 : 0, Math.round((add / total) * cells));
  return Array.from({ length: cells }, (_, i) =>
    h('div', { width: 14, height: 22, borderRadius: 3, background: i < plus ? C.add : C.del }),
  );
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
          h('div', { fontSize: 22, color: C.muted, fontFamily: 'Mono' }, `@${card.login}`),
        ),
      ),
      h('div', { fontFamily: 'Mono', fontSize: 22, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 14px' }, `${card.year}`),
    ),
    // Hero number
    h(
      'div',
      { flexDirection: 'column', marginTop: 40 },
      h('div', { fontSize: 168, fontWeight: 800, color: C.add, lineHeight: 1, letterSpacing: -6 }, `+${fmt(card.additions)}`),
      h('div', { fontSize: 36, fontWeight: 400, marginTop: 14 }, `lines of code shipped with Claude in ${card.year}`),
    ),
    // Footer: diffstat + monthly bars
    h(
      'div',
      { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' },
      h(
        'div',
        { flexDirection: 'column', gap: 14 },
        h(
          'div',
          { fontFamily: 'Mono', fontSize: 24, gap: 22 },
          h('div', {}, `${fmt(card.commits)} commits`),
          h('div', { color: C.muted }, '·'),
          h('div', {}, `${fmt(card.repos)} ${card.repos === 1 ? 'repo' : 'repos'}`),
          h('div', { color: C.muted }, '·'),
          h('div', { color: C.del }, `-${fmt(card.deletions)}`),
        ),
        h('div', { gap: 4 }, ...diffstat(card.additions, card.deletions)),
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
        h('div', { fontFamily: 'Mono', fontSize: 18, color: C.muted }, siteHost),
      ),
    ),
  );

  const frame = h('div', { width: 1200, height: 630, background: C.bg }, tree);
  const svg = await satori(frame, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
