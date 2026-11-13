import { analyse, parseCSV, normaliseAnswers, toCSV, promptPanel, brandMatcher } from './geo.js';
import { generateDemo, DEMO_BRANDS, DEMO_CATEGORY } from './demo.js';
import { parseBrands, brandsToText } from './brands.js';

const $ = (id) => document.getElementById(id);
const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let report = null, brands = [], panel = [];

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('loadDemo').onclick = () => {
  $('brands').value = brandsToText(DEMO_BRANDS);
  $('csv').value = toCSV(generateDemo());
  $('pCategory').value = DEMO_CATEGORY.category; $('pAudience').value = DEMO_CATEGORY.audience; $('pUses').value = DEMO_CATEGORY.useCases.join(', ');
  run();
};

$('makePanel').onclick = () => {
  const cat = $('pCategory').value.trim();
  if (!cat) { $('pCategory').focus(); return; }
  panel = promptPanel(cat, $('pAudience').value.trim(), $('pUses').value.split(','));
  $('panel').innerHTML = panel.map((p) => `<li><span class="tag">${esc(p.intent)}</span> ${esc(p.prompt)}</li>`).join('');
  $('dlTemplate').disabled = false;
};
$('dlTemplate').onclick = () => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const engine of ['Assistant 1', 'Assistant 2']) for (const p of panel) rows.push({ snapshot: today, engine, intent: p.intent, prompt: p.prompt, answer: '' });
  download('prompt-panel-template.csv', toCSV(rows));
};

$('file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('csv').value = await f.text(); run(); } };
$('analyse').onclick = run;

function run() {
  brands = parseBrands($('brands').value);
  const { answers, dropped } = normaliseAnswers(parseCSV($('csv').value));
  const status = $('status');
  if (brands.length < 2) { status.textContent = 'Add at least two brands (yours and one competitor).'; return; }
  if (!brands.some((b) => b.isOwn)) { status.textContent = 'Mark one brand as "own", e.g. "Murmur | Murmur AI | own".'; return; }
  if (!answers.length) { status.textContent = 'No usable rows: each row needs a prompt and an answer.'; return; }
  report = analyse(answers, brands);
  status.textContent = `Analysed ${report.current.length} answers in snapshot ${report.latestSnap}` + (report.snapshots.length > 1 ? ` (${report.snapshots.length} snapshots loaded)` : '') + (dropped ? `; skipped ${dropped} row(s) missing a prompt or answer.` : '.');
  render();
}

function heat(groups) {
  const names = brands.map((b) => b.name);
  return `<table class="heat"><tr><th></th>${names.map((n) => `<th>${esc(n)}</th>`).join('')}<th>n</th></tr>` + groups.map((g) => `<tr><th>${esc(g.group)}</th>${names.map((n) => { const s = g.scorecard.find((x) => x.brand === n); const a = s.mentionRate; return `<td style="background:rgba(91,76,255,${(0.08 + a * 0.75).toFixed(2)});color:${a > 0.55 ? '#fff' : 'inherit'}">${pct(a)}</td>`; }).join('')}<td class="muted">${g.n}</td></tr>`).join('') + '</table>';
}

function render() {
  $('results').hidden = false;
  const me = report.scorecard.find((s) => s.isOwn);
  const rank = report.scorecard.indexOf(me) + 1;
  $('kpis').innerHTML = [
    ['Mention rate', pct(me.mentionRate), `95% range ${pct(me.mentionCI[0])}–${pct(me.mentionCI[1])}`],
    ['Named first', pct(me.firstPlaceRate), `${me.firstPlace} of ${me.answers} answers`],
    ['Weighted share of voice', pct(me.weightedSoV), `#${rank} of ${brands.length} brands`],
    ['Prompt gaps', String(report.gaps.length), 'prompts where rivals appear without you'],
  ].map(([l, v, s]) => `<div class="kpi"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`).join('');
  $('readout').innerHTML = report.readout.map((l) => `<li>${esc(l)}</li>`).join('');
  $('snapTag').textContent = `snapshot ${report.latestSnap}`;
  $('scorecard').innerHTML = '<tr><th>Brand</th><th>Mention rate</th><th>95% range</th><th>Named first</th><th>Avg rank</th><th>Share of voice</th><th>Weighted SoV</th><th>Tone</th></tr>' +
    report.scorecard.map((s) => `<tr class="${s.isOwn ? 'own' : ''}"><td>${esc(s.brand)}${s.isOwn ? ' <span class="tag">you</span>' : ''}</td><td>${pct(s.mentionRate)}</td><td>${pct(s.mentionCI[0])}–${pct(s.mentionCI[1])}</td><td>${pct(s.firstPlaceRate)}</td><td>${s.avgRank ? s.avgRank.toFixed(2) : '–'}</td><td>${pct(s.shareOfVoice)}</td><td>${pct(s.weightedSoV)}</td><td>${s.sentiment === null ? '–' : s.sentiment.toFixed(2)}</td></tr>`).join('');
  const max = Math.max(...report.scorecard.map((s) => s.weightedSoV), 0.01);
  $('sovChart').innerHTML = report.scorecard.map((s) => `<div class="bar ${s.isOwn ? 'own' : ''}"><span>${esc(s.brand)}</span><div><i style="width:${(s.weightedSoV / max) * 100}%"></i></div><b>${pct(s.weightedSoV)}</b></div>`).join('');
  $('engineHeat').innerHTML = heat(report.byEngine);
  $('intentHeat').innerHTML = heat(report.byIntent);
  $('trendCard').hidden = !report.trend;
  if (report.trend) $('trend').innerHTML = `<tr><th>Brand</th><th>${esc(report.trend[0].prevSnap)}</th><th>${esc(report.latestSnap)}</th><th>Change</th><th>p-value</th><th></th></tr>` + report.trend.map((t) => `<tr class="${t.isOwn ? 'own' : ''}"><td>${esc(t.brand)}</td><td>${pct(t.from)}</td><td>${pct(t.to)}</td><td>${t.diff >= 0 ? '+' : ''}${Math.round(t.diff * 100)} pts</td><td>${t.p.toFixed(3)}</td><td>${t.p < 0.05 ? '<span class="tag good">significant</span>' : '<span class="tag">noise range</span>'}</td></tr>`).join('');
  $('gaps').innerHTML = report.gaps.length ? '<tr><th>Prompt</th><th>Stage</th><th>Engines naming you</th><th>Rivals named</th><th>Sources cited</th></tr>' + report.gaps.slice(0, 15).map((g) => `<tr><td>${esc(g.prompt)}</td><td>${esc(g.intent)}</td><td>${g.ownHits} / ${g.engines}</td><td>${esc(g.rivals.join(', '))}</td><td class="small">${esc(g.citedDomains.join(', ') || '–')}</td></tr>`).join('') : '<tr><td>No gaps: you appear wherever a competitor does.</td></tr>';
  $('domains').innerHTML = report.domains.length ? '<tr><th>Domain</th><th>Citations</th><th>With your brand</th><th>Without your brand</th><th></th></tr>' + report.domains.slice(0, 15).map((d) => `<tr><td>${esc(d.domain)}</td><td>${d.citations}</td><td>${d.withOwn}</td><td>${d.withoutOwn}</td><td>${d.withoutOwn > d.withOwn ? '<span class="tag warn">opportunity</span>' : ''}</td></tr>`).join('') : '<tr><td>No URLs or domains found in the answers.</td></tr>';
  const opts = (key, label) => `<option value="">All ${label}</option>` + [...new Set(report.current.map((a) => a[key]))].map((v) => `<option>${esc(v)}</option>`).join('');
  $('fEngine').innerHTML = opts('engine', 'engines'); $('fIntent').innerHTML = opts('intent', 'stages');
  renderAnswers();
}

function highlight(text) {
  let html = esc(text);
  for (const b of brands) {
    const re = brandMatcher({ name: esc(b.name), aliases: b.aliases.map(esc) });
    html = html.replace(re, (m) => `<mark class="${b.isOwn ? 'own' : ''}">${m}</mark>`);
  }
  return html;
}

function renderAnswers() {
  if (!report) return;
  const own = brands.find((b) => b.isOwn).name;
  const rows = report.current.filter((a) => (!$('fEngine').value || a.engine === $('fEngine').value) && (!$('fIntent').value || a.intent === $('fIntent').value) && (!$('fMissing').checked || !a.brands[own].mentioned));
  $('answers').innerHTML = rows.slice(0, 60).map((a) => `<article><header><span class="tag">${esc(a.engine)}</span><span class="tag">${esc(a.intent)}</span> <strong>${esc(a.prompt)}</strong></header><p>${highlight(a.answer)}</p></article>`).join('') || '<p class="muted">No answers match.</p>';
}
['fEngine', 'fIntent', 'fMissing'].forEach((id) => { $(id).onchange = renderAnswers; });

$('copyReadout').onclick = async () => { await navigator.clipboard.writeText(report.readout.map((l) => `• ${l}`).join('\n')); $('copyReadout').textContent = 'Copied'; setTimeout(() => { $('copyReadout').textContent = 'Copy readout'; }, 1500); };
$('dlCsv').onclick = () => {
  const rows = report.analysed.map((a) => {
    const o = { snapshot: a.snapshot, engine: a.engine, intent: a.intent, prompt: a.prompt, brands_named: a.brandsNamed };
    for (const b of brands) { o[`${b.name}_rank`] = a.brands[b.name].rank ?? ''; o[`${b.name}_tone`] = a.brands[b.name].sentiment ?? ''; }
    o.domains = a.domains.join(' ');
    return o;
  });
  download('ai-answer-share-analysis.csv', toCSV(rows));
};

if (new URLSearchParams(location.search).has('demo')) $('loadDemo').click();
