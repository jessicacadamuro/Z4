// Atualiza public/index.html com os resultados do Brasileirão Série A 2026.
// Fonte: placar público da ESPN (site.api.espn.com). Roda no GitHub Actions.
// Move os jogos encerrados da lista FIX (a disputar) para PLAYED (disputados),
// atualiza as datas dos jogos que mudaram e a linha "Dados após a Xª rodada".
// Se a fonte falhar, não altera nada.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'index.html');
const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=';
const SEASON_END = '2026-12-10';
const SCAN_FROM = '2026-10-20';

const TEAM = {
  'Flamengo': 'FLA', 'Palmeiras': 'PAL', 'Athletico-PR': 'ATP', 'Athletico Paranaense': 'ATP',
  'Cruzeiro': 'CRU', 'Fluminense': 'FLU', 'Atlético-MG': 'ATM', 'Atletico-MG': 'ATM', 'Atlético Mineiro': 'ATM',
  'Bahia': 'BAH', 'Santos': 'SAN', 'São Paulo': 'SPA', 'Sao Paulo': 'SPA', 'Red Bull Bragantino': 'RBB',
  'Bragantino': 'RBB', 'Botafogo': 'BOT', 'Coritiba': 'CTB', 'Vitória': 'VIT', 'Vitoria': 'VIT',
  'Mirassol': 'MIR', 'Vasco da Gama': 'VAS', 'Vasco': 'VAS', 'Corinthians': 'COR', 'Internacional': 'INT',
  'Grêmio': 'GRE', 'Gremio': 'GRE', 'Remo': 'REM', 'Chapecoense': 'CHA'
};

// data no fuso de Brasília
const brt = d => new Date(new Date(d).getTime() - 3 * 3600 * 1000);
const ymd = d => d.toISOString().slice(0, 10);
const ddmm = d => ymd(d).slice(8, 10) + '/' + ymd(d).slice(5, 7);

function days(from, to) {
  const out = [];
  for (let d = new Date(from + 'T12:00:00Z'); ymd(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(ymd(d).replace(/-/g, ''));
  return out;
}

async function getDay(day) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + day);
      if (r.ok) return (await r.json()).events || [];
    } catch (e) {}
    await new Promise(s => setTimeout(s, 2000));
  }
  throw new Error('ESPN não respondeu para ' + day);
}

(async () => {
  let html = fs.readFileSync(FILE, 'utf8');
  const mP = html.match(/const PLAYED=(\[\[.*?\]\]);/);
  const mF = html.match(/const FIX=(\[\[.*?\]\]|\[\]);/);
  if (!mP || !mF) throw new Error('Não achei PLAYED/FIX no index.html');
  const PLAYED = JSON.parse(mP[1]);
  let FIX = JSON.parse(mF[1]);

  const today = ymd(brt(Date.now()));
  const todayEnd = today < SEASON_END ? today : SEASON_END;
  const pending = new Map(FIX.map(g => [g[0] + '_' + g[1], g]));
  let newResults = 0, newDates = 0;

  for (const day of days(SCAN_FROM, SEASON_END)) {
    const isPast = day <= todayEnd.replace(/-/g, '');
    const events = await getDay(day);
    for (const e of events) {
      const c = e.competitions && e.competitions[0];
      if (!c) continue;
      const h = c.competitors.find(x => x.homeAway === 'home');
      const a = c.competitors.find(x => x.homeAway === 'away');
      const hk = TEAM[h && h.team.displayName], ak = TEAM[a && a.team.displayName];
      if (!hk || !ak) continue;
      const g = pending.get(hk + '_' + ak);
      if (!g) continue;
      const status = c.status && c.status.type && c.status.type.name;
      if (isPast && status === 'STATUS_FULL_TIME') {
        const x = parseInt(h.score, 10), y = parseInt(a.score, 10);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        PLAYED.push([hk, ak, x, y]);
        pending.delete(hk + '_' + ak);
        newResults++;
      } else if (status === 'STATUS_SCHEDULED') {
        const d = ddmm(brt(e.date));
        if (g[3] !== d) { g[3] = d; newDates++; }
      }
    }
  }

  if (!newResults && !newDates) { console.log('Nada novo.'); return; }
  FIX = FIX.filter(g => pending.has(g[0] + '_' + g[1]));

  // última rodada completa (ignora jogos adiados de rodadas antigas, como a 21ª)
  const left = FIX.map(g => g[2]).filter(r => r >= 32);
  const done = left.length ? Math.min(...left) - 1 : 38;
  const [Y, M, D] = today.split('-');

  html = html.replace(mP[0], () => 'const PLAYED=' + JSON.stringify(PLAYED) + ';')
             .replace(mF[0], () => 'const FIX=' + JSON.stringify(FIX) + ';');
  if (newResults) {
    html = html.replace(/Dados após a \d+ª rodada · atualizado em \d\d\/\d\d\/\d{4}/,
      `Dados após a ${done}ª rodada · atualizado em ${D}/${M}/${Y}`);
  }
  fs.writeFileSync(FILE, html);
  console.log(`Resultados novos: ${newResults}. Datas alteradas: ${newDates}. Após a ${done}ª rodada.`);
})().catch(e => { console.error(e.message); process.exit(1); });
