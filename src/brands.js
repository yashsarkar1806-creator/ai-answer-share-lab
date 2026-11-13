// Parse the brands textarea: "Name | alias, alias | own"
export function parseBrands(text) {
  const brands = [];
  for (const line of text.split(/\n/)) {
    const parts = line.split('|').map((s) => s.trim());
    if (!parts[0]) continue;
    const aliases = (parts[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const isOwn = parts.slice(1).some((p) => /^own$/i.test(p));
    brands.push({ name: parts[0], aliases: aliases.filter((a) => !/^own$/i.test(a)), isOwn });
  }
  let seen = false;
  for (const b of brands) { if (b.isOwn) { if (seen) b.isOwn = false; seen = true; } }
  return brands;
}
export function brandsToText(brands) {
  return brands.map((b) => [b.name, b.aliases.join(', '), b.isOwn ? 'own' : ''].filter((x, i) => i === 0 || x).join(' | ')).join('\n');
}
