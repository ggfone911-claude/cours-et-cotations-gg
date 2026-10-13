// Graphiques (Chart.js, copie locale dans vendor/, chargée par index.html).

import { pourcent, nombre, moisAnnee } from './format.js';

const VERT = '#1D9E75';
const ORANGE = '#D85A30';
const PALETTE = ['#3266ad', '#1D9E75', '#D85A30', '#7c3aed', '#0891b2', '#ca8a04',
  '#db2777', '#4b5563', '#65a30d', '#9a3412', '#1e3a8a', '#0f766e', '#a21caf'];

const instances = new WeakMap();

function dessiner(canvas, config) {
  if (instances.has(canvas)) instances.get(canvas).destroy();
  if (typeof window.Chart !== 'function') return null;
  const graphique = new window.Chart(canvas, config);
  instances.set(canvas, graphique);
  return graphique;
}

// Barres horizontales des performances ; les fonds sans valeur sont omis.
export function barres(canvas, lignes) {
  const donnees = lignes.filter((l) => l.valeur !== null && l.valeur !== undefined)
    .sort((a, b) => b.valeur - a.valeur);
  canvas.parentElement.style.height = `${Math.max(160, donnees.length * 26 + 40)}px`;
  return dessiner(canvas, {
    type: 'bar',
    data: {
      labels: donnees.map((l) => l.nom),
      datasets: [{
        data: donnees.map((l) => l.valeur),
        backgroundColor: donnees.map((l) => (l.valeur >= 0 ? VERT : ORANGE)),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => pourcent(c.parsed.x) } },
      },
      scales: {
        x: { ticks: { callback: (v) => pourcent(v, 0) } },
        y: {
          ticks: {
            autoSkip: false,
            font: { size: 11 },
            // Noms raccourcis sur écran étroit ; l'infobulle garde le nom complet.
            callback(v) {
              const nom = this.getLabelForValue(v);
              const max = this.chart.width < 500 ? 20 : 42;
              return nom.length > max ? `${nom.slice(0, max - 1)}…` : nom;
            },
          },
        },
      },
    },
  });
}

// « AAAA-MM » → horodatage du 1er du mois : un vrai axe chronologique.
// « AAAA-MM-JJ » (VL journalières) → horodatage du jour.
const temps = (cle) => {
  const [a, m, j] = cle.split('-').map(Number);
  return Date.UTC(a, m - 1, j || 1);
};
const jourDepuisTemps = (t) => {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const cleDepuisTemps = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function graduationsMensuelles(min, max) {
  const debut = new Date(min);
  const fin = new Date(max);
  const mois = (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12
    + fin.getUTCMonth() - debut.getUTCMonth();
  const pas = mois > 36 ? 6 : mois > 12 ? 3 : mois > 6 ? 2 : 1;
  const ticks = [];
  const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1));
  if (d.getTime() < min) d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getUTCMonth() % pas !== 0) d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.getTime() <= max; d.setUTCMonth(d.getUTCMonth() + pas)) ticks.push({ value: d.getTime() });
  return ticks;
}

function graduationsHebdo(min, max) {
  const ticks = [];
  for (let t = min; t <= max; t += 7 * 86400000) ticks.push({ value: t });
  return ticks;
}

// Courbes base 100 ; series : [{nom, points: [{date, valeur}]}]
export function courbes(canvas, series) {
  canvas.parentElement.style.height = '360px';
  const journalier = series.some((s) => s.points.some((p) => p.date.length === 10));
  const etiquette = journalier ? jourDepuisTemps : (t) => moisAnnee(cleDepuisTemps(t));
  return dessiner(canvas, {
    type: 'line',
    data: {
      datasets: series.map((s, i) => ({
        label: s.nom,
        data: s.points.map((p) => ({ x: temps(p.date), y: p.valeur })),
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length],
        borderWidth: 1.8,
        pointRadius: 0,
        pointHitRadius: 6,
        tension: 0,  // pas de lissage : aucun point inventé entre deux mois
      })),
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => etiquette(items[0].parsed.x),
            label: (c) => `${c.dataset.label} : ${nombre(c.parsed.y, 1)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          // Graduations placées sur de vrais débuts de mois.
          afterBuildTicks: (axe) => {
            axe.ticks = journalier ? graduationsHebdo(axe.min, axe.max) : graduationsMensuelles(axe.min, axe.max);
          },
          ticks: { autoSkip: false, callback: (v) => etiquette(v) },
        },
        y: { ticks: { callback: (v) => nombre(v, 0) } },
      },
    },
  });
}
