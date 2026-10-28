// Sin City Shop (23.10.2026). Pakete, Preise und Bilder kommen live aus Tebex (Headless API), Login (Cfx.re),
// Warenkorb und Kasse laufen ueber Tebex. Hier liegt nur der Public Token, der ist oeffentlich und kein Geheimnis.
'use strict';

const TOKEN = '1518w-cc12c9ee3a64e61fdf2a23fe623eef0981223f29';
const API = 'https://headless.tebex.io/api';
const SEITE = location.origin + location.pathname;
const KORB_KEY = 'sc_shop_korb';
const BELIEBT = 7754872; // Paket im Kasten "Beliebt" (230 Coins), Tebex-Paket-ID
// Letzte Kaeufe und Community-Ziel: holt unser Server alle 3 Minuten mit dem Tebex-Secret (sc-shopdaten.py)
// und stellt hier nur Name, Zeit und Prozent bereit. Das Secret bleibt auf dem Server.
const SHOPDATEN = 'https://45-145-42-141.sslip.io/sc/web/shop.json';

const $ = (id) => document.getElementById(id);
const euro = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);

let kategorien = [];
let korb = null;
let detailPaket = null;

// ---------- Hilfen ----------
function merken(wert) {
  try { wert ? localStorage.setItem(KORB_KEY, wert) : localStorage.removeItem(KORB_KEY); } catch (e) { /* privat, egal */ }
}
function gemerkt() {
  try { return localStorage.getItem(KORB_KEY); } catch (e) { return null; }
}

async function api(pfad, opt = {}) {
  const r = await fetch(API + pfad, { ...opt, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  let d = null;
  try { d = await r.json(); } catch (e) { /* leer */ }
  if (!r.ok) {
    const fehler = new Error((d && (d.detail || d.title || d.message)) || ('Fehler ' + r.status));
    fehler.status = r.status;
    throw fehler;
  }
  return d && d.data !== undefined ? d.data : d;
}

function hinweis(text, gut = false) {
  const el = $('hinweis');
  el.textContent = text;
  el.classList.toggle('gut', gut);
  el.hidden = !text;
}

const UEBERSETZT = {
  'User must login before adding packages to basket': 'Bitte melde dich zuerst mit deinem FiveM-Konto an.',
};
function fehlerText(e) {
  return UEBERSETZT[e.message] || ('Das hat nicht geklappt: ' + e.message);
}

// Beschreibungen kommen aus dem Tebex-Panel. Trotzdem nur harmloses HTML durchlassen.
function sauber(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form, input, button').forEach((e) => e.remove());
  doc.querySelectorAll('*').forEach((e) => {
    for (const a of [...e.attributes]) {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value) || a.name === 'style') e.removeAttribute(a.name);
    }
    if (e.tagName === 'A') { e.target = '_blank'; e.rel = 'noopener'; }
  });
  return doc.body.innerHTML;
}

function preis(p) {
  return p.total_price ?? p.base_price ?? 0;
}

// 28.10.2026: Bei einem Tebex-Sale ist preis() schon reduziert. discount ist der Nachlass ohne Steuer, der alte Preis
// steht im selben Verhaeltnis zum neuen wie (base_price + discount) zu base_price.
function altpreis(p) {
  if (!(p.discount > 0) || !(p.base_price > 0)) return null;
  return preis(p) * (p.base_price + p.discount) / p.base_price;
}

const prozent = (p) => Math.round((1 - preis(p) / altpreis(p)) * 100);

// Preis in ein Element schreiben. Bei Rabatt: alter Preis durchgestrichen, neuer Preis gross, darunter "Du sparst ..."
function preisSetzen(el, p) {
  el.textContent = '';
  const alt = altpreis(p);
  el.classList.toggle('im-sale', !!alt);
  if (!alt) { el.textContent = euro(preis(p)); return; }
  const s = document.createElement('s');
  s.className = 'altpreis';
  s.textContent = euro(alt);
  const neu = document.createElement('span');
  neu.className = 'neupreis';
  neu.textContent = euro(preis(p));
  const spar = document.createElement('span');
  spar.className = 'ersparnis';
  spar.textContent = 'Du sparst ' + euro(alt - preis(p));
  el.append(s, neu, spar);
}

// ---------- Sale-Banner mit Countdown (28.10.2026: Launch-Wochen) ----------
// Die Headless-API liefert kein Enddatum, deshalb steht es hier. Nach Ablauf verschwindet der Banner von selbst.
const SALE = { name: 'Launch-Wochen', ende: new Date('2026-11-11T23:59:00+01:00') };

function salePakete() {
  return kategorien.flatMap((k) => (k.packages || []).filter((p) => altpreis(p)).map((p) => ({ p, k })));
}

function restzeit() {
  const ms = SALE.ende - Date.now();
  if (ms <= 0) return null;
  const t = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return [[t, 'Tage'], [h, 'Std'], [m, 'Min'], [s, 'Sek']];
}

function saleBannerBauen(ziel, nurKategorie) {
  const box = $(ziel);
  if (!box) return;
  const liste = salePakete().filter((x) => !nurKategorie || x.k.id === nurKategorie.id);
  const rest = restzeit();
  box.hidden = !liste.length || !rest;
  clearInterval(box._takt);
  if (box.hidden) return;
  const max = Math.max(...liste.map((x) => prozent(x.p)));
  const erste = liste[0].k;
  box.innerHTML = '';
  const links = document.createElement('div');
  links.className = 'sale-text';
  links.innerHTML = '<span class="sale-ueber"></span><strong class="sale-titel"></strong><span class="sale-unter"></span>';
  links.querySelector('.sale-ueber').textContent = SALE.name + ' · nur für kurze Zeit';
  links.querySelector('.sale-titel').textContent = 'Bis zu −' + max + ' %';
  links.querySelector('.sale-unter').textContent = nurKategorie
    ? 'Auf alle Pakete in dieser Kategorie. Danach gilt wieder der normale Preis.'
    : 'Auf Coins, VIP, Fraktion, Kleidung und Extras. Danach gilt wieder der normale Preis.';
  const uhr = document.createElement('div');
  uhr.className = 'sale-uhr';
  uhr.setAttribute('aria-label', 'Endet am 11.11. um 23:59 Uhr');
  const zellen = rest.map(([, wort]) => {
    const z = document.createElement('span');
    z.className = 'sale-zelle';
    z.innerHTML = '<b></b><small></small>';
    z.querySelector('small').textContent = wort;
    uhr.append(z);
    return z.querySelector('b');
  });
  box.append(links, uhr);
  if (!nurKategorie) {
    const a = document.createElement('a');
    a.className = 'knopf sale-knopf';
    a.href = '#kat-' + erste.id;
    a.textContent = 'Jetzt sichern';
    box.append(a);
  } else {
    box.classList.add('ohne-knopf');
  }
  const ticken = () => {
    const r = restzeit();
    if (!r) { box.hidden = true; clearInterval(box._takt); return; }
    r.forEach(([zahl], i) => { zellen[i].textContent = String(zahl).padStart(2, '0'); });
  };
  ticken();
  box._takt = setInterval(ticken, 1000);
}

async function beschaeftigt(knopf, arbeit) {
  if (knopf) knopf.disabled = true;
  try { await arbeit(); }
  catch (e) { hinweis(fehlerText(e)); }
  finally { if (knopf) knopf.disabled = false; }
}

// ---------- Katalog ----------
async function katalogLaden() {
  const liste = await api(`/accounts/${TOKEN}/categories?includePackages=1`);
  // 28.10.2026 (Jason): feste Reihenfolge im Menue und bei den Kacheln, neue Kategorien hinten an
  const REIHENFOLGE = ['Coins', 'Fraktion', 'Kleidung', 'VIP', 'Extras', 'Gutscheine'];
  const platz = (k) => { const i = REIHENFOLGE.indexOf(k.name); return i < 0 ? 100 + (k.order ?? 0) : i; };
  kategorien = (liste || [])
    .filter((k) => (k.packages || []).length)
    .sort((a, b) => platz(a) - platz(b));
}

// 28.10.2026 (Jason): Zusammengehoeriges hintereinander, in jeder Gruppe vom kleinen zum grossen.
// Pakete, die hier nicht stehen (Coins, Gutscheine, neue), kommen danach nach Preis.
const PAKET_REIHENFOLGE = [
  'Fraktions-Gebäude S', 'Fraktions-Gebäude M', 'Fraktions-Gebäude L', 'Gebäude-Wechsel', 'Mapping-Aufpreis',
  'Custom-Livery', 'Fuhrpark +5', 'Custom-Fahrzeug',
  // 28.10.2026: Reiter Kleidung (Preise nach Designer-Liste)
  'Fraktions-Kleidung S', 'Fraktions-Kleidung M', 'Fraktions-Kleidung L', 'MC-Paket S', 'MC-Paket M', 'MC-Paket L',
  'Privat-Kleidung', 'Premade-Kette', 'Custom-Kette',
  'VIP 30 Tage', 'VIP 90 Tage', 'Starter-Bundle: VIP 30 Tage + 110 Coins', 'Boss-Bundle: VIP 30 Tage + 650 Coins',
  'Zusätzlicher Charakter-Slot', 'Charakter-Transfer', 'Wunschkennzeichen', 'Wunschnummer', 'Namensänderung',
  'Fahrzeug-Ummeldung', 'Privat-Fahrzeug',
];
const NUR_ZUSATZ = ['Mapping-Aufpreis'];
function paketRang(p) {
  const i = PAKET_REIHENFOLGE.indexOf(p.name);
  return i < 0 ? 1000 : i;
}

function paketFinden(id) {
  for (const k of kategorien) {
    const p = (k.packages || []).find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function menueBauen() {
  const box = $('menue-kategorien');
  box.textContent = '';
  for (const k of kategorien) {
    const a = document.createElement('a');
    a.href = '#kat-' + k.id;
    a.dataset.ziel = 'kat-' + k.id;
    a.textContent = k.name;
    box.append(a);
  }
}

// Kategorie-Bild: teuerstes Paket der Kategorie, bevorzugt eins, dessen Name mit der Kategorie
// beginnt (bei VIP also "VIP 90 Tage" statt dem Boss-Bundle)
function kategorieBild(k) {
  const passend = k.packages.filter((p) => p.name.toLowerCase().startsWith(k.name.toLowerCase()));
  const teuerstes = [...(passend.length ? passend : k.packages)].sort((a, b) => preis(b) - preis(a))[0];
  return (teuerstes && teuerstes.image) || 'bilder/kokosnuss.webp';
}

// Fassung 5: Kacheln mit grossem Bild, darunter Name, Anzahl und Ab-Preis
function symboleBauen() {
  const box = $('symbole');
  box.textContent = '';
  for (const k of kategorien) {
    const a = document.createElement('a');
    a.className = 'symbol';
    a.href = '#kat-' + k.id;
    a.dataset.ziel = 'kat-' + k.id;
    const bild = document.createElement('span');
    bild.className = 'symbol-bild';
    const img = document.createElement('img');
    img.src = kategorieBild(k);
    img.alt = '';
    img.loading = 'lazy';
    bild.append(img);
    const text = document.createElement('span');
    text.className = 'symbol-text';
    const name = document.createElement('strong');
    name.textContent = k.name;
    const info = document.createElement('small');
    // 28.10.2026: Mapping-Aufpreis (5 €) ist nur ein Zusatz zu den Gebaeuden, zaehlt nicht als Paket und nicht fuers "ab"
    const echte = k.packages.filter((p) => !NUR_ZUSATZ.includes(p.name));
    const ab = Math.min(...echte.map(preis));
    info.textContent = echte.length + (echte.length === 1 ? ' Paket' : ' Pakete') + ' · ab ' + euro(ab);
    text.append(name, info);
    const pfeil = document.createElement('span');
    pfeil.className = 'symbol-pfeil';
    pfeil.setAttribute('aria-hidden', 'true');
    pfeil.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    a.append(bild, text, pfeil);
    // 28.10.2026: Kategorie mit Rabatt bekommt ein Prozent-Schild
    const sale = k.packages.filter((p) => altpreis(p));
    if (sale.length) {
      a.classList.add('im-sale');
      const ecke = document.createElement('span');
      ecke.className = 'rabatt-ecke';
      ecke.textContent = '−' + Math.max(...sale.map(prozent)) + ' %';
      bild.append(ecke);
    }
    box.append(a);
  }
}

// Fassung 5: Bilder hinter der Sale-Karte auf der Buehne. Im Sale drei weitere Angebote, die nicht schon bei den
// Top-Angeboten stehen (deren 3D-Motive sehen auch angeschnitten gut aus), sonst je ein Bild der ersten drei Kategorien.
function buehneBauen() {
  const box = $('buehne-bilder');
  box.textContent = '';
  const oben = new Set(topAngebote(4).map((p) => p.id));
  const spar = (p) => altpreis(p) - preis(p);
  let bilder = salePakete().map((x) => x.p).filter((p) => !oben.has(p.id) && p.image)
    .sort((a, b) => spar(b) - spar(a)).slice(0, 3).map((p) => p.image);
  if (bilder.length < 3) bilder = kategorien.slice(0, 3).map(kategorieBild);
  bilder.forEach((src, i) => {
    const img = document.createElement('img');
    img.className = 'schau-' + (i + 1);
    img.src = src;
    img.alt = '';
    box.append(img);
  });
}

// Fassung 5: Top-Angebote auf der Startseite. Groesste Ersparnis zuerst, abwechselnd aus den Kategorien,
// damit nicht nur Fraktion oben steht. Angezeigt wird in derselben Reihenfolge wie in den Kategorien.
function topAngebote(anzahl) {
  const spar = (x) => altpreis(x.p) - preis(x.p);
  const toepfe = new Map();
  for (const x of salePakete().sort((a, b) => spar(b) - spar(a))) {
    if (!toepfe.has(x.k.id)) toepfe.set(x.k.id, []);
    toepfe.get(x.k.id).push(x);
  }
  const listen = [...toepfe.values()];
  const aus = [];
  while (aus.length < anzahl && listen.some((t) => t.length)) {
    for (const t of listen) if (t.length && aus.length < anzahl) aus.push(t.shift());
  }
  return aus.map((x) => x.p).sort((a, b) => paketRang(a) - paketRang(b) || preis(a) - preis(b));
}

function angeboteBauen() {
  const liste = topAngebote(4);
  $('angebote').hidden = !liste.length;
  const box = $('angebote-liste');
  box.textContent = '';
  if (!liste.length) return;
  $('angebote-mehr').href = '#kat-' + salePakete()[0].k.id;
  for (const p of liste) box.append(paketKarte(p, true));
}

function beliebtBauen() {
  const p = paketFinden(BELIEBT);
  $('beliebt').hidden = !p;
  if (!p) return;
  $('beliebt-img').src = p.image || 'bilder/kokosnuss.webp';
  $('beliebt-name').textContent = p.name;
  preisSetzen($('beliebt-preis'), p);
}

// Fassung 5: Paket als Karte (grosses Bild, Name, Preisblock, Knopf). Fuer Kategorien und Top-Angebote.
// Bild und Name oeffnen die Details; das Bild ist nur fuer die Maus, per Tastatur geht es ueber den Namen.
function paketKarte(p, mitKategorie) {
  const karte = document.createElement('article');
  karte.className = 'paket';

  const bild = document.createElement('button');
  bild.type = 'button';
  bild.className = 'paket-bild';
  bild.tabIndex = -1;
  bild.setAttribute('aria-hidden', 'true');
  bild.addEventListener('click', () => detailsOeffnen(p));
  const img = document.createElement('img');
  img.src = p.image || 'bilder/kokosnuss.webp';
  img.alt = '';
  img.loading = 'lazy';
  img.width = img.height = 400;
  bild.append(img);
  if (altpreis(p)) {
    karte.classList.add('im-sale');
    const ecke = document.createElement('span');
    ecke.className = 'rabatt-ecke';
    ecke.textContent = '−' + prozent(p) + ' %';
    bild.append(ecke);
  }

  const text = document.createElement('div');
  text.className = 'paket-text';
  if (mitKategorie && p.category && p.category.name) {
    const kat = document.createElement('span');
    kat.className = 'paket-kat';
    kat.textContent = p.category.name;
    text.append(kat);
  }
  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'paket-name';
  name.textContent = p.name;
  name.title = 'Details ansehen';
  name.addEventListener('click', () => detailsOeffnen(p));
  text.append(name);

  const pr = document.createElement('span');
  pr.className = 'preis';
  preisSetzen(pr, p);

  const kaufen = document.createElement('button');
  kaufen.type = 'button';
  kaufen.className = 'knopf';
  kaufen.textContent = altpreis(p) ? 'Jetzt sichern' : 'In den Warenkorb';
  kaufen.addEventListener('click', () => beschaeftigt(kaufen, () => hinzu(p.id)));

  karte.append(bild, text, pr, kaufen);
  return karte;
}

function kategorieZeigen(k) {
  saleBannerBauen('sale-kat', k);
  $('kat-titel').textContent = k.name;
  $('kat-bild').src = kategorieBild(k);
  $('kat-anzahl').textContent = k.packages.length + (k.packages.length === 1 ? ' Paket' : ' Pakete');
  $('kat-text').innerHTML = sauber(k.description) || '';
  $('kat-text').hidden = !k.description;
  const box = $('pakete');
  box.textContent = '';
  const liste = [...k.packages].sort((a, b) => paketRang(a) - paketRang(b) || preis(a) - preis(b));
  for (const p of liste) box.append(paketKarte(p));
}

function detailsOeffnen(p) {
  detailPaket = p;
  $('details-titel').textContent = p.name;
  $('details-kat').textContent = (p.category && p.category.name) || '';
  $('details-kaufen').textContent = altpreis(p) ? 'Jetzt sichern' : 'In den Warenkorb';
  // Fassung 5: Bild links in eigener Spalte, Text rechts
  const bild = $('details-bild');
  bild.textContent = '';
  const rahmen = document.createElement('span');
  rahmen.className = 'dialog-bild-rahmen';
  const img = document.createElement('img');
  img.src = p.image || 'bilder/kokosnuss.webp';
  img.alt = '';
  rahmen.append(img);
  if (altpreis(p)) {
    const ecke = document.createElement('span');
    ecke.className = 'rabatt-ecke';
    ecke.textContent = '−' + prozent(p) + ' %';
    rahmen.append(ecke);
  }
  bild.append(rahmen);
  const inhalt = $('details-inhalt');
  inhalt.innerHTML = '';
  const text = document.createElement('div');
  text.innerHTML = sauber(p.description);
  inhalt.append(text);
  preisSetzen($('details-preis'), p);
  $('details').showModal();
}

// ---------- Community-Ziel und letzte Kaeufe ----------
// Fassung 5: nur Markenfarben (vorher waren Grau, Gruen und ein Braun-Gold dabei)
const FARBEN = ['#ff3d7f', '#a74dff', '#e62ad6', '#ff8a3d', '#7b3fbf', '#c13bd8', '#ff2e97', '#8f45ff'];

function wann(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const heute = new Date();
  const gestern = new Date(heute.getTime() - 864e5);
  if (d.toDateString() === heute.toDateString()) return 'Heute ' + uhr;
  if (d.toDateString() === gestern.toDateString()) return 'Gestern ' + uhr;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + uhr;
}

// Beide Kaesten sind immer da (wie Jason es will). Ohne Ziel bzw. ohne Kaeufe steht ein Hinweis drin.
function shopDatenZeigen(d) {
  const ziel = d && d.ziel;
  const prozent = ziel ? ziel.prozent : 0;
  $('ziel-bild').src = (ziel && ziel.bild) || 'bilder/kokosnuss.webp';
  $('ziel-name').textContent = ziel ? ziel.name || '' : 'Bald geht es los';
  $('ziel-fuellung').style.width = prozent + '%';
  $('ziel-balken').setAttribute('aria-valuenow', prozent);
  $('ziel-prozent').textContent = prozent + ' % geschafft';
  const liste = (d && d.kaeufe) || [];
  const box = $('gekauft-liste');
  box.textContent = '';
  if (!liste.length) {
    const li = document.createElement('li');
    li.className = 'gekauft-leer';
    li.textContent = 'Noch keine Käufe. Sei der Erste!';
    box.append(li);
  }
  for (const k of liste) {
    const li = document.createElement('li');
    const bild = document.createElement('span');
    bild.className = 'gekauft-bild';
    bild.textContent = (k.name || '?').trim().charAt(0).toUpperCase();
    let h = 0;
    for (const z of k.name || '') h = (h * 31 + z.charCodeAt(0)) >>> 0;
    bild.style.background = FARBEN[h % FARBEN.length];
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'gekauft-name';
    name.textContent = k.name;
    const zeit = document.createElement('span');
    zeit.className = 'gekauft-zeit';
    zeit.textContent = wann(k.zeit);
    text.append(name, zeit);
    li.append(bild, text);
    box.append(li);
  }
}

async function shopDatenLaden() {
  try {
    const r = await fetch(SHOPDATEN, { cache: 'no-store' });
    if (r.ok) shopDatenZeigen(await r.json());
  } catch (e) { /* Kaesten bleiben einfach aus */ }
}

// ---------- Ansicht (Hash) ----------
function zeigen() {
  const ziel = (location.hash || '#start').slice(1);
  const kat = ziel.startsWith('kat-') ? kategorien.find((k) => 'kat-' + k.id === ziel) : null;
  const hilfe = ziel === 'hilfe';
  const aktiv = kat ? ziel : hilfe ? 'hilfe' : 'start';
  $('ansicht-start').hidden = aktiv !== 'start';
  $('ansicht-kategorie').hidden = !kat;
  $('ansicht-hilfe').hidden = !hilfe;
  if (kat) kategorieZeigen(kat);
  document.querySelectorAll('.menue a, .symbol').forEach((a) => {
    if (a.dataset.ziel === aktiv) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = kat ? kat.name + ' · Sin City Shop' : hilfe ? 'Hilfe · Sin City Shop' : 'Sin City Shop';
}

// ---------- Warenkorb ----------
async function korbLaden() {
  const id = gemerkt();
  if (!id) { korb = null; return null; }
  try {
    korb = await api(`/accounts/${TOKEN}/baskets/${id}`);
    if (korb.complete) { merken(null); korb = null; }
  } catch (e) {
    if (e.status >= 400 && e.status < 500) { merken(null); korb = null; } else throw e;
  }
  return korb;
}

async function korbNeu() {
  korb = await api(`/accounts/${TOKEN}/baskets`, {
    method: 'POST',
    body: JSON.stringify({ complete_url: SEITE + '?fertig=1', cancel_url: SEITE, complete_auto_redirect: true }),
  });
  merken(korb.ident);
  return korb;
}

// Tebex verlangt bei FiveM erst den Cfx.re-Login, dann duerfen Pakete in den Korb.
async function anmelden(paketId) {
  const zurueck = SEITE + (paketId ? '?add=' + paketId : '') + (location.hash || '');
  const links = await api(`/accounts/${TOKEN}/baskets/${korb.ident}/auth?returnUrl=` + encodeURIComponent(zurueck));
  const link = (Array.isArray(links) ? links : [links]).find((x) => x && x.url);
  if (!link) throw new Error('Tebex hat keinen Login-Link geschickt.');
  location.href = link.url;
}

async function hinzu(paketId) {
  if (!korb) await korbLaden();
  if (!korb) await korbNeu();
  if (!korb.username) return anmelden(paketId);
  await api(`/baskets/${korb.ident}/packages`, { method: 'POST', body: JSON.stringify({ package_id: paketId, quantity: 1 }) });
  await korbLaden();
  korbZeigen();
  const p = paketFinden(paketId);
  hinweis((p ? p.name : 'Paket') + ' liegt im Warenkorb.', true);
}

async function entfernen(paketId) {
  await api(`/baskets/${korb.ident}/packages/remove`, { method: 'POST', body: JSON.stringify({ package_id: paketId }) });
  await korbLaden();
  korbZeigen();
}

async function creatorCode(code) {
  await api(`/accounts/${TOKEN}/baskets/${korb.ident}/creator-codes`, { method: 'POST', body: JSON.stringify({ creator_code: code }) });
  await korbLaden();
  korbZeigen();
  hinweis('Creator-Code gespeichert. Danke für deine Unterstützung!', true);
}

function korbZeigen() {
  const pakete = (korb && korb.packages) || [];
  const liste = $('korb-liste');
  liste.textContent = '';
  for (const p of pakete) {
    const menge = (p.in_basket && p.in_basket.quantity) || 1;
    const einzel = (p.in_basket && p.in_basket.price) ?? preis(p);
    const li = document.createElement('li');
    // Fassung 5: kleines Paketbild vorne
    const bild = document.createElement('img');
    bild.className = 'korb-bild';
    bild.alt = '';
    const katalog = paketFinden(p.id);
    bild.src = p.image || (katalog && katalog.image) || 'bilder/kokosnuss.webp';
    const name = document.createElement('span');
    name.className = 'korb-name';
    name.textContent = (menge > 1 ? menge + '× ' : '') + p.name;
    const pr = document.createElement('span');
    pr.className = 'preis';
    pr.textContent = euro(einzel * menge);
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.textContent = '✕';
    weg.setAttribute('aria-label', p.name + ' entfernen');
    weg.addEventListener('click', () => beschaeftigt(weg, () => entfernen(p.id)));
    li.append(bild, name, pr, weg);
    liste.append(li);
  }
  const voll = pakete.length > 0;
  $('korb-leer').hidden = voll;
  $('korb-summe').hidden = !voll;
  $('korb-betrag').textContent = euro(korb ? (korb.total_price ?? korb.base_price) : 0);
  $('zur-kasse').hidden = !voll;
  $('creator-form').hidden = !voll;
  if (korb && korb.creator_code) $('creator-code').value = korb.creator_code;
  // Kopf: Login oder Name
  const angemeldet = !!(korb && korb.username);
  $('login').hidden = angemeldet;
  $('angemeldet').hidden = !angemeldet;
  $('angemeldet-name').textContent = angemeldet ? korb.username : '';
}

async function einloggen() {
  if (!korb) await korbLaden();
  if (!korb) await korbNeu();
  await anmelden(null);
}

function zurKasse() {
  if (!korb) return;
  location.href = (korb.links && korb.links.checkout) || ('https://pay.tebex.io/' + korb.ident);
}

// ---------- Start ----------
document.querySelectorAll('[data-schliessen]').forEach((b) => b.addEventListener('click', () => $('details').close()));
$('details').addEventListener('click', (e) => { if (e.target === $('details')) $('details').close(); });
$('details-kaufen').addEventListener('click', (e) => beschaeftigt(e.currentTarget, async () => {
  if (detailPaket) await hinzu(detailPaket.id);
  $('details').close();
}));
$('zur-kasse').addEventListener('click', zurKasse);
$('login').addEventListener('click', (e) => beschaeftigt(e.currentTarget, einloggen));
$('abmelden').addEventListener('click', () => { merken(null); korb = null; korbZeigen(); hinweis('Abgemeldet. Der Warenkorb ist leer.', true); });
$('beliebt-bild').addEventListener('click', () => { const p = paketFinden(BELIEBT); if (p) detailsOeffnen(p); });
$('beliebt-kaufen').addEventListener('click', (e) => beschaeftigt(e.currentTarget, () => hinzu(BELIEBT)));
$('creator-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('creator-code').value.trim();
  if (code) beschaeftigt(e.submitter, () => creatorCode(code));
});
window.addEventListener('hashchange', () => { zeigen(); $('inhalt').focus({ preventScroll: true }); });

(async function start() {
  const q = new URLSearchParams(location.search);
  const neuesPaket = Number(q.get('add')) || null;
  if (q.has('fertig')) {
    merken(null);
    hinweis('Danke für deinen Kauf! Deine Transaktions-ID (tbx-…) kommt per E-Mail. Einlösen im Spiel mit F4 → „Code einlösen“.', true);
  }
  if (location.search) history.replaceState(null, '', SEITE + location.hash);
  shopDatenZeigen(null);
  shopDatenLaden();
  try {
    await Promise.all([katalogLaden(), korbLaden()]);
    menueBauen();
    symboleBauen();
    buehneBauen();
    angeboteBauen();
    beliebtBauen();
    saleBannerBauen('sale-start', null);
    zeigen();
    korbZeigen();
    $('laden').hidden = true;
    if (neuesPaket && korb && korb.username) await hinzu(neuesPaket);
    else if (neuesPaket) hinweis('Die Anmeldung mit FiveM hat nicht geklappt. Versuch es bitte nochmal.');
  } catch (e) {
    $('laden').textContent = 'Der Shop konnte nicht geladen werden. Bitte lade die Seite neu.';
    hinweis(fehlerText(e));
  }
})();
