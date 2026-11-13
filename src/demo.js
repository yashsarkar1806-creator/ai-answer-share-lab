// Synthetic demo data for a FICTIONAL AI meeting note-taker brand ("Murmur").
// All brands, engines, domains and answers are made up. Generated with a fixed seed.

export const DEMO_BRANDS = [
  { name: 'Murmur', aliases: ['Murmur AI', 'Murmur Notes'], isOwn: true },
  { name: 'Notewise', aliases: [] },
  { name: 'Scribbly', aliases: [] },
  { name: 'TalkTrail', aliases: ['Talk Trail'] },
];

export const DEMO_CATEGORY = { category: 'AI meeting note-taker', audience: 'small remote teams', useCases: ['sales calls', 'Hindi and English meetings', 'customer interviews'] };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PROMPTS = [
  ['Discovery', 'What is the best AI meeting note-taker for small remote teams?'],
  ['Discovery', 'Which AI meeting note-taker tools do people recommend in 2026?'],
  ['Discovery', 'What are the top alternatives in AI meeting note-takers?'],
  ['Comparison', 'Compare the leading AI meeting note-takers on price and features.'],
  ['Comparison', 'Which AI meeting note-taker is most affordable for small remote teams?'],
  ['Comparison', 'Which AI meeting note-taker has the best reviews?'],
  ['Problem', 'How do I choose an AI meeting note-taker for small remote teams?'],
  ['Problem', 'What should I avoid when buying an AI meeting note-taker?'],
  ['Trust', 'Which AI meeting note-taker is the most trusted and secure?'],
  ['Use case', 'What is the best AI meeting note-taker for sales calls?'],
  ['Use case', 'What is the best AI meeting note-taker for Hindi and English meetings?'],
  ['Use case', 'What is the best AI meeting note-taker for customer interviews?'],
];

const ENGINES = ['Assistant A', 'Assistant B', 'Assistant C'];

const PHRASES = {
  Murmur: { pos: ['Murmur is easy to set up and its summaries are accurate.', 'Murmur stands out for mixed Hindi-English calls and is affordable for small teams.', 'Many reviewers recommend Murmur for fast, intuitive action items.'], neg: ['Murmur is still limited on CRM integrations.', 'Some users find Murmur slow on long recordings.'] },
  Notewise: { pos: ['Notewise is a popular, reliable choice with strong integrations.', 'Notewise is trusted by larger teams and has excellent search.'], neg: ['Notewise can get expensive as the team grows.', 'Notewise lacks good support for Indian languages.'] },
  Scribbly: { pos: ['Scribbly has a generous free plan and is easy to use.', 'Scribbly is a solid budget pick.'], neg: ['Scribbly summaries can be inaccurate with accents.', 'Scribbly feels clunky for sales teams.'] },
  TalkTrail: { pos: ['TalkTrail is great for sales calls with deal-coaching features.', 'TalkTrail is a leading option for revenue teams.'], neg: ['TalkTrail is pricey for small teams.', 'TalkTrail has a steep learning curve.'] },
};

const DOMAINS = ['toolreviews.example', 'saasgrid.example', 'remoteteams-blog.example', 'forum.worktalk.example', 'murmur.example', 'notewise.example', 'videotech-news.example'];

// Base visibility of each brand by intent; Murmur improves in the second snapshot on the gaps it targeted.
const VIS = {
  Murmur: { Discovery: 0.35, Comparison: 0.3, Problem: 0.2, Trust: 0.15, 'Use case': 0.45 },
  Notewise: { Discovery: 0.85, Comparison: 0.8, Problem: 0.6, Trust: 0.75, 'Use case': 0.55 },
  Scribbly: { Discovery: 0.55, Comparison: 0.7, Problem: 0.4, Trust: 0.3, 'Use case': 0.35 },
  TalkTrail: { Discovery: 0.45, Comparison: 0.5, Problem: 0.3, Trust: 0.35, 'Use case': 0.5 },
};
const ENGINE_BIAS = { 'Assistant A': 1.0, 'Assistant B': 0.75, 'Assistant C': 1.15 };

export function generateDemo(seed = 20261113) {
  const r = rng(seed);
  const rows = [];
  for (const [snapshot, lift] of [['2026-10-16', 0], ['2026-11-13', 0.3]]) {
    for (const [intent, prompt] of PROMPTS) {
      for (const engine of ENGINES) {
        const named = [];
        for (const b of DEMO_BRANDS) {
          let p = VIS[b.name][intent] * (b.isOwn ? ENGINE_BIAS[engine] : 1);
          if (b.isOwn) p += lift * (intent === 'Comparison' || intent === 'Problem' || intent === 'Discovery' ? 1 : 0.4);
          if (prompt.includes('Hindi') && b.isOwn) p += 0.35;
          if (prompt.includes('sales') && b.name === 'TalkTrail') p += 0.4;
          if (r() < Math.min(0.97, p)) named.push(b.name);
        }
        named.sort(() => r() - 0.5);
        const parts = [named.length ? `Here are options worth a look for this question.` : `It depends on your needs; look for accurate transcription, clear pricing and good privacy controls.`];
        for (const n of named) {
          const pool = r() < (n === 'Murmur' ? 0.75 : 0.65) ? PHRASES[n].pos : PHRASES[n].neg;
          parts.push(pool[Math.floor(r() * pool.length)]);
        }
        const cites = DOMAINS.filter((d) => {
          if (d === 'murmur.example') return named.includes('Murmur') && r() < 0.35;
          if (d === 'notewise.example') return named.includes('Notewise') && r() < 0.35;
          if (d === 'toolreviews.example') return r() < (named.includes('Murmur') ? 0.25 : 0.55);
          if (d === 'saasgrid.example') return r() < 0.35;
          if (d === 'forum.worktalk.example') return r() < (named.includes('Murmur') ? 0.15 : 0.35);
          return r() < 0.15;
        });
        if (cites.length) parts.push(`Sources: ${cites.map((d) => `https://${d}/ai-note-takers`).join(' ')}`);
        rows.push({ snapshot, engine, intent, prompt, answer: parts.join(' ') });
      }
    }
  }
  return rows;
}
