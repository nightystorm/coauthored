// Simple per-visitor rate limit kept in memory (the app runs as one server).
// Each visitor gets `limit` requests per `windowMs`; beyond that they get 429.
// Link-preview crawlers from X, LinkedIn, WhatsApp etc. are never limited,
// because a viral card means many of their fetches from the same addresses.
const PREVIEW_BOTS = /twitterbot|facebookexternalhit|facebot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|skypeuripreview|applebot|googlebot|bingbot|redditbot|mastodon|bluesky|embedly|iframely/i;

export function rateLimit({ limit, windowMs = 60_000, name }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (now - h.start > windowMs) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    if (PREVIEW_BOTS.test(req.get('user-agent') || '')) return next();
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || now - h.start > windowMs) {
      h = { start: now, count: 0 };
      hits.set(ip, h);
    }
    h.count += 1;
    if (h.count > limit) {
      const retry = Math.ceil((h.start + windowMs - now) / 1000);
      if (h.count === limit + 1) console.warn(`rate limit ${name}: ${ip}`);
      res.set('Retry-After', String(retry));
      return res.status(429).type('text').send('Too many requests. Try again in a minute.');
    }
    next();
  };
}
