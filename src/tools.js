// AI coding tools we recognise in "Co-authored-by:" lines.
// Patterns are tested against "Name <email>" with any "(model)" part removed,
// so "Kiro (Claude Opus 5.5)" counts as Kiro and "opencode (glm-5)" as opencode.
// Formats checked against real public commits in Oct 2026. Names that are
// also human first names (Devin, Kimi, Junie, Jules) match on email only.
export const TOOLS = [
  { id: 'claude', name: 'Claude', color: '#e0a35c', match: /^claude\b|@anthropic\.com/i },
  { id: 'cursor', name: 'Cursor', color: '#7aa2f7', match: /^cursor\b|@cursor\.(com|sh)/i },
  { id: 'copilot', name: 'GitHub Copilot', color: '#b48ead', match: /^copilot\b|\+copilot@users\.noreply/i },
  { id: 'codex', name: 'OpenAI Codex', color: '#c0caf5', match: /^codex\b|@openai\.com/i },
  { id: 'gemini', name: 'Gemini', color: '#4fc1c9', match: /^gemini\b|gemini-code-assist/i },
  { id: 'jules', name: 'Jules', color: '#9ccfd8', match: /google-labs-jules/i },
  { id: 'kimi', name: 'Kimi', color: '#f6c177', match: /@moonshot\.(ai|cn)|moonshot-agent/i },
  { id: 'qwen', name: 'Qwen', color: '#c4a7e7', match: /^qwen\b|@alibaba|@qwen/i },
  { id: 'deepseek', name: 'DeepSeek', color: '#6e9fff', match: /^deepseek\b|@deepseek\.com/i },
  { id: 'glm', name: 'GLM', color: '#eb6f92', match: /^glm\b|@z\.ai|zai-org@/i },
  { id: 'grok', name: 'Grok', color: '#d7d7cf', match: /^grok\b|@x\.ai|grok-by-xai/i },
  { id: 'aider', name: 'Aider', color: '#a3be8c', match: /^aider\b|@aider\.chat/i },
  { id: 'amp', name: 'Amp', color: '#ff9e64', match: /^amp\s*(<|$)|@ampcode\.com>/i },
  { id: 'opencode', name: 'opencode', color: '#89ddff', match: /^opencode\b|@opencode\.ai/i },
  { id: 'devin', name: 'Devin', color: '#73daca', match: /devin-ai-integration|@cognition\.ai/i },
  { id: 'windsurf', name: 'Windsurf', color: '#2ac3de', match: /^windsurf\b|@windsurf\.com|@codeium\.com/i },
  { id: 'droid', name: 'Factory Droid', color: '#e0af68', match: /factory-droid|@factory\.ai/i },
  { id: 'junie', name: 'Junie', color: '#ff7a93', match: /junie@jetbrains\.com|junie@air\.dev/i },
  { id: 'cline', name: 'Cline', color: '#bb9af7', match: /^cline\b|@cline\.bot/i },
  { id: 'kiro', name: 'Kiro', color: '#9d7cd8', match: /kiro-agent|@kiro\.dev/i },
  { id: 'augment', name: 'Augment', color: '#7dcfff', match: /@augmentcode\.com/i },
  { id: 'zed', name: 'Zed Agent', color: '#a9b1d6', match: /agent@zed\.dev/i },
];

const TRAILER = /^co-authored-by:\s*(.+)$/gim;

// Returns the tools credited in a commit message (each at most once).
export function toolsInMessage(message) {
  const found = new Set();
  for (const [, who] of message.matchAll(TRAILER)) {
    const clean = who.replace(/\s*\([^)]*\)/g, '').trim();
    const tool = TOOLS.find((t) => t.match.test(clean));
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
