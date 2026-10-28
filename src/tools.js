// AI coding tools we recognise in "Co-authored-by:" lines.
// Each pattern is tested against the full "Name <email>" text of the line.
// Add a tool by adding a row; order matters only when patterns overlap.
export const TOOLS = [
  { id: 'claude', name: 'Claude', color: '#e0a35c', match: /\bclaude\b|@anthropic\.com/i },
  { id: 'cursor', name: 'Cursor', color: '#7aa2f7', match: /^cursor\b|@cursor\.(com|sh)/i },
  { id: 'copilot', name: 'GitHub Copilot', color: '#b48ead', match: /\bcopilot\b/i },
  { id: 'codex', name: 'OpenAI Codex', color: '#c0caf5', match: /\bcodex\b|@openai\.com|\bchatgpt\b/i },
  { id: 'gemini', name: 'Gemini', color: '#4fc1c9', match: /\bgemini\b/i },
  { id: 'jules', name: 'Jules', color: '#9ccfd8', match: /\bjules\b/i },
  { id: 'kimi', name: 'Kimi', color: '#f6c177', match: /\bkimi\b|moonshot/i },
  { id: 'qwen', name: 'Qwen', color: '#c4a7e7', match: /\bqwen\b/i },
  { id: 'glm', name: 'GLM', color: '#eb6f92', match: /\bglm\b|zhipu|z\.ai/i },
  { id: 'grok', name: 'Grok', color: '#d7d7cf', match: /\bgrok\b|@x\.ai/i },
  { id: 'aider', name: 'Aider', color: '#a3be8c', match: /\baider\b/i },
  { id: 'amp', name: 'Amp', color: '#ff9e64', match: /@ampcode\.com|^amp\s*</i },
  { id: 'opencode', name: 'opencode', color: '#89ddff', match: /\bopencode\b/i },
  { id: 'devin', name: 'Devin', color: '#73daca', match: /\bdevin\b/i },
  { id: 'windsurf', name: 'Windsurf', color: '#2ac3de', match: /windsurf|codeium/i },
  { id: 'droid', name: 'Factory Droid', color: '#e0af68', match: /factory\.ai|\bfactory-droid\b|^droid\s*</i },
  { id: 'junie', name: 'Junie', color: '#ff7a93', match: /\bjunie\b/i },
  { id: 'cline', name: 'Cline', color: '#bb9af7', match: /\bcline\b/i },
  { id: 'kiro', name: 'Kiro', color: '#9d7cd8', match: /\bkiro\b/i },
  { id: 'augment', name: 'Augment', color: '#7dcfff', match: /augmentcode|\baugment agent\b/i },
];

const TRAILER = /^co-authored-by:\s*(.+)$/gim;

// Returns the tools credited in a commit message (each at most once).
export function toolsInMessage(message) {
  const found = new Set();
  for (const [, who] of message.matchAll(TRAILER)) {
    const tool = TOOLS.find((t) => t.match.test(who.trim()));
    if (tool) found.add(tool.id);
  }
  return [...found];
}

export const toolById = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

// Tool split for a saved card. Cards saved before multi-tool support were Claude only.
export function cardTools(card) {
  const list = card.tools?.length ? card.tools : [{ id: 'claude', name: 'Claude', commits: card.commits, additions: card.additions }];
  const total = list.reduce((s, t) => s + t.additions, 0) || 1;
  return list.map((t) => ({ ...t, color: toolById[t.id]?.color || '#8f958a', share: t.additions / total }));
}

// "Claude" when one tool did it all, otherwise "AI".
export function headlineTool(card) {
  const list = cardTools(card);
  return list.length === 1 ? list[0].name : 'AI';
}

// Short split for share text, e.g. "Claude 92%, Cursor 8%".
export function splitText(card, max = 3) {
  const list = cardTools(card);
  if (list.length < 2) return '';
  return list.slice(0, max).map((t) => `${t.name} ${Math.max(1, Math.round(t.share * 100))}%`).join(', ');
}
