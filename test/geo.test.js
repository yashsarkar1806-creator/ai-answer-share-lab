import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMentions, extractDomains, mentionSentiment, analyseAnswer, brandScorecard, promptGaps, domainLeaderboard, wilson, twoPropTest, parseCSV, normaliseAnswers, toCSV, promptPanel, analyse, normCdf } from '../src/geo.js';
import { parseBrands, brandsToText } from '../src/brands.js';
import { generateDemo, DEMO_BRANDS } from '../src/demo.js';

const B = [{ name: 'Acme', aliases: ['Acme AI'], isOwn: true }, { name: 'Bolt', aliases: [] }, { name: 'Cove', aliases: [] }];

test('mentions are whole-word, case-insensitive and include aliases', () => {
  assert.equal(findMentions('acme is good. Acmeville is not. ACME AI rocks', B[0]).length, 2);
  assert.equal(findMentions('Boltzmann and bolted', B[1]).length, 0);
});

test('extracts domains from URLs and bare domains, skips version numbers', () => {
  const d = extractDomains('See https://www.reviews.example/x and docs.foo.io, v1.2.3 too.');
  assert.deepEqual(d.sort(), ['docs.foo.io', 'reviews.example']);
});

test('sentiment only scores sentences naming the brand', () => {
  assert.equal(mentionSentiment('Acme is great and reliable. Bolt is slow.', B[0]), 1);
  assert.equal(mentionSentiment('Acme is great and reliable. Bolt is slow.', B[1]), -1);
  assert.equal(mentionSentiment('Nothing here.', B[0]), null);
  assert.equal(mentionSentiment('Acme exists.', B[0]), 0);
});

test('ranks brands by first appearance', () => {
  const a = analyseAnswer({ prompt: 'p', answer: 'Try Bolt first, then Acme. Bolt again.' }, B);
  assert.equal(a.brands.Bolt.rank, 1);
  assert.equal(a.brands.Acme.rank, 2);
  assert.equal(a.brands.Acme.weight, 0.5);
  assert.equal(a.brands.Cove.mentioned, false);
  assert.equal(a.brands.Bolt.count, 2);
  assert.equal(a.brandsNamed, 2);
});

test('scorecard shares sum to 1 and rates are correct', () => {
  const rows = [
    { prompt: 'p1', answer: 'Acme then Bolt' },
    { prompt: 'p2', answer: 'Bolt only' },
    { prompt: 'p3', answer: 'Cove, Acme, Bolt' },
    { prompt: 'p4', answer: 'none' },
  ].map((r) => analyseAnswer(r, B));
  const sc = brandScorecard(rows, B);
  const acme = sc.find((s) => s.brand === 'Acme');
  assert.equal(acme.mentionRate, 0.5);
  assert.equal(acme.firstPlace, 1);
  assert.ok(Math.abs(sc.reduce((s, x) => s + x.shareOfVoice, 0) - 1) < 1e-9);
  assert.ok(Math.abs(sc.reduce((s, x) => s + x.weightedSoV, 0) - 1) < 1e-9);
  // Bolt: weights 1/2 + 1 + 1/3 ; total weight = 1.5 + 1 + (1+1/2+1/3)
  const bolt = sc.find((s) => s.brand === 'Bolt');
  assert.ok(Math.abs(bolt.weightedSoV - (11 / 6) / (1.5 + 1 + 11 / 6)) < 1e-9);
  assert.equal(sc[0].brand, 'Bolt');
});

test('prompt gaps find prompts where rivals appear without own brand', () => {
  const rows = [
    { prompt: 'best?', engine: 'A', answer: 'Bolt and Cove' },
    { prompt: 'best?', engine: 'B', answer: 'Acme and Bolt' },
    { prompt: 'cheap?', engine: 'A', answer: 'Acme' },
    { prompt: 'cheap?', engine: 'B', answer: 'Acme, Cove' },
  ].map((r) => analyseAnswer(r, B));
  const g = promptGaps(rows, B);
  assert.equal(g.length, 1);
  assert.equal(g[0].prompt, 'best?');
  assert.equal(g[0].ownHits, 1);
  assert.deepEqual(g[0].rivals, ['Bolt', 'Cove']);
});

test('domain leaderboard splits citations with and without own brand', () => {
  const rows = [
    { prompt: 'a', answer: 'Acme https://r.example/x' },
    { prompt: 'b', answer: 'Bolt https://r.example/y q.example' },
  ].map((r) => analyseAnswer(r, B));
  const d = domainLeaderboard(rows, B);
  assert.deepEqual(d[0], { domain: 'r.example', citations: 2, withOwn: 1, withoutOwn: 1 });
  assert.equal(d[1].domain, 'q.example');
});

test('wilson interval and stats helpers behave', () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(lo > 0.23 && lo < 0.24 && hi > 0.76 && hi < 0.77);
  assert.deepEqual(wilson(0, 0), [0, 0]);
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
  const t = twoPropTest(20, 100, 40, 100);
  assert.ok(t.p < 0.01 && t.diff > 0);
  assert.equal(twoPropTest(0, 0, 1, 1).p, 1);
});

test('CSV parse handles quotes, commas and newlines; round-trips via toCSV', () => {
  const rows = [{ prompt: 'a, b', answer: 'line1\nline "2"', engine: 'X' }];
  const back = parseCSV(toCSV(rows));
  assert.deepEqual(back, rows);
});

test('normaliseAnswers accepts aliases and drops incomplete rows', () => {
  const { answers, dropped } = normaliseAnswers([{ query: 'q', response: 'r', model: 'M', date: '2026-01-01' }, { query: 'q2', response: '' }]);
  assert.equal(dropped, 1);
  assert.deepEqual(answers[0], { prompt: 'q', answer: 'r', engine: 'M', intent: 'General', snapshot: '2026-01-01' });
});

test('brand parser reads aliases and keeps only one own brand', () => {
  const b = parseBrands('Acme | Acme AI, ACM | own\nBolt\nCove | | own\n\n');
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], { name: 'Acme', aliases: ['Acme AI', 'ACM'], isOwn: true });
  assert.equal(b[2].isOwn, false);
  assert.deepEqual(parseBrands(brandsToText(DEMO_BRANDS)), DEMO_BRANDS.map((x) => ({ ...x, isOwn: !!x.isOwn })));
});

test('prompt panel covers every buying stage and use cases', () => {
  const p = promptPanel('CRM', 'startups', ['sales teams', '']);
  assert.equal(p.length, 10);
  assert.deepEqual([...new Set(p.map((x) => x.intent))], ['Discovery', 'Comparison', 'Problem', 'Trust', 'Use case']);
});

test('demo data is deterministic and the full report runs end to end', () => {
  const a = generateDemo(); const b = generateDemo();
  assert.deepEqual(a, b);
  assert.equal(a.length, 72);
  const r = analyse(a, DEMO_BRANDS);
  assert.equal(r.latestSnap, '2026-11-13');
  assert.equal(r.current.length, 36);
  assert.equal(r.byEngine.length, 3);
  assert.equal(r.byIntent.length, 5);
  assert.ok(r.trend && r.trend.length === 4);
  assert.ok(r.readout.length >= 6);
  assert.ok(r.readout.every((l) => !/NaN|undefined|Infinity/.test(l)));
});

test('readout asks for setup when there is no own brand', () => {
  const r = analyse([{ prompt: 'p', answer: 'Bolt', engine: 'A', intent: 'x', snapshot: 's' }], B.map((x) => ({ ...x, isOwn: false })));
  assert.match(r.readout[0], /mark one brand/i);
  assert.deepEqual(r.gaps, []);
});
