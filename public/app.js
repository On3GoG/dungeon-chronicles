// Веб-клиент прототипа «Хроники Подземелий». Без фреймворков.
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

const ICONS = {
  attack: '<path d="M14.5 3 21 3v6.5L10 20.5 8.5 22 7 20.5l1.5-1.5-3-3L4 17.5 2.5 16 4 14.5 3.5 14 14.5 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  magic: '<path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="currentColor"/><circle cx="19" cy="19" r="1.6" fill="currentColor"/>',
  talk: '<path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  sneak: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="1.8"/>',
  explore: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 6 6" stroke="currentColor" stroke-width="1.8"/>',
  item: '<path d="M9 3h6v4l3 3v11H6V10l3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  rest: '<path d="M4 18c3-1 5-4 5-8a7 7 0 1 0 11 6c-6 2-12-2-12-8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  move: '<path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  other: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.other}</svg>`;

let meta = null;
let game = null;
let rendered = 0;
let busy = false;
let selectedPreset = null;

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || `Ошибка ${res.status}`); e.code = data.error; e.status = res.status; throw e; }
  return data;
}

function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ------------------------------------------------------------------ старт

async function showStart() {
  $('#game').hidden = true;
  $('#start').hidden = false;
  if (!meta) meta = await api('/api/meta');
  $('#ai-mode').textContent = meta.aiMode === 'yandex' ? 'Мастер: YandexGPT (Алиса AI)' : 'Мастер: заглушка для разработки (без ИИ)';
  $('#presets').innerHTML = meta.presets.map((p) => `
    <button class="preset" role="radio" aria-checked="false" data-id="${p.id}">
      <span class="p-title">${esc(p.title)}</span>
      <span class="p-name">${esc(p.name)}, ${esc(p.origin)}</span>
      <span class="p-blurb">${esc(p.blurb)}</span>
      <span class="p-stats">Хиты ${p.hp} · КД ${p.ac}</span>
    </button>`).join('');
  $('#continue-box').hidden = !store.get('dc_game');
}

$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b) return;
  selectedPreset = b.dataset.id;
  document.querySelectorAll('.preset').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  $('#btn-new').disabled = false;
});

$('#btn-new').addEventListener('click', async () => {
  if (!selectedPreset) return;
  $('#btn-new').disabled = true;
  try {
    game = await api('/api/games', { preset: selectedPreset, name: $('#hero-name').value });
    store.set('dc_game', game.id);
    enterGame();
  } catch (e) { toast(e.message); } finally { $('#btn-new').disabled = false; }
});

$('#btn-continue').addEventListener('click', async () => {
  try {
    game = await api(`/api/games/${store.get('dc_game')}`);
    enterGame();
  } catch (e) {
    store.del('dc_game');
    $('#continue-box').hidden = true;
    toast(e.message);
  }
});

// ------------------------------------------------------------------ игра

function enterGame() {
  $('#start').hidden = true;
  $('#game').hidden = false;
  $('#feed').innerHTML = '';
  rendered = 0;
  render(false);
}

function rollHtml(r, animate) {
  const cls = r.success ? (r.critical ? 'success crit' : 'success') : 'fail';
  const adv = r.advantage === 'advantage' ? ' · преимущество' : r.advantage === 'disadvantage' ? ' · помеха' : '';
  const dice = r.dice.length > 1 ? ` (${r.dice.join(' и ')})` : '';
  const mod = r.modifier ? ` ${r.modifier > 0 ? '+' : '−'} ${Math.abs(r.modifier)}` : '';
  return `<div class="roll ${animate ? 'rolling' : cls}" data-final="${cls}" data-nat="${r.natural}">
    <div class="die">${animate ? '?' : r.natural}</div>
    <div><div>${esc(r.label)}${adv}</div>
    <div class="muted small">${r.natural}${dice}${mod} = <b>${r.total}</b> против ${r.dc} · <span class="r-res">${r.success ? (r.critical ? 'крит!' : 'успех') : 'провал'}</span></div></div>
  </div>`;
}

function turnHtml(t, animate) {
  const parts = [];
  if (t.player) parts.push(`<div class="player">${esc(t.player)}</div>`);
  if (t.roll) parts.push(rollHtml(t.roll, animate));
  for (const n of t.notes || []) parts.push(`<div class="note">${esc(n)}</div>`);
  parts.push(`<div class="narration${t.outcome === 'intro' ? ' intro' : ''}">${esc(t.narration)}</div>`);
  if (t.events && t.events.length) {
    parts.push(`<details class="events"><summary>Механика хода</summary><ul>${t.events.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>`);
  }
  return `<article class="turn" data-n="${t.n}">${parts.join('')}</article>`;
}

function animateRoll(el) {
  const roll = el.querySelector('.roll.rolling');
  if (!roll) return Promise.resolve();
  const die = roll.querySelector('.die');
  const narr = el.querySelector('.narration');
  narr.style.visibility = 'hidden';
  const timer = setInterval(() => { die.textContent = 1 + Math.floor(Math.random() * 20); }, 60);
  return new Promise((done) => setTimeout(() => {
    clearInterval(timer);
    die.textContent = roll.dataset.nat;
    roll.classList.remove('rolling');
    roll.className = `roll ${roll.dataset.final}`;
    narr.style.visibility = '';
    done();
  }, 800));
}

function scrollFeed() {
  const f = $('#feed');
  f.scrollTop = f.scrollHeight;
}

async function render(animate = true) {
  const feed = $('#feed');
  feed.querySelector('.thinking')?.remove();
  const fresh = game.history.slice(rendered);
  for (const t of fresh) {
    feed.insertAdjacentHTML('beforeend', turnHtml(t, animate && t.roll));
    const el = feed.lastElementChild;
    if (animate) { scrollFeed(); await animateRoll(el); }
  }
  rendered = game.history.length;
  if (game.status === 'won' && !feed.querySelector('.victory')) {
    feed.insertAdjacentHTML('beforeend', `<div class="victory"><h3>Победа!</h3><p>Дети вернулись домой. Вересковка не забудет ${esc(game.hero.name)}.</p><button class="btn btn-primary wide" id="btn-again">Новое приключение</button></div>`);
    $('#btn-again').addEventListener('click', () => { store.del('dc_game'); showStart(); });
  }
  renderHud();
  renderChoices();
  scrollFeed();
}

function renderHud() {
  const h = game.hero;
  $('#hud-name').textContent = h.name;
  $('#hud-hp').textContent = `${h.hp}/${h.maxHp}`;
  $('#hud-hp-fill').style.width = `${Math.max(0, (h.hp / h.maxHp) * 100)}%`;
  $('#hud-loc').textContent = game.location.name;
  $('#hud-loc').classList.toggle('danger', game.location.danger);
  $('#hud-energy').textContent = game.energy.value;
  $('#btn-energy').classList.toggle('low', game.energy.value < 5);
}

function renderChoices() {
  const last = game.history[game.history.length - 1];
  const box = $('#choices');
  if (game.status === 'won') { box.innerHTML = ''; return; }
  box.innerHTML = (last?.choices || []).map((c) => `<button class="choice" data-label="${esc(c.label)}">${icon(c.icon)}<span>${esc(c.label)}</span></button>`).join('');
  setBusy(busy);
}

function setBusy(v) {
  busy = v;
  document.querySelectorAll('.choice, #btn-send').forEach((b) => { b.disabled = v; });
}

async function sendAction(text) {
  text = text.trim();
  if (!text || busy) return;
  if (game.energy.value < game.energy.perTurn) { openPanel('energy-panel'); return; }
  setBusy(true);
  const feed = $('#feed');
  feed.insertAdjacentHTML('beforeend', `<div class="player turn">${esc(text)}</div><div class="thinking">Мастер думает <span class="dots"><span></span><span></span><span></span></span></div>`);
  scrollFeed();
  try {
    game = await api(`/api/games/${game.id}/turn`, { action: text });
    $('#action').value = '';
    autosize();
    feed.querySelectorAll('.player.turn').forEach((x) => x.remove()); // заменим настоящим ходом
    await render(true);
  } catch (e) {
    feed.querySelector('.thinking')?.remove();
    feed.querySelectorAll('.player.turn').forEach((x) => x.remove());
    if (e.code === 'no_energy') openPanel('energy-panel');
    toast(e.message, 5000);
  } finally {
    setBusy(false);
  }
}

$('#choices').addEventListener('click', (e) => {
  const b = e.target.closest('.choice');
  if (b) sendAction(b.dataset.label);
});
$('#action-form').addEventListener('submit', (e) => { e.preventDefault(); sendAction($('#action').value); });
$('#action').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAction($('#action').value); }
});
function autosize() {
  const a = $('#action');
  a.style.height = 'auto';
  a.style.height = `${Math.min(120, a.scrollHeight)}px`;
}
$('#action').addEventListener('input', autosize);

// ------------------------------------------------------------------ панели

function openPanel(id) {
  if (id === 'sheet') renderSheet();
  if (id === 'journal') renderJournal();
  if (id === 'energy-panel') renderEnergy();
  $(`#${id}`).hidden = false;
}
document.querySelectorAll('.panel').forEach((p) => p.addEventListener('click', (e) => {
  if (e.target === p || e.target.closest('.panel-close')) p.hidden = true;
}));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.panel)));
$('#btn-sheet').addEventListener('click', () => openPanel('sheet'));
$('#btn-energy').addEventListener('click', () => openPanel('energy-panel'));

function renderSheet() {
  const h = game.hero;
  const sign = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  $('#sheet-body').innerHTML = `
    <h2>${esc(h.name)}</h2>
    <p class="muted">${esc(h.origin)}, ${esc(h.cls)} ${h.level} уровня · опыт ${h.xp}${h.xpNext ? ` / ${h.xpNext}` : ''}</p>
    <div class="kv"><span>Хиты <b>${h.hp}/${h.maxHp}</b></span><span>КД <b>${h.ac}</b></span><span>Золото <b>${h.gold}</b></span>${h.spellDc ? `<span>СЛ заклинаний <b>${h.spellDc}</b></span>` : ''}</div>
    ${h.conditions.length ? `<p class="note">Состояния: ${esc(h.conditions.join(', '))}</p>` : ''}
    <h3>Характеристики</h3>
    <div class="abil">${h.abilities.map((a) => `<div><b>${sign(a.mod)}</b><span>${esc(a.name)} ${a.score}</span></div>`).join('')}</div>
    <h3>Навыки</h3><div class="tags">${h.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
    ${h.spells.length ? `<h3>Заклинания</h3>
      <p class="slots small">${h.slots.map((s) => `Ячейки ${s.level} ур.: ${'●'.repeat(s.left)}${'○'.repeat(s.max - s.left)}`).join(' · ')}</p>
      <div class="tags">${h.spells.map((s) => `<span class="tag">${esc(s.name)}${s.level ? ` · ${s.level}` : ''}</span>`).join('')}</div>` : ''}
    <h3>Снаряжение</h3>
    <div class="tags">${h.inventory.map((i) => `<span class="tag">${esc(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ''}</span>`).join('')}</div>`;
}

function renderJournal() {
  const q = game.quests.length ? `<h3>Сюжет</h3><ul class="journal-list">${game.quests.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const j = game.journal.length ? `<h3>Записи</h3><ul class="journal-list">${game.journal.slice().reverse().map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">Пока пусто. Важные факты появятся здесь сами.</p>';
  $('#journal-body').innerHTML = `<p class="muted small">Кампания «${esc(game.campaign)}» · ход ${game.turn}</p>${q}${j}`;
}

function renderEnergy() {
  $('#energy-now').textContent = game.energy.value;
  $('#ad-reward').textContent = game.energy.adReward;
  $('#pack-reward').textContent = game.energy.packReward;
  $('#ads-left').textContent = game.energy.adsLeft > 0 ? `осталось сегодня: ${game.energy.adsLeft}` : 'на сегодня всё';
  $('#btn-ad').disabled = game.energy.adsLeft <= 0;
}

$('#btn-ad').addEventListener('click', () => {
  const sim = $('#ad-sim');
  let n = 3;
  $('#ad-count').textContent = n;
  sim.hidden = false;
  const t = setInterval(async () => {
    n -= 1;
    $('#ad-count').textContent = n;
    if (n > 0) return;
    clearInterval(t);
    sim.hidden = true;
    try { game = await api(`/api/games/${game.id}/energy`, { source: 'ad' }); renderHud(); renderEnergy(); toast(`+${game.energy.adReward} ⚡`); } catch (e) { toast(e.message); }
  }, 1000);
});
$('#btn-buy').addEventListener('click', async () => {
  try { game = await api(`/api/games/${game.id}/energy`, { source: 'purchase' }); renderHud(); renderEnergy(); toast('Тестовая покупка прошла'); } catch (e) { toast(e.message); }
});
$('#btn-to-start').addEventListener('click', () => {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  showStart();
});
$('#btn-stats').addEventListener('click', async () => {
  const s = await api('/api/stats');
  const box = $('#stats-body');
  box.hidden = false;
  box.textContent = [
    `ИИ: ${s.aiMode === 'yandex' ? `${s.models.arbiter} / ${s.models.narrator}` : 'заглушка'}`,
    `Ходов всего: ${s.turns}, с настоящим ИИ: ${s.realTurns}`,
    `Потрачено: ${s.totalRub} ₽, в среднем ${s.avgRubPerTurn} ₽ за ход`,
    `Среднее время ответа: ${(s.avgMs / 1000).toFixed(1)} с`,
    `Токенов на ход: вход ${s.avgTokensIn}, выход ${s.avgTokensOut}, из кэша ${s.cachedShare}%`,
    `Повторы из-за плохого JSON: ${s.retries}, запасной вариант: ${s.fallbacks}`,
    `Исправлений стража: ${s.guardFixes}, отказов: ${s.rejected}, вырезано вставок: ${s.filtered}`,
  ].join('\n');
});

// ------------------------------------------------------------------ запуск

(async () => {
  try {
    const id = store.get('dc_game');
    if (id) {
      try { game = await api(`/api/games/${id}`); enterGame(); return; } catch { store.del('dc_game'); }
    }
    await showStart();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:24px">Сервер недоступен: ${esc(e.message)}</p>`;
  }
})();
