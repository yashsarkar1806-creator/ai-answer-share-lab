// AI Answer Share Lab — core analysis (pure functions, no DOM).
// Works in the browser (ES module) and in Node for tests.

const POS_WORDS = ['best','great','excellent','reliable','accurate','recommend','recommended','top','favourite','favorite','easy','affordable','fast','strong','loved','popular','standout','solid','leading','trusted','secure','intuitive','generous'];
const NEG_WORDS = ['expensive','pricey','slow','buggy','limited','clunky','inaccurate','avoid','weak','confusing','outdated','complaints','unreliable','lacks','missing','worse','poor','privacy concerns','steep'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a matcher for a brand and its aliases (whole-word, case-insensitive). */
export function brandMatcher(brand) {
  const names = [brand.name, ...(brand.aliases || [])].filter(Boolean).map((n) => n.trim()).filter(Boolean);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return re;
}

/** Find all mentions of a brand in text: returns array of character indices. */
export function findMentions(text, brand) {
  const re = brandMatcher(brand);
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m.index);
  return out;
}

/** Extract cited domains from URLs or bare domains in an answer. */
export function extractDomains(text) {
  const found = new Set();
  const re = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s)\]]*)?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const d = m[1].toLowerCase();
    // skip things like "e.g" or version numbers – require a letter TLD and at least one dot
    if (/^\d+(\.\d+)+$/.test(d)) continue;
    found.add(d);
  }
  return [...found];
}

/** Split text into sentences (simple, good enough for answer text). */
export function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Lexicon sentiment of the sentences that mention a brand: -1..1, or null if none. */
export function mentionSentiment(text, brand) {
  const re = brandMatcher(brand);
  let pos = 0, neg = 0, n = 0;
  for (const s of sentences(text)) {
    re.lastIndex = 0;
    if (!re.test(s)) continue;
    n++;
    const low = s.toLowerCase();
    for (const w of POS_WORDS) if (new RegExp(`\\b${escapeRe(w)}\\b`).test(low)) pos++;
    for (const w of NEG_WORDS) if (new RegExp(`\\b${escapeRe(w)}\\b`).test(low)) neg++;
  }
  if (n === 0) return null;
  if (pos + neg === 0) return 0;
  return (pos - neg) / (pos + neg);
}

/** Position weight: 1st brand named = 1, 2nd = 1/2, 3rd = 1/3 ... */
export const positionWeight = (rank) => (rank ? 1 / rank : 0);

/**
 * Analyse one answer: which brands appear, in what order, with what sentiment.
 * brands: [{name, aliases, isOwn}]
 */
export function analyseAnswer(answer, brands) {
  const text = answer.answer || '';
  const hits = brands.map((b) => {
    const idx = findMentions(text, b);
    return { brand: b.name, isOwn: !!b.isOwn, count: idx.length, first: idx.length ? idx[0] : Infinity };
  });
  const ordered = hits.filter((h) => h.count > 0).sort((a, b) => a.first - b.first);
  ordered.forEach((h, i) => { h.rank = i + 1; });
  const result = {};
  for (const h of hits) {
    const b = brands.find((x) => x.name === h.brand);
    result[h.brand] = {
      mentioned: h.count > 0,
      count: h.count,
      rank: h.rank || null,
      weight: positionWeight(h.rank),
      sentiment: h.count ? mentionSentiment(text, b) : null,
    };
  }
  return { ...answer, brands: result, domains: extractDomains(text), brandsNamed: ordered.length };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Wilson 95% interval for a proportion. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - r) / d), Math.min(1, (c + r) / d)];
}

/** Aggregate brand metrics over a set of analysed answers. */
export function brandScorecard(analysed, brands) {
  const n = analysed.length;
  const totalWeight = analysed.reduce((s, a) => s + Object.values(a.brands).reduce((t, x) => t + x.weight, 0), 0);
  const totalMentions = analysed.reduce((s, a) => s + Object.values(a.brands).filter((x) => x.mentioned).length, 0);
  return brands.map((b) => {
    const rows = analysed.map((a) => a.brands[b.name]);
    const k = rows.filter((r) => r.mentioned).length;
    const w = rows.reduce((s, r) => s + r.weight, 0);
    const sents = rows.map((r) => r.sentiment).filter((x) => x !== null);
    const ranks = rows.map((r) => r.rank).filter(Boolean);
    return {
      brand: b.name,
      isOwn: !!b.isOwn,
      answers: n,
      mentions: k,
      mentionRate: n ? k / n : 0,
      mentionCI: wilson(k, n),
      firstPlace: rows.filter((r) => r.rank === 1).length,
      firstPlaceRate: n ? rows.filter((r) => r.rank === 1).length / n : 0,
      avgRank: mean(ranks),
      shareOfVoice: totalMentions ? k / totalMentions : 0,
      weightedSoV: totalWeight ? w / totalWeight : 0,
      sentiment: mean(sents),
    };
  }).sort((a, b) => b.weightedSoV - a.weightedSoV);
}

/** Group analysed answers by a key and compute the scorecard per group. */
export function breakdown(analysed, brands, key) {
  const groups = {};
  for (const a of analysed) (groups[a[key] || '(none)'] ||= []).push(a);
  return Object.entries(groups).map(([group, rows]) => ({ group, n: rows.length, scorecard: brandScorecard(rows, brands) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Domain leaderboard: how often each domain is cited, and with which brands. */
export function domainLeaderboard(analysed, brands) {
  const own = brands.find((b) => b.isOwn);
  const map = {};
  for (const a of analysed) {
    for (const d of a.domains) {
      const e = (map[d] ||= { domain: d, citations: 0, withOwn: 0, withoutOwn: 0 });
      e.citations++;
      if (own && a.brands[own.name]?.mentioned) e.withOwn++; else e.withoutOwn++;
    }
  }
  return Object.values(map).sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain));
}

/** Prompts where competitors appear but the own brand never does (across engines). */
export function promptGaps(analysed, brands) {
  const own = brands.find((b) => b.isOwn);
  if (!own) return [];
  const byPrompt = {};
  for (const a of analysed) (byPrompt[a.prompt] ||= []).push(a);
  const gaps = [];
  for (const [prompt, rows] of Object.entries(byPrompt)) {
    const ownHits = rows.filter((r) => r.brands[own.name].mentioned).length;
    const rivals = {};
    for (const r of rows) for (const b of brands) if (!b.isOwn && r.brands[b.name].mentioned) rivals[b.name] = (rivals[b.name] || 0) + 1;
    const rivalNames = Object.entries(rivals).sort((x, y) => y[1] - x[1]).map(([n]) => n);
    if (rivalNames.length && ownHits < rows.length) {
      gaps.push({ prompt, intent: rows[0].intent || '', engines: rows.length, ownHits, rivals: rivalNames,
        severity: (rows.length - ownHits) / rows.length * rivalNames.length,
        citedDomains: [...new Set(rows.flatMap((r) => r.domains))] });
    }
  }
  return gaps.sort((a, b) => b.severity - a.severity || a.prompt.localeCompare(b.prompt));
}

/** Two-proportion z-test (for comparing mention rate between two snapshots). */
export function twoPropTest(k1, n1, k2, n2) {
  if (!n1 || !n2) return { diff: 0, z: 0, p: 1 };
  const p1 = k1 / n1, p2 = k2 / n2, p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = se ? (p2 - p1) / se : 0;
  return { diff: p2 - p1, z, p: 2 * (1 - normCdf(Math.abs(z))) };
}

export function normCdf(x) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Parse CSV text into objects (handles quoted fields, embedded commas/newlines). */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Normalise loose CSV rows into answers: {prompt, engine, intent, snapshot, answer}. */
export function normaliseAnswers(rows) {
  const pick = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]; return ''; };
  let dropped = 0;
  const out = [];
  for (const r of rows) {
    const answer = pick(r, 'answer', 'response', 'output', 'text');
    const prompt = pick(r, 'prompt', 'query', 'question');
    if (!answer || !prompt) { dropped++; continue; }
    out.push({ prompt, answer, engine: pick(r, 'engine', 'model', 'assistant') || 'Unknown', intent: pick(r, 'intent', 'stage', 'category') || 'General', snapshot: pick(r, 'snapshot', 'date', 'week') || 'Current' });
  }
  return { answers: out, dropped };
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head.join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n');
}

/** Generate a buying-journey prompt panel for a category. */
export function promptPanel(category, audience = '', useCases = []) {
  const who = audience ? ` for ${audience}` : '';
  const base = [
    ['Discovery', `What is the best ${category}${who}?`],
    ['Discovery', `Which ${category} tools do people recommend in 2026?`],
    ['Discovery', `What are the top alternatives in ${category}?`],
    ['Comparison', `Compare the leading ${category} options on price and features.`],
    ['Comparison', `Which ${category} is most affordable${who}?`],
    ['Comparison', `Which ${category} has the best reviews?`],
    ['Problem', `How do I choose a ${category}${who}?`],
    ['Problem', `What should I avoid when buying a ${category}?`],
    ['Trust', `Which ${category} is the most trusted and secure?`],
  ];
  for (const u of useCases.filter(Boolean)) base.push(['Use case', `What is the best ${category} for ${u}?`]);
  return base.map(([intent, prompt]) => ({ intent, prompt }));
}

/** Full report with plain-English readout. */
export function analyse(answers, brands, opts = {}) {
  const analysed = answers.map((a) => analyseAnswer(a, brands));
  const snapshots = [...new Set(analysed.map((a) => a.snapshot))];
  const latestSnap = opts.snapshot || snapshots[snapshots.length - 1];
  const current = analysed.filter((a) => a.snapshot === latestSnap);
  const scorecard = brandScorecard(current, brands);
  const report = {
    analysed, current, snapshots, latestSnap, scorecard,
    byEngine: breakdown(current, brands, 'engine'),
    byIntent: breakdown(current, brands, 'intent'),
    domains: domainLeaderboard(current, brands),
    gaps: promptGaps(current, brands),
    trend: null,
  };
  if (snapshots.length > 1) {
    const prevSnap = snapshots[snapshots.indexOf(latestSnap) - 1];
    if (prevSnap) {
      const prev = brandScorecard(analysed.filter((a) => a.snapshot === prevSnap), brands);
      report.trend = scorecard.map((s) => {
        const p = prev.find((x) => x.brand === s.brand);
        return { brand: s.brand, isOwn: s.isOwn, from: p.mentionRate, to: s.mentionRate, prevSnap, ...twoPropTest(p.mentions, p.answers, s.mentions, s.answers) };
      });
    }
  }
  report.readout = readout(report, brands);
  return report;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;

export function readout(r, brands) {
  const own = brands.find((b) => b.isOwn);
  if (!own || !r.current.length) return ['Add answers and mark one brand as yours to get a readout.'];
  const me = r.scorecard.find((s) => s.isOwn);
  const leader = r.scorecard[0];
  const lines = [];
  lines.push(`${own.name} is named in ${pct(me.mentionRate)} of ${me.answers} AI answers (95% range ${pct(me.mentionCI[0])}–${pct(me.mentionCI[1])}) and is the first brand named in ${pct(me.firstPlaceRate)}.`);
  if (leader.brand === own.name) lines.push(`${own.name} leads position-weighted share of voice at ${pct1(me.weightedSoV)}.`);
  else lines.push(`${leader.brand} leads position-weighted share of voice at ${pct1(leader.weightedSoV)} vs ${pct1(me.weightedSoV)} for ${own.name}.`);
  const engines = r.byEngine.map((g) => ({ g: g.group, rate: g.scorecard.find((s) => s.isOwn).mentionRate })).sort((a, b) => a.rate - b.rate);
  if (engines.length > 1) lines.push(`Weakest engine: ${engines[0].g} (${pct(engines[0].rate)} mention rate); strongest: ${engines[engines.length - 1].g} (${pct(engines[engines.length - 1].rate)}).`);
  const intents = r.byIntent.map((g) => ({ g: g.group, rate: g.scorecard.find((s) => s.isOwn).mentionRate })).sort((a, b) => a.rate - b.rate);
  if (intents.length > 1) lines.push(`By buying stage, ${own.name} is least visible in "${intents[0].g}" prompts (${pct(intents[0].rate)}).`);
  if (me.sentiment !== null) lines.push(`Tone around ${own.name} mentions is ${me.sentiment > 0.2 ? 'mostly positive' : me.sentiment < -0.2 ? 'mostly negative' : 'mixed'} (score ${me.sentiment.toFixed(2)} on −1 to 1, simple word-list method).`);
  if (r.gaps.length) {
    const g = r.gaps[0];
    lines.push(`Biggest gap: "${g.prompt}" — ${g.rivals.join(', ')} appear but ${own.name} is missing in ${g.engines - g.ownHits} of ${g.engines} engines.`);
  }
  const blind = r.domains.filter((d) => d.withoutOwn > d.withOwn).slice(0, 3).map((d) => d.domain);
  if (blind.length) lines.push(`Sources the engines cite mostly in answers without ${own.name}: ${blind.join(', ')}. These are the first PR, review and listing targets.`);
  if (r.trend) {
    const t = r.trend.find((x) => x.isOwn);
    const sig = t.p < 0.05 ? 'a statistically significant change' : 'not yet statistically significant';
    lines.push(`Since ${t.prevSnap}, ${own.name}'s mention rate moved from ${pct(t.from)} to ${pct(t.to)} (${t.diff >= 0 ? '+' : ''}${Math.round(t.diff * 100)} pts, p = ${t.p.toFixed(3)}; ${sig}).`);
  }
  lines.push('Next: publish comparison and use-case pages that answer the gap prompts directly, get listed on the cited review sites, then re-run the same prompt panel in 2–4 weeks to measure the change.');
  return lines;
}
