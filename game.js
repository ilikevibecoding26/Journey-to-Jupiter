// ─────────────────────────────────────────────
//  JOURNEY TO JUPITER — game.js
//  All game logic lives here.
// ─────────────────────────────────────────────

// ── Supabase auth (plain fetch — no SDK needed) ──
const SUPA_URL = 'https://zvzajodcyglizsgvhkmu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2emFqb2RjeWdsaXpzZ3Zoa211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNzQ0ODMsImV4cCI6MjA5MTY1MDQ4M30.NiAv0K6ij4LQ4_raE1vk3RZ7VEXuZWbUd5hTM5lyZ7M';
const SUPA_HEADERS = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

async function supaSelect(table, filters) {
  const params = Object.entries(filters).map(([k,v])=>`${k}=eq.${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: SUPA_HEADERS });
  return r.json();
}
async function supaInsert(table, row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method:'POST', headers: SUPA_HEADERS, body: JSON.stringify(row) });
  const data = await r.json();
  return { data, error: r.ok ? null : data };
}

function hashPIN(pin) {
  // Simple deterministic hash — no crypto API needed (works over http)
  let h = 5381;
  const s = 'jtj_salt_' + pin;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36) + pin.split('').map(c=>((c*7+13)%36).toString(36)).join('');
}

// ── Floating username input ───────────────────
const _authInput = document.createElement('input');
_authInput.type = 'text';
_authInput.maxLength = 12;
_authInput.placeholder = 'USERNAME';
_authInput.autocomplete = 'off';
_authInput.autocapitalize = 'characters';
Object.assign(_authInput.style, {
  position:'fixed', left:'50%', top:'30%', transform:'translateX(-50%)',
  width:'220px', padding:'12px 16px', fontSize:'20px', fontFamily:'monospace',
  fontWeight:'bold', textAlign:'center', letterSpacing:'3px',
  background:'rgba(10,10,40,0.95)', color:'#fff', border:'2px solid #ffd700',
  borderRadius:'10px', outline:'none', display:'none', zIndex:'9999',
  textTransform:'uppercase'
});
document.body.appendChild(_authInput);

_authInput.addEventListener('input', () => {
  state.authUsername = _authInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  _authInput.value = state.authUsername;
});
_authInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { _authInput.style.display='none'; _authInput.blur(); }
});
_authInput.addEventListener('blur', () => { _authInput.style.display='none'; });

function showAuthInput() {
  _authInput.value = state.authUsername;
  _authInput.style.display = 'block';
  _authInput.focus();
}

function loadAuthSession() {
  try { return JSON.parse(localStorage.getItem('jtj_auth') || 'null'); } catch { return null; }
}
function saveAuthSession(obj) {
  if (obj) localStorage.setItem('jtj_auth', JSON.stringify(obj));
  else localStorage.removeItem('jtj_auth');
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// The game always renders at this internal size.
// CSS scales the canvas element to fit the screen.
const CANVAS_W = 390;
const CANVAS_H = 844;
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// ── Settings (persisted) ──────────────────────
const settings = {
  soundEnabled: localStorage.getItem('jtj_sound') !== 'off',
};
function saveSettings() {
  localStorage.setItem('jtj_sound', settings.soundEnabled ? 'on' : 'off');
}
// ── Name-entry overlay (HTML input over canvas) ──
let _nameInputEl = null;

function getNameInputEl() {
  if (_nameInputEl) return _nameInputEl;
  _nameInputEl = document.createElement('input');
  _nameInputEl.type        = 'text';
  _nameInputEl.maxLength   = 8;
  _nameInputEl.placeholder = 'YOUR NAME';
  _nameInputEl.autocomplete = 'off';
  _nameInputEl.autocorrect  = 'off';
  _nameInputEl.spellcheck   = false;
  Object.assign(_nameInputEl.style, {
    position:    'fixed',
    fontFamily:  'monospace',
    fontWeight:  'bold',
    textAlign:   'center',
    textTransform: 'uppercase',
    letterSpacing: '4px',
    background:  'rgba(0,0,20,0.92)',
    color:       '#ffd060',
    border:      '2px solid rgba(255,200,60,0.85)',
    borderRadius:'12px',
    outline:     'none',
    display:     'none',
    zIndex:      '999',
    boxSizing:   'border-box',
  });
  _nameInputEl.addEventListener('input', () => {
    _nameInputEl.value = _nameInputEl.value.toUpperCase().replace(/[^A-Z0-9 _\-]/g, '');
  });
  _nameInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNameEntry(_nameInputEl.value);
  });
  document.body.appendChild(_nameInputEl);
  return _nameInputEl;
}

function showNameInput() {
  const el   = getNameInputEl();
  el.value   = '';
  el.style.display = 'block';
  // Position over the canvas input zone
  function positionInput() {
    const rect  = canvas.getBoundingClientRect();
    const scale = rect.width / CANVAS_W;
    const w = Math.round(220 * scale);
    const h = Math.round(48 * scale);
    el.style.left     = Math.round(rect.left + (CANVAS_W / 2 - 110) * scale) + 'px';
    el.style.top      = Math.round(rect.top  + 430 * scale) + 'px';
    el.style.width    = w + 'px';
    el.style.height   = h + 'px';
    el.style.fontSize = Math.round(18 * scale) + 'px';
    el.style.padding  = Math.round(8 * scale) + 'px ' + Math.round(12 * scale) + 'px';
  }
  positionInput();
  setTimeout(() => el.focus(), 80);
}

function hideNameInput() {
  if (_nameInputEl) _nameInputEl.style.display = 'none';
}

// nameInputCallback lets any screen reuse the name-entry overlay
let nameInputCallback = null;

function submitNameEntry(rawName) {
  hideNameInput();
  if (nameInputCallback) {
    const cb = nameInputCallback;
    nameInputCallback = null;
    cb((rawName || '').toUpperCase().trim().slice(0, 8) || 'PILOT');
    return;
  }
  // Default: leaderboard name entry after winning
  // Use the logged-in username if available, otherwise use typed name
  const name  = (state.authUser && !state.authUser.isGuest)
    ? state.authUser.username
    : (rawName || '').toUpperCase().trim().slice(0, 8) || 'PILOT';
  const board = submitTime(state.pendingTime, name);
  state.leaderboard = board;
  const pos = board.findIndex(e => e.time === state.pendingTime && e.name === name);
  const { earned, total } = awardCoins(pos + 1);
  state.coinsEarned = earned;
  state.coins       = total;
  // Submit to global leaderboard (best effort, non-blocking)
  submitGlobalScore(name, state.pendingTime);
  updateStatsAfterRun(true);
  updateDailyChallengeAfterRun();
  checkAchievements();
  state.firstRunBonus = false;
  state.screen = 'win';
}



// ── Audio engine (Web Audio API, procedural) ──
let _audioCtx = null;
function getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// Smooth ramp helper
function ramp(param, value, time) {
  param.setTargetAtTime(value, getAudio().currentTime, time);
}

function sfxLaunchRumble() {
  if (!settings.soundEnabled) return;
  const ac  = getAudio();
  const buf = ac.createBuffer(1, ac.sampleRate * 2.8, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate;
    const env = Math.min(t / 0.3, 1) * Math.max(0, 1 - (t - 2.0) / 0.8);
    data[i] = (Math.random() * 2 - 1) * env * 0.35;
  }
  const src  = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 180;
  const gain = ac.createGain();
  gain.gain.value = 1;
  src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
  src.start();
}

function sfxStarCollect() {
  if (!settings.soundEnabled) return;
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12);
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.25);
}

function sfxHit() {
  if (!settings.soundEnabled) return;
  const ac   = getAudio();
  const buf  = ac.createBuffer(1, ac.sampleRate * 0.25, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t   = i / ac.sampleRate;
    const env = Math.max(0, 1 - t / 0.25);
    data[i]   = (Math.random() * 2 - 1) * env * 0.5;
  }
  const src  = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 220; filt.Q.value = 0.8;
  const gain = ac.createGain();
  gain.gain.value = 1;
  src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
  src.start();
}

function sfxShieldBreak() {
  if (!settings.soundEnabled) return;
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, ac.currentTime + 0.3);
  gain.gain.setValueAtTime(0.14, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.32);
}

function sfxPowerupCollect() {
  if (!settings.soundEnabled) return;
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(660, ac.currentTime);
  osc.frequency.setValueAtTime(880, ac.currentTime + 0.08);
  osc.frequency.setValueAtTime(1100, ac.currentTime + 0.16);
  gain.gain.setValueAtTime(0.14, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.32);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.35);
}

function sfxBoost() {
  if (!settings.soundEnabled) return;
  const ac   = getAudio();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1800, ac.currentTime + 0.25);
  gain.gain.setValueAtTime(0.0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(0.16, ac.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(); osc.stop(ac.currentTime + 0.5);
}

// ── Time formatter ────────────────────────────
function formatTime(seconds) {
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return m > 0
    ? `${m}:${String(s).padStart(2, '0')}.${ms}`
    : `${s}.${ms}s`;
}

// ── Leaderboard (top 5 fastest trips to Jupiter) ──
function loadLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem('jtj_times') || '[]');
    // Migrate plain-number entries from the old format
    return raw.map(e => (typeof e === 'number' ? { name: 'PILOT', time: e } : e));
  } catch { return []; }
}
function saveLeaderboard(board) {
  localStorage.setItem('jtj_times', JSON.stringify(board));
}
function submitTime(time, name) {
  name = (name || 'PILOT').toUpperCase().trim().slice(0, 8) || 'PILOT';
  const board = loadLeaderboard();
  board.push({ time, name });
  board.sort((a, b) => a.time - b.time);   // ascending: fastest first
  const top5 = board.slice(0, 5);
  saveLeaderboard(top5);
  return top5;
}
function timeQualifies(time) {
  const board = loadLeaderboard();
  return board.length < 5 || time < board[board.length - 1].time;
}


// ── Coin system ───────────────────────────────
// Coins are earned by finishing a Jupiter trip and placing on the leaderboard.
// 1st place = 5 coins, 2nd = 4, 3rd = 3, 4th = 2, 5th = 1
const COIN_AWARDS = [5, 4, 3, 2, 1];

function loadCoins() {
  return parseInt(localStorage.getItem('jtj_coins') || '0', 10);
}
function saveCoins(n) {
  localStorage.setItem('jtj_coins', String(Math.max(0, n)));
}

// ── Daily login + first-run bonus helpers ──────
function getTodayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function checkDailyLogin() {
  const today     = getTodayStr();
  const lastLogin = localStorage.getItem('jtj_last_login') || '';
  if (lastLogin === today) return; // already claimed today
  const streak    = parseInt(localStorage.getItem('jtj_login_streak') || '0', 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = (lastLogin === yesterday) ? streak + 1 : 1;
  const rewards   = [0, 3, 5, 8, 12]; // index = day (4+ → 12)
  const coins     = rewards[Math.min(newStreak, rewards.length - 1)];
  state.coins += coins;
  saveCoins(state.coins);
  localStorage.setItem('jtj_last_login',   today);
  localStorage.setItem('jtj_login_streak', String(newStreak));
  state.dailyBonus = { show: true, coins, streak: newStreak, life: 5.0 };
}
function checkFirstRunBonus() {
  const today = getTodayStr();
  if (localStorage.getItem('jtj_last_firstrun') !== today) {
    state.firstRunBonus = true;
    localStorage.setItem('jtj_last_firstrun', today);
  }
}
// Returns the effective coin multiplier (pickup ×2 + first-run ×2 stack)
function getCoinMult() {
  return state.coinMultiplier * (state.firstRunBonus ? 2 : 1);
}

function awardCoins(leaderboardPosition) {
  // leaderboardPosition is 1-indexed (1 = fastest)
  const earned = COIN_AWARDS[leaderboardPosition - 1] || 0;
  const total  = loadCoins() + earned;
  if (earned > 0) saveCoins(total);
  return { earned, total };
}

// ── Global leaderboard (Supabase) ─────────────────
async function fetchGlobalLeaderboard() {
  state.globalLbLoading = true;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/jtj_scores?select=username,time&order=time.asc&limit=10`,
      { headers: SUPA_HEADERS }
    );
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        state.globalLeaderboard = data.map(e => ({ name: e.username, time: e.time }));
      }
    }
  } catch(e) {}
  state.globalLbLoading = false;
}

async function submitGlobalScore(username, time) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/jtj_scores`, {
      method: 'POST',
      headers: SUPA_HEADERS,
      body: JSON.stringify({ username, time })
    });
  } catch(e) {}
}

// ── Background draw functions ────────────────────────────────────────────────
// Classic: replicates the zone-based nebula (always on)
// ── Background environments (each paints a complete full-screen scene) ───────

function drawBgClassic() { drawNebula(); }

// NEBULA — inside a vivid pink/purple gas cloud
function drawBgNebula() {
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#1a0030');bg.addColorStop(0.5,'#2e0050');bg.addColorStop(1,'#0e0020');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  const t=gameTime*0.07;
  [[80+Math.sin(t)*25,220,220,'255,40,180',0.55],[310+Math.cos(t*0.9)*30,380,200,'180,0,255',0.50],
   [180+Math.sin(t*1.1)*20,620,190,'80,180,255',0.45],[250+Math.cos(t*0.7)*35,100,160,'255,100,220',0.40]
  ].forEach(([x,y,r,c,a])=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);
    ctx.fillStyle=g;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  });
  // haze overlay
  const h=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);
  h.addColorStop(0,'rgba(120,0,180,0.12)');h.addColorStop(1,'rgba(40,0,80,0.18)');
  ctx.fillStyle=h;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
}

// AURORA — northern lights, tall curtains of colour
function drawBgAurora() {
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000d08');bg.addColorStop(0.4,'#001a10');bg.addColorStop(1,'#000810');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  const t=gameTime*0.35;
  // tall vertical curtain columns
  for(let i=0;i<10;i++){
    const x=CANVAS_W*(i/10)+Math.sin(t+i*0.8)*22;
    const hue=140+i*12+Math.sin(t*0.4+i)*18;
    const a=0.18+0.12*Math.sin(t*0.7+i*1.1);
    const g=ctx.createLinearGradient(x,0,x+CANVAS_W*0.12,CANVAS_H);
    g.addColorStop(0,`hsla(${hue},100%,55%,${a*1.4})`);
    g.addColorStop(0.5,`hsla(${hue},100%,50%,${a})`);
    g.addColorStop(1,`hsla(${hue+20},100%,45%,${a*0.3})`);
    ctx.fillStyle=g;ctx.fillRect(x-10,0,CANVAS_W*0.14,CANVAS_H);
  }
  // soft top glow source
  const top=ctx.createLinearGradient(0,0,0,CANVAS_H*0.35);
  top.addColorStop(0,'rgba(0,255,160,0.18)');top.addColorStop(1,'rgba(0,255,160,0)');
  ctx.fillStyle=top;ctx.fillRect(0,0,CANVAS_W,CANVAS_H*0.35);
}

// DEEP — inside a dense globular cluster, warm amber/gold everywhere
function drawBgDeep() {
  // Rich amber base — nothing like classic dark space
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#1a0e00');bg.addColorStop(0.35,'#2a1800');bg.addColorStop(0.7,'#1e1000');bg.addColorStop(1,'#0e0800');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // bright cluster core glow — warm gold
  const core=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H*0.44,0,CANVAS_W/2,CANVAS_H*0.44,260);
  core.addColorStop(0,'rgba(255,230,120,0.55)');core.addColorStop(0.3,'rgba(255,180,60,0.35)');
  core.addColorStop(0.6,'rgba(200,120,20,0.18)');core.addColorStop(1,'rgba(100,50,0,0)');
  ctx.fillStyle=core;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // secondary warm haze patches
  [[80,200,120,'255,160,40',0.22],[320,500,140,'255,200,80',0.18],[160,700,100,'255,140,20',0.20]].forEach(([x,y,r,c,a])=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);
    ctx.fillStyle=g;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  });
  // hundreds of twinkling amber/white stars
  for(let i=0;i<80;i++){
    const sx=((i*113.7+41)%CANVAS_W),sy=((i*79.3+17)%CANVAS_H);
    const a=(0.35+0.55*((i*11%10)/10))*(0.7+0.3*Math.sin(gameTime*2.5+i*0.8));
    const sz=0.5+(i%5)*0.28;
    const warm=i%3===0?'255,220,120':'255,245,200';
    ctx.beginPath();ctx.arc(sx,sy,sz,0,Math.PI*2);ctx.fillStyle=`rgba(${warm},${a})`;ctx.fill();
  }
}

// SUPERNOVA — the whole screen is an inferno, deep crimson/orange throughout
function drawBgSupernova() {
  const pulse=0.5+0.5*Math.sin(gameTime*0.75);
  // Full-screen fire gradient — red/orange/crimson base, nothing dark
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,`rgb(${80+Math.floor(30*pulse)},10,0)`);
  bg.addColorStop(0.3,`rgb(${140+Math.floor(40*pulse)},30,0)`);
  bg.addColorStop(0.6,`rgb(${100+Math.floor(20*pulse)},15,0)`);
  bg.addColorStop(1,'rgb(50,5,0)');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // full-screen heat shimmer bands
  for(let i=0;i<5;i++){
    const y=CANVAS_H*(i/5)+Math.sin(gameTime*0.6+i)*30;
    const a=0.10+0.06*Math.sin(gameTime*1.1+i*0.9);
    const g=ctx.createLinearGradient(0,y,0,y+CANVAS_H*0.22);
    g.addColorStop(0,'rgba(255,80,0,0)');g.addColorStop(0.5,`rgba(255,120,0,${a})`);g.addColorStop(1,'rgba(255,80,0,0)');
    ctx.fillStyle=g;ctx.fillRect(0,y,CANVAS_W,CANVAS_H*0.22);
  }
  // explosion bloom — fills most of the screen
  const cx=CANVAS_W/2,cy=CANVAS_H*0.38;
  const blast=ctx.createRadialGradient(cx,cy,0,cx,cy,340);
  blast.addColorStop(0,`rgba(255,230,100,${0.50*pulse})`);
  blast.addColorStop(0.15,`rgba(255,120,20,${0.38*pulse})`);
  blast.addColorStop(0.5,`rgba(200,30,0,${0.20})`);
  blast.addColorStop(1,'rgba(100,0,0,0)');
  ctx.fillStyle=blast;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // expanding shockwave ring
  const ringR=120+90*pulse;
  const ring=ctx.createRadialGradient(cx,cy,ringR-20,cx,cy,ringR+20);
  ring.addColorStop(0,'rgba(255,140,20,0)');
  ring.addColorStop(0.5,`rgba(255,200,60,${0.35*pulse})`);
  ring.addColorStop(1,'rgba(255,140,20,0)');
  ctx.fillStyle=ring;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
}

// VOID: pure black, no stars
function drawBgVoid() {
  ctx.fillStyle='#000000';ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
}

// GALACTIC — deep blue/violet galaxy, spiral arms dominate the whole screen
function drawBgGalactic() {
  // Rich blue/violet throughout — unmistakably different
  const bg=ctx.createLinearGradient(0,0,CANVAS_W,CANVAS_H);
  bg.addColorStop(0,'#06003a');bg.addColorStop(0.3,'#0e0060');bg.addColorStop(0.7,'#080045');bg.addColorStop(1,'#020020');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  const cx=CANVAS_W/2,cy=CANVAS_H*0.5;
  // wide galaxy haze — fills entire screen with blue/purple
  const haze=ctx.createRadialGradient(cx,cy,0,cx,cy,420);
  haze.addColorStop(0,'rgba(140,100,255,0.45)');haze.addColorStop(0.4,'rgba(80,50,200,0.28)');
  haze.addColorStop(0.7,'rgba(40,20,140,0.18)');haze.addColorStop(1,'rgba(10,0,60,0)');
  ctx.fillStyle=haze;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // blazing core
  const core=ctx.createRadialGradient(cx,cy,0,cx,cy,80);
  core.addColorStop(0,'rgba(255,250,220,0.85)');core.addColorStop(0.3,'rgba(200,160,255,0.55)');core.addColorStop(1,'rgba(120,80,255,0)');
  ctx.fillStyle=core;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // large spiral arms sweeping across whole canvas
  const t=gameTime*0.022;
  ctx.save();ctx.translate(cx,cy);
  for(let arm=0;arm<2;arm++){
    for(let i=0;i<60;i++){
      const r=12+i*9,angle=(arm*Math.PI)+i*0.22+t;
      const x=Math.cos(angle)*r,y=Math.sin(angle)*r*0.52;
      const sz=Math.max(0.8,5.5-i*0.07);
      const a=0.45*(1-i/60);
      ctx.beginPath();ctx.arc(x,y,sz,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,140,255,${a})`;ctx.fill();
    }
  }
  // second layer of brighter inner arm dots
  for(let arm=0;arm<2;arm++){
    for(let i=0;i<25;i++){
      const r=8+i*7,angle=(arm*Math.PI)+i*0.28+t*1.3+0.4;
      const x=Math.cos(angle)*r,y=Math.sin(angle)*r*0.5;
      ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);
      ctx.fillStyle=`rgba(220,200,255,${0.55*(1-i/25)})`;ctx.fill();
    }
  }
  ctx.restore(); // end main spiral translate

  // small scattered mini-swirls dotted around the canvas
  const miniSwirls=[
    {sx:CANVAS_W*0.15, sy:CANVAS_H*0.15, scale:0.60, tMul:0.7,  col:'160,120,255'},
    {sx:CANVAS_W*0.82, sy:CANVAS_H*0.10, scale:0.50, tMul:0.9,  col:'200,160,255'},
    {sx:CANVAS_W*0.10, sy:CANVAS_H*0.52, scale:0.55, tMul:0.6,  col:'140,100,230'},
    {sx:CANVAS_W*0.90, sy:CANVAS_H*0.42, scale:0.65, tMul:0.8,  col:'180,140,255'},
    {sx:CANVAS_W*0.22, sy:CANVAS_H*0.83, scale:0.52, tMul:1.1,  col:'200,170,255'},
    {sx:CANVAS_W*0.78, sy:CANVAS_H*0.78, scale:0.48, tMul:0.65, col:'160,130,240'},
  ];
  // mini-swirls use their own slower spin rate, independent of the main galaxy
  const tMini=gameTime*0.10;
  for(const ms of miniSwirls){
    ctx.save();ctx.translate(ms.sx,ms.sy);
    const mt=tMini*ms.tMul;
    for(let arm=0;arm<2;arm++){
      for(let i=0;i<18;i++){
        const r=(6+i*6)*ms.scale, angle=(arm*Math.PI)+i*0.28+mt;
        const mx=Math.cos(angle)*r, my=Math.sin(angle)*r*0.5;
        const msz=Math.max(1.0,(3.5-i*0.1)*ms.scale);
        ctx.beginPath();ctx.arc(mx,my,msz,0,Math.PI*2);
        ctx.fillStyle=`rgba(${ms.col},${0.7*(1-i/18)})`;ctx.fill();
      }
    }
    // tiny bright core
    const mc=ctx.createRadialGradient(0,0,0,0,0,10*ms.scale);
    mc.addColorStop(0,'rgba(245,235,255,0.85)');mc.addColorStop(1,'rgba(180,140,255,0)');
    ctx.fillStyle=mc;ctx.fillRect(-12*ms.scale,-12*ms.scale,24*ms.scale,24*ms.scale);
    ctx.restore();
  }
}

// STORM — electric blue nebula with lightning
function drawBgStorm() {
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000818');bg.addColorStop(0.5,'#001028');bg.addColorStop(1,'#000510');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // swirling blue mist columns
  for(let i=0;i<9;i++){
    const x=(i/9)*CANVAS_W+Math.sin(gameTime*0.9+i)*38;
    const a=0.22+0.14*Math.sin(gameTime*0.7+i*1.3);
    const g=ctx.createLinearGradient(x,0,x+55,CANVAS_H);
    g.addColorStop(0,'rgba(20,80,255,0)');
    g.addColorStop(0.3+0.15*Math.sin(gameTime+i),`rgba(80,180,255,${a})`);
    g.addColorStop(1,'rgba(20,80,255,0)');
    ctx.fillStyle=g;ctx.fillRect(x-28,0,90,CANVAS_H);
  }
  // electric glow
  const glow=ctx.createRadialGradient(CANVAS_W*0.5,CANVAS_H*0.3,0,CANVAS_W*0.5,CANVAS_H*0.3,250);
  glow.addColorStop(0,`rgba(60,160,255,${0.18+0.08*Math.sin(gameTime*1.2)})`);
  glow.addColorStop(1,'rgba(0,40,120,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // lightning flash
  if(Math.sin(gameTime*4.1)>0.90){
    const f=(Math.sin(gameTime*4.1)-0.90)*10;
    ctx.fillStyle=`rgba(160,220,255,${0.15*f})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  }
}

// COSMIC — rainbow pillars, like the Pillars of Creation
function drawBgCosmic() {
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#020a10');bg.addColorStop(0.5,'#041520');bg.addColorStop(1,'#010808');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  const t=gameTime*0.12;
  // large drifting colour masses
  [{x:55,y:300,r:180,c:'0,200,255',a:0.38},{x:340,y:200,r:160,c:'255,160,0',a:0.32},
   {x:180,y:560,r:190,c:'255,40,180',a:0.35},{x:310,y:680,r:150,c:'0,255,160',a:0.30},
   {x:120,y:100,r:140,c:'180,0,255',a:0.28}].forEach((s,si)=>{
    const dx=Math.sin(t+si*1.3)*25,dy=Math.cos(t*0.8+si)*20;
    const g=ctx.createRadialGradient(s.x+dx,s.y+dy,0,s.x+dx,s.y+dy,s.r);
    g.addColorStop(0,`rgba(${s.c},${s.a})`);g.addColorStop(1,`rgba(${s.c},0)`);
    ctx.fillStyle=g;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  });
}

// SOLAR — inside a solar system, near a blazing star
function drawBgSolar() {
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#100400');bg.addColorStop(0.4,'#1a0800');bg.addColorStop(1,'#060200');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  const pulse=0.75+0.25*Math.sin(gameTime*0.55);
  // main star top-right
  const star=ctx.createRadialGradient(CANVAS_W*0.82,CANVAS_H*0.08,0,CANVAS_W*0.82,CANVAS_H*0.08,340);
  star.addColorStop(0,`rgba(255,255,200,${0.85*pulse})`);
  star.addColorStop(0.15,`rgba(255,200,60,${0.60*pulse})`);
  star.addColorStop(0.4,`rgba(255,120,20,${0.30*pulse})`);
  star.addColorStop(1,'rgba(180,40,0,0)');
  ctx.fillStyle=star;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // solar wind streaks
  for(let i=0;i<14;i++){
    const sx=CANVAS_W*0.82,sy=CANVAS_H*0.08;
    const angle=Math.PI*0.55+((i/14)-0.5)*Math.PI*0.7+Math.sin(gameTime*0.3+i)*0.08;
    const len=(220+80*Math.sin(gameTime*0.4+i*0.6))*pulse;
    ctx.strokeStyle=`rgba(255,180,60,${0.12+0.06*Math.sin(gameTime*0.5+i)})`;
    ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,sy);
    ctx.lineTo(sx+Math.cos(angle)*len,sy+Math.sin(angle)*len);ctx.stroke();
  }
  // warm ambient fill lower half
  const warm=ctx.createLinearGradient(0,CANVAS_H*0.4,0,CANVAS_H);
  warm.addColorStop(0,'rgba(200,80,0,0)');warm.addColorStop(1,'rgba(80,20,0,0.22)');
  ctx.fillStyle=warm;ctx.fillRect(0,CANVAS_H*0.4,CANVAS_W,CANVAS_H*0.6);
}



// ── Background card previews (vivid, small-scale) ───────────────────────────
function drawBgPreview(id, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.clip();
  // base
  ctx.fillStyle = '#06040e'; ctx.fillRect(x, y, w, h);

  const cx = x + w/2, cy = y + h/2;

  if (id === 'classic') {
    const g1=ctx.createRadialGradient(x+w*0.2,y+h*0.35,0,x+w*0.2,y+h*0.35,w*0.55);
    g1.addColorStop(0,'rgba(170,80,255,0.7)');g1.addColorStop(1,'rgba(170,80,255,0)');ctx.fillStyle=g1;ctx.fillRect(x,y,w,h);
    const g2=ctx.createRadialGradient(x+w*0.8,y+h*0.65,0,x+w*0.8,y+h*0.65,w*0.45);
    g2.addColorStop(0,'rgba(60,200,255,0.6)');g2.addColorStop(1,'rgba(60,200,255,0)');ctx.fillStyle=g2;ctx.fillRect(x,y,w,h);
  } else if (id === 'nebula') {
    const g1=ctx.createRadialGradient(cx-w*0.2,cy-h*0.2,0,cx-w*0.2,cy-h*0.2,w*0.5);
    g1.addColorStop(0,'rgba(200,60,255,0.75)');g1.addColorStop(1,'rgba(200,60,255,0)');ctx.fillStyle=g1;ctx.fillRect(x,y,w,h);
    const g2=ctx.createRadialGradient(cx+w*0.2,cy+h*0.2,0,cx+w*0.2,cy+h*0.2,w*0.4);
    g2.addColorStop(0,'rgba(255,60,160,0.65)');g2.addColorStop(1,'rgba(255,60,160,0)');ctx.fillStyle=g2;ctx.fillRect(x,y,w,h);
    const g3=ctx.createRadialGradient(cx,cy+h*0.3,0,cx,cy+h*0.3,w*0.35);
    g3.addColorStop(0,'rgba(60,160,255,0.55)');g3.addColorStop(1,'rgba(60,160,255,0)');ctx.fillStyle=g3;ctx.fillRect(x,y,w,h);
  } else if (id === 'aurora') {
    // Dark teal base
    const ab=ctx.createLinearGradient(x,y,x,y+h);
    ab.addColorStop(0,'#000d08');ab.addColorStop(1,'#001a10');
    ctx.fillStyle=ab;ctx.fillRect(x,y,w,h);
    // Vertical curtain columns
    for(let i=0;i<5;i++){
      const lx=x+w*(i/5)+w*0.1;
      const hue=140+i*18;
      const g=ctx.createLinearGradient(lx,y,lx+w*0.12,y+h);
      g.addColorStop(0,`hsla(${hue},100%,55%,0)`);
      g.addColorStop(0.4,`hsla(${hue},100%,55%,0.6)`);
      g.addColorStop(1,`hsla(${hue},100%,55%,0)`);
      ctx.fillStyle=g;ctx.fillRect(lx-4,y,w*0.16,h);
    }
  } else if (id === 'deep') {
    // Warm amber/gold globular cluster base
    const db=ctx.createLinearGradient(x,y,x,y+h);
    db.addColorStop(0,'#1a0e00');db.addColorStop(1,'#2a1800');
    ctx.fillStyle=db;ctx.fillRect(x,y,w,h);
    // Golden core glow
    const gc=ctx.createRadialGradient(cx,cy,0,cx,cy,w*0.45);
    gc.addColorStop(0,'rgba(255,200,80,0.55)');gc.addColorStop(0.5,'rgba(200,140,40,0.3)');gc.addColorStop(1,'rgba(180,100,0,0)');
    ctx.fillStyle=gc;ctx.fillRect(x,y,w,h);
    // Amber star dots
    for(let i=0;i<20;i++){
      const sx=x+((i*73.1+5)%w), sy=y+((i*47.3+8)%h);
      ctx.beginPath();ctx.arc(sx,sy,0.8+i%2*0.5,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,210,120,${0.5+0.4*((i%3)/3)})`;ctx.fill();
    }
  } else if (id === 'supernova') {
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,w*0.55);
    g.addColorStop(0,'rgba(255,220,100,0.9)');g.addColorStop(0.3,'rgba(255,80,20,0.7)');g.addColorStop(1,'rgba(180,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
    // rays
    ctx.save();ctx.translate(cx,cy);
    for(let i=0;i<10;i++){
      const angle=(i/10)*Math.PI*2;
      ctx.strokeStyle=`rgba(255,160,50,0.5)`;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*w*0.5,Math.sin(angle)*w*0.5);ctx.stroke();
    }
    ctx.restore();
  } else if (id === 'void') {
    // Pure black — absolutely nothing
    ctx.fillStyle='#000000';ctx.fillRect(x,y,w,h);
  } else if (id === 'galactic') {
    const g=ctx.createRadialGradient(cx,cy+h*0.1,0,cx,cy+h*0.1,w*0.55);
    g.addColorStop(0,'rgba(200,160,255,0.5)');g.addColorStop(0.5,'rgba(120,80,200,0.2)');g.addColorStop(1,'rgba(60,20,140,0)');
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
    // spiral arm hint
    ctx.save();ctx.translate(cx,cy+h*0.1);
    for(let arm=0;arm<2;arm++){
      ctx.beginPath();
      for(let i=0;i<20;i++){
        const r=i*w*0.025, angle=arm*Math.PI+i*0.3;
        const px=Math.cos(angle)*r, py=Math.sin(angle)*r*0.5;
        i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
      }
      ctx.strokeStyle='rgba(200,160,255,0.5)';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();
  } else if (id === 'storm') {
    for(let i=0;i<5;i++){
      const lx=x+w*(i/5)+w*0.1;
      const g=ctx.createLinearGradient(lx,y,lx+w*0.12,y+h);
      g.addColorStop(0,'rgba(60,150,255,0)');g.addColorStop(0.4,`rgba(100,210,255,0.55)`);g.addColorStop(1,'rgba(60,150,255,0)');
      ctx.fillStyle=g;ctx.fillRect(lx-4,y,w*0.14,h);
    }
  } else if (id === 'cosmic') {
    [{dx:-0.25,dy:-0.2,c:'0,220,255'},{dx:0.25,dy:-0.15,c:'255,200,0'},
     {dx:-0.1,dy:0.2,c:'255,60,200'},{dx:0.2,dy:0.25,c:'0,255,180'}].forEach(s=>{
      const g=ctx.createRadialGradient(cx+s.dx*w,cy+s.dy*h,0,cx+s.dx*w,cy+s.dy*h,w*0.38);
      g.addColorStop(0,`rgba(${s.c},0.65)`);g.addColorStop(1,`rgba(${s.c},0)`);
      ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
    });
  } else if (id === 'solar') {
    const g=ctx.createRadialGradient(x+w,y,0,x+w,y,w*1.1);
    g.addColorStop(0,'rgba(255,220,80,0.9)');g.addColorStop(0.4,'rgba(255,120,20,0.5)');g.addColorStop(1,'rgba(200,40,0,0)');
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
    // wind streaks
    for(let i=0;i<5;i++){
      const sx=x+w*(0.2+i*0.15);
      ctx.strokeStyle=`rgba(255,180,60,0.4)`;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(sx-12,y+h);ctx.stroke();
    }
  }

  // Pack background previews — scale down the full drawFn
  const bgEntry = typeof BACKGROUNDS !== 'undefined' && BACKGROUNDS.find(b=>b.id===id);
  if (bgEntry && bgEntry.packId) {
    ctx.save(); ctx.translate(x, y); ctx.scale(w/CANVAS_W, h/CANVAS_H);
    bgEntry.drawFn(); ctx.restore();
    ctx.restore(); return;
  }

  // Tiny star dots on every preview (except void)
  if (id !== 'void') {
    for(let i=0;i<10;i++){
      const sx=x+((i*79.3+13)%w), sy=y+((i*53.7+7)%h);
      ctx.beginPath();ctx.arc(sx,sy,0.7,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${0.25+0.2*(i%2)})`;ctx.fill();
    }
  }
  ctx.restore();
}
function drawEquippedBg() {
  const id=(typeof state!=='undefined'&&state.equippedBg)||'classic';
  const pk=PACKS.find(p=>id===p.id+'_bg');
  if (pk) { pk.drawBg(); return; }
  const b=BACKGROUNDS.find(b=>b.id===id)||BACKGROUNDS[0];
  b.drawFn();
}

// ══════════════════════════════════════════════════════
//  THEMED PACKS — draw functions
// ══════════════════════════════════════════════════════

// ── PACK BACKGROUNDS ─────────────────────────────────

function drawPackBgAbyss(){
  // Deep ocean — dark water gradient top to murky blue-green bottom
  const t=gameTime*0.4;
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000a10');bg.addColorStop(0.4,'#001a22');bg.addColorStop(0.8,'#002a30');bg.addColorStop(1,'#003838');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // God-rays filtering down from surface (top)
  for(let i=0;i<7;i++){
    const rx=CANVAS_W*(0.05+i*0.15)+Math.sin(t*0.3+i)*18;
    const rw=18+Math.sin(i*1.1+t*0.4)*8;
    const ray=ctx.createLinearGradient(rx,0,rx,CANVAS_H*0.75);
    ray.addColorStop(0,'rgba(0,180,160,0.13)');ray.addColorStop(1,'rgba(0,100,100,0)');
    ctx.save();ctx.translate(0,0);
    ctx.beginPath();ctx.moveTo(rx-rw/2,0);ctx.lineTo(rx+rw/2,0);ctx.lineTo(rx+rw,CANVAS_H*0.75);ctx.lineTo(rx-rw,CANVAS_H*0.75);ctx.closePath();
    ctx.fillStyle=ray;ctx.fill();ctx.restore();
  }
  // Floating bioluminescent particles
  for(let i=0;i<50;i++){
    const px=(Math.sin(i*1.3+t*0.5)*0.45+0.5)*CANVAS_W;
    const py=((i*0.083+t*0.04)%1)*CANVAS_H;
    const a=0.25+0.35*Math.sin(i*0.9+t*1.2);
    const sz=1+Math.sin(i*1.7+t)*0.8;
    ctx.beginPath();ctx.arc(px,py,Math.max(0.3,sz),0,Math.PI*2);
    ctx.fillStyle=`rgba(0,210,180,${a})`;ctx.fill();
  }
  // Drifting jellyfish
  for(let i=0;i<4;i++){
    const jx=(Math.sin(i*2.3+t*0.25)*0.38+0.5)*CANVAS_W;
    const jy=((i*0.28+t*0.035)%1)*CANVAS_H;
    const jr=14+6*Math.sin(i*0.8+t*0.6);
    // Bell
    const jg=ctx.createRadialGradient(jx,jy,0,jx,jy,jr);
    jg.addColorStop(0,'rgba(60,220,200,0.35)');jg.addColorStop(0.6,'rgba(0,160,150,0.18)');jg.addColorStop(1,'rgba(0,80,100,0)');
    ctx.fillStyle=jg;ctx.beginPath();ctx.arc(jx,jy,jr,0,Math.PI*2);ctx.fill();
    // Tentacles
    for(let k=0;k<5;k++){
      const tx=jx+(k-2)*4;
      ctx.beginPath();ctx.moveTo(tx,jy+jr);ctx.quadraticCurveTo(tx+Math.sin(t+k)*8,jy+jr+15,tx+Math.sin(t*0.7+k)*4,jy+jr+28);
      ctx.strokeStyle='rgba(0,190,170,0.30)';ctx.lineWidth=1.5;ctx.stroke();
    }
  }
  // Coral silhouettes at bottom
  ctx.fillStyle='rgba(0,50,40,0.85)';
  const coralPts=[[0,CANVAS_H],[20,CANVAS_H-40],[30,CANVAS_H-80],[40,CANVAS_H-50],[55,CANVAS_H-110],[70,CANVAS_H-60],[90,CANVAS_H-90],[110,CANVAS_H-50],[120,CANVAS_H],[0,CANVAS_H]];
  ctx.beginPath();for(const[x,y]of coralPts)ctx.lineTo(x,y);ctx.closePath();ctx.fill();
  const coralPts2=[[CANVAS_W-120,CANVAS_H],[CANVAS_W-100,CANVAS_H-70],[CANVAS_W-80,CANVAS_H-100],[CANVAS_W-60,CANVAS_H-60],[CANVAS_W-40,CANVAS_H-90],[CANVAS_W-20,CANVAS_H-45],[CANVAS_W,CANVAS_H-30],[CANVAS_W,CANVAS_H]];
  ctx.beginPath();for(const[x,y]of coralPts2)ctx.lineTo(x,y);ctx.closePath();ctx.fill();
}

function drawPackBgSakura(){
  // Cherry blossom forest — flying upward, branches/canopy scroll downward
  const t=gameTime*0.35;
  // Full-canvas blossom sky
  const sky=ctx.createLinearGradient(0,0,0,CANVAS_H);
  sky.addColorStop(0,'#a8c8f0');sky.addColorStop(0.45,'#d8b8d8');sky.addColorStop(1,'#f0d0e8');
  ctx.fillStyle=sky;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Fixed trunk bars spanning full height on edges
  const trunkData=[{x:-8,w:28},{x:22,w:15},{x:CANVAS_W-34,w:18},{x:CANVAS_W-4,w:26}];
  for(const tr of trunkData){
    const tg=ctx.createLinearGradient(tr.x,0,tr.x+tr.w,0);
    tg.addColorStop(0,'rgba(40,18,7,0.82)');tg.addColorStop(0.5,'rgba(62,28,11,0.95)');tg.addColorStop(1,'rgba(40,18,7,0.82)');
    ctx.fillStyle=tg;ctx.fillRect(tr.x,0,tr.w,CANVAS_H);
  }
  // ── Far canopy blobs — slow scroll DOWN ──────────────
  const FAR_N=6,FAR_GAP=CANVAS_H/FAR_N;
  const farSY=(gameTime*20)%CANVAS_H;
  for(let i=0;i<FAR_N+1;i++){
    const y=(i*FAR_GAP+farSY)%CANVAS_H;
    const cgL=ctx.createRadialGradient(-25,y,0,-25,y,85);
    cgL.addColorStop(0,'rgba(255,185,210,0.32)');cgL.addColorStop(1,'rgba(255,165,190,0)');
    ctx.fillStyle=cgL;ctx.beginPath();ctx.arc(-25,y,85,0,Math.PI*2);ctx.fill();
    const cgR=ctx.createRadialGradient(CANVAS_W+25,(y+FAR_GAP*0.5)%CANVAS_H,0,CANVAS_W+25,(y+FAR_GAP*0.5)%CANVAS_H,90);
    cgR.addColorStop(0,'rgba(255,180,208,0.28)');cgR.addColorStop(1,'rgba(255,155,182,0)');
    ctx.fillStyle=cgR;ctx.beginPath();ctx.arc(CANVAS_W+25,(y+FAR_GAP*0.5)%CANVAS_H,90,0,Math.PI*2);ctx.fill();
  }
  // ── Mid branches — medium scroll DOWN ────────────────
  const MID_N=5,MID_GAP=CANVAS_H/MID_N;
  const midSY=(gameTime*52)%CANVAS_H;
  for(let i=0;i<MID_N+1;i++){
    const y=(i*MID_GAP+midSY)%CANVAS_H;
    ctx.save();ctx.strokeStyle='rgba(48,20,8,0.75)';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(20,y);ctx.quadraticCurveTo(90,y-22,148,y+12);ctx.stroke();
    const bgL=ctx.createRadialGradient(122,y+4,0,122,y+4,58);
    bgL.addColorStop(0,'rgba(255,170,195,0.65)');bgL.addColorStop(1,'rgba(255,148,175,0)');
    ctx.fillStyle=bgL;ctx.beginPath();ctx.arc(122,y+4,58,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(CANVAS_W-18,y+MID_GAP*0.55);ctx.quadraticCurveTo(CANVAS_W-90,y+MID_GAP*0.55-18,CANVAS_W-148,y+MID_GAP*0.55+10);ctx.stroke();
    const bgR=ctx.createRadialGradient(CANVAS_W-120,y+MID_GAP*0.55+3,0,CANVAS_W-120,y+MID_GAP*0.55+3,54);
    bgR.addColorStop(0,'rgba(255,165,192,0.60)');bgR.addColorStop(1,'rgba(255,145,172,0)');
    ctx.fillStyle=bgR;ctx.beginPath();ctx.arc(CANVAS_W-120,y+MID_GAP*0.55+3,54,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  // ── Foreground thick branches — fast scroll DOWN ──────
  const FG_N=4,FG_GAP=CANVAS_H/FG_N;
  const fgSY=(gameTime*95)%CANVAS_H;
  for(let i=0;i<FG_N+1;i++){
    const y=(i*FG_GAP+fgSY)%CANVAS_H;
    ctx.save();ctx.strokeStyle='rgba(30,12,4,0.55)';ctx.lineWidth=10;
    ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(65,y+20,102,y+6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(CANVAS_W,y+FG_GAP*0.62);ctx.quadraticCurveTo(CANVAS_W-62,y+FG_GAP*0.62-14,CANVAS_W-100,y+FG_GAP*0.62+7);ctx.stroke();
    ctx.restore();
  }
  // ── Falling petals ────────────────────────────────────
  for(let i=0;i<50;i++){
    const px=((i*0.14+Math.sin(i*1.2+t*0.3)*0.06)%1)*CANVAS_W;
    const py=((i*0.09+t*0.09)%1)*CANVAS_H;
    const angle=i*0.6+t*0.8;
    const a=0.55+0.3*Math.sin(i+t);
    ctx.save();ctx.translate(px,py);ctx.rotate(angle);
    ctx.beginPath();ctx.ellipse(0,0,5,3,0,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,175,195,${a})`;ctx.fill();
    ctx.restore();
  }
}

function drawPackBgCrystal(){
  // Crystal cave — deep blue cave walls, glowing blue crystals
  const t=gameTime*0.4;
  // Cave interior — rich deep blue
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000818');bg.addColorStop(0.4,'#001030');bg.addColorStop(0.8,'#001848');bg.addColorStop(1,'#002060');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Cave ceiling rock silhouette
  ctx.fillStyle='rgba(0,5,20,0.9)';
  ctx.beginPath();ctx.moveTo(0,0);
  const ceilPts=[0,60,40,20,80,50,120,15,160,45,200,10,240,55,280,20,320,40,360,8,CANVAS_W,35,CANVAS_W,0];
  for(let i=0;i<ceilPts.length;i+=2)ctx.lineTo(ceilPts[i],ceilPts[i+1]);
  ctx.closePath();ctx.fill();
  // Cave floor rock silhouette
  ctx.fillStyle='rgba(0,5,20,0.9)';
  ctx.beginPath();ctx.moveTo(0,CANVAS_H);
  const floorPts=[0,CANVAS_H-40,50,CANVAS_H-20,100,CANVAS_H-55,150,CANVAS_H-25,200,CANVAS_H-60,250,CANVAS_H-30,300,CANVAS_H-50,CANVAS_W,CANVAS_H-20,CANVAS_W,CANVAS_H];
  for(let i=0;i<floorPts.length;i+=2)ctx.lineTo(floorPts[i],floorPts[i+1]);
  ctx.closePath();ctx.fill();
  // Blue crystal formations — ceiling
  const cCrystals=[{x:30,h:80},{x:70,h:120},{x:110,h:70},{x:170,h:100},{x:220,h:90},{x:270,h:130},{x:330,h:75},{x:370,h:110}];
  for(const c of cCrystals){
    const glow=0.6+0.3*Math.sin(t*1.2+c.x*0.05);
    const cg=ctx.createLinearGradient(c.x,0,c.x,c.h);
    cg.addColorStop(0,'rgba(60,140,255,0.0)');cg.addColorStop(0.5,`rgba(80,160,255,${glow*0.5})`);cg.addColorStop(1,`rgba(140,200,255,${glow*0.9})`);
    ctx.beginPath();ctx.moveTo(c.x-8,0);ctx.lineTo(c.x,c.h);ctx.lineTo(c.x+8,0);ctx.closePath();
    ctx.fillStyle=cg;ctx.fill();
    ctx.strokeStyle=`rgba(160,210,255,${glow*0.6})`;ctx.lineWidth=1;ctx.stroke();
  }
  // Blue crystal formations — floor
  const fCrystals=[{x:20,h:70},{x:60,h:110},{x:130,h:80},{x:190,h:130},{x:250,h:90},{x:310,h:120},{x:360,h:85}];
  for(const c of fCrystals){
    const glow=0.5+0.4*Math.sin(t*0.9+c.x*0.04+1.5);
    const cg=ctx.createLinearGradient(c.x,CANVAS_H,c.x,CANVAS_H-c.h);
    cg.addColorStop(0,'rgba(40,100,220,0.0)');cg.addColorStop(0.5,`rgba(60,130,255,${glow*0.45})`);cg.addColorStop(1,`rgba(120,190,255,${glow*0.85})`);
    ctx.beginPath();ctx.moveTo(c.x-9,CANVAS_H);ctx.lineTo(c.x,CANVAS_H-c.h);ctx.lineTo(c.x+9,CANVAS_H);ctx.closePath();
    ctx.fillStyle=cg;ctx.fill();
    ctx.strokeStyle=`rgba(140,200,255,${glow*0.55})`;ctx.lineWidth=1;ctx.stroke();
  }
  // Floating blue sparkle motes
  for(let i=0;i<30;i++){
    const sx=(Math.sin(i*1.8+t*0.5)*0.45+0.5)*CANVAS_W;
    const sy=((i*0.09+t*0.025)%1)*CANVAS_H;
    const a=0.4+0.4*Math.sin(i*2.2+t*1.5);
    ctx.beginPath();ctx.arc(sx,sy,1.3,0,Math.PI*2);
    ctx.fillStyle=`rgba(100,180,255,${a})`;ctx.fill();
  }
  // Central blue ambient glow
  const amb=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,0,CANVAS_W/2,CANVAS_H/2,200);
  amb.addColorStop(0,'rgba(40,100,220,0.12)');amb.addColorStop(1,'rgba(20,60,160,0)');
  ctx.fillStyle=amb;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
}

function drawPackBgGlacial(){
  // Arctic north pole — flying upward, ice spires scroll downward past you
  const t=gameTime*0.4;
  // Full-canvas arctic night sky
  const sky=ctx.createLinearGradient(0,0,0,CANVAS_H);
  sky.addColorStop(0,'#00060e');sky.addColorStop(0.5,'#000d18');sky.addColorStop(1,'#001525');
  ctx.fillStyle=sky;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // ── Aurora borealis curtains ──────────────────────────
  for(let i=0;i<9;i++){
    const ax=CANVAS_W*(i/8);
    const wave=Math.sin(t*0.6+i*1.1)*22;
    const hue=140+i*8;
    const aurora=ctx.createLinearGradient(ax,0,ax,CANVAS_H*0.62);
    aurora.addColorStop(0,`hsla(${hue},80%,50%,0)`);
    aurora.addColorStop(0.2+Math.sin(t*0.5+i)*0.12,`hsla(${hue},80%,55%,0.22)`);
    aurora.addColorStop(0.55,`hsla(${hue+20},70%,60%,0.12)`);
    aurora.addColorStop(1,`hsla(${hue},70%,50%,0)`);
    ctx.save();ctx.translate(wave,0);
    ctx.beginPath();ctx.rect(ax-9,0,18,CANVAS_H*0.62);
    ctx.fillStyle=aurora;ctx.fill();ctx.restore();
  }
  // ── Stars ─────────────────────────────────────────────
  for(let i=0;i<40;i++){
    const sx=(i*0.179%1)*CANVAS_W;
    const sy=(i*0.113%1)*CANVAS_H*0.55;
    const a=0.3+0.5*Math.sin(i*2.1+t*1.5);
    ctx.beginPath();ctx.arc(sx,sy,0.8,0,Math.PI*2);
    ctx.fillStyle=`rgba(220,240,255,${a})`;ctx.fill();
  }
  // ── Far ice ridges — slow scroll DOWN ────────────────
  // Spires rooted at y, pointing upward by spireH; scroll y downward
  const FAR_N=5,FAR_GAP=CANVAS_H/FAR_N;
  const farSY=(gameTime*22)%CANVAS_H;
  for(let i=0;i<FAR_N+1;i++){
    const cy=(i*FAR_GAP+farSY)%CANVAS_H; // center y of this row
    // Spread a few small ridges across screen width at this y
    for(let j=0;j<5;j++){
      const rx=CANVAS_W*(j+0.5)/5+(j%2===0?-18:18);
      const rh=30+j*6;
      ctx.fillStyle='rgba(155,205,235,0.22)';
      ctx.beginPath();
      ctx.moveTo(rx-20,cy+12);ctx.lineTo(rx-8,cy-rh+10);ctx.lineTo(rx,cy-rh);
      ctx.lineTo(rx+8,cy-rh+10);ctx.lineTo(rx+20,cy+12);ctx.closePath();ctx.fill();
    }
  }
  // ── Mid ice spires — medium scroll DOWN ──────────────
  const MID_N=4,MID_GAP=CANVAS_H/MID_N;
  const midSY=(gameTime*50)%CANVAS_H;
  for(let i=0;i<MID_N+1;i++){
    const cy=(i*MID_GAP+midSY)%CANVAS_H;
    // Two tall spires per row, left and right
    const spires=[{rx:CANVAS_W*0.22,rh:110},{rx:CANVAS_W*0.78,rh:125}];
    for(const sp of spires){
      const cg=ctx.createLinearGradient(sp.rx,cy-sp.rh,sp.rx,cy+20);
      cg.addColorStop(0,'rgba(145,205,242,0.0)');
      cg.addColorStop(0.3,'rgba(175,222,250,0.42)');
      cg.addColorStop(1,'rgba(135,195,235,0.28)');
      ctx.fillStyle=cg;
      ctx.beginPath();
      ctx.moveTo(sp.rx-38,cy+18);ctx.lineTo(sp.rx-22,cy-sp.rh*0.55);
      ctx.lineTo(sp.rx,cy-sp.rh);ctx.lineTo(sp.rx+22,cy-sp.rh*0.55);
      ctx.lineTo(sp.rx+38,cy+18);ctx.closePath();ctx.fill();
      // Glowing tip
      const glow=0.5+0.4*Math.sin(t*0.8+sp.rx*0.02);
      const tg=ctx.createRadialGradient(sp.rx,cy-sp.rh,0,sp.rx,cy-sp.rh,16);
      tg.addColorStop(0,`rgba(200,238,255,${glow*0.7})`);tg.addColorStop(1,'rgba(180,222,255,0)');
      ctx.fillStyle=tg;ctx.beginPath();ctx.arc(sp.rx,cy-sp.rh,16,0,Math.PI*2);ctx.fill();
    }
  }
  // ── Foreground ice slabs — fast scroll DOWN ───────────
  const FG_N=3,FG_GAP=CANVAS_H/FG_N;
  const fgSY=(gameTime*90)%CANVAS_H;
  for(let i=0;i<FG_N+1;i++){
    const cy=(i*FG_GAP+fgSY)%CANVAS_H;
    // Left slab
    ctx.fillStyle='rgba(118,182,222,0.42)';
    ctx.beginPath();
    ctx.moveTo(0,cy+22);ctx.lineTo(18,cy-35);ctx.lineTo(50,cy-58);
    ctx.lineTo(62,cy-35);ctx.lineTo(50,cy+10);ctx.lineTo(0,cy+22);ctx.closePath();ctx.fill();
    // Right slab
    ctx.beginPath();
    ctx.moveTo(CANVAS_W,cy+30);ctx.lineTo(CANVAS_W-20,cy-28);ctx.lineTo(CANVAS_W-52,cy-52);
    ctx.lineTo(CANVAS_W-65,cy-28);ctx.lineTo(CANVAS_W-52,cy+15);ctx.lineTo(CANVAS_W,cy+30);ctx.closePath();ctx.fill();
  }
  // ── Falling snowflakes ────────────────────────────────
  for(let i=0;i<35;i++){
    const sx=((i*0.16+Math.sin(i*1.1+t*0.18)*0.04)%1)*CANVAS_W;
    const sy=((i*0.085+t*0.06)%1)*CANVAS_H;
    const a=0.4+0.3*Math.sin(i*1.3+t);
    ctx.save();ctx.translate(sx,sy);ctx.rotate(t*0.4+i*0.5);
    for(let s=0;s<6;s++){
      ctx.save();ctx.rotate(s*Math.PI/3);
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,4.5);
      ctx.strokeStyle=`rgba(210,235,255,${a})`;ctx.lineWidth=1.2;ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ── PACK TAILS ────────────────────────────────────────
function drawPackTailAbyss(bb,bw,no){
  const ny=bb+no,hw=bw*0.35,t=gameTime;
  for(let i=0;i<12;i++){
    const age=(i/12+t*0.8)%1;
    const bx=Math.sin(i*1.3+t*2)*hw*age*0.8;
    const by=ny+age*55;
    const sz=Math.max(0.5,4*(1-age));
    const a=0.7*(1-age);
    ctx.beginPath();ctx.arc(bx,by,sz,0,Math.PI*2);
    ctx.fillStyle=`rgba(0,210,190,${a})`;ctx.fill();
    // Inner bright
    if(sz>1.5){ctx.beginPath();ctx.arc(bx,by,sz*0.5,0,Math.PI*2);ctx.fillStyle=`rgba(180,255,250,${a*0.8})`;ctx.fill();}
  }
}
function drawPackTailSakura(bb,bw,no){
  const ny=bb+no,hw=bw*0.4,t=gameTime;
  for(let i=0;i<14;i++){
    const age=(i/14+t*0.6)%1;
    const px=Math.sin(i*1.1+t*1.5)*hw*(0.3+age*0.7);
    const py=ny+age*50;
    const rot=i*0.8+t*1.2;
    const a=0.65*(1-age);
    ctx.save();ctx.translate(px,py);ctx.rotate(rot);
    ctx.beginPath();ctx.ellipse(0,0,4*(1-age*0.5),2.5*(1-age*0.5),0,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,160,190,${a})`;ctx.fill();
    ctx.restore();
  }
}
function drawPackTailCrystal(bb,bw,no){
  const ny=bb+no,hw=bw*0.45,t=gameTime;
  const cols=['rgba(180,120,255,','rgba(120,180,255,','rgba(255,120,220,','rgba(120,240,200,'];
  for(let i=0;i<16;i++){
    const age=(i/16+t*0.7)%1;
    const px=Math.sin(i*1.5+t*1.8)*hw*age;
    const py=ny+age*52;
    const sz=Math.max(0.5,3.5*(1-age));
    const a=0.75*(1-age);
    ctx.beginPath();ctx.arc(px,py,sz,0,Math.PI*2);
    ctx.fillStyle=cols[i%4]+a+')';ctx.fill();
  }
}
function drawPackTailGlacial(bb,bw,no){
  const ny=bb+no,hw=bw*0.4,t=gameTime;
  for(let i=0;i<14;i++){
    const age=(i/14+t*0.55)%1;
    const px=Math.sin(i*1.2+t*0.8)*hw*(0.2+age*0.8);
    const py=ny+age*48;
    const a=0.6*(1-age);
    // Snowflake crystal: 6 spokes
    ctx.save();ctx.translate(px,py);ctx.rotate(t*0.5+i*0.4);
    const sz=(1-age)*5;
    for(let s=0;s<6;s++){
      ctx.save();ctx.rotate(s*Math.PI/3);
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,sz);
      ctx.strokeStyle=`rgba(180,230,255,${a})`;ctx.lineWidth=1.2;ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ── PACK ROCKETS ──────────────────────────────────────
function drawPackRocketAbyss(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=30,bh=54,nh=40,bt=-bh/2,bb=bh/2;
  // Side fins
  const fL=ctx.createLinearGradient(-bw/2-14,0,-bw/2,0);
  fL.addColorStop(0,'#041828');fL.addColorStop(1,'#082840');
  ctx.beginPath();ctx.moveTo(-bw/2,bb-14);ctx.lineTo(-bw/2-14,bb+8);ctx.lineTo(-bw/2,bb+4);ctx.closePath();
  ctx.fillStyle=fL;ctx.fill();ctx.strokeStyle='#0a4060';ctx.lineWidth=1;ctx.stroke();
  const fR=ctx.createLinearGradient(bw/2,0,bw/2+14,0);
  fR.addColorStop(0,'#082840');fR.addColorStop(1,'#041828');
  ctx.beginPath();ctx.moveTo(bw/2,bb-14);ctx.lineTo(bw/2+14,bb+8);ctx.lineTo(bw/2,bb+4);ctx.closePath();
  ctx.fillStyle=fR;ctx.fill();ctx.strokeStyle='#0a4060';ctx.lineWidth=1;ctx.stroke();
  // Body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#040e1a');bg.addColorStop(0.3,'#0a2035');bg.addColorStop(0.7,'#082030');bg.addColorStop(1,'#040e1a');
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-bw/2,bt,bw,bh,[3,3,6,6]);ctx.fill();
  ctx.strokeStyle='#0a3050';ctx.lineWidth=1;ctx.stroke();
  // Torpedo nose
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.quadraticCurveTo(-bw/2,bt-nh*0.5,0,bt-nh);ctx.quadraticCurveTo(bw/2,bt-nh*0.5,bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#040e18');ng.addColorStop(0.5,'#082838');ng.addColorStop(1,'#040e18');
  ctx.fillStyle=ng;ctx.fill();ctx.strokeStyle='#0a3555';ctx.lineWidth=1;ctx.stroke();
  // Nose tip glow
  ctx.beginPath();ctx.arc(0,bt-nh,4,0,Math.PI*2);
  ctx.fillStyle='rgba(0,210,190,0.9)';ctx.fill();
  // Bioluminescent stripe
  const stripe=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  stripe.addColorStop(0,'rgba(0,200,180,0)');stripe.addColorStop(0.5,'rgba(0,220,200,0.8)');stripe.addColorStop(1,'rgba(0,200,180,0)');
  ctx.fillStyle=stripe;ctx.fillRect(-bw/2,bt+bh*0.4,bw,4);
  // Porthole windows x2
  for(let i=0;i<2;i++){
    const py=bt+bh*0.18+i*18;
    ctx.beginPath();ctx.arc(0,py,6,0,Math.PI*2);ctx.fillStyle='#021520';ctx.fill();
    ctx.beginPath();ctx.arc(0,py,5,0,Math.PI*2);
    const wg=ctx.createRadialGradient(-1,py-1,1,0,py,5);
    wg.addColorStop(0,'rgba(100,255,240,0.7)');wg.addColorStop(1,'rgba(0,120,140,0.4)');
    ctx.fillStyle=wg;ctx.fill();
    ctx.strokeStyle='#00c8d0';ctx.lineWidth=1.2;ctx.stroke();
  }
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.4,bb);ctx.lineTo(bw*0.4,bb);ctx.lineTo(bw*0.5,bb+10);ctx.lineTo(-bw*0.5,bb+10);ctx.closePath();
  ctx.fillStyle='#041020';ctx.fill();
  drawPackTailAbyss(bb,bw,10);
  ctx.restore();
}
function drawPackRocketSakura(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=28,bh=56,nh=46,bt=-bh/2,bb=bh/2;
  // Elegant swept fins
  ctx.beginPath();ctx.moveTo(-bw/2,bb-16);ctx.lineTo(-bw/2-16,bb+10);ctx.lineTo(-bw/2,bb+4);ctx.closePath();
  ctx.fillStyle='#d4a0b0';ctx.fill();ctx.strokeStyle='#e8c0cc';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(bw/2,bb-16);ctx.lineTo(bw/2+16,bb+10);ctx.lineTo(bw/2,bb+4);ctx.closePath();
  ctx.fillStyle='#d4a0b0';ctx.fill();ctx.strokeStyle='#e8c0cc';ctx.lineWidth=1;ctx.stroke();
  // Ivory body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#c8a8b8');bg.addColorStop(0.3,'#f0e0e8');bg.addColorStop(0.7,'#e8d0dc');bg.addColorStop(1,'#c8a8b8');
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-bw/2,bt,bw,bh,[3,3,6,6]);ctx.fill();
  // Gold accent rings
  ctx.fillStyle='#d4a040';ctx.fillRect(-bw/2,bt+bh*0.28,bw,4);
  ctx.fillStyle='#e8c060';ctx.fillRect(-bw/2,bt+bh*0.29,bw,2);
  ctx.fillStyle='#d4a040';ctx.fillRect(-bw/2,bt+bh*0.60,bw,4);
  ctx.fillStyle='#e8c060';ctx.fillRect(-bw/2,bt+bh*0.61,bw,2);
  // Black nose
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.quadraticCurveTo(-bw/2,bt-nh*0.5,0,bt-nh);ctx.quadraticCurveTo(bw/2,bt-nh*0.5,bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#1a0808');ng.addColorStop(0.5,'#2a1010');ng.addColorStop(1,'#1a0808');
  ctx.fillStyle=ng;ctx.fill();
  // Porthole with blossom
  const py=bt+bh*0.44;
  ctx.beginPath();ctx.arc(0,py,9,0,Math.PI*2);ctx.fillStyle='#c8a0b0';ctx.fill();
  ctx.beginPath();ctx.arc(0,py,7,0,Math.PI*2);ctx.fillStyle='#ffe0ea';ctx.fill();
  // Simple blossom dots
  for(let p=0;p<5;p++){
    const pa=p*Math.PI*2/5;
    ctx.beginPath();ctx.arc(Math.cos(pa)*4,py+Math.sin(pa)*4,2.5,0,Math.PI*2);
    ctx.fillStyle='#ff80a0';ctx.fill();
  }
  ctx.beginPath();ctx.arc(0,py,2,0,Math.PI*2);ctx.fillStyle='#ffee88';ctx.fill();
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.38,bb);ctx.lineTo(bw*0.38,bb);ctx.lineTo(bw*0.48,bb+10);ctx.lineTo(-bw*0.48,bb+10);ctx.closePath();
  ctx.fillStyle='#b09098';ctx.fill();
  drawPackTailSakura(bb,bw,10);
  ctx.restore();
}
function drawPackRocketCrystal(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=26,bh=58,nh=52,bt=-bh/2,bb=bh/2;
  // Sharp angular fins
  ctx.beginPath();ctx.moveTo(-bw/2,bt+bh*0.5);ctx.lineTo(-bw/2-18,bb+14);ctx.lineTo(-bw/2,bb+2);ctx.closePath();
  const fLg=ctx.createLinearGradient(-bw/2-18,0,-bw/2,0);
  fLg.addColorStop(0,'#1a0840');fLg.addColorStop(1,'#3010a0');
  ctx.fillStyle=fLg;ctx.fill();ctx.strokeStyle='rgba(140,100,255,0.7)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(bw/2,bt+bh*0.5);ctx.lineTo(bw/2+18,bb+14);ctx.lineTo(bw/2,bb+2);ctx.closePath();
  const fRg=ctx.createLinearGradient(bw/2,0,bw/2+18,0);
  fRg.addColorStop(0,'#3010a0');fRg.addColorStop(1,'#1a0840');
  ctx.fillStyle=fRg;ctx.fill();ctx.strokeStyle='rgba(140,100,255,0.7)';ctx.lineWidth=1;ctx.stroke();
  // Icy faceted body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#0a0628');bg.addColorStop(0.25,'#5040b0');bg.addColorStop(0.5,'#8060e0');bg.addColorStop(0.75,'#5040b0');bg.addColorStop(1,'#0a0628');
  ctx.fillStyle=bg;ctx.fillRect(-bw/2,bt,bw,bh);
  // Prismatic shimmer bands
  for(let i=0;i<4;i++){
    const by2=bt+bh*i*0.25;
    ctx.fillStyle=`rgba(${[180,120,255,80,200,255,255,120,200,120,220,255][i*3]},${[180,120,255,80,200,255,255,120,200,120,220,255][i*3+1]},${[180,120,255,80,200,255,255,120,200,120,220,255][i*3+2]},0.1)`;
    ctx.fillRect(-bw/2,by2,bw,bh*0.1);
  }
  ctx.strokeStyle='rgba(160,120,255,0.6)';ctx.lineWidth=1;ctx.strokeRect(-bw/2,bt,bw,bh);
  // Crystal nose — sharp pointed
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.lineTo(0,bt-nh);ctx.lineTo(bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#0a0628');ng.addColorStop(0.5,'#7060d0');ng.addColorStop(1,'#0a0628');
  ctx.fillStyle=ng;ctx.fill();ctx.strokeStyle='rgba(160,120,255,0.8)';ctx.lineWidth=1;ctx.stroke();
  // Nose tip glow
  ctx.beginPath();ctx.arc(0,bt-nh,3,0,Math.PI*2);ctx.fillStyle='rgba(200,180,255,0.95)';ctx.fill();
  // Center gem
  const py=bt+bh*0.4;
  ctx.beginPath();ctx.arc(0,py,7,0,Math.PI*2);
  const gg=ctx.createRadialGradient(-2,py-2,1,0,py,7);
  gg.addColorStop(0,'#fff');gg.addColorStop(0.4,'#c0a0ff');gg.addColorStop(1,'#5020c0');
  ctx.fillStyle=gg;ctx.fill();
  ctx.strokeStyle='rgba(200,180,255,0.9)';ctx.lineWidth=1;ctx.stroke();
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.38,bb);ctx.lineTo(bw*0.38,bb);ctx.lineTo(bw*0.48,bb+10);ctx.lineTo(-bw*0.48,bb+10);ctx.closePath();
  ctx.fillStyle='#1a0850';ctx.fill();
  drawPackTailCrystal(bb,bw,10);
  ctx.restore();
}
function drawPackRocketGlacial(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=28,bh=56,nh=48,bt=-bh/2,bb=bh/2;
  // Icicle fins
  ctx.beginPath();ctx.moveTo(-bw/2,bt+bh*0.45);ctx.lineTo(-bw/2-20,bb+20);ctx.lineTo(-bw/2+2,bb);ctx.closePath();
  const fLg=ctx.createLinearGradient(-bw/2-20,0,-bw/2,0);
  fLg.addColorStop(0,'rgba(140,200,240,0.5)');fLg.addColorStop(1,'rgba(180,225,255,0.8)');
  ctx.fillStyle=fLg;ctx.fill();ctx.strokeStyle='rgba(180,230,255,0.7)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(bw/2,bt+bh*0.45);ctx.lineTo(bw/2+20,bb+20);ctx.lineTo(bw/2-2,bb);ctx.closePath();
  const fRg=ctx.createLinearGradient(bw/2,0,bw/2+20,0);
  fRg.addColorStop(0,'rgba(180,225,255,0.8)');fRg.addColorStop(1,'rgba(140,200,240,0.5)');
  ctx.fillStyle=fRg;ctx.fill();ctx.strokeStyle='rgba(180,230,255,0.7)';ctx.lineWidth=1;ctx.stroke();
  // Ice body — translucent blue
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'rgba(80,140,200,0.7)');bg.addColorStop(0.3,'rgba(160,210,250,0.85)');bg.addColorStop(0.7,'rgba(140,200,240,0.80)');bg.addColorStop(1,'rgba(80,140,200,0.7)');
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-bw/2,bt,bw,bh,[3,3,6,6]);ctx.fill();
  // Frost crystal pattern lines
  ctx.strokeStyle='rgba(220,240,255,0.4)';ctx.lineWidth=1;
  const fx=[-bw/2+6,0,bw/2-6];
  for(const x2 of fx){for(let yi=0;yi<3;yi++){const y2=bt+bh*(0.2+yi*0.28);ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2+4,y2-5);ctx.stroke();ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-4,y2-5);ctx.stroke();}}
  // Nose
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.quadraticCurveTo(-bw/2,bt-nh*0.55,0,bt-nh);ctx.quadraticCurveTo(bw/2,bt-nh*0.55,bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'rgba(100,160,220,0.7)');ng.addColorStop(0.5,'rgba(200,235,255,0.9)');ng.addColorStop(1,'rgba(100,160,220,0.7)');
  ctx.fillStyle=ng;ctx.fill();ctx.strokeStyle='rgba(200,235,255,0.6)';ctx.lineWidth=1;ctx.stroke();
  // Pale glow at tip
  ctx.beginPath();ctx.arc(0,bt-nh,4,0,Math.PI*2);ctx.fillStyle='rgba(220,245,255,0.9)';ctx.fill();
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.4,bb);ctx.lineTo(bw*0.4,bb);ctx.lineTo(bw*0.5,bb+10);ctx.lineTo(-bw*0.5,bb+10);ctx.closePath();
  ctx.fillStyle='rgba(100,170,220,0.8)';ctx.fill();
  drawPackTailGlacial(bb,bw,10);
  ctx.restore();
}

// ── PACK METEOR SKINS ─────────────────────────────────
function drawPackMeteorAbyss(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  // Bioluminescent jelly body
  const bg=ctx.createRadialGradient(-m.rx*0.2,-m.ry*0.2,1,0,0,m.rx*1.1);
  bg.addColorStop(0,'rgba(0,160,150,0.9)');bg.addColorStop(0.6,'rgba(0,80,100,0.8)');bg.addColorStop(1,'rgba(0,30,50,0.7)');
  ctx.beginPath();ctx.ellipse(0,0,m.rx,m.ry,0,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();
  // Glow outline
  ctx.strokeStyle='rgba(0,220,200,0.7)';ctx.lineWidth=1.5;ctx.stroke();
  // Tentacle trail
  for(let i=0;i<4;i++){
    const tx=(-m.rx*0.5)+i*(m.rx*0.33),ty=-m.ry;
    const len=m.ry*1.4+i*4;
    ctx.beginPath();ctx.moveTo(tx,ty);ctx.quadraticCurveTo(tx+Math.sin(i*1.2)*8,ty-len*0.5,tx+Math.sin(i*0.8)*5,ty-len);
    ctx.strokeStyle=`rgba(0,180,170,0.5)`;ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.restore();
}
function drawPackMeteorSakura(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  // Pink petal cluster
  for(let p=0;p<6;p++){
    const pa=p*Math.PI*2/6;
    const px=Math.cos(pa)*m.rx*0.7,py=Math.sin(pa)*m.ry*0.7;
    ctx.save();ctx.translate(px,py);ctx.rotate(pa);
    ctx.beginPath();ctx.ellipse(0,0,m.rx*0.55,m.ry*0.38,0,0,Math.PI*2);
    ctx.fillStyle='rgba(255,160,185,0.88)';ctx.fill();
    ctx.strokeStyle='rgba(255,200,215,0.7)';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();
  }
  // Center
  ctx.beginPath();ctx.arc(0,0,m.rx*0.32,0,Math.PI*2);
  ctx.fillStyle='rgba(255,235,180,0.9)';ctx.fill();
  ctx.restore();
}
function drawPackMeteorCrystal(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  const cols=['rgba(160,100,255,0.9)','rgba(80,160,255,0.9)','rgba(255,100,200,0.9)','rgba(80,230,200,0.9)'];
  const col=cols[Math.floor(Math.abs(m.x+m.y))%4];
  // Faceted gem
  ctx.beginPath();
  const sides=6;
  for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;ctx.lineTo(Math.cos(a)*m.rx,Math.sin(a)*m.ry);}
  ctx.closePath();
  const bg=ctx.createRadialGradient(-m.rx*0.3,-m.ry*0.3,1,0,0,m.rx);
  bg.addColorStop(0,'rgba(255,255,255,0.95)');bg.addColorStop(0.4,col);bg.addColorStop(1,'rgba(20,0,60,0.9)');
  ctx.fillStyle=bg;ctx.fill();
  ctx.strokeStyle='rgba(200,180,255,0.8)';ctx.lineWidth=1.5;ctx.stroke();
  // Sparkle
  ctx.beginPath();ctx.arc(-m.rx*0.3,-m.ry*0.3,m.rx*0.12,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
  ctx.restore();
}
function drawPackMeteorGlacial(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  // Icy sphere
  const bg=ctx.createRadialGradient(-m.rx*0.35,-m.ry*0.35,1,0,0,m.rx*1.1);
  bg.addColorStop(0,'rgba(220,240,255,0.95)');bg.addColorStop(0.5,'rgba(120,185,230,0.9)');bg.addColorStop(1,'rgba(50,100,160,0.85)');
  ctx.beginPath();ctx.ellipse(0,0,m.rx,m.ry,0,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();
  ctx.strokeStyle='rgba(180,225,255,0.7)';ctx.lineWidth=1.5;ctx.stroke();
  // Ice crack lines
  ctx.strokeStyle='rgba(200,235,255,0.5)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(-m.rx*0.5,0);ctx.lineTo(m.rx*0.3,-m.ry*0.4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(m.rx*0.3,-m.ry*0.4);ctx.lineTo(m.rx*0.5,m.ry*0.2);ctx.stroke();
  // Frost highlight
  ctx.beginPath();ctx.arc(-m.rx*0.3,-m.ry*0.3,m.rx*0.15,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.8)';ctx.fill();
  ctx.restore();
}

// ── SPORTS PACK ────────────────────────────────────────
function drawPackBgSports(){
  const t=gameTime*0.4;
  // Stadium night sky
  const sky=ctx.createLinearGradient(0,0,0,CANVAS_H);
  sky.addColorStop(0,'#04090f');sky.addColorStop(0.5,'#070d16');sky.addColorStop(1,'#0a1520');
  ctx.fillStyle=sky;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Floodlight beams from top corners
  for(const[lx,sx] of [[0,1],[CANVAS_W,-1]]){
    const beam=ctx.createLinearGradient(lx,0,lx+sx*CANVAS_W*0.5,CANVAS_H);
    beam.addColorStop(0,'rgba(255,248,210,0.13)');beam.addColorStop(1,'rgba(255,248,210,0)');
    ctx.fillStyle=beam;ctx.beginPath();
    ctx.moveTo(lx,0);ctx.lineTo(lx+sx*80,0);ctx.lineTo(lx+sx*CANVAS_W*0.65,CANVAS_H);ctx.lineTo(lx,CANVAS_H);
    ctx.closePath();ctx.fill();
  }
  // ── Field + yard lines scroll DOWN ──
  const YARD_N=7,yardSY=(gameTime*68)%CANVAS_H,yGap=CANVAS_H/YARD_N;
  for(let i=0;i<YARD_N+1;i++){
    const y=(i*yGap+yardSY)%CANVAS_H;
    const turf=ctx.createLinearGradient(0,y,0,y+yGap-3);
    turf.addColorStop(0,'rgba(28,100,40,0.58)');turf.addColorStop(1,'rgba(22,80,30,0.42)');
    ctx.fillStyle=turf;ctx.fillRect(52,y,CANVAS_W-104,yGap-3);
    ctx.fillStyle='rgba(255,255,255,0.65)';ctx.fillRect(52,y,CANVAS_W-104,2.5);
  }
  // ── Crowd on sides scroll DOWN ──
  const CROWD_N=5,crowdSY=(gameTime*38)%CANVAS_H,cGap=CANVAS_H/CROWD_N;
  const tColors=['#e03030','#2266dd','#f0c020','#22aa55','#ee6622','#9922cc'];
  for(let i=0;i<CROWD_N+1;i++){
    const y=(i*cGap+crowdSY)%CANVAS_H;
    ctx.fillStyle='rgba(14,20,38,0.82)';ctx.fillRect(0,y,50,36);
    ctx.fillStyle='rgba(14,20,38,0.82)';ctx.fillRect(CANVAS_W-50,y+cGap*0.5,50,36);
    for(let c=0;c<4;c++){for(let r=0;r<2;r++){
      ctx.beginPath();ctx.arc(7+c*12,y+8+r*14,4,0,Math.PI*2);
      ctx.fillStyle=tColors[(i*4+c*2+r)%6];ctx.fill();
      ctx.beginPath();ctx.arc(CANVAS_W-43+c*12,y+cGap*0.5+8+r*14,4,0,Math.PI*2);
      ctx.fillStyle=tColors[(i*4+c*2+r+3)%6];ctx.fill();
    }}
  }
  // ── Confetti ──
  const confRgb=['224,48,48','34,102,221','240,192,32','34,170,85','238,102,34','153,34,204'];
  for(let i=0;i<38;i++){
    const cx=((i*0.17+Math.sin(i*1.3+t*0.4)*0.05)%1)*CANVAS_W;
    const cy=((i*0.11+t*0.07)%1)*CANVAS_H;
    const a=0.6+0.3*Math.sin(i+t*1.5);
    ctx.save();ctx.translate(cx,cy);ctx.rotate(i*0.8+t*1.2);
    ctx.fillStyle=`rgba(${confRgb[i%6]},${a})`;ctx.fillRect(-4,-2,8,4);
    ctx.restore();
  }
}
function drawPackTailSports(bb,bw,no){
  const ny=bb+no,hw=bw*0.45,t=gameTime;
  const confRgb=['224,48,48','34,102,221','240,192,32','34,170,85','238,102,34'];
  for(let i=0;i<16;i++){
    const age=(i/16+t*0.7)%1;
    const px=Math.sin(i*1.4+t*1.6)*hw*age;
    const py=ny+age*55;
    const a=0.75*(1-age);
    ctx.save();ctx.translate(px,py);ctx.rotate(i*0.9+t*2.5);
    ctx.fillStyle=`rgba(${confRgb[i%5]},${a})`;
    ctx.fillRect(-3.5*(1-age*0.4),-1.5,7*(1-age*0.4),3);
    ctx.restore();
  }
}
function drawPackRocketSports(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=26,bh=52,nh=42,bt=-bh/2,bb=bh/2;
  // Fins
  ctx.beginPath();ctx.moveTo(-bw/2,bb-14);ctx.lineTo(-bw/2-14,bb+10);ctx.lineTo(-bw/2,bb+4);ctx.closePath();
  ctx.fillStyle='#5a2d0c';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(bw/2,bb-14);ctx.lineTo(bw/2+14,bb+10);ctx.lineTo(bw/2,bb+4);ctx.closePath();
  ctx.fillStyle='#5a2d0c';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1;ctx.stroke();
  // Football body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#3d1a06');bg.addColorStop(0.3,'#7a3a10');bg.addColorStop(0.5,'#8c4412');bg.addColorStop(0.7,'#7a3a10');bg.addColorStop(1,'#3d1a06');
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-bw/2,bt,bw,bh,[3,3,6,6]);ctx.fill();
  // White seam stripe
  ctx.fillStyle='rgba(255,255,255,0.92)';ctx.fillRect(-bw/2,bt+bh*0.42,bw,5);
  // Laces
  ctx.strokeStyle='#4a2008';ctx.lineWidth=1.5;
  for(let l=-2;l<=2;l++){ctx.beginPath();ctx.moveTo(l*3.5,bt+bh*0.42+0.5);ctx.lineTo(l*3.5,bt+bh*0.42+4.5);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(-7,bt+bh*0.42+2.5);ctx.lineTo(9,bt+bh*0.42+2.5);ctx.stroke();
  // Pointed nose
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.quadraticCurveTo(-bw/4,bt-nh*0.7,0,bt-nh);ctx.quadraticCurveTo(bw/4,bt-nh*0.7,bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#3d1a06');ng.addColorStop(0.5,'#8c4412');ng.addColorStop(1,'#3d1a06');
  ctx.fillStyle=ng;ctx.fill();
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.38,bb);ctx.lineTo(bw*0.38,bb);ctx.lineTo(bw*0.48,bb+10);ctx.lineTo(-bw*0.48,bb+10);ctx.closePath();
  ctx.fillStyle='#2a0e04';ctx.fill();
  drawPackTailSports(bb,bw,10);
  ctx.restore();
}
function drawPackMeteorSports(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  const r=m.rx,type=(m.sportType||0)%6;
  if(type===0){
    // Football
    const fg=ctx.createRadialGradient(-r*0.2,-r*0.2,1,0,0,r);
    fg.addColorStop(0,'#8c4412');fg.addColorStop(0.7,'#5a2d0c');fg.addColorStop(1,'#3d1a06');
    ctx.beginPath();ctx.ellipse(0,0,r,m.ry*0.7,0,0,Math.PI*2);ctx.fillStyle=fg;ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fillRect(-r,-1.5,r*2,3);
    ctx.strokeStyle='#5a2d0c';ctx.lineWidth=1;
    for(let l=-2;l<=2;l++){ctx.beginPath();ctx.moveTo(l*3,-1.5);ctx.lineTo(l*3,1.5);ctx.stroke();}
  } else if(type===1){
    // Soccer ball
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle='#f5f5f5';ctx.fill();
    ctx.strokeStyle='#222';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath();
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;const px=Math.cos(a)*r*0.38,py=Math.sin(a)*r*0.38;i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);}
    ctx.closePath();ctx.fill();
    for(let s=0;s<5;s++){const a=s*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.arc(Math.cos(a)*r*0.72,Math.sin(a)*r*0.72,r*0.2,0,Math.PI*2);ctx.fill();}
  } else if(type===2){
    // Basketball
    const bg=ctx.createRadialGradient(-r*0.3,-r*0.3,1,0,0,r);
    bg.addColorStop(0,'#f08030');bg.addColorStop(0.6,'#d06020');bg.addColorStop(1,'#a04010');
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();
    ctx.strokeStyle='#1a0808';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r*0.7,Math.PI*0.1,Math.PI*0.9);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r*0.7,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
  } else if(type===3){
    // Baseball
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle='#f8f4ee';ctx.fill();
    ctx.strokeStyle='#ccc';ctx.lineWidth=1;ctx.stroke();
    ctx.strokeStyle='#cc2222';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(-r*0.22,0,r*0.6,-Math.PI*0.4,Math.PI*0.4);ctx.stroke();
    ctx.beginPath();ctx.arc(r*0.22,0,r*0.6,Math.PI*0.6,Math.PI*1.4);ctx.stroke();
  } else if(type===4){
    // Volleyball
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle='#e8e8f8';ctx.fill();
    const vCols=['rgba(51,102,204,0.75)','rgba(240,192,32,0.75)'];
    for(let p=0;p<6;p++){
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r-1,p*Math.PI/3,(p+1)*Math.PI/3);ctx.closePath();
      ctx.fillStyle=vCols[p%2];ctx.fill();
    }
    ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
  } else {
    // Golf ball
    const gg=ctx.createRadialGradient(-r*0.3,-r*0.3,1,0,0,r);
    gg.addColorStop(0,'#ffffff');gg.addColorStop(0.7,'#e8e8e8');gg.addColorStop(1,'#cccccc');
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=gg;ctx.fill();
    ctx.fillStyle='rgba(170,170,170,0.5)';
    for(const[dx,dy] of [[-r*.3,-r*.3],[r*.3,-r*.3],[0,r*.4],[-r*.45,r*.1],[r*.45,r*.1],[0,-r*.5],[-r*.2,r*.1],[r*.2,r*.1]]){
      if(dx*dx+dy*dy<r*r*0.82){ctx.beginPath();ctx.arc(dx,dy,r*0.1,0,Math.PI*2);ctx.fill();}
    }
  }
  ctx.restore();
}

// ── VIP MONTH 1: ROYALE ───────────────────────────────
function drawPackBgRoyale(){
  const t=gameTime;
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#0d0010');bg.addColorStop(0.5,'#1a0028');bg.addColorStop(1,'#0d0018');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Stone pillar columns on edges
  const drawPillar=(x,w)=>{
    const pg=ctx.createLinearGradient(x,0,x+w,0);
    pg.addColorStop(0,'rgba(20,15,30,0.97)');pg.addColorStop(0.35,'rgba(48,36,68,0.99)');
    pg.addColorStop(0.65,'rgba(48,36,68,0.99)');pg.addColorStop(1,'rgba(20,15,30,0.97)');
    ctx.fillStyle=pg;ctx.fillRect(x,0,w,CANVAS_H);
    ctx.fillStyle='rgba(200,160,20,0.55)';
    ctx.fillRect(x+(w>0?w-3:0),0,3,CANVAS_H);
  };
  drawPillar(-5,48);drawPillar(CANVAS_W-43,48);
  // ── Stained glass light patches — slow scroll DOWN ──
  const SG_N=4,SG_GAP=CANVAS_H/SG_N;
  const sgScroll=(t*18)%CANVAS_H;
  const sgCols=[['rgba(180,30,220,0.20)','rgba(220,20,180,0.14)'],['rgba(30,100,220,0.20)','rgba(20,180,220,0.14)'],['rgba(220,160,20,0.20)','rgba(220,100,20,0.14)'],['rgba(20,180,80,0.16)','rgba(100,220,40,0.11)']];
  for(let i=0;i<SG_N+1;i++){
    const y=(i*SG_GAP+sgScroll)%CANVAS_H;
    const c=sgCols[i%sgCols.length];
    const lgL=ctx.createRadialGradient(42,y,0,42,y,72);lgL.addColorStop(0,c[0]);lgL.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lgL;ctx.beginPath();ctx.arc(42,y,72,0,Math.PI*2);ctx.fill();
    const lgR=ctx.createRadialGradient(CANVAS_W-42,y+SG_GAP*0.5,0,CANVAS_W-42,y+SG_GAP*0.5,72);lgR.addColorStop(0,c[1]);lgR.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=lgR;ctx.beginPath();ctx.arc(CANVAS_W-42,y+SG_GAP*0.5,72,0,Math.PI*2);ctx.fill();
  }
  // ── Torches — medium scroll DOWN ──
  const TR_N=5,TR_GAP=CANVAS_H/TR_N,trScroll=(t*40)%CANVAS_H;
  for(let i=0;i<TR_N+1;i++){
    const y=(i*TR_GAP+trScroll)%CANVAS_H;
    const flk=0.82+0.18*Math.sin(t*9+i*2.5);
    const drawTorch=(tx)=>{
      ctx.fillStyle='rgba(90,55,18,0.95)';ctx.fillRect(tx-3,y,6,16);
      const fg=ctx.createRadialGradient(tx,y,0,tx,y,18*flk);
      fg.addColorStop(0,`rgba(255,235,90,${0.95*flk})`);fg.addColorStop(0.4,`rgba(255,130,15,${0.75*flk})`);fg.addColorStop(1,'rgba(255,50,0,0)');
      ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(tx,y-4,9*flk,14*flk,0,0,Math.PI*2);ctx.fill();
      const gw=ctx.createRadialGradient(tx,y,0,tx,y,44);gw.addColorStop(0,`rgba(255,170,40,${0.14*flk})`);gw.addColorStop(1,'rgba(255,90,0,0)');
      ctx.fillStyle=gw;ctx.beginPath();ctx.arc(tx,y,44,0,Math.PI*2);ctx.fill();
    };
    drawTorch(44);drawTorch(CANVAS_W-44);
  }
  // ── Banners — fast scroll DOWN ──
  const BN_N=3,BN_GAP=CANVAS_H/BN_N,bnScroll=(t*68)%CANVAS_H;
  for(let i=0;i<BN_N+1;i++){
    const y=(i*BN_GAP+bnScroll)%CANVAS_H;
    const drawBanner=(bx,flip)=>{
      const bw=20,bh=36,bxO=flip?bx-bw:bx;
      ctx.fillStyle='#4a0082';ctx.fillRect(bxO,y,bw,bh);
      ctx.strokeStyle='rgba(200,160,20,0.85)';ctx.lineWidth=1.5;ctx.strokeRect(bxO+2,y+2,bw-4,bh-4);
      ctx.fillStyle='rgba(220,180,35,0.9)';
      const cx2=bxO+bw/2,cy2=y+bh/2;
      // Mini crown shape
      ctx.beginPath();ctx.moveTo(cx2-5,cy2+3);ctx.lineTo(cx2-5,cy2-2);ctx.lineTo(cx2-3,cy2);ctx.lineTo(cx2,cy2-4);ctx.lineTo(cx2+3,cy2);ctx.lineTo(cx2+5,cy2-2);ctx.lineTo(cx2+5,cy2+3);ctx.closePath();ctx.fill();
    };
    drawBanner(5,false);drawBanner(CANVAS_W-5,true);
  }
  // Floating gold motes
  for(let i=0;i<28;i++){
    const px=((i*0.17+Math.sin(i*1.5+t*0.2)*0.05)%1)*CANVAS_W;
    const py=((i*0.11+t*0.04)%1)*CANVAS_H;
    const a=0.25+0.4*Math.sin(i+t*1.6);
    ctx.fillStyle=`rgba(220,180,30,${a})`;ctx.beginPath();ctx.arc(px,py,1.5,0,Math.PI*2);ctx.fill();
  }
}

function drawPackTailRoyale(bb,bw,no){
  const N=28;
  for(let i=0;i<N;i++){
    const frac=i/N;
    const px=bb[i*2],py=bb[i*2+1];
    if(!px&&!py)continue;
    const a=(1-frac)*0.75;
    const sz=bw*(1-frac*0.6)*0.5;
    ctx.save();ctx.translate(px,py);
    // Gold core
    ctx.fillStyle=`rgba(220,175,25,${a*0.85})`;
    ctx.beginPath();ctx.arc(0,0,sz,0,Math.PI*2);ctx.fill();
    // Purple sparkle
    if(i%3===0){ctx.fillStyle=`rgba(155,35,215,${a*0.65})`;ctx.beginPath();ctx.arc(sz*0.55,-sz*0.4,sz*0.42,0,Math.PI*2);ctx.fill();}
    // Star fleck
    if(i%4===0){
      ctx.fillStyle=`rgba(255,225,80,${a})`;
      ctx.beginPath();
      for(let s=0;s<4;s++){const ang=s*Math.PI/2;s===0?ctx.moveTo(Math.cos(ang)*sz*0.4,Math.sin(ang)*sz*0.4):ctx.lineTo(Math.cos(ang)*sz*0.4,Math.sin(ang)*sz*0.4);}
      ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
}

function drawPackRocketRoyale(x,y){
  ctx.save();ctx.translate(x,y);
  const W=22,H=52;
  // Body — deep purple
  const bodyG=ctx.createLinearGradient(-W/2,0,W/2,0);
  bodyG.addColorStop(0,'#2a0050');bodyG.addColorStop(0.3,'#5c009c');bodyG.addColorStop(0.7,'#5c009c');bodyG.addColorStop(1,'#2a0050');
  ctx.fillStyle=bodyG;ctx.beginPath();ctx.roundRect(-W/2,-H*0.3,W,H*0.7,4);ctx.fill();
  // Gold trim bands
  ctx.fillStyle='rgba(200,158,18,0.9)';ctx.fillRect(-W/2,-H*0.04,W,3);ctx.fillRect(-W/2,H*0.21,W,3);
  // Crown top
  ctx.fillStyle='#c89818';ctx.fillRect(-W/2,-H*0.33,W,8);
  ctx.fillStyle='#f0c028';
  for(let pt=0;pt<5;pt++){
    const bx=-W/2+pt*(W/4);
    ctx.beginPath();ctx.moveTo(bx,-H*0.33);ctx.lineTo(bx+W/8,-H*0.33-12);ctx.lineTo(bx+W/4,-H*0.33);ctx.closePath();ctx.fill();
  }
  // Crown gems
  const gemCols=['#cc2244','#2244cc','#22aa44'];
  for(let g=0;g<3;g++){ctx.fillStyle=gemCols[g];ctx.beginPath();ctx.arc(-W/4+g*W/4,-H*0.33+4,2.5,0,Math.PI*2);ctx.fill();}
  // Fins — gold
  ctx.fillStyle='#c8a010';
  ctx.beginPath();ctx.moveTo(-W/2,H*0.38);ctx.lineTo(-W/2-10,H*0.48);ctx.lineTo(-W/2,H*0.28);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(W/2,H*0.38);ctx.lineTo(W/2+10,H*0.48);ctx.lineTo(W/2,H*0.28);ctx.closePath();ctx.fill();
  // Heraldic crest
  ctx.fillStyle='rgba(220,178,38,0.75)';ctx.beginPath();ctx.arc(0,H*0.08,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#4a0080';ctx.beginPath();ctx.arc(0,H*0.08,3.5,0,Math.PI*2);ctx.fill();
  // Nozzle
  const engG=ctx.createLinearGradient(-W/2+2,0,W/2-2,0);
  engG.addColorStop(0,'#1a0030');engG.addColorStop(0.5,'#3a0060');engG.addColorStop(1,'#1a0030');
  ctx.fillStyle=engG;ctx.fillRect(-W/2+2,H*0.4,W-4,8);
  ctx.restore();
}

function drawPackMeteorRoyale(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  const r=m.rx;
  const og=ctx.createRadialGradient(-r*0.3,-r*0.3,1,0,0,r);
  og.addColorStop(0,'#fff8c0');og.addColorStop(0.4,'#d4a020');og.addColorStop(0.8,'#8a6010');og.addColorStop(1,'#4a3000');
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=og;ctx.fill();
  ctx.strokeStyle='rgba(255,240,120,0.5)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*0.7,0);ctx.lineTo(0,r);ctx.lineTo(-r*0.7,0);ctx.closePath();ctx.stroke();
  ctx.fillStyle='rgba(255,255,200,0.85)';ctx.beginPath();ctx.arc(-r*0.28,-r*0.28,r*0.14,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ── VIP MONTH 3: CANDY ────────────────────────────────
function drawPackBgCandy(){
  const t=gameTime;
  // Pastel sky gradient
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#b8e0ff');bg.addColorStop(0.4,'#ffc8e8');bg.addColorStop(0.8,'#fff0a0');bg.addColorStop(1,'#ffccf0');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // ── Rainbow arc bands in sky ──
  const arcCols=['rgba(255,100,100,0.07)','rgba(255,180,60,0.07)','rgba(255,235,60,0.07)','rgba(100,220,100,0.07)','rgba(80,160,255,0.07)','rgba(180,80,255,0.07)'];
  for(let a=0;a<arcCols.length;a++){
    ctx.strokeStyle=arcCols[a];ctx.lineWidth=18;
    ctx.beginPath();ctx.arc(CANVAS_W/2,CANVAS_H*0.6,(180+a*22),Math.PI,Math.PI*2);ctx.stroke();
  }
  // ── Cotton candy clouds — slow scroll DOWN ──
  const CC_N=5,CC_GAP=CANVAS_H/CC_N,ccScroll=(t*15)%CANVAS_H;
  const ccCols=['rgba(255,182,220,0.55)','rgba(182,210,255,0.5)','rgba(210,182,255,0.5)','rgba(255,220,182,0.48)'];
  for(let i=0;i<CC_N+1;i++){
    const y=(i*CC_GAP+ccScroll)%CANVAS_H;
    const cx2=20+((i*137)%CANVAS_W*0.6);
    const c=ccCols[i%ccCols.length];
    for(let b=0;b<5;b++){
      const bx=cx2+b*14-28,by=y+Math.sin(b*1.2)*8;
      const cg=ctx.createRadialGradient(bx,by,0,bx,by,22);
      cg.addColorStop(0,c.replace('0.5','0.7').replace('0.55','0.75').replace('0.48','0.68'));cg.addColorStop(1,c.replace('0.5','0').replace('0.55','0').replace('0.48','0'));
      ctx.fillStyle=cg;ctx.beginPath();ctx.arc(bx,by,22,0,Math.PI*2);ctx.fill();
    }
    // Second cloud on right side
    const cx3=CANVAS_W-30-((i*97)%CANVAS_W*0.5);
    const c2=ccCols[(i+2)%ccCols.length];
    for(let b=0;b<4;b++){
      const bx=cx3+b*15-22,by=y+CC_GAP*0.5+Math.sin(b*1.4)*7;
      const cg=ctx.createRadialGradient(bx,by,0,bx,by,20);
      cg.addColorStop(0,c2.replace('0.5','0.65').replace('0.55','0.7').replace('0.48','0.62'));cg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=cg;ctx.beginPath();ctx.arc(bx,by,20,0,Math.PI*2);ctx.fill();
    }
  }
  // ── Sprinkle particles ──
  const sprCols=['#ff4488','#ff8800','#ffee00','#44cc44','#4488ff','#cc44cc'];
  for(let i=0;i<60;i++){
    const sx=((i*0.18+Math.sin(i*1.3)*0.04)%1)*CANVAS_W;
    const sy=((i*0.11+t*0.06)%1)*CANVAS_H;
    const sc=sprCols[i%sprCols.length];
    const angle=i*0.9;
    ctx.save();ctx.translate(sx,sy);ctx.rotate(angle);
    ctx.fillStyle=sc;ctx.fillRect(-5,-1.5,10,3);
    ctx.restore();
  }
}

function drawPackTailCandy(bb,bw,no){
  const N=28;
  const bubCols=['rgba(255,150,200,{a})','rgba(150,200,255,{a})','rgba(200,150,255,{a})','rgba(255,220,100,{a})'];
  for(let i=0;i<N;i++){
    const frac=i/N;
    const px=bb[i*2],py=bb[i*2+1];
    if(!px&&!py)continue;
    const a=(1-frac)*0.75;
    const sz=bw*(1-frac*0.5)*0.55;
    ctx.save();ctx.translate(px,py);
    // Pastel bubble
    const col=bubCols[i%bubCols.length].replace('{a}',a*0.7);
    const cg=ctx.createRadialGradient(-sz*0.3,-sz*0.3,0,0,0,sz);
    cg.addColorStop(0,'rgba(255,255,255,'+a*0.5+')');cg.addColorStop(0.5,col);cg.addColorStop(1,col.replace(a*0.7,0));
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,0,sz,0,Math.PI*2);ctx.fill();
    // Sprinkle fleck
    if(i%3===0){
      const sc=['#ff4488','#ff8800','#44cc44','#4488ff'][i%4];
      ctx.fillStyle=sc;ctx.save();ctx.rotate(i*0.7);ctx.fillRect(-5,-1.5,10,3);ctx.restore();
    }
    ctx.restore();
  }
}

function drawPackRocketCandy(x,y){
  ctx.save();ctx.translate(x,y);
  const W=22,H=54;
  // Candy cane body — white base with red stripes
  ctx.fillStyle='#fff5f8';ctx.beginPath();ctx.roundRect(-W/2,-H*0.3,W,H*0.72,5);ctx.fill();
  // Red diagonal stripes
  ctx.save();ctx.beginPath();ctx.roundRect(-W/2,-H*0.3,W,H*0.72,5);ctx.clip();
  ctx.strokeStyle='#ff2255';ctx.lineWidth=6;
  for(let s=-3;s<6;s++){
    const sy=-H*0.3+s*16;
    ctx.beginPath();ctx.moveTo(-W/2,sy);ctx.lineTo(W/2,sy-16);ctx.stroke();
  }
  ctx.restore();
  // Outline
  ctx.strokeStyle='rgba(255,100,150,0.5)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-W/2,-H*0.3,W,H*0.72,5);ctx.stroke();
  // Round gumball nose
  const ng=ctx.createRadialGradient(-4,-H*0.42,1,0,-H*0.36,14);
  ng.addColorStop(0,'#ffffff');ng.addColorStop(0.4,'#ff88bb');ng.addColorStop(1,'#ff2266');
  ctx.fillStyle=ng;ctx.beginPath();ctx.arc(0,-H*0.36,14,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,50,100,0.4)';ctx.lineWidth=1;ctx.stroke();
  // Fins — pastel
  ctx.fillStyle='#ffaacc';
  ctx.beginPath();ctx.moveTo(-W/2,H*0.36);ctx.lineTo(-W/2-10,H*0.46);ctx.lineTo(-W/2,H*0.24);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(W/2,H*0.36);ctx.lineTo(W/2+10,H*0.46);ctx.lineTo(W/2,H*0.24);ctx.closePath();ctx.fill();
  // Sprinkle decorations on body
  const decs=[['#ff8800',6,4],['#44cc44',-4,10],['#4488ff',5,16]];
  for(const[dc,dx,dy] of decs){
    ctx.save();ctx.translate(dx,dy-H*0.1);ctx.rotate(0.5);
    ctx.fillStyle=dc;ctx.fillRect(-4,-1.5,8,3);ctx.restore();
  }
  // Nozzle
  ctx.fillStyle='#ffccdd';ctx.fillRect(-W/2+3,H*0.42,W-6,8);
  ctx.restore();
}

function drawPackMeteorCandy(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  const r=m.rx;
  // Gumball — color based on position
  const gumCols=['#ff4488','#ff8800','#44cc44','#4488ff','#cc44ff','#ffee00'];
  const gc=gumCols[Math.floor(Math.abs(m.x+m.y)/40)%gumCols.length];
  const gg=ctx.createRadialGradient(-r*0.35,-r*0.35,1,0,0,r);
  gg.addColorStop(0,'#ffffff');gg.addColorStop(0.25,gc+'dd');gg.addColorStop(0.8,gc);gg.addColorStop(1,gc+'88');
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=gg;ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.stroke();
  // Shine
  ctx.fillStyle='rgba(255,255,255,0.7)';ctx.beginPath();ctx.arc(-r*0.3,-r*0.3,r*0.2,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ── VIP MONTH 2: NEON CITY ────────────────────────────
function drawPackBgNeonCity(){
  const t=gameTime;
  // Night sky
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000008');bg.addColorStop(0.5,'#000514');bg.addColorStop(1,'#00020e');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Distant city glow on horizon
  const hg=ctx.createLinearGradient(0,CANVAS_H*0.55,0,CANVAS_H*0.85);
  hg.addColorStop(0,'rgba(255,30,120,0.0)');hg.addColorStop(0.5,'rgba(255,30,120,0.08)');hg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=hg;ctx.fillRect(0,CANVAS_H*0.55,CANVAS_W,CANVAS_H*0.3);
  // ── Far buildings — very slow scroll DOWN ──
  const FB_N=8,FB_GAP=CANVAS_W/FB_N;
  const fbScrollY=(t*12)%CANVAS_H;
  for(let i=0;i<FB_N+1;i++){
    const bx=i*FB_GAP-FB_GAP/2;
    const bh=80+((i*137)%120);
    const by=(fbScrollY+i*CANVAS_H/FB_N)%CANVAS_H - bh;
    ctx.fillStyle='rgba(8,4,22,0.95)';ctx.fillRect(bx,by,FB_GAP-3,bh+CANVAS_H);
    // Window lights
    ctx.fillStyle=`rgba(255,220,80,0.35)`;
    for(let wy=by+8;wy<by+bh;wy+=10){
      for(let wx=bx+4;wx<bx+FB_GAP-6;wx+=8){
        if((i*7+Math.floor(wy/10)*3+Math.floor(wx/8))%4!==0)continue;
        ctx.fillRect(wx,wy,4,5);
      }
    }
  }
  // ── Mid buildings — medium scroll DOWN ──
  const MB_N=6,MB_GAP=CANVAS_W/MB_N;
  const mbScrollY=(t*30)%CANVAS_H;
  for(let i=0;i<MB_N+2;i++){
    const bx=(i-0.5)*MB_GAP;
    const bh=110+((i*197)%150);
    const by=(mbScrollY+i*(CANVAS_H/MB_N))%CANVAS_H - bh;
    ctx.fillStyle='rgba(4,2,14,0.98)';ctx.fillRect(bx,by,MB_GAP-4,bh+CANVAS_H);
    // Neon sign glow on building edge
    const nCols=['rgba(255,0,180,0.5)','rgba(0,220,255,0.5)','rgba(255,80,0,0.4)'];
    const nc=nCols[i%nCols.length];
    ctx.fillStyle=nc;ctx.fillRect(bx,by,3,bh);
    ctx.fillStyle=nc;ctx.fillRect(bx+MB_GAP-7,by,3,bh);
    // Neon sign block
    const sg=ctx.createRadialGradient(bx+MB_GAP/2,by+20,0,bx+MB_GAP/2,by+20,32);
    sg.addColorStop(0,nc);sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg;ctx.beginPath();ctx.arc(bx+MB_GAP/2,by+20,32,0,Math.PI*2);ctx.fill();
  }
  // ── Near foreground building silhouettes — fast scroll DOWN ──
  const NB_N=4,NB_GAP=CANVAS_W/NB_N;
  const nbScrollY=(t*65)%CANVAS_H;
  for(let i=0;i<NB_N+2;i++){
    const bx=(i-0.5)*NB_GAP;
    const bh=60+((i*211)%80);
    const by=(nbScrollY+i*(CANVAS_H/NB_N))%CANVAS_H - bh;
    ctx.fillStyle='rgba(2,0,8,0.99)';ctx.fillRect(bx,by,NB_GAP-2,bh+CANVAS_H);
  }
  // ── Rain streaks ──
  ctx.strokeStyle='rgba(100,180,255,0.18)';ctx.lineWidth=1;
  for(let i=0;i<55;i++){
    const rx=((i*0.19+t*0.02)%1)*CANVAS_W;
    const ry=((i*0.13+t*0.38)%1)*CANVAS_H;
    ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(rx-3,ry+14);ctx.stroke();
  }
  // ── Neon glow halos on edges ──
  const halo1=ctx.createRadialGradient(0,CANVAS_H*0.4,0,0,CANVAS_H*0.4,80);
  halo1.addColorStop(0,'rgba(255,0,180,0.12)');halo1.addColorStop(1,'rgba(255,0,180,0)');
  ctx.fillStyle=halo1;ctx.beginPath();ctx.arc(0,CANVAS_H*0.4,80,0,Math.PI*2);ctx.fill();
  const halo2=ctx.createRadialGradient(CANVAS_W,CANVAS_H*0.65,0,CANVAS_W,CANVAS_H*0.65,80);
  halo2.addColorStop(0,'rgba(0,220,255,0.12)');halo2.addColorStop(1,'rgba(0,220,255,0)');
  ctx.fillStyle=halo2;ctx.beginPath();ctx.arc(CANVAS_W,CANVAS_H*0.65,80,0,Math.PI*2);ctx.fill();
}

function drawPackTailNeonCity(bb,bw,no){
  const N=30;
  for(let i=0;i<N;i++){
    const frac=i/N;
    const px=bb[i*2],py=bb[i*2+1];
    if(!px&&!py)continue;
    const a=(1-frac)*0.8;
    const sz=bw*(1-frac*0.55)*0.5;
    ctx.save();ctx.translate(px,py);
    // Cyan core
    ctx.fillStyle=`rgba(0,220,255,${a*0.7})`;
    ctx.beginPath();ctx.arc(0,0,sz,0,Math.PI*2);ctx.fill();
    // Pink outer
    if(i%2===0){ctx.fillStyle=`rgba(255,0,180,${a*0.5})`;ctx.beginPath();ctx.arc(sz*0.4,sz*0.3,sz*0.5,0,Math.PI*2);ctx.fill();}
    // Electric spark
    if(i%5===0){
      ctx.strokeStyle=`rgba(180,100,255,${a})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(-sz,0);ctx.lineTo(-sz*0.3,sz*0.5);ctx.lineTo(sz*0.4,-sz*0.3);ctx.lineTo(sz,0);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPackRocketNeonCity(x,y){
  ctx.save();ctx.translate(x,y);
  const W=20,H=52;
  // Sleek black body
  const bodyG=ctx.createLinearGradient(-W/2,0,W/2,0);
  bodyG.addColorStop(0,'#060612');bodyG.addColorStop(0.35,'#0e0e28');bodyG.addColorStop(0.65,'#0e0e28');bodyG.addColorStop(1,'#060612');
  ctx.fillStyle=bodyG;ctx.beginPath();ctx.roundRect(-W/2,-H*0.3,W,H*0.72,3);ctx.fill();
  // Neon pink trim lines
  ctx.strokeStyle='#ff00b4';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-W/2,-H*0.28);ctx.lineTo(W/2,-H*0.28);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-W/2,H*0.15);ctx.lineTo(W/2,H*0.15);ctx.stroke();
  // Cyan accent stripe down center
  ctx.strokeStyle='rgba(0,220,255,0.7)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,-H*0.28);ctx.lineTo(0,H*0.15);ctx.stroke();
  // Nose cone — dark with pink tip
  ctx.fillStyle='#0a0a1e';
  ctx.beginPath();ctx.moveTo(-W/2,-H*0.28);ctx.lineTo(0,-H*0.52);ctx.lineTo(W/2,-H*0.28);ctx.closePath();ctx.fill();
  ctx.fillStyle='#ff00b4';ctx.beginPath();ctx.arc(0,-H*0.52,3,0,Math.PI*2);ctx.fill();
  // Neon glow around body
  const glowP=ctx.createRadialGradient(0,0,W*0.4,0,0,W*1.1);
  glowP.addColorStop(0,'rgba(255,0,180,0)');glowP.addColorStop(0.7,'rgba(255,0,180,0.06)');glowP.addColorStop(1,'rgba(255,0,180,0)');
  ctx.fillStyle=glowP;ctx.beginPath();ctx.arc(0,0,W*1.1,0,Math.PI*2);ctx.fill();
  // Fins — dark with cyan edge
  ctx.fillStyle='#060612';
  ctx.beginPath();ctx.moveTo(-W/2,H*0.35);ctx.lineTo(-W/2-10,H*0.46);ctx.lineTo(-W/2,H*0.24);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(W/2,H*0.35);ctx.lineTo(W/2+10,H*0.46);ctx.lineTo(W/2,H*0.24);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(0,220,255,0.8)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-W/2,H*0.35);ctx.lineTo(-W/2-10,H*0.46);ctx.lineTo(-W/2,H*0.24);ctx.closePath();ctx.stroke();
  ctx.beginPath();ctx.moveTo(W/2,H*0.35);ctx.lineTo(W/2+10,H*0.46);ctx.lineTo(W/2,H*0.24);ctx.closePath();ctx.stroke();
  // Engine nozzle
  ctx.fillStyle='#04040e';ctx.fillRect(-W/2+2,H*0.42,W-4,8);
  ctx.strokeStyle='rgba(0,220,255,0.6)';ctx.lineWidth=1;ctx.strokeRect(-W/2+2,H*0.42,W-4,8);
  ctx.restore();
}

function drawPackMeteorNeonCity(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rotation);
  const r=m.rx;
  // Dark chunk with neon glow edge
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle='#04020c';ctx.fill();
  // Neon edge glow — alternating pink/cyan per meteor
  const edgeCol=(Math.floor(m.x/80)%2===0)?'rgba(255,0,180,0.7)':'rgba(0,220,255,0.7)';
  const eg=ctx.createRadialGradient(0,0,r*0.55,0,0,r);
  eg.addColorStop(0,'rgba(0,0,0,0)');eg.addColorStop(0.7,edgeCol.replace('0.7','0.15'));eg.addColorStop(1,edgeCol);
  ctx.fillStyle=eg;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
  // Circuit line details
  ctx.strokeStyle=edgeCol.replace('0.7','0.5');ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(-r*0.5,0);ctx.lineTo(0,-r*0.5);ctx.lineTo(r*0.5,0);ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,r*0.25,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}

// ── PACKS ARRAY ───────────────────────────────────────
const PACKS=[
  {id:'abyss',   name:'ABYSS',   emoji:'🌊', cost:800,
    drawRocket:drawPackRocketAbyss,  drawTail:drawPackTailAbyss,
    drawBg:drawPackBgAbyss,          drawMeteor:drawPackMeteorAbyss},
  {id:'sakura',  name:'SAKURA',  emoji:'🌸', cost:800,
    drawRocket:drawPackRocketSakura, drawTail:drawPackTailSakura,
    drawBg:drawPackBgSakura,         drawMeteor:drawPackMeteorSakura},
  {id:'crystal', name:'CRYSTAL', emoji:'💎', cost:800,
    drawRocket:drawPackRocketCrystal,drawTail:drawPackTailCrystal,
    drawBg:drawPackBgCrystal,        drawMeteor:drawPackMeteorCrystal},
  {id:'glacial', name:'GLACIAL', emoji:'❄️', cost:800,
    drawRocket:drawPackRocketGlacial,drawTail:drawPackTailGlacial,
    drawBg:drawPackBgGlacial,        drawMeteor:drawPackMeteorGlacial},
  {id:'sports',  name:'SPORTS',  emoji:'🏆', cost:800,
    drawRocket:drawPackRocketSports, drawTail:drawPackTailSports,
    drawBg:drawPackBgSports,         drawMeteor:drawPackMeteorSports},
  {id:'royale',  name:'ROYALE',  emoji:'👑', cost:0, vip:true, vipMonth:1,
    drawRocket:drawPackRocketRoyale, drawTail:drawPackTailRoyale,
    drawBg:drawPackBgRoyale,         drawMeteor:drawPackMeteorRoyale},
  {id:'neoncity',name:'NEON CITY',emoji:'🌆',cost:0, vip:true, vipMonth:2,
    drawRocket:drawPackRocketNeonCity, drawTail:drawPackTailNeonCity,
    drawBg:drawPackBgNeonCity,         drawMeteor:drawPackMeteorNeonCity},
  {id:'candy',   name:'CANDY',   emoji:'🍬',cost:0, vip:true, vipMonth:3,
    drawRocket:drawPackRocketCandy,    drawTail:drawPackTailCandy,
    drawBg:drawPackBgCandy,            drawMeteor:drawPackMeteorCandy},
];

const BACKGROUNDS=[
  {id:'classic',   name:'CLASSIC',   cost:0,  drawFn:drawBgClassic  },
  {id:'nebula',    name:'NEBULA',    cost:10, drawFn:drawBgNebula   },
  {id:'aurora',    name:'AURORA',    cost:16, drawFn:drawBgAurora   },
  {id:'deep',      name:'DEEP',      cost:20, drawFn:drawBgDeep     },
  {id:'supernova', name:'SUPERNOVA', cost:24, drawFn:drawBgSupernova},
  {id:'void',      name:'VOID',      cost:30, drawFn:drawBgVoid     },
  {id:'galactic',  name:'GALACTIC',  cost:36, drawFn:drawBgGalactic },
  {id:'storm',     name:'STORM',     cost:44, drawFn:drawBgStorm    },
  {id:'cosmic',    name:'COSMIC',    cost:50, drawFn:drawBgCosmic   },
  {id:'solar',     name:'SOLAR',     cost:60, drawFn:drawBgSolar    },
  // Pack backgrounds — unlocked via pack purchase
  {id:'abyss_bg',   name:'ABYSS',   cost:0, packId:'abyss',   drawFn:drawPackBgAbyss  },
  {id:'sakura_bg',  name:'SAKURA',  cost:0, packId:'sakura',  drawFn:drawPackBgSakura },
  {id:'crystal_bg', name:'CRYSTAL', cost:0, packId:'crystal', drawFn:drawPackBgCrystal},
  {id:'glacial_bg', name:'GLACIAL', cost:0, packId:'glacial', drawFn:drawPackBgGlacial},
  {id:'sports_bg',  name:'SPORTS',  cost:0, packId:'sports',  drawFn:drawPackBgSports },
  {id:'royale_bg',   name:'ROYALE',    cost:0, packId:'royale',   drawFn:drawPackBgRoyale   },
  {id:'neoncity_bg', name:'NEON CITY', cost:0, packId:'neoncity', drawFn:drawPackBgNeonCity },
  {id:'candy_bg',    name:'CANDY',     cost:0, packId:'candy',    drawFn:drawPackBgCandy    },
  // Secret easter-egg backgrounds (cost 0, hidden from shop)
  {id:'retrowave',   name:'RETROWAVE', cost:0, secret:true,       drawFn:drawBgRetrowave    },
  {id:'matrix',      name:'MATRIX',    cost:0, secret:true,       drawFn:drawBgMatrix       },
];

// ── Tail draw functions ─────────────────────────────────────────────────────
// signature: drawTailXxx(bb, bw, no)  →  bb=body-bottom y, bw=body width, no=nozzle height
function drawTailClassic(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=48*fs,fi=28*fs,ny=bb+no,hw=bw*0.4,hiw=bw*0.2;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.62,ny+fo*0.82,0,ny+fo);ctx.quadraticCurveTo(hw*0.62,ny+fo*0.82,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(255,136,68,0.9)');g1.addColorStop(1,'rgba(255,100,20,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(-hiw*0.5,ny+fi*0.75,0,ny+fi);ctx.quadraticCurveTo(hiw*0.5,ny+fi*0.75,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#ffffcc');g2.addColorStop(0.5,'#ffcc44');g2.addColorStop(1,'rgba(255,150,50,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailInferno(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=62*fs,fi=38*fs,ny=bb+no,hw=bw*0.52,hiw=bw*0.28;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.7,ny+fo*0.75,0,ny+fo);ctx.quadraticCurveTo(hw*0.7,ny+fo*0.75,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(255,40,0,0.95)');g1.addColorStop(0.5,'rgba(255,80,0,0.6)');g1.addColorStop(1,'rgba(180,0,0,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(-hiw*0.5,ny+fi*0.75,0,ny+fi);ctx.quadraticCurveTo(hiw*0.5,ny+fi*0.75,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#fff0a0');g2.addColorStop(0.4,'#ff8800');g2.addColorStop(1,'rgba(255,40,0,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailIce(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=42*fs,fi=24*fs,ny=bb+no,hw=bw*0.36,hiw=bw*0.18;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.5,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.5,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(80,160,255,0.9)');g1.addColorStop(1,'rgba(30,80,220,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(-hiw*0.5,ny+fi*0.75,0,ny+fi);ctx.quadraticCurveTo(hiw*0.5,ny+fi*0.75,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#eeffff');g2.addColorStop(0.5,'#88ccff');g2.addColorStop(1,'rgba(80,160,255,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailSmoke(bb,bw,no){
  const fs=1+(state.level-1)*0.22,ny=bb+no;
  for(let i=0;i<5;i++){const t=i/4,py=ny+t*50*fs,pr=(8+t*12)*fs,px=(i%2===0?1:-1)*4*t*fs;ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fillStyle=`rgba(160,160,170,${(1-t)*0.5})`;ctx.fill();}
}
function drawTailNeon(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=50*fs,fi=30*fs,ny=bb+no,hw=bw*0.38,hiw=bw*0.18;
  ctx.shadowColor='#00ff44';ctx.shadowBlur=14;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.5,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.5,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(0,255,80,0.9)');g1.addColorStop(1,'rgba(0,180,50,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.shadowBlur=0;
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(-hiw*0.5,ny+fi*0.75,0,ny+fi);ctx.quadraticCurveTo(hiw*0.5,ny+fi*0.75,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#ccffcc');g2.addColorStop(0.5,'#44ff88');g2.addColorStop(1,'rgba(0,255,80,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailGhost(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=54*fs,fi=34*fs,ny=bb+no,hw=bw*0.42,hiw=bw*0.22;
  const pulse=0.6+0.4*Math.sin(gameTime*4);
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.6,ny+fo*0.78,0,ny+fo);ctx.quadraticCurveTo(hw*0.6,ny+fo*0.78,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,`rgba(200,210,255,${0.6*pulse})`);g1.addColorStop(1,'rgba(180,200,255,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(0,ny+fi*0.72,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,`rgba(240,245,255,${0.8*pulse})`);g2.addColorStop(1,'rgba(220,230,255,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailGold(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=50*fs,fi=30*fs,ny=bb+no,hw=bw*0.4,hiw=bw*0.2;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.55,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.55,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(255,200,0,0.95)');g1.addColorStop(0.6,'rgba(220,140,0,0.5)');g1.addColorStop(1,'rgba(180,80,0,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(0,ny+fi*0.72,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#ffffd0');g2.addColorStop(0.5,'#ffdd00');g2.addColorStop(1,'rgba(255,180,0,0)');ctx.fillStyle=g2;ctx.fill();
  for(let i=0;i<4;i++){const t=(gameTime*3+i*1.57)%(Math.PI*2),sx=Math.sin(t*2.1+i)*hw*0.7,sy=ny+(Math.sin(t+i)*0.5+0.5)*fo*0.8;ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,180,${0.5+0.5*Math.sin(t*3)})`;ctx.fill();}
}
function drawTailPlasma(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=52*fs,fi=30*fs,ny=bb+no,hw=bw*0.4,hiw=bw*0.2;
  ctx.shadowColor='#aa44ff';ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.55,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.55,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(180,60,255,0.9)');g1.addColorStop(0.5,'rgba(80,180,255,0.6)');g1.addColorStop(1,'rgba(120,0,220,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.shadowBlur=0;
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(0,ny+fi*0.72,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#fff0ff');g2.addColorStop(0.5,'#cc88ff');g2.addColorStop(1,'rgba(160,60,255,0)');ctx.fillStyle=g2;ctx.fill();
}
function drawTailRainbow(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=50*fs,fi=30*fs,ny=bb+no,hw=bw*0.42,hiw=bw*0.2;
  const hue=(gameTime*120)%360;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.55,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.55,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,`hsla(${hue},100%,60%,0.9)`);g1.addColorStop(0.5,`hsla(${(hue+60)%360},100%,55%,0.6)`);g1.addColorStop(1,`hsla(${(hue+120)%360},100%,50%,0)`);ctx.fillStyle=g1;ctx.fill();
  ctx.beginPath();ctx.moveTo(-hiw,ny);ctx.quadraticCurveTo(0,ny+fi*0.72,hiw,ny);ctx.closePath();
  const g2=ctx.createLinearGradient(0,ny,0,ny+fi);g2.addColorStop(0,'#ffffff');g2.addColorStop(0.5,`hsla(${(hue+30)%360},100%,75%,0.8)`);g2.addColorStop(1,`hsla(${(hue+90)%360},100%,60%,0)`);ctx.fillStyle=g2;ctx.fill();
}
function drawTailNovaTail(bb,bw,no){
  const fs=1+(state.level-1)*0.22,fo=55*fs,ny=bb+no,hw=bw*0.44;
  ctx.beginPath();ctx.moveTo(-hw,ny);ctx.quadraticCurveTo(-hw*0.5,ny+fo*0.8,0,ny+fo);ctx.quadraticCurveTo(hw*0.5,ny+fo*0.8,hw,ny);ctx.closePath();
  const g1=ctx.createLinearGradient(0,ny,0,ny+fo);g1.addColorStop(0,'rgba(255,255,200,0.95)');g1.addColorStop(0.3,'rgba(255,180,60,0.8)');g1.addColorStop(1,'rgba(255,80,0,0)');ctx.fillStyle=g1;ctx.fill();
  ctx.save();ctx.translate(0,ny+fo*0.25);
  for(let i=0;i<8;i++){const angle=gameTime*2+i*Math.PI/4,len=(12+6*Math.sin(gameTime*5+i))*fs;ctx.strokeStyle=`rgba(255,220,80,${0.4+0.3*Math.sin(gameTime*4+i)})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*len,Math.sin(angle)*len);ctx.stroke();}
  ctx.restore();
}
function drawActiveTail(bb,bw,no,tailId){
  const tId=tailId||(typeof state!=='undefined'&&state.equippedTail)||'classic';
  const pk=PACKS.find(p=>tId===p.id+'_tail');
  if (pk) { pk.drawTail(bb,bw,no); return; }
  const t=TAILS.find(t=>t.id===tId)||TAILS[0];
  t.drawFn(bb,bw,no);
}
const TAILS=[
  {id:'classic', name:'CLASSIC', cost:0,  drawFn:drawTailClassic },
  {id:'inferno', name:'INFERNO', cost:8,  drawFn:drawTailInferno },
  {id:'ice',     name:'ICE',     cost:12, drawFn:drawTailIce     },
  {id:'smoke',   name:'SMOKE',   cost:16, drawFn:drawTailSmoke   },
  {id:'neon',    name:'NEON',    cost:20, drawFn:drawTailNeon    },
  {id:'ghost',   name:'GHOST',   cost:24, drawFn:drawTailGhost   },
  {id:'gold',    name:'GOLD',    cost:30, drawFn:drawTailGold    },
  {id:'plasma',  name:'PLASMA',  cost:36, drawFn:drawTailPlasma  },
  {id:'rainbow', name:'RAINBOW', cost:44, drawFn:drawTailRainbow },
  {id:'nova',    name:'NOVA',    cost:56, drawFn:drawTailNovaTail},
  // Pack tails — unlocked via pack purchase
  {id:'abyss_tail',   name:'ABYSS TRAIL',   cost:0, packId:'abyss',   drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='abyss');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'sakura_tail',  name:'SAKURA TRAIL',  cost:0, packId:'sakura',  drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='sakura');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'crystal_tail', name:'CRYSTAL TRAIL', cost:0, packId:'crystal', drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='crystal');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'glacial_tail', name:'GLACIAL TRAIL', cost:0, packId:'glacial', drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='glacial');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'sports_tail',  name:'SPORTS TRAIL',  cost:0, packId:'sports',  drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='sports');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'royale_tail',   name:'ROYALE TRAIL',   cost:0, packId:'royale',   drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='royale');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'neoncity_tail', name:'NEON CITY TRAIL', cost:0, packId:'neoncity', drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='neoncity');if(pk)pk.drawTail(bb,bw,no);}},
  {id:'candy_tail',    name:'CANDY TRAIL',    cost:0, packId:'candy',    drawFn:(bb,bw,no)=>{const pk=PACKS.find(p=>p.id==='candy');if(pk)pk.drawTail(bb,bw,no);}},
];

// ── Rocket shop config ────────────────────────
const ROCKETS = [
  // ── Cost 0 ───────────────────────────────────
  {
    id: 'explorer', name: 'EXPLORER', cost: 0, emoji: '🚀',
    body:  ['#9898aa', '#dcdcec', '#c8c8da'],
    nose:  ['#9a2010', '#d84420'],
    fin:   ['#9898aa', '#c8c8da'],
    band:  '#ff6b35', stripe: '#ffaa80',
    glass: ['#aaeeff', '#7ed6c8', '#3a8878'],
  },
  // ── Cost 8 ───────────────────────────────────
  {
    id: 'frost', name: 'FROST', cost: 15, emoji: '❄️',
    body:  ['#5888b0', '#c0e8ff', '#88c0f0'],
    nose:  ['#1a4488', '#3377cc'],
    fin:   ['#4878a0', '#78b0d8'],
    band:  '#44aaff', stripe: '#aaddff',
    glass: ['#eeffff', '#aaeeff', '#3388aa'],
  },
  // ── Cost 12 ──────────────────────────────────
  {
    id: 'retro', name: 'RETRO', cost: 22, emoji: '🛸',
    drawFn: drawRocketRetro,
    body: ['#8a7030','#e8c870','#d0aa50'], nose: ['#8a3010','#cc5820'],
    fin:  ['#8a6820','#c8a040'], band: '#d4a030', stripe: '#f0c050',
    glass: ['#ffcc88','#cc8840','#7a4418'],
  },
  // ── Cost 15 ──────────────────────────────────
  {
    id: 'solar', name: 'SOLAR', cost: 28, emoji: '☀️',
    body:  ['#aa8800', '#fff070', '#d4b830'],
    nose:  ['#882200', '#cc5500'],
    fin:   ['#996600', '#ccaa00'],
    band:  '#ffaa00', stripe: '#ffdd66',
    glass: ['#ffffaa', '#ffee44', '#bb8800'],
  },
  // ── Cost 20 ──────────────────────────────────
  {
    id: 'stealth', name: 'STEALTH', cost: 38, emoji: '🖤',
    drawFn: drawRocketStealth,
    body: ['#181820','#2e2e40','#252535'], nose: ['#141420','#282838'],
    fin:  ['#1a1a22','#2a2a36'], band: '#00cc44', stripe: 'rgba(0,200,60,0.5)',
    glass: ['#88ffaa','#00aa33','#0a1020'],
  },
  // ── Cost 25 ──────────────────────────────────
  {
    id: 'phantom', name: 'PHANTOM', cost: 48, emoji: '👻',
    body:  ['#280838', '#7030c0', '#4a2080'],
    nose:  ['#440088', '#9922cc'],
    fin:   ['#330055', '#7733bb'],
    band:  '#aa44ff', stripe: '#cc88ff',
    glass: ['#eeccff', '#aa44ff', '#550099'],
  },
  // ── Cost 35 ──────────────────────────────────
  {
    id: 'alien', name: 'ALIEN', cost: 65, emoji: '👽',
    drawFn: drawRocketAlien,
    body: ['#1a4a1a','#2a7a2a','#228822'], nose: ['#155515','#2a882a'],
    fin:  ['#1a5a1a','#2a8a2a'], band: 'rgba(0,220,80,0.5)', stripe: 'rgba(80,220,80,0.4)',
    glass: ['#aaffee','#44ff44','#0d2e0d'],
  },
  // ── Cost 40 ──────────────────────────────────
  {
    id: 'plasma', name: 'PLASMA', cost: 75, emoji: '⚡',
    body:  ['#103028', '#60f0a0', '#20a060'],
    nose:  ['#004d20', '#00aa44'],
    fin:   ['#0a2018', '#1a5038'],
    band:  '#00ff88', stripe: '#88ffcc',
    glass: ['#aaffee', '#00ffcc', '#007755'],
  },
  // ── Cost 50 ──────────────────────────────────
  {
    id: 'nova', name: 'NOVA', cost: 95, emoji: '💫',
    drawFn: drawRocketNova,
    body: ['#9090b0','#f0f0ff','#d8d8f0'], nose: ['#0a1060','#1830c0'],
    fin:  ['#0a1440','#1a2880'], band: '#1830c0', stripe: 'rgba(100,140,255,0.5)',
    glass: ['#fff0ff','#dd88ff','#0a1840'],
  },
  // ── Cost 60 ──────────────────────────────────
  {
    id: 'jupiter', name: 'JUPITER', cost: 120, emoji: '🪐',
    body:  ['#805028', '#e8c080', '#c07840'],
    nose:  ['#601808', '#b03818'],
    fin:   ['#703818', '#b06828'],
    band:  '#ff8833', stripe: '#ffcc88',
    glass: ['#ffddaa', '#ff8844', '#cc3311'],
  },
  // Pack rockets — unlocked via pack purchase
  {id:'abyss_rocket',   name:'ABYSS SHIP',   cost:0, packId:'abyss',   drawFn:(x,y)=>drawPackRocketAbyss(x,y)},
  {id:'sakura_rocket',  name:'SAKURA SHIP',  cost:0, packId:'sakura',  drawFn:(x,y)=>drawPackRocketSakura(x,y)},
  {id:'crystal_rocket', name:'CRYSTAL SHIP', cost:0, packId:'crystal', drawFn:(x,y)=>drawPackRocketCrystal(x,y)},
  {id:'glacial_rocket', name:'GLACIAL SHIP', cost:0, packId:'glacial', drawFn:(x,y)=>drawPackRocketGlacial(x,y)},
  {id:'sports_rocket',  name:'SPORTS SHIP',  cost:0, packId:'sports',  drawFn:(x,y)=>drawPackRocketSports(x,y)},
  {id:'royale_rocket',   name:'ROYALE SHIP',   cost:0, packId:'royale',   drawFn:(x,y)=>drawPackRocketRoyale(x,y)  },
  {id:'neoncity_rocket', name:'NEON CITY SHIP', cost:0, packId:'neoncity', drawFn:(x,y)=>drawPackRocketNeonCity(x,y)},
  {id:'candy_rocket',    name:'CANDY SHIP',    cost:0, packId:'candy',    drawFn:(x,y)=>drawPackRocketCandy(x,y)   },
];

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem('jtj_unlocked') || '["explorer"]'); }
  catch { return ['explorer']; }
}
function saveUnlocked(arr) {
  localStorage.setItem('jtj_unlocked', JSON.stringify(arr));
}
function loadEquipped() {
  return localStorage.getItem('jtj_equipped') || 'explorer';
}
function saveEquipped(id) {
  localStorage.setItem('jtj_equipped', id);
}
function loadUnlockedBgs() {
  try { return JSON.parse(localStorage.getItem('jtj_unlocked_bgs') || '["classic"]'); }
  catch { return ['classic']; }
}
function saveUnlockedBgs(arr) { localStorage.setItem('jtj_unlocked_bgs', JSON.stringify(arr)); }
function loadEquippedBg()     { return localStorage.getItem('jtj_equipped_bg') || 'classic'; }
function saveEquippedBg(id)   { localStorage.setItem('jtj_equipped_bg', id); }

function loadUnlockedPacks() {
  try { return JSON.parse(localStorage.getItem('jtj_unlocked_packs') || '[]'); }
  catch { return []; }
}
function saveUnlockedPacks(arr) { localStorage.setItem('jtj_unlocked_packs', JSON.stringify(arr)); }
function loadEquippedPack()     { return localStorage.getItem('jtj_equipped_pack') || null; }
function saveEquippedPack(id)   {
  if (id) localStorage.setItem('jtj_equipped_pack', id);
  else localStorage.removeItem('jtj_equipped_pack');
}

function loadUnlockedTails() {
  try { return JSON.parse(localStorage.getItem('jtj_unlocked_tails') || '["classic"]'); }
  catch { return ['classic']; }
}
function saveUnlockedTails(arr) { localStorage.setItem('jtj_unlocked_tails', JSON.stringify(arr)); }
function loadEquippedTail()     { return localStorage.getItem('jtj_equipped_tail') || 'classic'; }
function saveEquippedTail(id)   { localStorage.setItem('jtj_equipped_tail', id); }


// Hit areas rebuilt on every shop frame draw
const shopButtons = [];


// ══════════════════════════════════════════════
//  Profile / pilot save system  (up to 3 slots)
// ══════════════════════════════════════════════
const MAX_PROFILES = 3;
const profileButtons = [];           // rebuilt every draw
const profileScreen  = { selectedIdx: -1 };

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem('jtj_profiles') || '[]'); }
  catch { return []; }
}
function saveProfiles(profiles) {
  localStorage.setItem('jtj_profiles', JSON.stringify(profiles));
}
function getActiveProfileIdx() {
  return parseInt(localStorage.getItem('jtj_active_profile') || '-1', 10);
}
function setActiveProfileIdx(idx) {
  localStorage.setItem('jtj_active_profile', String(idx));
}
function getProfileRank(p) {
  const c = p.coins || 0;
  if (c >= 2000) return 'COMMANDER';
  if (c >= 800)  return 'ACE PILOT';
  if (c >= 300)  return 'PILOT';
  if (c >= 50)   return 'CADET';
  return 'ROOKIE';
}
function loadProfileIntoSession(idx) {
  const profiles = loadProfiles();
  const p = profiles[idx];
  if (!p) return;
  saveCoins(p.coins || 0);
  saveEquipped(p.equippedRocket || 'explorer');
  saveUnlocked(p.unlockedRockets && p.unlockedRockets.length ? p.unlockedRockets : ['explorer']);
  saveLeaderboard(p.leaderboard || []);
  saveEquippedTail(p.equippedTail || 'classic');
  saveUnlockedTails(p.unlockedTails && p.unlockedTails.length ? p.unlockedTails : ['classic']);
  setActiveProfileIdx(idx);
  state.coins           = loadCoins();
  state.leaderboard     = loadLeaderboard();
  state.unlockedRockets = loadUnlocked();
  state.equippedRocket  = loadEquipped();
  state.unlockedTails   = loadUnlockedTails();
  state.equippedTail    = loadEquippedTail();
  saveEquippedBg(p.equippedBg || 'classic');
  saveUnlockedBgs(p.unlockedBgs && p.unlockedBgs.length ? p.unlockedBgs : ['classic']);
  state.unlockedBgs     = loadUnlockedBgs();
  state.equippedBg      = loadEquippedBg();
  saveEquippedPack(p.equippedPack || null);
  saveUnlockedPacks(p.unlockedPacks || []);
  state.unlockedPacks   = loadUnlockedPacks();
  state.equippedPack    = loadEquippedPack();
  state.lastSpinDate    = p.lastSpinDate || '';
}
function saveCurrentProfileData() {
  const idx      = getActiveProfileIdx();
  const profiles = loadProfiles();
  if (idx < 0 || idx >= profiles.length) return;
  profiles[idx] = {
    ...profiles[idx],
    coins:           loadCoins(),
    equippedRocket:  loadEquipped(),
    unlockedRockets: loadUnlocked(),
    equippedTail:    loadEquippedTail(),
    unlockedTails:   loadUnlockedTails(),
    equippedBg:      loadEquippedBg(),
    unlockedBgs:     loadUnlockedBgs(),
    equippedPack:    loadEquippedPack(),
    unlockedPacks:   loadUnlockedPacks(),
    leaderboard:     loadLeaderboard(),
    lastSpinDate:    state.lastSpinDate || '',
  };
  saveProfiles(profiles);
}

// Migrate existing single-save data into profile slot 0
(function migrateToProfiles() {
  if (loadProfiles().length > 0) return;
  const coins = loadCoins();
  const lb    = loadLeaderboard();
  const ul    = loadUnlocked();
  const eq    = loadEquipped();
  if (coins > 0 || lb.length > 0 || ul.length > 1) {
    saveProfiles([{ name: 'PILOT', coins, equippedRocket: eq, unlockedRockets: ul, leaderboard: lb }]);
    setActiveProfileIdx(0);
    profileScreen.selectedIdx = 0;
  }
})();

// Pre-select the last-used profile
(function initProfileSelection() {
  const idx = getActiveProfileIdx();
  const profiles = loadProfiles();
  if (idx >= 0 && idx < profiles.length) profileScreen.selectedIdx = idx;
  else if (profiles.length > 0) profileScreen.selectedIdx = 0;
})();

// ── Background zone config ────────────────────
// Score thresholds to enter each zone (zone 1 = start)
const WIN_SCORE       = 2000;   // score needed to reach Jupiter

const ZONE_THRESHOLDS = [0, 300, 700, 1200];

// RGB colour stops [top, mid, bottom] per zone
const ZONE_PALETTES = [
  { t: [0,  0,  8],  m: [8,  4,  32], b: [26, 10, 80]  },  // Zone 1: deep blue
  { t: [2,  0,  14], m: [12, 6,  44], b: [30, 8,  90]  },  // Zone 2: violet
  { t: [4,  0,  8],  m: [14, 4,  30], b: [36, 8,  58]  },  // Zone 3: dark purple
  { t: [10, 2,  0],  m: [24, 6,  10], b: [52, 14, 20]  },  // Zone 4: warm Jupiter
];

const ZONE_LABELS = ['', 'LEAVING ORBIT', 'DEEP SPACE', 'JUPITER AHEAD!'];

// ── Game state ────────────────────────────────
const state = {
  screen: loadAuthSession() ? 'splash' : 'auth',
  authMode:    'login',   // 'login' | 'signup'
  authUser:    loadAuthSession(),
  authPin:     '',
  authUsername:'',
  authError:   '',
  authLoading: false,
  splashTimer: 5.0,    // counts down; transitions to 'start' when done
  score: 0,
  elapsedTime: 0,        // seconds played this run
  leaderboard: loadLeaderboard(),
  globalLeaderboard: [],
  globalLbLoading: false,
  coins: loadCoins(),           // total coin balance
  coinsEarned: 0,               // coins earned this run
  pendingTime: 0,                // time awaiting name entry
  unlockedRockets: loadUnlocked(),
  equippedRocket:  loadEquipped(),
  shopTab:         'rockets',
  shopScrollY:     0,
  wheelAngle:      0,
  wheelSpinning:   false,
  wheelVelocity:   0,
  wheelTarget:     0,
  wheelResult:     null,
  wheelShowResult: false,
  lastSpinDate:    '',
  unlockedTails:   loadUnlockedTails ? loadUnlockedTails() : ['classic'],
  equippedTail:    loadEquippedTail  ? loadEquippedTail()  : 'classic',
  unlockedBgs:     loadUnlockedBgs   ? loadUnlockedBgs()   : ['classic'],
  equippedBg:      loadEquippedBg    ? loadEquippedBg()    : 'classic',
  unlockedPacks:   loadUnlockedPacks ? loadUnlockedPacks() : [],
  equippedPack:    loadEquippedPack  ? loadEquippedPack()  : null,
  level: 1,
  lives: 3,
  rocket: { x: CANVAS_W / 2, y: CANVAS_H * 0.75, vx: 0, hitTimer: 0 },
  meteors: [],
  stars: [],
  powerups: [],
  explosions: [],
  shield: false,                 // true while shield orb is active
  magnetTimer: 0,               // seconds remaining on magnet effect
  boostTimer: 0,                // seconds remaining on speed boost
  boostFlash: 0,                // golden flash overlay on pickup (0–1)
  shakeTimer: 0,                // screen shake remaining (seconds)
  hitFlash: 0,                  // red flash overlay alpha (0–1, fades per frame)
  backgroundZone: 1,             // 1–4, advances with score
  zoneAnnounce: { text: '', life: 0 },  // banner shown when entering a new zone
  levelAnnounce: { life: 0 },           // "LEVEL UP!" banner
  scorePopups: [],               // floating "+50" text after collecting a star
  coinPickups:        [],        // coin tokens falling down screen
  coinMultiplier:     1,         // 1 or 2 (active pickup multiplier)
  coinMultiplierTimer: 0,        // seconds remaining on ×2
  noHitTimer:         0,         // seconds since last hit (dodge streak timer)
  streakMilestones:   [],        // streak thresholds already awarded this run
  zoneEntryTime:      0,         // gameTime when current zone started
  zoneHits:           0,         // hits taken in the current zone
  dailyBonus:   { show: false, coins: 0, streak: 0, life: 0 }, // login reward popup
  firstRunBonus: false,          // true → all coins ×2 for first game of the day
  dailyChallenge: null,          // today's challenge object
  dailyChallengeHidden: false,   // dismissed by tapping X
  signinPrompt: false,           // show "sign in" overlay for guests
  eggTaps: 0,                    // secret cloud easter egg tap counter
  eggLastTap: 0,                 // timestamp of last egg tap
  eggFlash: 0,                   // seconds remaining on "SECRET UNLOCKED" flash
  // Sun egg — 5 taps → +500 coins
  sunTaps: 0, sunLastTap: 0,
  // Title egg — 4 taps on "JUPITER" → speed boost on next run
  titleTaps: 0, titleLastTap: 0, titleBoostArmed: false,
  // Coin badge egg — 10 taps → double coins
  coinTaps: 0, coinLastTap: 0,
  // Trophy egg — 3 taps → ghost time popup
  trophyTaps: 0, trophyLastTap: 0, ghostTimeVisible: false,
  // Gear egg — 5 taps → unlock RETROWAVE theme
  gearTaps: 0, gearLastTap: 0,
  // Back-button egg — 5 rapid back taps → unlock MATRIX theme
  backTaps: 0, backLastTap: 0,
  // Rage mode — 3 consecutive hits → rocket turns red, meteors explode
  rageMode: false, rageTimer: 0, consecutiveHits: 0,
  secretFlash: { life: 0, msg: '', sub: '' },  // shared flash banner for new secrets
  newAchievements: [],           // achievements unlocked since last start screen visit
  dailyChallengeJustCompleted: false,
  runStarCount:       0,         // stars collected this run
  runCloseCallCount:  0,         // close calls this run
  clearedZoneNoHit:   false,     // true if player cleared a zone with 0 hits
};

// ── Daily challenges ──────────────────────────
const CHALLENGE_POOL = [
  { id:'survive_20',    desc:'Survive 20 seconds',          type:'survive',     target:20, reward:5  },
  { id:'survive_40',    desc:'Survive 40 seconds',          type:'survive',     target:40, reward:7  },
  { id:'stars_run_3',   desc:'Collect 3 stars in a run',    type:'stars_run',   target:3,  reward:5  },
  { id:'stars_run_6',   desc:'Collect 6 stars in a run',    type:'stars_run',   target:6,  reward:7  },
  { id:'score_200',     desc:'Reach a score of 200',        type:'score',       target:200,reward:5  },
  { id:'score_500',     desc:'Reach a score of 500',        type:'score',       target:500,reward:8  },
  { id:'close_calls_2', desc:'Get 2 close calls',           type:'close_calls', target:2,  reward:6  },
  { id:'zone_2',        desc:'Reach Zone 2',                type:'zone',        target:2,  reward:5  },
  { id:'zone_3',        desc:'Reach Zone 3',                type:'zone',        target:3,  reward:8  },
  { id:'no_hit_zone',   desc:'Clear a zone without being hit', type:'no_hit_zone', target:1, reward:10 },
];
function getDailyChallenge() {
  const dayIndex = Math.floor(Date.now() / 86400000); // changes every calendar day
  return CHALLENGE_POOL[dayIndex % CHALLENGE_POOL.length];
}
function loadDailyChallengeData() {
  try { return JSON.parse(localStorage.getItem('jtj_daily_challenge') || 'null'); } catch { return null; }
}
function saveDailyChallengeData(d) { localStorage.setItem('jtj_daily_challenge', JSON.stringify(d)); }
function initDailyChallenge() {
  const today = getTodayStr();
  const saved = loadDailyChallengeData();
  if (saved && saved.date === today) {
    state.dailyChallenge = saved;
  } else {
    const c = getDailyChallenge();
    state.dailyChallenge = { date: today, id: c.id, desc: c.desc, type: c.type,
                              target: c.target, reward: c.reward, progress: 0, completed: false };
    saveDailyChallengeData(state.dailyChallenge);
  }
}

// ── Achievements ──────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_flight',  name:'LIFTOFF',        desc:'Play your first game',              reward:5  },
  { id:'survivor_60',   name:'SURVIVOR',       desc:'Survive 60s in one run',            reward:10 },
  { id:'stars_50',      name:'STAR CHASER',    desc:'Collect 50 total stars',            reward:8  },
  { id:'daredevil',     name:'DAREDEVIL',      desc:'Get 10 total close calls',          reward:8  },
  { id:'deep_space',    name:'DEEP SPACE',     desc:'Reach Zone 4',                      reward:10 },
  { id:'big_spender',   name:'BIG SPENDER',    desc:'Unlock 5 shop items',               reward:7  },
  { id:'hat_trick',     name:'HAT TRICK',      desc:'Get 3 close calls in one run',      reward:7  },
  { id:'jupiter',       name:'JUPITER!',       desc:'Reach Jupiter',                     reward:10 },
  { id:'coin_lord',     name:'COIN LORD',      desc:'Earn 100 total coins',              reward:8  },
  { id:'freq_flyer',    name:'FREQUENT FLYER', desc:'Play 10 games',                     reward:7  },
];
function loadStats() {
  try { return JSON.parse(localStorage.getItem('jtj_stats') || '{}'); } catch { return {}; }
}
function saveStats(s) { localStorage.setItem('jtj_stats', JSON.stringify(s)); }
function loadUnlockedAchievements() {
  try { return JSON.parse(localStorage.getItem('jtj_achievements') || '[]'); } catch { return []; }
}
function saveUnlockedAchievements(arr) { localStorage.setItem('jtj_achievements', JSON.stringify(arr)); }

function checkAchievements() {
  const stats    = loadStats();
  const unlocked = loadUnlockedAchievements();
  const newOnes  = [];
  const totalUnlocked = (loadUnlocked().length - 1) + (loadUnlockedTails().length - 1) + (loadUnlockedBgs().length - 1);

  const conditions = {
    first_flight:  ()=> (stats.gamesPlayed || 0) >= 1,
    survivor_60:   ()=> (stats.bestSurvive  || 0) >= 60,
    stars_50:      ()=> (stats.totalStars   || 0) >= 50,
    daredevil:     ()=> (stats.totalCloseCalls || 0) >= 10,
    deep_space:    ()=> (stats.highestZone  || 0) >= 4,
    big_spender:   ()=> totalUnlocked >= 5,
    hat_trick:     ()=> (stats.bestCloseCallsRun || 0) >= 3,
    jupiter:       ()=> (stats.wins         || 0) >= 1,
    coin_lord:     ()=> (stats.totalCoinsEarned || 0) >= 100,
    freq_flyer:    ()=> (stats.gamesPlayed  || 0) >= 10,
  };

  for (const ach of ACHIEVEMENTS) {
    if (!unlocked.includes(ach.id) && conditions[ach.id] && conditions[ach.id]()) {
      unlocked.push(ach.id);
      newOnes.push(ach);
      state.coins += ach.reward;
      saveCoins(state.coins);
    }
  }
  if (newOnes.length) saveUnlockedAchievements(unlocked);
  if (newOnes.length) state.newAchievements = [...(state.newAchievements || []), ...newOnes];
}

function updateStatsAfterRun(won) {
  const stats = loadStats();
  stats.gamesPlayed        = (stats.gamesPlayed || 0) + 1;
  stats.totalStars         = (stats.totalStars  || 0) + (state.runStarCount || 0);
  stats.totalCloseCalls    = (stats.totalCloseCalls || 0) + (state.runCloseCallCount || 0);
  stats.totalCoinsEarned   = (stats.totalCoinsEarned || 0) + (state.coinsEarned || 0);
  stats.bestSurvive        = Math.max(stats.bestSurvive || 0, state.elapsedTime || 0);
  stats.highestZone        = Math.max(stats.highestZone || 0, state.backgroundZone || 1);
  stats.bestCloseCallsRun  = Math.max(stats.bestCloseCallsRun || 0, state.runCloseCallCount || 0);
  if (won) stats.wins      = (stats.wins || 0) + 1;
  saveStats(stats);
}

function updateDailyChallengeAfterRun() {
  const dc = state.dailyChallenge;
  if (!dc || dc.completed) return;
  let progress = dc.progress;
  switch (dc.type) {
    case 'survive':     progress = Math.max(progress, state.elapsedTime || 0); break;
    case 'stars_run':   progress = Math.max(progress, state.runStarCount || 0); break;
    case 'score':       progress = Math.max(progress, state.score || 0); break;
    case 'close_calls': progress = Math.max(progress, state.runCloseCallCount || 0); break;
    case 'zone':        progress = Math.max(progress, state.backgroundZone || 1); break;
    case 'no_hit_zone': progress = state.clearedZoneNoHit ? progress + 1 : progress; break;
  }
  dc.progress = progress;
  if (dc.progress >= dc.target && !dc.completed) {
    dc.completed = true;
    state.coins += dc.reward;
    saveCoins(state.coins);
    state.dailyChallengeJustCompleted = true;
  }
  saveDailyChallengeData(dc);
}

// ── Shared animation timer (always running) ───
let gameTime = 0;

// ── Launch animation state ────────────────────
const LAUNCH_DURATION = 3.0;   // total seconds for takeoff sequence
const launchAnim = { t: 0 };   // .t counts up from 0 each launch

// ── Input ─────────────────────────────────────
const keys = {};  // tracks which keys are currently held down

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  // Enter or Space launches from start screen
  if ((e.key === 'Enter' || e.key === ' ') && state.screen === 'start') {
    beginLaunch();
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Movement tuning
const ROCKET_ACCEL = 1400;  // how fast the rocket speeds up (pixels per second²)
const ROCKET_MAX   = 420;   // top speed (pixels per second)
const ROCKET_DECAY = 0.08;  // how quickly it slows down when no key is held (0–1, lower = slidier)
const ROCKET_PAD   = 30;    // gap to keep from screen edges

// ── Touch / swipe input ───────────────────────
const touch = { active: false, startX: 0, currentX: 0, startY: 0, currentY: 0, didScroll: false };

// On-screen arrow buttons (held during gameplay)
const arrowTouch = { left: false, right: false };
const ARROW_L = { x: 55,          y: CANVAS_H - 60, w: 100, h: 80 };
const ARROW_R = { x: CANVAS_W-55, y: CANVAS_H - 60, w: 100, h: 80 };

function inArrowBtn(btn, cx, cy) {
  return Math.abs(cx - btn.x) < btn.w / 2 && Math.abs(cy - btn.y) < btn.h / 2;
}

function updateArrowTouches(e) {
  const rect  = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  arrowTouch.left  = false;
  arrowTouch.right = false;
  for (const t of e.touches) {
    const cx = (t.clientX - rect.left) / scale;
    const cy = (t.clientY - rect.top)  / scale;
    if (inArrowBtn(ARROW_L, cx, cy)) arrowTouch.left  = true;
    if (inArrowBtn(ARROW_R, cx, cy)) arrowTouch.right = true;
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  updateArrowTouches(e);
  touch.active    = true;
  touch.didScroll = false;
  touch.startX    = e.touches[0].clientX;
  touch.currentX  = e.touches[0].clientX;
  touch.startY    = e.touches[0].clientY;
  touch.currentY  = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  updateArrowTouches(e);
  touch.currentX = e.touches[0].clientX;
  const newY = e.touches[0].clientY;
  if (state.screen === 'shop') {
    const rect  = canvas.getBoundingClientRect();
    const scale = rect.width / CANVAS_W;
    const dy = (touch.currentY - newY) / scale;
    if (Math.abs(dy) > 1) { touch.didScroll = true; state.shopScrollY += dy; clampShopScroll(); }
  }
  touch.currentY = newY;
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  updateArrowTouches(e);
  if (e.touches.length === 0) touch.active = false;
  if (touch.didScroll) { touch.didScroll = false; return; }
  // Only fire handleTap if the lift wasn't on an arrow button
  const rect  = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  const tx = (e.changedTouches[0].clientX - rect.left) / scale;
  const ty = (e.changedTouches[0].clientY - rect.top)  / scale;
  if (state.screen === 'playing' && (inArrowBtn(ARROW_L, tx, ty) || inArrowBtn(ARROW_R, tx, ty))) return;
  handleTap(tx, ty);
}, { passive: false });

// Mouse click (desktop)
canvas.addEventListener('click', e => {
  const rect  = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  const cx = (e.clientX - rect.left) / scale;
  const cy = (e.clientY - rect.top)  / scale;
  handleTap(cx, cy);
});

// Mouse wheel (desktop shop scroll)
canvas.addEventListener('wheel', e => {
  if (state.screen !== 'shop') return;
  e.preventDefault();
  const rect  = canvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_W;
  state.shopScrollY += e.deltaY / scale;
  clampShopScroll();
}, { passive: false });

function handleTap(x, y) {
  // ── Auth screen taps ──
  if (state.screen === 'auth') {
    // Mode toggle
    if (Math.abs(y-155)<22) {
      if (x < CANVAS_W/2) { state.authMode='login'; state.authPin=''; state.authError=''; }
      else                 { state.authMode='signup'; state.authPin=''; state.authError=''; }
      return;
    }
    // Username tap — show input
    if (y>220 && y<265) {
      showAuthInput();
      state.authError='';
      return;
    }
    // Play as Guest
    const guestY = AUTH_PAD_Y + 4*(AUTH_BTN_H+AUTH_BTN_GAP) + 12;
    if (y >= guestY && y <= guestY+44 && Math.abs(x-CANVAS_W/2) < 115) {
      playAsGuest(); return;
    }
    // Numpad
    const key = authNumpadHit(x,y);
    if (key) {
      if (key==='←') { state.authPin=state.authPin.slice(0,-1); state.authError=''; }
      else if (key==='✓') { submitAuth(); }
      else if (state.authPin.length<4) { state.authPin+=key; state.authError=''; }
    }
    return;
  }

  if (state.screen === 'splash')  { state.screen = state.authUser ? 'start' : 'profile'; return; }
  if (state.screen === 'profile') {
    for (const btn of profileButtons) {
      if (Math.abs(x - btn.x) < btn.w / 2 && Math.abs(y - btn.y) < btn.h / 2) {
        if (btn.action === 'select') {
          profileScreen.selectedIdx = btn.idx;
        } else if (btn.action === 'new') {
          nameInputCallback = (name) => {
            const profiles = loadProfiles();
            profiles.push({ name: name || 'PILOT', coins: 0, equippedRocket: 'explorer', unlockedRockets: ['explorer'], equippedTail: 'classic', unlockedTails: ['classic'], equippedBg: 'classic', unlockedBgs: ['classic'], leaderboard: [] });
            saveProfiles(profiles);
            profileScreen.selectedIdx = profiles.length - 1;
            state.screen = 'profile';
          };
          showNameInput();
        } else if (btn.action === 'launch') {
          loadProfileIntoSession(btn.idx);
          state.screen = 'start';
        } else if (btn.action === 'delete') {
          const profiles = loadProfiles();
          profiles.splice(btn.idx, 1);
          saveProfiles(profiles);
          if (getActiveProfileIdx() === btn.idx) setActiveProfileIdx(-1);
          profileScreen.selectedIdx = Math.max(0, Math.min(profileScreen.selectedIdx, profiles.length - 1));
        } else if (btn.action === 'rename') {
          const profiles = loadProfiles();
          const cur = profiles[btn.idx]?.name || '';
          nameInputCallback = (name) => {
            const profs = loadProfiles();
            if (profs[btn.idx]) { profs[btn.idx].name = name || cur; saveProfiles(profs); }
            state.screen = 'profile';
          };
          showNameInput();
        } else if (btn.action === 'viewprofile') {
          loadProfileIntoSession(btn.idx);
          state.screen = 'leaderboard';
          fetchGlobalLeaderboard();
        }
        break;
      }
    }
    return;
  }
  if (state.screen === 'start'       && hitButton(LAUNCH_BTN,       x, y)) beginLaunch();
  if (state.screen === 'start'       && hitButton(SETTINGS_BTN,     x, y)) state.screen = 'settings';
  if (state.screen === 'start'       && hitButton(LEADERBOARD_BTN,  x, y)) { state.screen = 'leaderboard'; fetchGlobalLeaderboard(); }
  if (state.screen === 'start'       && hitButton(SHOP_BTN,          x, y)) {
    if (state.authUser?.isGuest) { state.signinPrompt = true; return; }
    state.screen = 'shop';
  }
  if (state.screen === 'start'       && hitButton(PROFILE_BTN,       x, y)) { saveCurrentProfileData(); state.screen = 'profile'; }
  if (state.screen === 'start'       && hitButton(TUTORIAL_BTN,      x, y)) state.screen = 'tutorial';
  if (state.screen === 'start'       && hitButton(WHEEL_BTN,         x, y)) {
    if (state.authUser?.isGuest) { state.signinPrompt = true; return; }
    state.wheelShowResult=false; state.screen='wheel';
  }
  // 🥚 Easter egg: tap the right cloud (330, 355) 7 times to unlock everything
  if (state.screen === 'start' && Math.abs(x - 330) < 60 && Math.abs(y - 355) < 40) {
    const now = Date.now();
    if (now - state.eggLastTap > 2000) state.eggTaps = 0; // reset if too slow
    state.eggTaps++;
    state.eggLastTap = now;
    if (state.eggTaps >= 7) {
      state.eggTaps = 0;
      const allRockets = ROCKETS.map(r => r.id);
      const allTails   = TAILS.map(t => t.id);
      const allBgs     = ['classic','nebula','aurora','deep','supernova','void','galactic',
                          'storm','cosmic','solar','abyss_bg','sakura_bg','crystal_bg',
                          'glacial_bg','sports_bg','royale_bg','neoncity_bg','candy_bg'];
      const allPacks   = PACKS.map(p => p.id);
      state.unlockedRockets = allRockets;
      state.unlockedTails   = allTails;
      state.unlockedBgs     = allBgs;
      state.unlockedPacks   = allPacks;
      saveUnlocked(allRockets);
      saveUnlockedTails(allTails);
      saveUnlockedBgs(allBgs);
      localStorage.setItem('jtj_unlocked_packs', JSON.stringify(allPacks));
      state.eggFlash = 3.0; // show flash for 3 seconds
    }
  }
  // ☀️ Sun egg — tap sun (310,115) 5 times for +500 coins
  if (state.screen === 'start' && Math.hypot(x - 310, y - 115) < 60) {
    const now = Date.now();
    if (now - state.sunLastTap > 2000) state.sunTaps = 0;
    state.sunTaps++; state.sunLastTap = now;
    if (state.sunTaps >= 5) {
      state.sunTaps = 0;
      state.coins += 500; saveCoins(state.coins);
      state.secretFlash = { life: 3.0, msg: '☀️  SOLAR BONUS  ☀️', sub: '+500 coins added!' };
    }
  }

  // 🚀 Title egg — tap "JUPITER" text area (centre, y≈144) 4 times → speed boost armed for next run
  if (state.screen === 'start' && Math.abs(x - CANVAS_W/2) < 140 && Math.abs(y - 144) < 36) {
    const now = Date.now();
    if (now - state.titleLastTap > 2000) state.titleTaps = 0;
    state.titleTaps++; state.titleLastTap = now;
    if (state.titleTaps >= 4) {
      state.titleTaps = 0;
      state.titleBoostArmed = true;
      state.secretFlash = { life: 3.0, msg: '⚡  HYPERDRIVE ARMED  ⚡', sub: 'Speed boost ready for your next run!' };
    }
  }

  // 🪙 Coin badge egg — tap coin balance (top-left, ~x=55,y=36) 10 times → double coins
  if (state.screen === 'start' && x < 115 && y < 62) {
    const now = Date.now();
    if (now - state.coinLastTap > 2000) state.coinTaps = 0;
    state.coinTaps++; state.coinLastTap = now;
    if (state.coinTaps >= 10) {
      state.coinTaps = 0;
      state.coins = Math.min(state.coins * 2, 99999); saveCoins(state.coins);
      state.secretFlash = { life: 3.0, msg: '🪙  COIN DOUBLED  🪙', sub: `Balance is now ${state.coins}!` };
    }
  }

  // Dismiss ghost time popup on any tap
  if (state.ghostTimeVisible) { state.ghostTimeVisible = false; return; }

  // Dismiss sign-in prompt on any tap
  if (state.signinPrompt) {
    state.signinPrompt = false;
    return;
  }
  if (state.screen === 'wheel') {
    // Tap SPIN button area
    if(!state.wheelSpinning && !state.wheelShowResult && y>CANVAS_H-134 && y<CANVAS_H-86) startWheelSpin();
    // Dismiss result
    else if(state.wheelShowResult) state.wheelShowResult=false;
    // Back button
    if(y>CANVAS_H-66 && y<CANVAS_H-22 && !state.wheelShowResult) state.screen='start';
  }
  // Daily challenge dismiss X
  if (state.screen === 'start' && state.dailyChallenge && !state.dailyChallengeHidden) {
    const cX = CANVAS_W / 2, cY = CANVAS_H - 138, cW = CANVAS_W - 40, cH = 62;
    const xBtnX = cX + cW / 2 - 2, xBtnY = cY - cH / 2 + 2;
    if (Math.abs(x - xBtnX) < 16 && Math.abs(y - xBtnY) < 16) state.dailyChallengeHidden = true;
  }
  if (state.screen === 'shop') {
    for (const btn of shopButtons) {
      if (Math.abs(x - btn.x) < btn.w / 2 && Math.abs(y - btn.y) < btn.h / 2) {
        if (btn.action === 'back')  { countBackEgg(); state.screen = 'start'; break; }
        if (btn.action === 'tab') { state.shopTab = btn.id; state.shopScrollY = 0; break; }
        if (btn.action === 'equip') {
          state.equippedRocket = btn.id;
          saveEquipped(btn.id);
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'unlock' && btn.canAfford) {
          state.coins -= btn.cost;
          saveCoins(state.coins);
          const ul = loadUnlocked(); ul.push(btn.id); saveUnlocked(ul);
          state.unlockedRockets = loadUnlocked();
          state.equippedRocket  = btn.id;
          saveEquipped(btn.id);
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'equip_tail') {
          state.equippedTail = btn.id;
          saveEquippedTail(btn.id);
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'unlock_tail' && btn.canAfford) {
          state.coins -= btn.cost;
          saveCoins(state.coins);
          const ut = loadUnlockedTails(); ut.push(btn.id); saveUnlockedTails(ut);
          state.unlockedTails = loadUnlockedTails();
          state.equippedTail  = btn.id;
          saveEquippedTail(btn.id);
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'equip_bg') {
          state.equippedBg = btn.id;
          saveEquippedBg(btn.id);
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'unlock_bg' && btn.canAfford) {
          state.coins -= btn.cost;
          saveCoins(state.coins);
          const ub = loadUnlockedBgs(); ub.push(btn.id); saveUnlockedBgs(ub);
          state.unlockedBgs = loadUnlockedBgs();
          state.equippedBg  = btn.id;
          saveEquippedBg(btn.id);
          checkAchievements(); // check BIG SPENDER
          saveCurrentProfileData();
          break;
        }
        if (btn.action === 'equip_pack') {
          // Equip all pack items at once as a shortcut, but they can be changed individually
          saveEquipped(btn.id+'_rocket'); state.equippedRocket = btn.id+'_rocket';
          saveEquippedTail(btn.id+'_tail'); state.equippedTail = btn.id+'_tail';
          saveEquippedBg(btn.id+'_bg'); state.equippedBg = btn.id+'_bg';
          state.equippedPack = btn.id; // keep for backward compat / meteor only
          saveEquippedPack(btn.id);
          saveCurrentProfileData(); break;
        }
        if (btn.action === 'unlock_pack' && btn.canAfford) {
          state.coins -= btn.cost; saveCoins(state.coins);
          const up = loadUnlockedPacks(); up.push(btn.id); saveUnlockedPacks(up);
          state.unlockedPacks = loadUnlockedPacks();
          // Add pack items to individual unlock arrays
          const ur = loadUnlocked(); ur.push(btn.id+'_rocket'); saveUnlocked(ur); state.unlockedRockets = ur;
          const ut = loadUnlockedTails(); ut.push(btn.id+'_tail'); saveUnlockedTails(ut); state.unlockedTails = ut;
          const ub = loadUnlockedBgs(); ub.push(btn.id+'_bg'); saveUnlockedBgs(ub); state.unlockedBgs = ub;
          saveCurrentProfileData(); break;
        }
      }
    }
  }
  if (state.screen === 'settings'    && hitButton(SETTINGS_BACK,    x, y)) {
    countBackEgg();
    // ⚙️ Gear egg: back from settings 5 rapid times → RETROWAVE
    const gNow = Date.now();
    if (gNow - state.gearLastTap > 6000) state.gearTaps = 0;
    state.gearTaps++; state.gearLastTap = gNow;
    if (state.gearTaps >= 5) {
      state.gearTaps = 0;
      if (!state.unlockedBgs.includes('retrowave')) { state.unlockedBgs = [...state.unlockedBgs, 'retrowave']; saveUnlockedBgs(state.unlockedBgs); }
      state.equippedBg = 'retrowave'; saveEquippedBg('retrowave');
      state.secretFlash = { life: 3.5, msg: '🌆  RETROWAVE UNLOCKED  🌆', sub: 'Secret theme equipped!' };
    }
    state.screen = 'start';
    return;
  }
  if (state.screen === 'settings' && Math.abs(x - CANVAS_W/2) < 100 && Math.abs(y - 478) < 22) {
    saveAuthSession(null);
    state.authUser = null;
    state.authPin = '';
    state.authUsername = '';
    state.authError = '';
    state.authMode = 'login';
    state.screen = 'auth';
    return;
  }
  if (state.screen === 'leaderboard' && hitButton(LEADERBOARD_BACK, x, y)) {
    countBackEgg();
    // 🏆 Trophy egg: back from leaderboard 3 rapid times → ghost time popup
    const tNow = Date.now();
    if (tNow - state.trophyLastTap > 6000) state.trophyTaps = 0;
    state.trophyTaps++; state.trophyLastTap = tNow;
    if (state.trophyTaps >= 3) { state.trophyTaps = 0; state.ghostTimeVisible = true; }
    state.screen = 'start';
    return;
  }
  if (state.screen === 'tutorial'    && hitButton(TUTORIAL_BACK,    x, y)) { countBackEgg(); state.screen = 'start'; return; }
  if (state.screen === 'settings' && hitButton(SOUND_TOGGLE,  x, y)) {
    settings.soundEnabled = !settings.soundEnabled;
    saveSettings();
  }
  if (state.screen === 'playing'  && hitButton(EXIT_BTN,       x, y)) goMainMenu();
  if (state.screen === 'gameover' && hitButton(TRY_AGAIN_BTN, x, y)) beginLaunch();
  if (state.screen === 'gameover' && hitButton(MAIN_MENU_BTN, x, y)) goMainMenu();
  if (state.screen === 'nameentry' && hitButton(NAME_SUBMIT_BTN, x, y)) submitNameEntry(getNameInputEl().value);
  if (state.screen === 'win'      && hitButton(WIN_PLAY_BTN,  x, y)) beginLaunch();
  if (state.screen === 'win'      && hitButton(WIN_MENU_BTN,  x, y)) goMainMenu();
}

// ── Button helpers ────────────────────────────
const SETTINGS_BTN    = { x: CANVAS_W - 44, y: 44,  w: 52,  h: 52  };  // gear icon, top-right
const LEADERBOARD_BTN = { x: CANVAS_W - 44, y: CANVAS_H - 44, w: 52, h: 52 };  // trophy, bottom-right
const SHOP_BTN        = { x: CANVAS_W - 44 - 58, y: 44, w: 52, h: 52 };  // shop, left of gear
const PROFILE_BTN     = { x: 44,             y: CANVAS_H - 44, w: 52, h: 52 };  // profile, bottom-left
const TUTORIAL_BTN    = { x: CANVAS_W / 2,  y: CANVAS_H - 44, w: 52, h: 52 };  // how-to-play, bottom-center
const WHEEL_BTN       = { x: CANVAS_W/2, y: 210, w: CANVAS_W-40, h: 54 };  // daily spin banner
const SETTINGS_BACK   = { x: CANVAS_W / 2,  y: 748, w: 250, h: 58  };  // back to menu
const LEADERBOARD_BACK = { x: CANVAS_W / 2, y: 748, w: 250, h: 58  };  // back to menu
const TUTORIAL_BACK   = { x: CANVAS_W / 2,  y: 748, w: 250, h: 58  };  // back to menu
const SOUND_TOGGLE    = { x: CANVAS_W / 2,  y: 380, w: 280, h: 70  };  // toggle row
const LAUNCH_BTN      = { x: CANVAS_W / 2, y: 748, w: 250, h: 58 };
const TRY_AGAIN_BTN   = { x: CANVAS_W / 2, y: 560, w: 250, h: 58 };
const MAIN_MENU_BTN   = { x: CANVAS_W / 2, y: 648, w: 250, h: 58 };
const WIN_PLAY_BTN    = { x: CANVAS_W / 2, y: 720, w: 250, h: 58 };
const NAME_SUBMIT_BTN = { x: CANVAS_W / 2, y: 530, w: 220, h: 54 };
const WIN_MENU_BTN    = { x: CANVAS_W / 2, y: 792, w: 250, h: 58 };
const EXIT_BTN        = { x: 36,            y: CANVAS_H - 28, w: 60, h: 40 };  // bottom-left, discrete

function hitButton(btn, px, py) {
  return Math.abs(px - btn.x) < btn.w / 2 && Math.abs(py - btn.y) < btn.h / 2;
}

// ── Launch animation trigger ──────────────────
function beginLaunch() {
  hideNameInput();
  checkFirstRunBonus();     // mark first run of the day → 2× coins
  launchAnim.t = 0;
  state.screen  = 'launching';
  sfxLaunchRumble();
}

// ── Start / reset (called when anim finishes) ─
function startGame() {
  state.screen      = 'playing';
  state.score       = 0;
  state.level       = 1;
  state.lives       = 3;
  state.meteors     = [];
  state.stars       = [];
  state.powerups    = [];
  state.explosions  = [];
  state.scorePopups       = [];
  state.coinPickups         = [];
  state.coinMultiplier      = 1;
  state.coinMultiplierTimer = 0;
  state.noHitTimer          = 0;
  state.streakMilestones    = [];
  state.zoneEntryTime       = gameTime;
  state.zoneHits            = 0;
  state.runStarCount        = 0;
  state.runCloseCallCount   = 0;
  state.clearedZoneNoHit    = false;
  state.rocket.x        = CANVAS_W / 2;
  state.rocket.y        = CANVAS_H * 0.75;
  state.rocket.vx       = 0;
  state.rocket.hitTimer = 0;
  state.elapsedTime    = 0;
  state.coinsEarned    = 0;
  state.pendingTime    = 0;
  state.shield         = false;
  state.magnetTimer    = 0;
  // Apply hyperdrive if armed by title easter egg
  state.boostTimer     = state.titleBoostArmed ? 10.0 : 0;
  state.boostFlash     = state.titleBoostArmed ? 0.8  : 0;
  state.titleBoostArmed = false;
  state.shakeTimer     = 0;
  state.hitFlash       = 0;
  state.backgroundZone = 1;
  state.rageMode       = false;
  state.rageTimer      = 0;
  state.consecutiveHits = 0;
  state.zoneAnnounce   = { text: '', life: 0 };
  state.levelAnnounce  = { life: 0 };
  meteorTimer      = 0;
  speederTimer     = 0;
  giantTimer       = 0;
  starTimer        = 0;
  shieldTimer      = 0;
  magnetSpawnTimer = 0;
  boostSpawnTimer  = 0;
  coinPickupTimer  = 0;
  treasureCoinTimer = 0;
  coinMultSpawnTimer = 0;
}

function goMainMenu() {
  hideNameInput();
  saveCurrentProfileData();
  state.screen = 'start';
}

// ── Background stars ──────────────────────────
// Two layers: far (slow, small, dim) and near (faster, bigger, brighter).
const SCROLL_SPEED = 280;  // base pixels/second for the near layer
const starsFar  = [];
const starsNear = [];

(function generateStars() {
  for (let i = 0; i < 90; i++) {
    starsFar.push({
      x:     Math.random() * CANVAS_W,
      y:     Math.random() * CANVAS_H,
      r:     Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.5 + 0.2,
    });
  }
  for (let i = 0; i < 45; i++) {
    starsNear.push({
      x:     Math.random() * CANVAS_W,
      y:     Math.random() * CANVAS_H,
      r:     Math.random() * 1.8 + 0.8,
      alpha: Math.random() * 0.4 + 0.5,
    });
  }
})();

// ── Meteor config ─────────────────────────────
// ── Meteor types ──────────────────────────────
//   normal : standard mixed sizes
//   speeder: small & very fast
//   giant  : huge & slow
const METEOR_SIZES = [
  { rx: 20, ry: 14, r: 18 },  // large  (~40×28)
  { rx: 15, ry: 11, r: 13 },  // medium (~30×22)
  { rx: 11, ry:  8, r: 10 },  // small  (~22×16)
];
const METEOR_SPAWN_INTERVAL  = 1.4;   // normal meteor
const SPEEDER_SPAWN_INTERVAL = 2.2;   // fast small meteor
const GIANT_SPAWN_INTERVAL   = 7.0;   // slow giant meteor
const METEOR_SPEED_MIN = 120;
const METEOR_SPEED_MAX = 200;

let meteorTimer  = 0;
let speederTimer = 0;
let giantTimer   = 0;

function spawnMeteor() {
  const size    = METEOR_SIZES[Math.floor(Math.random() * METEOR_SIZES.length)];
  const speedMult = (1 + (state.level - 1) * 0.18);
  state.meteors.push({
    type:     'normal',
    x:        Math.random() * (CANVAS_W - 40) + 20,
    y:        -20,
    rx:       size.rx,
    ry:       size.ry,
    r:        size.r,
    vy:       (METEOR_SPEED_MIN + Math.random() * (METEOR_SPEED_MAX - METEOR_SPEED_MIN)) * speedMult,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 1.5,
    sportType: Math.floor(Math.random() * 6),
  });
}

function spawnSpeeder() {
  const speedMult = (1 + (state.level - 1) * 0.18);
  state.meteors.push({
    type:     'speeder',
    x:        Math.random() * (CANVAS_W - 40) + 20,
    y:        -20,
    rx:       7, ry: 5, r: 7,     // small hitbox
    vy:       (320 + Math.random() * 100) * speedMult,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 4.0,   // spins fast
    sportType: Math.floor(Math.random() * 6),
  });
}

function spawnGiant() {
  const speedMult = (1 + (state.level - 1) * 0.18);
  state.meteors.push({
    type:     'giant',
    x:        Math.random() * (CANVAS_W - 80) + 40,
    y:        -50,
    rx:       38, ry: 28, r: 36,  // big hitbox
    vy:       (65 + Math.random() * 40) * speedMult,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.4,   // rotates slowly
    sportType: Math.floor(Math.random() * 6),
  });
}

// ── Shield power-up config ─────────────────────
const SHIELD_SPAWN_INTERVAL = 9.0;  // avg seconds between shield orbs
const SHIELD_SPEED  = 70;
const SHIELD_RADIUS = 16;
let shieldTimer = 0;

function spawnShield() {
  state.powerups.push({
    type: 'shield',
    x: Math.random() * (CANVAS_W - 60) + 30,
    y: -20,
    r: SHIELD_RADIUS,
  });
}

// ── Magnet power-up config ─────────────────────
const MAGNET_SPAWN_INTERVAL = 13.0;
const MAGNET_SPEED    = 65;
const MAGNET_RADIUS   = 16;
const MAGNET_DURATION = 8.0;
const MAGNET_PULL     = 260;   // px/s² pull strength toward rocket
let magnetSpawnTimer = 0;

function spawnMagnet() {
  state.powerups.push({
    type: 'magnet',
    x: Math.random() * (CANVAS_W - 60) + 30,
    y: -20,
    r: MAGNET_RADIUS,
  });
}

// ── Speed boost power-up config ───────────────────
const BOOST_SPAWN_INTERVAL = 18.0;  // rare: ~18s base, gets rarer each zone
const BOOST_SPEED    = 60;
const BOOST_RADIUS   = 17;
const BOOST_DURATION = 6.0;   // seconds of boosted speed
const BOOST_MULT     = 5.0;   // 400% speed increase while active
let boostSpawnTimer  = 0;

function spawnBoost() {
  state.powerups.push({
    type: 'boost',
    x: Math.random() * (CANVAS_W - 60) + 30,
    y: -20,
    r: BOOST_RADIUS,
  });
}

// ── Coin pickup config ────────────────────────────
const COIN_PICKUP_INTERVAL   = 38;    // regular coin roughly once per long run
const TREASURE_COIN_INTERVAL = 75;    // treasure coin very rare
const COIN_MULT_INTERVAL     = 110;   // ×2 multiplier — once in a blue moon
const COIN_PICKUP_SPEED      = 72;
const COIN_PICKUP_RADIUS     = 12;
const TREASURE_COIN_RADIUS   = 17;
const COIN_MULT_RADIUS       = 18;
const COIN_MULT_DURATION     = 10;    // seconds the ×2 lasts
let coinPickupTimer    = 0;
let treasureCoinTimer  = 0;
let coinMultSpawnTimer = 0;

function spawnCoinPickup(type = 'coin') {
  state.coinPickups.push({
    x:     Math.random() * (CANVAS_W - 60) + 30,
    y:     -20,
    r:     type === 'treasure' ? TREASURE_COIN_RADIUS : COIN_PICKUP_RADIUS,
    type,
    value: type === 'treasure' ? 5 : 1,
    spin:  Math.random() * Math.PI * 2,
  });
}

// ── Rage mode explosion particles ───────────────
function spawnExplosion(x, y, r) {
  if (!state.explosions) state.explosions = [];
  const count = 8 + Math.floor(r * 0.4);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 60 + Math.random() * 120;
    state.explosions.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.6 + Math.random() * 0.4,
      r:  2 + Math.random() * 3,
      hue: 20 + Math.floor(Math.random() * 40),  // orange-red
    });
  }
}

function tickExplosions(delta) {
  if (!state.explosions) return;
  for (let i = state.explosions.length - 1; i >= 0; i--) {
    const p = state.explosions[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.vy += 60 * delta; // slight gravity
    p.life -= delta;
    if (p.life <= 0) state.explosions.splice(i, 1);
  }
}

function drawExplosions() {
  if (!state.explosions || state.explosions.length === 0) return;
  for (const p of state.explosions) {
    const alpha = (p.life / p.maxLife);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha})`;
    ctx.fill();
  }
}

// ── Collectible star config ─────────────────────
const STAR_SPAWN_INTERVAL = 2.2;
const STAR_SPEED   = 80;
const STAR_RADIUS  = 14;
let starTimer = 0;

function spawnCollectibleStar() {
  state.stars.push({
    x: Math.random() * (CANVAS_W - 60) + 30,
    y: -20,
    r: STAR_RADIUS,
  });
}

// Register wheel-exclusive cosmetics into arrays
registerLuckyCosmetics();

// ── Game loop ─────────────────────────────────
let lastTime = 0;

function loop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  gameTime += delta;  // always ticking for start-screen animations

  update(delta);
  draw();

  requestAnimationFrame(loop);
}

function update(delta) {
  if (state.screen === 'auth') return;

  // Splash screen — auto-advance to main menu after 5 s
  if (state.screen === 'splash') {
    state.splashTimer -= delta;
    if (state.splashTimer <= 0) {
      // If logged in via auth, skip the profile picker
      state.screen = state.authUser ? 'start' : 'profile';
    }
    return;
  }

  // Wheel spin animation
  if (state.screen === 'wheel') updateWheel(delta);

  // Tick daily bonus popup countdown on start screen
  if (state.dailyBonus && state.dailyBonus.life > 0) state.dailyBonus.life -= delta;
  if (state.eggFlash > 0) state.eggFlash -= delta;
  if (state.secretFlash.life > 0) state.secretFlash.life -= delta;
  // Tick achievement popup
  if (state.achPopupLife > 0) { state.achPopupLife -= delta; if (state.achPopupLife <= 0) { state.newAchievements.shift(); state.achPopupLife = 0; } }

  // Advance launch animation, then kick off the real game
  if (state.screen === 'launching') {
    launchAnim.t += delta;
    if (launchAnim.t >= LAUNCH_DURATION) startGame();
    return;
  }

  // Only run gameplay logic while the game is active
  if (state.screen !== 'playing') return;

  state.elapsedTime += delta;   // tick the trip timer

  const rocket = state.rocket;

  // Zone speed multiplier: zone 1=1.0, zone 2=1.2, zone 3=1.4, zone 4=1.65
  const zoneMult  = 1 + (state.backgroundZone - 1) * 0.22;
  const boostMult = state.boostTimer > 0 ? BOOST_MULT : 1.0;
  const accel     = ROCKET_ACCEL * zoneMult * boostMult;
  const maxSpeed  = ROCKET_MAX   * zoneMult * boostMult;

  // Apply left/right acceleration from held keys or on-screen arrow buttons
  if (keys['ArrowLeft']  || arrowTouch.left)  rocket.vx -= accel * delta;
  if (keys['ArrowRight'] || arrowTouch.right) rocket.vx += accel * delta;

  // Clamp to max speed
  rocket.vx = Math.max(-maxSpeed, Math.min(maxSpeed, rocket.vx));

  // Decay velocity when no input is active
  const anyInput = keys['ArrowLeft'] || keys['ArrowRight'] || arrowTouch.left || arrowTouch.right;
  if (!anyInput) rocket.vx *= Math.pow(ROCKET_DECAY, delta);

  // Tick hit invincibility timer
  if (rocket.hitTimer  > 0) rocket.hitTimer  -= delta;
  if (state.shakeTimer > 0) state.shakeTimer -= delta;
  if (state.hitFlash   > 0) state.hitFlash   = Math.max(0, state.hitFlash - delta * 2);

  // Tick rage mode timer
  if (state.rageMode) {
    state.rageTimer -= delta;
    if (state.rageTimer <= 0) { state.rageMode = false; state.rageTimer = 0; }
  }

  // Reset consecutive-hit streak if 4 seconds pass without being hit
  if (state.consecutiveHits > 0 && !state.rageMode) {
    state.timeSinceHit = (state.timeSinceHit || 0) + delta;
    if (state.timeSinceHit > 4) { state.consecutiveHits = 0; state.timeSinceHit = 0; }
  } else {
    state.timeSinceHit = 0;
  }

  // Spawn meteors on a timer
  meteorTimer += delta;
  if (meteorTimer >= METEOR_SPAWN_INTERVAL) {
    meteorTimer = 0;
    spawnMeteor();
  }

  // Spawn fast small meteors (zone 2+)
  if (state.backgroundZone >= 2) {
    speederTimer += delta;
    if (speederTimer >= SPEEDER_SPAWN_INTERVAL) {
      speederTimer = -(Math.random() * 1.5);
      spawnSpeeder();
    }
  }

  // Spawn slow giant meteors (zone 3+)
  if (state.backgroundZone >= 3) {
    giantTimer += delta;
    if (giantTimer >= GIANT_SPAWN_INTERVAL) {
      giantTimer = -(Math.random() * 3);
      spawnGiant();
    }
  }

  // Move meteors, rotate, remove off-screen, check collision
  const ROCKET_RADIUS = 22;
  for (let i = state.meteors.length - 1; i >= 0; i--) {
    const m = state.meteors[i];
    m.y        += m.vy * delta;
    m.rotation += m.rotSpeed * delta;

    if (m.y > CANVAS_H + 30) { state.meteors.splice(i, 1); continue; }

    if (rocket.hitTimer <= 0) {
      const dx   = rocket.x - m.x;
      const dy   = rocket.y - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitZone = ROCKET_RADIUS + m.r;
      if (dist < hitZone) {
        if (state.shield) {
          state.shield = false;
          rocket.hitTimer  = 0.8;
          state.shakeTimer = 0.15;
          state.hitFlash   = 0.18;
          sfxShieldBreak();
          state.meteors.splice(i, 1);
          continue;
        }
        // 💥 RAGE MODE: meteor explodes instead of hurting
        if (state.rageMode) {
          spawnExplosion(m.x, m.y, m.r);
          state.meteors.splice(i, 1);
          continue;
        }
        // 3rd consecutive hit → RAGE MODE saves you instead of dying
        state.consecutiveHits++;
        state.timeSinceHit = 0;
        if (state.consecutiveHits >= 3 && !state.rageMode) {
          state.consecutiveHits = 0;
          state.rageMode  = true;
          state.rageTimer = 10;
          rocket.hitTimer  = 1.5;
          state.shakeTimer = 0.5;
          state.hitFlash   = 0.6;
          sfxHit();
          state.meteors.splice(i, 1);
          state.secretFlash = { life: 3.5, msg: '🔥  RAGE MODE  🔥', sub: 'Meteors explode for 10 seconds!' };
          continue; // no life lost — rage saves you
        }
        state.lives -= 1;
        rocket.hitTimer  = 1.5;
        state.shakeTimer = 0.35;
        state.hitFlash   = 0.45;
        state.noHitTimer = 0;
        state.streakMilestones = [];
        state.zoneHits++;
        sfxHit();
        state.meteors.splice(i, 1);
        if (state.lives <= 0) {
          state.leaderboard = loadLeaderboard();
          updateStatsAfterRun(false);
          updateDailyChallengeAfterRun();
          checkAchievements();
          saveCurrentProfileData();
          state.firstRunBonus = false;
          state.screen = 'gameover';
        }
      } else if (!m.closeCalled && dist < hitZone + 14) {
        // Close call — near miss!
        m.closeCalled = true;
        state.runCloseCallCount++;
        const earned = 1 * getCoinMult();
        state.coins += earned;
        saveCoins(state.coins);
        state.scorePopups.push({ x: rocket.x, y: rocket.y - 28, life: 1.2,
          text: `CLOSE! +${earned}\u{1FA99}`, coin: true });
      }
    }
  }

  // Spawn shield power-ups
  // zone 1=1×, zone 2=1.5×, zone 3=2.2×, zone 4=3.2× longer between spawns
  const powerupInterval = [1, 1.5, 2.2, 3.2][state.backgroundZone - 1] || 3.2;

  shieldTimer += delta;
  if (shieldTimer >= SHIELD_SPAWN_INTERVAL * powerupInterval) {
    shieldTimer = -(Math.random() * 4 * powerupInterval);
    spawnShield();
  }

  // Spawn magnet power-ups
  magnetSpawnTimer += delta;
  if (magnetSpawnTimer >= MAGNET_SPAWN_INTERVAL * powerupInterval) {
    magnetSpawnTimer = -(Math.random() * 5 * powerupInterval);
    spawnMagnet();
  }

  // Spawn speed boost (super rare — extra multiplier on top of powerupInterval)
  boostSpawnTimer += delta;
  if (boostSpawnTimer >= BOOST_SPAWN_INTERVAL * powerupInterval) {
    boostSpawnTimer = -(Math.random() * 5 * powerupInterval);
    spawnBoost();
  }

  // Move power-up orbs, check pickup
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const p = state.powerups[i];
    const spd = p.type === 'magnet' ? MAGNET_SPEED
              : p.type === 'boost'  ? BOOST_SPEED
              : SHIELD_SPEED;
    p.y += spd * delta;
    if (p.y > CANVAS_H + 20) { state.powerups.splice(i, 1); continue; }
    const dx = rocket.x - p.x;
    const dy = rocket.y - p.y;
    if (Math.sqrt(dx * dx + dy * dy) < 24 + p.r) {
      if (p.type === 'shield')      state.shield = true;
      else if (p.type === 'magnet') state.magnetTimer = MAGNET_DURATION;
      else if (p.type === 'boost')  { state.boostTimer = BOOST_DURATION; state.boostFlash = 0.6; sfxBoost(); state.powerups.splice(i, 1); continue; }
      else if (p.type === 'coinmult') { state.coinMultiplier = 2; state.coinMultiplierTimer = COIN_MULT_DURATION; }
      sfxPowerupCollect();
      state.powerups.splice(i, 1);
    }
  }

  // Tick boost timer and flash
  if (state.boostTimer > 0) state.boostTimer -= delta;
  if (state.boostFlash  > 0) state.boostFlash = Math.max(0, state.boostFlash - delta * 2.5);

  // Tick rage-mode explosion particles
  tickExplosions(delta);

  // Magnet: pull collectible stars toward rocket
  if (state.magnetTimer > 0) {
    state.magnetTimer -= delta;
    for (const s of state.stars) {
      const dx = rocket.x - s.x;
      const dy = rocket.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      s.x += (dx / dist) * MAGNET_PULL * delta;
      s.y += (dy / dist) * MAGNET_PULL * delta;
    }
  }

  // Spawn collectible stars
  starTimer += delta;
  if (starTimer >= STAR_SPAWN_INTERVAL) {
    starTimer = 0;
    spawnCollectibleStar();
  }

  // ── Coin pickup spawning ──────────────────────────
  coinPickupTimer += delta;
  if (coinPickupTimer >= COIN_PICKUP_INTERVAL) { coinPickupTimer = 0; spawnCoinPickup('coin'); }
  treasureCoinTimer += delta;
  if (treasureCoinTimer >= TREASURE_COIN_INTERVAL) { treasureCoinTimer = 0; spawnCoinPickup('treasure'); }
  coinMultSpawnTimer += delta;
  if (coinMultSpawnTimer >= COIN_MULT_INTERVAL) {
    coinMultSpawnTimer = 0;
    state.powerups.push({ type:'coinmult', x: Math.random()*(CANVAS_W-60)+30, y:-20, r:COIN_MULT_RADIUS });
  }

  // ── Coin multiplier tick ──────────────────────────
  if (state.coinMultiplier > 1) {
    state.coinMultiplierTimer -= delta;
    if (state.coinMultiplierTimer <= 0) { state.coinMultiplier = 1; state.coinMultiplierTimer = 0; }
  }

  // ── Dodge streak milestones ───────────────────────
  state.noHitTimer += delta;
  const STREAK_LEVELS = [{t:10,c:1,msg:'10s DODGE!'},{t:25,c:2,msg:'25s STREAK!'},{t:45,c:3,msg:'FLAWLESS!'}];
  for (const sl of STREAK_LEVELS) {
    if (state.noHitTimer >= sl.t && !state.streakMilestones.includes(sl.t)) {
      state.streakMilestones.push(sl.t);
      const earned = sl.c * getCoinMult();
      state.coins += earned; saveCoins(state.coins);
      state.scorePopups.push({ x: CANVAS_W/2, y: CANVAS_H*0.32, life: 1.8,
        text: `${sl.msg} +${earned}\u{1FA99}`, coin: true });
    }
  }

  // ── Move coin pickups, check collection ───────────
  for (let i = state.coinPickups.length - 1; i >= 0; i--) {
    const c = state.coinPickups[i];
    c.y   += COIN_PICKUP_SPEED * (1 + (state.level - 1) * 0.18) * delta;
    c.spin += delta * 2.8;
    if (c.y > CANVAS_H + 30) { state.coinPickups.splice(i, 1); continue; }
    const dx = rocket.x - c.x, dy = rocket.y - c.y;
    if (Math.sqrt(dx*dx + dy*dy) < 26 + c.r) {
      const earned = c.value * getCoinMult();
      state.coins += earned;
      saveCoins(state.coins);
      state.scorePopups.push({ x: c.x, y: c.y, life: 1.0, text: `+${earned}\u{1FA99}`, coin: true });
      state.coinPickups.splice(i, 1);
    }
  }

  // Move collectible stars, check collection
  const COLLECT_RADIUS = 22;
  for (let i = state.stars.length - 1; i >= 0; i--) {
    const s = state.stars[i];
    s.y += STAR_SPEED * (1 + (state.level - 1) * 0.18) * delta;

    if (s.y > CANVAS_H + 20) { state.stars.splice(i, 1); continue; }

    const dx = rocket.x - s.x;
    const dy = rocket.y - s.y;
    if (Math.sqrt(dx * dx + dy * dy) < COLLECT_RADIUS + s.r) {
      state.score += 50;
      state.runStarCount++;
      sfxStarCollect();
      state.scorePopups.push({ x: s.x, y: s.y, life: 1.0 });
      state.stars.splice(i, 1);
    }
  }

  // Tick score popups (float up, fade out over 1 second)
  for (let i = state.scorePopups.length - 1; i >= 0; i--) {
    const p = state.scorePopups[i];
    p.life -= delta;
    p.y    -= 60 * delta;
    if (p.life <= 0) state.scorePopups.splice(i, 1);
  }

  // Background zone: advance when score crosses a threshold
  const newZone = 1 + ZONE_THRESHOLDS.slice(1).filter(t => state.score >= t).length;
  if (newZone !== state.backgroundZone) {
    // ── Zone-completion skill bonuses ─────────────────
    const timeInZone = gameTime - state.zoneEntryTime;
    const ZONE_SPEED_TARGETS = [38, 52, 68]; // target seconds per zone
    const speedTarget = ZONE_SPEED_TARGETS[state.backgroundZone - 1];
    const popY = CANVAS_H * 0.38;
    if (state.zoneHits === 0) {
      const earned = 3 * state.coinMultiplier;
      state.coins += earned; saveCoins(state.coins);
      state.scorePopups.push({ x: CANVAS_W/2, y: popY, life: 2.2,
        text: `PERFECT ZONE! +${earned}\u{1FA99}`, coin: true });
    }
    if (speedTarget && timeInZone < speedTarget) {
      const earned = 2 * state.coinMultiplier;
      state.coins += earned; saveCoins(state.coins);
      state.scorePopups.push({ x: CANVAS_W/2, y: popY + 26, life: 2.2,
        text: `SPEED RUN! +${earned}\u{1FA99}`, coin: true });
    }
    if (state.zoneHits === 0) state.clearedZoneNoHit = true; // for daily challenge
    state.zoneEntryTime = gameTime;
    state.zoneHits = 0;
    // ─────────────────────────────────────────────────
    state.backgroundZone = newZone;
    const label = ZONE_LABELS[newZone - 1] || '';
    if (label) { state.zoneAnnounce.text = label; state.zoneAnnounce.life = 2.5; }
  }
  if (state.zoneAnnounce.life > 0) state.zoneAnnounce.life -= delta;

  // Level progression: every 500 points
  const newLevel = 1 + Math.floor(state.score / 500);
  if (newLevel !== state.level) {
    state.level = newLevel;
    state.levelAnnounce.life = 2.0;
  }
  if (state.levelAnnounce.life > 0) state.levelAnnounce.life -= delta;

  // Win condition
  if (state.score >= WIN_SCORE && state.screen === 'playing') {
    if (timeQualifies(state.elapsedTime)) {
      // New record — ask for their name first
      state.pendingTime = state.elapsedTime;
      state.screen = 'nameentry';
      showNameInput();
    } else {
      // Didn't place locally — still submit to global leaderboard
      const gName = (state.authUser && !state.authUser.isGuest)
        ? state.authUser.username : 'PILOT';
      submitGlobalScore(gName, state.elapsedTime);
      state.leaderboard = loadLeaderboard();
      state.coinsEarned = 0;
      state.screen = 'win';
    }
  }

  // Scroll background stars downward (parallax) — boosted during speed boost
  const scrollMult = (1 + (state.backgroundZone - 1) * 0.22) * boostMult;
  for (const s of starsFar)  { s.y += SCROLL_SPEED * 0.3 * scrollMult * delta; if (s.y > CANVAS_H) { s.y = 0; s.x = Math.random() * CANVAS_W; } }
  for (const s of starsNear) { s.y += SCROLL_SPEED * 0.6 * scrollMult * delta; if (s.y > CANVAS_H) { s.y = 0; s.x = Math.random() * CANVAS_W; } }

  // Move rocket
  rocket.x += rocket.vx * delta;
  rocket.x = Math.max(ROCKET_PAD, Math.min(CANVAS_W - ROCKET_PAD, rocket.x));
  if (rocket.x <= ROCKET_PAD || rocket.x >= CANVAS_W - ROCKET_PAD) rocket.vx = 0;
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  if (state.screen === 'auth') {
    drawAuthScreen();
    return;
  }

  if (state.screen === 'splash') {
    drawSplashScreen();
    return;
  }

  if (state.screen === 'profile') {
    drawProfileScreen();
    return;
  }

  if (state.screen === 'start') {
    drawStartScreen();
    if (state.signinPrompt) drawSignInPrompt();
    if (state.ghostTimeVisible) drawGhostTimePopup();
    if (state.eggFlash > 0) drawEggFlash();
    if (state.secretFlash.life > 0) drawSecretFlash();
    return;
  }

  if (state.screen === 'wheel') {
    drawWheelScreen();
    return;
  }

  if (state.screen === 'settings') {
    drawSettingsScreen();
    return;
  }

  if (state.screen === 'leaderboard') {
    drawLeaderboardScreen();
    return;
  }

  if (state.screen === 'tutorial') {
    drawTutorialScreen();
    return;
  }

  if (state.screen === 'shop') {
    drawShopScreen();
    return;
  }

  if (state.screen === 'launching') {
    drawLaunchAnim();
    return;
  }

  if (state.screen === 'nameentry') {
    drawNameEntryScreen();
    return;
  }

  if (state.screen === 'win') {
    drawWinScreen();
    return;
  }

  // ── Screen shake ─────────────────────────────
  const shakeAmt = state.shakeTimer > 0 ? 6 * (state.shakeTimer / 0.35) : 0;
  const shakeX   = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt * 2 : 0;
  const shakeY   = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt * 2 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // ── Space gradient background (zone-tinted, skipped for custom BGs) ──
  const packBgActive = PACKS.some(p => state.equippedBg === p.id + '_bg');
  if ((!state.equippedBg || state.equippedBg === 'classic') && !packBgActive) {
    const zc = getZoneBgColors();
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bg.addColorStop(0,   `rgb(${zc.t})`);
    bg.addColorStop(0.4, `rgb(${zc.m})`);
    bg.addColorStop(1,   `rgb(${zc.b})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── Background effect (cosmetic) ───────────────
  drawEquippedBg();

  // ── Far stars ────────────────────────────────
  if (state.equippedBg !== 'void' && !packBgActive) {
    for (const s of starsFar) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 255, ${s.alpha})`;
      ctx.fill();
    }

    // ── Near stars ───────────────────────────────
    for (const s of starsNear) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fill();
    }
  }

  // ── Speed lines (level 3+ or magnet active) ──
  drawSpeedLines();

  // ── Power-up orbs ─────────────────────────────
  for (const p of state.powerups) {
    if (p.type === 'shield')        drawShieldOrb(p);
    else if (p.type === 'magnet')   drawMagnetOrb(p);
    else if (p.type === 'boost')    drawBoostOrb(p);
    else if (p.type === 'coinmult') drawCoinMultOrb(p);
  }

  // ── Coin pickups ──────────────────────────────
  for (const c of state.coinPickups) drawCoinPickup(c);

  // ── Collectible stars ─────────────────────────
  for (const s of state.stars) drawCollectibleStar(s);

  // ── Meteors ───────────────────────────────────
  for (const m of state.meteors) drawMeteor(m);

  // ── Rage-mode explosion particles ─────────────
  drawExplosions();

  // ── Score popups ──────────────────────────────
  for (const p of state.scorePopups) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.coin ? '#ffd700' : '#fff5a0';
    ctx.font        = `bold ${p.coin ? 16 : 18}px monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText(p.text || '+50', p.x, p.y);
    ctx.globalAlpha = 1;
  }

  // ── Active power-up auras on rocket ──────────
  if (state.boostTimer  > 0) drawBoostAura(state.rocket.x, state.rocket.y);
  if (state.magnetTimer > 0) drawMagnetAura(state.rocket.x, state.rocket.y);
  if (state.shield)          drawShieldBubble(state.rocket.x, state.rocket.y);
  if (state.coinMultiplier > 1) drawCoinMultHUD();
  if (state.firstRunBonus)     drawFirstRunHUD();

  // ── Rocket (blinks when invincible) ──────────
  const showRocket = state.rocket.hitTimer <= 0 ||
                     Math.floor(state.rocket.hitTimer / 0.15) % 2 === 0;
  if (showRocket) {
    if (state.rageMode) {
      // Red composite tint over the rocket
      ctx.save();
      drawRocket(state.rocket.x, state.rocket.y);
      ctx.globalCompositeOperation = 'source-atop';
      // Pulsing red glow
      const pulse = 0.45 + 0.25 * Math.sin(gameTime * 12);
      ctx.fillStyle = `rgba(255, 30, 0, ${pulse})`;
      ctx.beginPath();
      ctx.arc(state.rocket.x, state.rocket.y, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      drawRocket(state.rocket.x, state.rocket.y);
    }
  }

  // ── End screen shake transform ───────────────
  ctx.restore();

  // ── Zone announce banner ──────────────────────
  if (state.zoneAnnounce.life  > 0) drawZoneBanner();
  if (state.levelAnnounce.life > 0) drawLevelBanner();

  // ── Red hit flash overlay ─────────────────────
  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(220, 30, 30, ${state.hitFlash * 0.55})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── Golden boost pickup flash ──────────────────
  if (state.boostFlash > 0) {
    ctx.fillStyle = `rgba(255, 200, 0, ${state.boostFlash * 0.38})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── HUD (always on top) ───────────────────────
  drawHUD();
  drawArrowButtons();
  if (state.rageMode) drawRageBar();

  // ── Altitude progress bar (right edge) ────────
  drawAltitudeBar();

  // ── Discrete exit button (bottom-left) ────────
  drawExitBtn();

  // ── Game over overlay ─────────────────────────
  if (state.screen === 'gameover') drawGameOverScreen();
}


function drawNameEntryScreen() {
  // Deep space background
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, 'rgb(2,0,8)'); bg.addColorStop(1, 'rgb(10,4,28)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const s of starsFar) {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(200,210,255,${s.alpha})`; ctx.fill();
  }

  // Position on leaderboard
  const board = loadLeaderboard();
  const pos   = board.length < 5 || state.pendingTime < board[board.length-1].time
    ? Math.min(board.filter(e => e.time <= state.pendingTime).length + 1, 5)
    : 5;
  const posLabels = ['1ST','2ND','3RD','4TH','5TH'];
  const posColors = ['#ffd700','#e8e8e8','#cd7f32','#aac8ff','#aac8ff'];
  const posLabel  = posLabels[pos-1] || '5TH';
  const posColor  = posColors[pos-1] || '#aac8ff';

  // Trophy / medal
  ctx.font = '64px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pos === 1 ? '🏆' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅', CANVAS_W/2, 140);

  // Title
  ctx.fillStyle = posColor;
  ctx.font = 'bold 32px monospace';
  ctx.fillText(`${posLabel} PLACE!`, CANVAS_W/2, 210);

  // Time
  ctx.fillStyle = '#ddc0ff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`⏱ ${formatTime(state.pendingTime)}`, CANVAS_W/2, 260);

  // Panel
  ctx.fillStyle = 'rgba(0,0,30,0.85)';
  ctx.beginPath(); ctx.roundRect(CANVAS_W/2-150, 300, 300, 180, 20); ctx.fill();
  ctx.strokeStyle = `rgba(${pos===1?'255,200,0':pos===2?'200,200,200':pos===3?'180,100,40':'120,140,255'},0.6)`;
  ctx.lineWidth = 2; ctx.stroke();

  // "Enter your name" label
  ctx.fillStyle = '#aac8ff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('ENTER YOUR NAME', CANVAS_W/2, 336);

  // Name input box placeholder (the actual input is an HTML element)
  ctx.fillStyle = 'rgba(255,200,60,0.08)';
  ctx.beginPath(); ctx.roundRect(CANVAS_W/2-110, 352, 220, 50, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,60,0.4)'; ctx.lineWidth=1.5; ctx.stroke();

  // Note below input
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px monospace';
  ctx.fillText('max 8 characters', CANVAS_W/2, 422);

  // Submit button
  drawMenuButton(NAME_SUBMIT_BTN, 'CONFIRM  ✓', '#1a4a1a', '#28882a', '#88ffaa');
  ctx.textBaseline = 'alphabetic';
}

// ── Win / Arrival screen ──────────────────────
function drawWinScreen() {
  // Deep space background
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0,   'rgb(8, 2, 0)');
  bg.addColorStop(0.4, 'rgb(20, 6, 2)');
  bg.addColorStop(1,   'rgb(40, 10, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Background parallax stars
  for (const s of starsFar)  {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,210,255,${s.alpha})`; ctx.fill();
  }

  // ── Jupiter (large, upper half) ───────────────
  const jx = CANVAS_W / 2;
  const jy = 260;
  const jr = 175;

  // Outer glow
  const jGlow = ctx.createRadialGradient(jx, jy, jr * 0.7, jx, jy, jr * 1.6);
  jGlow.addColorStop(0,   'rgba(255, 140, 40, 0.3)');
  jGlow.addColorStop(0.5, 'rgba(200, 80, 20, 0.12)');
  jGlow.addColorStop(1,   'rgba(180, 60, 0, 0)');
  ctx.beginPath();
  ctx.arc(jx, jy, jr * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = jGlow;
  ctx.fill();

  // Jupiter sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(jx, jy, jr, 0, Math.PI * 2);
  ctx.clip();

  // Base colour
  const jBase = ctx.createRadialGradient(jx - jr * 0.3, jy - jr * 0.3, jr * 0.1, jx, jy, jr);
  jBase.addColorStop(0,   '#f0c090');
  jBase.addColorStop(0.4, '#d4884a');
  jBase.addColorStop(0.7, '#c06030');
  jBase.addColorStop(1,   '#7a3010');
  ctx.fillStyle = jBase;
  ctx.fillRect(jx - jr, jy - jr, jr * 2, jr * 2);

  // Cloud bands
  const bands = [
    { y: -0.55, h: 0.10, c: 'rgba(240,200,150,0.55)' },
    { y: -0.30, h: 0.14, c: 'rgba(160, 80, 30, 0.5)' },
    { y: -0.05, h: 0.18, c: 'rgba(230,170,100,0.5)' },
    { y:  0.20, h: 0.10, c: 'rgba(140, 60, 20, 0.45)' },
    { y:  0.45, h: 0.16, c: 'rgba(200,130, 70, 0.4)' },
  ];
  for (const b of bands) {
    const scroll = gameTime * 14;  // slowly drift bands
    ctx.fillStyle = b.c;
    ctx.fillRect(jx - jr + (scroll % 20) - 20, jy + b.y * jr, jr * 2 + 40, b.h * jr);
  }

  // Great Red Spot
  ctx.save();
  ctx.translate(jx + jr * 0.25 + Math.sin(gameTime * 0.4) * jr * 0.05, jy + jr * 0.12);
  ctx.scale(1.7, 1);
  const spot = ctx.createRadialGradient(0, 0, 0, 0, 0, jr * 0.18);
  spot.addColorStop(0,   'rgba(180, 40, 10, 0.85)');
  spot.addColorStop(0.6, 'rgba(200, 70, 20, 0.5)');
  spot.addColorStop(1,   'rgba(200, 80, 30, 0)');
  ctx.beginPath();
  ctx.arc(0, 0, jr * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = spot;
  ctx.fill();
  ctx.restore();

  // Limb darkening
  const limb = ctx.createRadialGradient(jx, jy, jr * 0.5, jx, jy, jr);
  limb.addColorStop(0,   'rgba(0,0,0,0)');
  limb.addColorStop(0.8, 'rgba(0,0,0,0.1)');
  limb.addColorStop(1,   'rgba(0,0,0,0.55)');
  ctx.fillStyle = limb;
  ctx.fillRect(jx - jr, jy - jr, jr * 2, jr * 2);

  ctx.restore();  // end clip

  // ── Rocket arriving (coming up from bottom) ───
  const rArriveT = Math.min(gameTime * 0.35, 1);  // 0→1 over ~3s
  const rY = CANVAS_H - 50 - rArriveT * (CANVAS_H - 50 - (jy + jr + 30));
  drawRocket(CANVAS_W / 2, rY);

  // ── Confetti particles (time-driven, no array) ─
  for (let i = 0; i < 28; i++) {
    const t  = (gameTime * 1.1 + i * 0.37) % 3.5;
    const cx = (i * 53 + 40) % (CANVAS_W - 40) + 20;
    const cy = t * 280 + 20;
    const alpha = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 2.5) / 1.0);
    if (alpha <= 0) continue;
    const colors = ['#ff6b35','#ffe066','#88ffaa','#7ed6c8','#ff88cc','#aabbff'];
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle   = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(cx + Math.sin(gameTime * 2.5 + i) * 14, cy, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Victory panel ────────────────────────────
  const panelY = jy + jr + 20;
  ctx.fillStyle = 'rgba(4, 0, 0, 0.82)';
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 155, panelY, 310, 175, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 160, 60, 0.7)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Title
  ctx.fillStyle    = '#ffd060';
  ctx.font         = 'bold 30px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JUPITER REACHED!', CANVAS_W / 2, panelY + 32);

  // Trip time (big)
  const isNewRecord = state.leaderboard[0]?.time === state.elapsedTime;
  ctx.fillStyle = isNewRecord ? '#ffdd44' : '#ddc0ff';
  ctx.font      = 'bold 28px monospace';
  ctx.fillText(`⏱ ${formatTime(state.elapsedTime)}`, CANVAS_W / 2, panelY + 68);
  if (isNewRecord) {
    ctx.fillStyle = '#ffdd44';
    ctx.font      = 'bold 11px monospace';
    ctx.fillText('★ NEW RECORD! ★', CANVAS_W / 2, panelY + 90);
  } else {
    ctx.fillStyle = '#888899';
    ctx.font      = '11px monospace';
    ctx.fillText(`BEST  ${formatTime(state.leaderboard[0]?.time || 0)}`, CANVAS_W / 2, panelY + 90);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font      = '12px monospace';
  ctx.fillText(`SCORE  ${state.score}`, CANVAS_W / 2, panelY + 112);

  // Coins earned this run
  if (state.coinsEarned > 0) {
    const medalLabels = ['1ST','2ND','3RD','4TH','5TH'];
    const pos = state.leaderboard.indexOf(state.elapsedTime);
    const posLabel = pos >= 0 ? medalLabels[pos] : '';
    ctx.fillStyle    = '#ffd700';
    ctx.font         = 'bold 15px monospace';
    ctx.fillText(`🪙 +${state.coinsEarned} coins  ${posLabel ? '(' + posLabel + ' PLACE)' : ''}`, CANVAS_W / 2, panelY + 136);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.font      = '12px monospace';
    ctx.fillText(`total: ${state.coins} 🪙`, CANVAS_W / 2, panelY + 155);
  }

  ctx.textBaseline = 'alphabetic';

  // ── Buttons ───────────────────────────────────
  drawMenuButton(WIN_PLAY_BTN, 'PLAY AGAIN', '#1a6b20', '#28a030', '#88ffaa');
  drawMenuButton(WIN_MENU_BTN, 'MAIN MENU',  '#1a2a8a', '#2840c0', '#88aaff');
}

// ── Game over overlay ─────────────────────────
// Drawn on top of the frozen space scene
function drawGameOverScreen() {
  // Dark vignette overlay
  ctx.fillStyle = 'rgba(0, 0, 10, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel background
  const panelY = 100;
  const panelH = 430;
  ctx.fillStyle = 'rgba(0, 0, 30, 0.88)';
  ctx.beginPath();
  ctx.roundRect(30, panelY, CANVAS_W - 60, panelH, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // "GAME OVER"
  ctx.fillStyle    = '#ff3a3a';
  ctx.font         = 'bold 44px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', CANVAS_W / 2, panelY + 55);

  // Survived time
  ctx.fillStyle = '#aaaacc';
  ctx.font      = 'bold 13px monospace';
  ctx.fillText('SCORE', CANVAS_W / 2 - 68, panelY + 100);
  ctx.fillText('TIME', CANVAS_W / 2 + 68, panelY + 100);
  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 28px monospace';
  ctx.fillText(state.score, CANVAS_W / 2 - 68, panelY + 132);
  ctx.fillStyle = '#ddc0ff';
  ctx.fillText(formatTime(state.elapsedTime), CANVAS_W / 2 + 68, panelY + 132);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(55, panelY + 158); ctx.lineTo(CANVAS_W - 55, panelY + 158);
  ctx.stroke();

  // Fastest trips leaderboard header
  ctx.fillStyle = '#7a7aaa';
  ctx.font      = 'bold 12px monospace';
  ctx.fillText('FASTEST TRIPS TO JUPITER', CANVAS_W / 2, panelY + 180);

  // Top 5 rows (times, ascending)
  const board   = state.leaderboard;
  const medals  = ['🥇','🥈','🥉','4.','5.'];
  if (board.length === 0) {
    ctx.fillStyle = '#555577';
    ctx.font      = '12px monospace';
    ctx.fillText('Reach Jupiter to set a record!', CANVAS_W / 2, panelY + 210);
  } else {
    for (let i = 0; i < Math.min(board.length, 5); i++) {
      const rowY = panelY + 206 + i * 34;
      ctx.fillStyle = i === 0 ? '#ffd700' : '#ccccee';
      ctx.font      = `bold 14px monospace`;
      const entry = board[i]; const isMe = entry?.time === state.elapsedTime;
      ctx.fillStyle = isMe ? '#ffee88' : (i === 0 ? '#ffd700' : '#ccccee');
      ctx.fillText(`${medals[i]}  ${(entry?.name||'PILOT').padEnd(8)}  ${formatTime(entry?.time||0)}`, CANVAS_W / 2, rowY);
    }
  }

  // ── TRY AGAIN button ──────────────────────────
  drawMenuButton(TRY_AGAIN_BTN, 'TRY AGAIN', '#1a6b20', '#28a030', '#88ffaa');

  // ── MAIN MENU button ──────────────────────────
  drawMenuButton(MAIN_MENU_BTN, 'MAIN MENU', '#1a1a60', '#2828a0', '#8888ff');

  ctx.textBaseline = 'alphabetic';
}

// Reusable pill button for menus
function drawMenuButton(btn, label, colorDark, colorMid, textColor) {
  ctx.beginPath();
  ctx.roundRect(btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h, btn.h / 2);
  const g = ctx.createLinearGradient(btn.x - btn.w / 2, btn.y, btn.x + btn.w / 2, btn.y);
  g.addColorStop(0,   colorDark);
  g.addColorStop(0.5, colorMid);
  g.addColorStop(1,   colorDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.fillStyle    = textColor;
  ctx.font         = 'bold 20px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, btn.x, btn.y);
}

// ══════════════════════════════════════════════════════
//  PRIZE WHEEL
// ══════════════════════════════════════════════════════

// Weight 3 = coin segment, weight 1 = special (smaller slice)
const WHEEL_PRIZES = [
  {type:'coins', amount:1,  label:'1',    color:'#ff6b6b', weight:3},
  {type:'coins', amount:2,  label:'2',    color:'#ff9f43', weight:3},
  {type:'tail',             label:'TAIL', color:'#74c0fc', weight:1},
  {type:'coins', amount:3,  label:'3',    color:'#ffd43b', weight:3},
  {type:'coins', amount:4,  label:'4',    color:'#69db7c', weight:3},
  {type:'rocket',           label:'SHIP', color:'#ff6fd8', weight:1},
  {type:'coins', amount:5,  label:'5',    color:'#38d9a9', weight:3},
  {type:'coins', amount:6,  label:'6',    color:'#4dabf7', weight:3},
  {type:'bg',               label:'BG',   color:'#b197fc', weight:1},
  {type:'coins', amount:7,  label:'7',    color:'#748ffc', weight:3},
  {type:'coins', amount:8,  label:'8',    color:'#da77f2', weight:3},
  {type:'coins', amount:9,  label:'9',    color:'#f783ac', weight:3},
  {type:'coins', amount:10, label:'10',   color:'#ffe066', weight:3},
];

// Pre-compute cumulative angles
(function(){
  const total = WHEEL_PRIZES.reduce((s,p)=>s+p.weight,0);
  let cum = 0;
  for(const p of WHEEL_PRIZES){
    p.startAngle = (cum/total)*Math.PI*2;
    p.deg = (p.weight/total)*Math.PI*2;
    p.midAngle = p.startAngle + p.deg/2;
    cum += p.weight;
  }
})();

function canSpinToday(){
  return state.lastSpinDate !== new Date().toDateString();
}
function markSpinUsed(){
  state.lastSpinDate = new Date().toDateString();
  saveCurrentProfileData();
}
function pickWheelPrize(){
  // weighted random
  const total = WHEEL_PRIZES.reduce((s,p)=>s+p.weight,0);
  let r = Math.random()*total, cum=0;
  for(const p of WHEEL_PRIZES){ cum+=p.weight; if(r<cum) return p; }
  return WHEEL_PRIZES[0];
}
function applyWheelPrize(prize){
  if(prize.type==='coins'){
    state.coins+=prize.amount; saveCoins(state.coins);
  } else if(prize.type==='rocket'){
    if(!state.unlockedRockets.includes('lucky')){
      state.unlockedRockets.push('lucky');
      if(typeof saveUnlockedRockets==='function') saveUnlockedRockets(state.unlockedRockets);
    }
  } else if(prize.type==='tail'){
    if(!state.unlockedTails.includes('lucky')){
      state.unlockedTails.push('lucky');
      if(typeof saveUnlockedTails==='function') saveUnlockedTails(state.unlockedTails);
    }
  } else if(prize.type==='bg'){
    if(!state.unlockedBgs.includes('lucky')){
      state.unlockedBgs.push('lucky');
      if(typeof saveUnlockedBgs==='function') saveUnlockedBgs(state.unlockedBgs);
    }
  }
  saveCurrentProfileData();
}
function startWheelSpin(){
  if(!canSpinToday()||state.wheelSpinning) return;
  const prize = pickWheelPrize();
  state.wheelResult = prize;
  state.wheelShowResult = false;
  // Target: the pointer (top = -π/2) should point at prize.midAngle
  // Rotate wheel so that prize.midAngle ends up at the top
  // We need wheelAngle such that: (prize.midAngle + wheelAngle) % 2π = 3π/2 (top)
  const targetStop = Math.PI*2 - prize.midAngle + Math.PI*1.5;
  // Add several full spins for drama (5–8 rotations)
  const spins = (5 + Math.floor(Math.random()*3)) * Math.PI * 2;
  state.wheelTarget = (state.wheelAngle%(Math.PI*2)) + spins + (targetStop%(Math.PI*2));
  state.wheelVelocity = (state.wheelTarget - state.wheelAngle) * 1.8; // drive hard then ease
  state.wheelSpinning = true;
  markSpinUsed();
}
function updateWheel(dt){
  if(!state.wheelSpinning) return;
  const remaining = state.wheelTarget - state.wheelAngle;
  if(remaining <= 0.02){
    state.wheelAngle = state.wheelTarget;
    state.wheelSpinning = false;
    state.wheelShowResult = true;
    applyWheelPrize(state.wheelResult);
    return;
  }
  // Ease-out: velocity proportional to remaining distance
  const speed = Math.max(0.8, remaining * 2.5);
  state.wheelAngle += speed * dt;
  if(state.wheelAngle >= state.wheelTarget) state.wheelAngle = state.wheelTarget;
}

// ── Prize wheel exclusive cosmetics ─────────────────

// Lucky rocket — gold & rainbow shimmer
function drawRocketLucky(x,y){
  ctx.save();ctx.translate(x,y);
  const bw=28,bh=54,nh=46,bt=-bh/2,bb=bh/2,t=gameTime;
  // Rainbow fins
  ctx.beginPath();ctx.moveTo(-bw/2,bb-14);ctx.lineTo(-bw/2-14,bb+10);ctx.lineTo(-bw/2,bb+4);ctx.closePath();
  ctx.fillStyle=`hsl(${(t*80)%360},100%,60%)`;ctx.fill();
  ctx.beginPath();ctx.moveTo(bw/2,bb-14);ctx.lineTo(bw/2+14,bb+10);ctx.lineTo(bw/2,bb+4);ctx.closePath();
  ctx.fillStyle=`hsl(${(t*80+120)%360},100%,60%)`;ctx.fill();
  // Gold body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#8a6000');bg.addColorStop(0.3,'#ffd700');bg.addColorStop(0.5,'#fff8c0');bg.addColorStop(0.7,'#ffd700');bg.addColorStop(1,'#8a6000');
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-bw/2,bt,bw,bh,[3,3,6,6]);ctx.fill();
  // Rainbow shimmer band
  const shimmer=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  shimmer.addColorStop(0,`hsla(${(t*60)%360},100%,60%,0.7)`);
  shimmer.addColorStop(0.5,`hsla(${(t*60+180)%360},100%,60%,0.7)`);
  shimmer.addColorStop(1,`hsla(${(t*60+360)%360},100%,60%,0.7)`);
  ctx.fillStyle=shimmer;ctx.fillRect(-bw/2,bt+bh*0.38,bw,6);
  // Star on body
  ctx.fillStyle='rgba(255,255,200,0.9)';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('★',0,bt+bh*0.65);
  // Gold pointed nose
  ctx.beginPath();ctx.moveTo(-bw/2,bt);ctx.quadraticCurveTo(-bw/4,bt-nh*0.7,0,bt-nh);ctx.quadraticCurveTo(bw/4,bt-nh*0.7,bw/2,bt);ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#8a6000');ng.addColorStop(0.5,'#ffe566');ng.addColorStop(1,'#8a6000');
  ctx.fillStyle=ng;ctx.fill();
  ctx.beginPath();ctx.arc(0,bt-nh,4,0,Math.PI*2);ctx.fillStyle=`hsl(${(t*120)%360},100%,70%)`;ctx.fill();
  // Nozzle
  ctx.beginPath();ctx.moveTo(-bw*0.38,bb);ctx.lineTo(bw*0.38,bb);ctx.lineTo(bw*0.48,bb+10);ctx.lineTo(-bw*0.48,bb+10);ctx.closePath();
  ctx.fillStyle='#6a4800';ctx.fill();
  drawTailLucky(bb,bw,10);
  ctx.restore();
}

// Lucky tail — golden stars
function drawTailLucky(bb,bw,no){
  const ny=bb+no,hw=bw*0.45,t=gameTime;
  for(let i=0;i<14;i++){
    const age=(i/14+t*0.65)%1;
    const px=Math.sin(i*1.3+t*1.5)*hw*age;
    const py=ny+age*54;
    const a=0.8*(1-age);
    const hue=(t*80+i*25)%360;
    ctx.save();ctx.translate(px,py);ctx.rotate(t*2+i);
    ctx.fillStyle=`hsla(${hue},100%,65%,${a})`;
    const s=(1-age)*5;
    // draw star shape
    ctx.beginPath();
    for(let p=0;p<5;p++){
      const a1=p*Math.PI*2/5-Math.PI/2, a2=a1+Math.PI/5;
      p===0?ctx.moveTo(Math.cos(a1)*s,Math.sin(a1)*s):ctx.lineTo(Math.cos(a1)*s,Math.sin(a1)*s);
      ctx.lineTo(Math.cos(a2)*s*0.4,Math.sin(a2)*s*0.4);
    }
    ctx.closePath();ctx.fill();
    ctx.restore();
  }
}

// Lucky background — deep purple with rainbow aurora
function drawBgLucky(){
  const t=gameTime*0.4;
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#0a0018');bg.addColorStop(0.5,'#140030');bg.addColorStop(1,'#0a0018');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Rainbow aurora bands
  for(let i=0;i<12;i++){
    const ax=CANVAS_W*(i/11);
    const hue=(i*30+t*40)%360;
    const wave=Math.sin(t*0.7+i*0.9)*28;
    const aur=ctx.createLinearGradient(ax,0,ax,CANVAS_H);
    aur.addColorStop(0,`hsla(${hue},100%,55%,0)`);
    aur.addColorStop(0.3+Math.sin(t*0.4+i)*0.1,`hsla(${hue},100%,60%,0.25)`);
    aur.addColorStop(0.7,`hsla(${(hue+60)%360},100%,55%,0.10)`);
    aur.addColorStop(1,`hsla(${hue},100%,50%,0)`);
    ctx.save();ctx.translate(wave,0);
    ctx.beginPath();ctx.rect(ax-10,0,20,CANVAS_H);ctx.fillStyle=aur;ctx.fill();
    ctx.restore();
  }
  // Floating rainbow stars
  for(let i=0;i<55;i++){
    const sx=((i*0.179)%1)*CANVAS_W;
    const sy=((i*0.113)%1)*CANVAS_H;
    const a=0.4+0.5*Math.sin(i*2.1+t*2);
    const hue=(i*37+t*60)%360;
    ctx.beginPath();ctx.arc(sx,sy,1.2,0,Math.PI*2);
    ctx.fillStyle=`hsla(${hue},100%,80%,${a})`;ctx.fill();
  }
}

// ── RETROWAVE (secret egg background) ─────────────────────────────────────────
function drawBgRetrowave() {
  // Deep purple sky
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0,   '#0a0018');
  sky.addColorStop(0.45,'#1a0040');
  sky.addColorStop(0.55,'#2a0060');
  sky.addColorStop(1,   '#0a0018');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const horizon = CANVAS_H * 0.54;
  const t = gameTime * 0.5;

  // Neon sun — half circle sitting on horizon
  const sunX = CANVAS_W / 2, sunR = 68;
  const sunG = ctx.createLinearGradient(sunX, horizon - sunR, sunX, horizon);
  sunG.addColorStop(0,   '#ffe040');
  sunG.addColorStop(0.45,'#ff6090');
  sunG.addColorStop(1,   '#cc00cc');
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, horizon, sunR, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = sunG;
  ctx.fill();
  // Scanlines across the sun
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let sy = horizon - sunR; sy < horizon; sy += 7) {
    ctx.beginPath(); ctx.moveTo(sunX - sunR, sy); ctx.lineTo(sunX + sunR, sy); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  // Glow halo around sun
  const halo = ctx.createRadialGradient(sunX, horizon, sunR * 0.5, sunX, horizon, sunR * 2.2);
  halo.addColorStop(0,   'rgba(255,80,160,0.22)');
  halo.addColorStop(0.5, 'rgba(180,0,220,0.10)');
  halo.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Perspective grid (floor)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, CANVAS_W, CANVAS_H - horizon);
  ctx.clip();

  // Floor gradient
  const floor = ctx.createLinearGradient(0, horizon, 0, CANVAS_H);
  floor.addColorStop(0,   '#1a003a');
  floor.addColorStop(1,   '#000010');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, CANVAS_W, CANVAS_H - horizon);

  // Grid lines — horizontal (animated scroll)
  const vp = horizon; // vanishing-point y = horizon
  const gridScroll = (t * 0.3) % 1;
  ctx.strokeStyle = 'rgba(200,0,255,0.55)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 10; i++) {
    const frac = ((i / 10) + gridScroll) % 1;
    const frac2 = frac * frac; // perspective — denser near horizon
    const y = vp + frac2 * (CANVAS_H - vp);
    const alpha = 0.15 + frac2 * 0.55;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
  // Grid lines — vertical (converge to vanishing point at center)
  const numV = 10;
  for (let i = 0; i <= numV; i++) {
    const fx = i / numV; // 0..1
    const bx = fx * CANVAS_W;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W / 2, vp);
    ctx.lineTo(bx, CANVAS_H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Stars in the top portion
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 0.197) % 1) * CANVAS_W;
    const sy = ((i * 0.137) % 1) * horizon * 0.9;
    const a  = 0.3 + 0.6 * Math.abs(Math.sin(i * 1.9 + t * 2));
    const hue = (i * 23 + 200) % 360;
    ctx.beginPath();
    ctx.arc(sx, sy, 0.9 + 0.7 * Math.abs(Math.sin(i * 3.1)), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue},80%,80%,${a})`;
    ctx.fill();
  }
}

// ── MATRIX (secret back-egg background) ───────────────────────────────────────
const MATRIX_CHARS = '01';
function drawBgMatrix() {
  // Dark green-tinted black sky
  ctx.fillStyle = '#000a00';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cols   = 20;                // number of character columns
  const colW   = CANVAS_W / cols;
  const t      = gameTime;

  ctx.font         = `bold ${Math.floor(colW * 0.75)}px monospace`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';

  for (let c = 0; c < cols; c++) {
    const cx = c * colW;
    // Each column has its own phase offset and speed
    const speed  = 3 + ((c * 7) % 5);           // chars per second
    const offset = (c * 0.37) % 1;              // phase 0..1
    const rows   = 14;

    for (let r = 0; r < rows; r++) {
      // Which character index this cell shows (changes over time)
      const charIdx = Math.floor((t * speed + r * 1.7 + c * 3.1)) % MATRIX_CHARS.length;
      const ch      = MATRIX_CHARS[charIdx];

      // Vertical scroll position
      const frac   = ((t * speed * 0.06 + offset + r / rows) % 1);
      const cy     = frac * CANVAS_H;

      // Leading character is bright white, trail fades green
      const trailPos = (r / rows);
      let alpha, color;
      if (trailPos > 0.88) {
        // Leading edge — bright white flash
        alpha = 0.95;
        color = `rgba(200,255,200,${alpha})`;
      } else {
        alpha = Math.max(0, 0.7 - trailPos * 0.6);
        const g = Math.floor(100 + trailPos * 100);
        color = `rgba(0,${g + 60},0,${alpha})`;
      }
      ctx.fillStyle = color;
      ctx.fillText(ch, cx + 2, cy);
    }
  }

  // Faint green scanline overlay
  ctx.fillStyle = 'rgba(0, 40, 0, 0.12)';
  for (let sy = 0; sy < CANVAS_H; sy += 4) {
    ctx.fillRect(0, sy, CANVAS_W, 2);
  }
}

// Register lucky cosmetics (wheel-only, cost 0, hidden from shop)
// Add to arrays so equip system works — filtered out of shop by wheelOnly flag
function registerLuckyCosmetics(){
  if(!ROCKETS.find(r=>r.id==='lucky'))
    ROCKETS.push({id:'lucky',name:'LUCKY',cost:0,wheelOnly:true,drawFn:drawRocketLucky});
  if(!TAILS.find(t=>t.id==='lucky'))
    TAILS.push({id:'lucky',name:'LUCKY',cost:0,wheelOnly:true,drawFn:drawTailLucky});
  if(!BACKGROUNDS.find(b=>b.id==='lucky'))
    BACKGROUNDS.push({id:'lucky',name:'LUCKY',cost:0,wheelOnly:true,drawFn:drawBgLucky});
}

function drawWheelScreen(){
  // Background
  const bg=ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#0a0020');bg.addColorStop(1,'#1a0040');
  ctx.fillStyle=bg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  // Rainbow aurora behind wheel
  drawBgLucky();

  ctx.textAlign='center';ctx.textBaseline='middle';

  // Title
  ctx.fillStyle='#ffd700';ctx.font='bold 26px monospace';
  ctx.fillText('DAILY SPIN', CANVAS_W/2, 38);

  // Subtitle
  const canSpin=canSpinToday();
  ctx.font='bold 12px monospace';
  ctx.fillStyle=canSpin?'#aaffaa':'#ff8888';
  ctx.fillText(canSpin?'Spin available!':'Come back tomorrow', CANVAS_W/2, 62);

  // ── Draw wheel ──────────────────────────────────────
  const WX=CANVAS_W/2, WY=320, WR=148;
  ctx.save();ctx.translate(WX,WY);ctx.rotate(state.wheelAngle);

  for(const p of WHEEL_PRIZES){
    // Segment fill
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.arc(0,0,WR,p.startAngle,p.startAngle+p.deg);
    ctx.closePath();
    ctx.fillStyle=p.color;ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1.5;ctx.stroke();
    // Label
    ctx.save();ctx.rotate(p.midAngle);
    ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.font=`bold ${p.deg>0.5?13:10}px monospace`;
    ctx.fillText(p.label,WR-10,0);
    ctx.restore();
  }
  // Center cap
  const cap=ctx.createRadialGradient(0,0,0,0,0,22);
  cap.addColorStop(0,'#fff8c0');cap.addColorStop(0.5,'#ffd700');cap.addColorStop(1,'#8a6000');
  ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fillStyle=cap;ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#3a2000';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('★',0,0);
  ctx.restore();

  // ── Pointer (top of wheel) ──────────────────────────
  ctx.fillStyle='#ffffff';ctx.strokeStyle='#ffd700';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(WX,WY-WR-6);ctx.lineTo(WX-11,WY-WR-26);ctx.lineTo(WX+11,WY-WR-26);ctx.closePath();
  ctx.fill();ctx.stroke();

  // ── SPIN button ─────────────────────────────────────
  const btnY=CANVAS_H-110;
  if(!state.wheelSpinning && !state.wheelShowResult){
    const active=canSpinToday();
    ctx.beginPath();ctx.roundRect(CANVAS_W/2-90,btnY-24,180,48,24);
    ctx.fillStyle=active?'#ff6b35':'rgba(60,60,80,0.8)';ctx.fill();
    ctx.strokeStyle=active?'#ffaa60':'#444466';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=active?'#fff':'#666688';ctx.font='bold 20px monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(active?'SPIN!':'SPUN TODAY',CANVAS_W/2,btnY);
  } else if(state.wheelSpinning){
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='bold 16px monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('Spinning...', CANVAS_W/2, btnY);
  }

  // ── Result banner ───────────────────────────────────
  if(state.wheelShowResult && state.wheelResult){
    const p=state.wheelResult;
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.beginPath();ctx.roundRect(CANVAS_W/2-140,btnY-44,280,90,18);ctx.fill();
    ctx.strokeStyle='#ffd700';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#ffd700';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('YOU WON!', CANVAS_W/2, btnY-22);
    ctx.fillStyle='#ffffff';ctx.font='bold 22px monospace';
    let wonLabel='';
    if(p.type==='coins') wonLabel=`${p.amount} COINS`;
    else if(p.type==='rocket') wonLabel='LUCKY ROCKET';
    else if(p.type==='tail') wonLabel='LUCKY TAIL';
    else if(p.type==='bg') wonLabel='LUCKY BACKGROUND';
    ctx.fillText(wonLabel, CANVAS_W/2, btnY+6);
    ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='bold 11px monospace';
    ctx.fillText('Tap to continue', CANVAS_W/2, btnY+30);
  }

  // Back button
  const backBtn={x:CANVAS_W/2,y:CANVAS_H-44,w:200,h:44};
  drawMenuButton(backBtn,'← BACK','#1a1a60','#2828a0','#8888ff');
}

// ── Leaderboard screen ────────────────────────

function shopContentHeight() {
  const CARD_H=132,GAP=7,PCARD_H=148;
  if (state.shopTab==='rockets')     return Math.ceil(ROCKETS.length/2)*(CARD_H+GAP)-GAP;
  if (state.shopTab==='tails')       return Math.ceil(TAILS.length/2)*(CARD_H+GAP)-GAP;
  if (state.shopTab==='backgrounds') {
    const vis = BACKGROUNDS.filter(b => !b.wheelOnly && (!b.secret || state.unlockedBgs.includes(b.id)));
    return Math.ceil(vis.length/2)*(CARD_H+GAP)-GAP;
  }
  if (state.shopTab==='packs')       return PACKS.length*(PCARD_H+GAP)-GAP;
  return 0;
}
function clampShopScroll() {
  const TAB_Y=70,TAB_H=32,gridTopBase=TAB_Y+TAB_H+10;
  const visH = CANVAS_H - 60 - gridTopBase;
  const maxScroll = Math.max(0, shopContentHeight() - visH);
  state.shopScrollY = Math.max(0, Math.min(state.shopScrollY, maxScroll));
}

function drawShopScreen() {
  shopButtons.length = 0;

  // Deep space background
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, 'rgb(2,0,10)'); bg.addColorStop(1, 'rgb(6,2,22)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const s of starsFar) {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,210,255,${s.alpha * 0.5})`; ctx.fill();
  }

  // Title
  ctx.fillStyle = '#ffd060'; ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🛒  SHOP', CANVAS_W / 2, 30);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 13px monospace';
  ctx.fillText(`🪙 ${state.coins}  coins available`, CANVAS_W / 2, 54);

  // ── Tabs ──────────────────────────────────────────────
  const TAB_Y = 70, TAB_H = 32, TAB_W = 88, TAB_GAP = 5;
  const tabTotalW = 4 * TAB_W + 3 * TAB_GAP;
  const tabStartX = (CANVAS_W - tabTotalW) / 2;
  const tabs = [
    { id: 'rockets',     label: '🚀',     x: tabStartX + TAB_W * 0.5,                   y: TAB_Y + TAB_H / 2 },
    { id: 'tails',       label: '🔥',     x: tabStartX + TAB_W * 1.5 + TAB_GAP,         y: TAB_Y + TAB_H / 2 },
    { id: 'backgrounds', label: '🌌',     x: tabStartX + TAB_W * 2.5 + TAB_GAP * 2,     y: TAB_Y + TAB_H / 2 },
    { id: 'packs',       label: '⭐ PACKS', x: tabStartX + TAB_W * 3.5 + TAB_GAP * 3,   y: TAB_Y + TAB_H / 2 },
  ];
  for (const tab of tabs) {
    const active = state.shopTab === tab.id;
    ctx.beginPath(); ctx.roundRect(tab.x - TAB_W / 2, TAB_Y, TAB_W, TAB_H, 10);
    ctx.fillStyle = active ? '#ff6b35' : 'rgba(255,255,255,0.07)'; ctx.fill();
    ctx.strokeStyle = active ? '#ff8c55' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tab.label, tab.x, tab.y);
    shopButtons.push({ action: 'tab', id: tab.id, x: tab.x, y: tab.y, w: TAB_W, h: TAB_H });
  }

  const CARD_W = 168, CARD_H = 132, GAP = 7;
  const gridLeft = (CANVAS_W - (2 * CARD_W + GAP)) / 2;
  const GRID_TOP_BASE = TAB_Y + TAB_H + 10;
  const CLIP_BOTTOM = CANVAS_H - 60;

  // Clamp + apply scroll
  clampShopScroll();
  const scrollY = state.shopScrollY;
  const gridTop = GRID_TOP_BASE - scrollY;

  // Clip scrollable area
  ctx.save();
  ctx.beginPath(); ctx.rect(0, GRID_TOP_BASE, CANVAS_W, CLIP_BOTTOM - GRID_TOP_BASE); ctx.clip();

  function drawCard(cx, cy, cardX, cardY, isOwned, isEquipped, canAfford, name, cost, previewFn, action, id, packLockLabel) {
    ctx.beginPath(); ctx.roundRect(cardX, cardY, CARD_W, CARD_H, 14);
    ctx.fillStyle = isEquipped ? 'rgba(255,220,60,0.10)' : (isOwned ? 'rgba(30,30,60,0.85)' : 'rgba(18,18,34,0.85)');
    ctx.fill();
    ctx.strokeStyle = isEquipped ? '#ffd700' : (isOwned ? 'rgba(80,80,160,0.6)' : 'rgba(50,50,80,0.4)');
    ctx.lineWidth = isEquipped ? 2 : 1; ctx.stroke();
    previewFn();
    ctx.fillStyle = isOwned ? '#ffffff' : 'rgba(180,180,210,0.7)';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, cx, cardY + CARD_H - 42);
    const btnW = 126, btnH = 28, btnX = cx, btnY = cardY + CARD_H - 18;
    let lbl, bgCol, bdCol, txtCol;
    if (packLockLabel) {
      // Pack item that hasn't been unlocked via pack purchase
      lbl = packLockLabel;
      bgCol = 'rgba(20,10,40,0.9)'; bdCol = 'rgba(100,60,160,0.6)'; txtCol = 'rgba(160,120,210,0.8)';
    } else if (isEquipped) {
      lbl='✓ EQUIPPED'; bgCol='#ff6b35'; bdCol='#ff8c55'; txtCol='#fff';
    } else if (isOwned) {
      lbl='EQUIP'; bgCol='rgba(40,40,80,0.9)'; bdCol='#4444aa'; txtCol='#aaaaff';
    } else {
      lbl = canAfford ? `🪙 ${cost}  UNLOCK` : `🔒 ${cost}`;
      bgCol = canAfford ? 'rgba(30,60,30,0.9)' : 'rgba(30,20,20,0.9)';
      bdCol = canAfford ? '#44aa44' : '#552222';
      txtCol = canAfford ? '#88ff88' : '#886666';
    }
    ctx.beginPath(); ctx.roundRect(btnX-btnW/2, btnY-btnH/2, btnW, btnH, 7);
    ctx.fillStyle=bgCol; ctx.fill(); ctx.strokeStyle=bdCol; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=txtCol; ctx.font='bold 11px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(lbl, btnX, btnY);
    if (!isEquipped && !packLockLabel) shopButtons.push({ id, cost, action, x: btnX, y: btnY, w: btnW, h: btnH, canAfford });
  }

  if (state.shopTab === 'rockets') {
    const unlocked = state.unlockedRockets, equipped = state.equippedRocket;
    for (let i = 0; i < ROCKETS.length; i++) {
      const r = ROCKETS[i], col = i%2, row = Math.floor(i/2);
      const cx = gridLeft + col*(CARD_W+GAP) + CARD_W/2, cy = gridTop + row*(CARD_H+GAP) + CARD_H/2;
      const cardX = cx-CARD_W/2, cardY = cy-CARD_H/2;
      const isOwned = unlocked.includes(r.id), isEquipped = equipped===r.id, canAfford = state.coins>=r.cost;
      // Pack items locked unless pack is purchased
      let packLockLabel = null;
      if (r.packId && !state.unlockedPacks.includes(r.packId)) {
        const packDef = PACKS.find(p=>p.id===r.packId);
        packLockLabel = '🔒 ' + (packDef ? packDef.name : r.packId.toUpperCase()) + ' PACK';
      }
      drawCard(cx, cy, cardX, cardY, isOwned, isEquipped, canAfford, r.name, r.cost,
        () => { ctx.save(); ctx.translate(cx-CARD_W*0.22, cardY+CARD_H*0.42); ctx.scale(0.42,0.42); drawRocket(0,0,r); ctx.restore(); },
        isOwned ? 'equip' : 'unlock', r.id, packLockLabel);
    }
  } else if (state.shopTab === 'tails') {
    const unlocked = state.unlockedTails, equipped = state.equippedTail;
    for (let i = 0; i < TAILS.length; i++) {
      const t = TAILS[i], col = i%2, row = Math.floor(i/2);
      const cx = gridLeft + col*(CARD_W+GAP) + CARD_W/2, cy = gridTop + row*(CARD_H+GAP) + CARD_H/2;
      const cardX = cx-CARD_W/2, cardY = cy-CARD_H/2;
      const isOwned = unlocked.includes(t.id), isEquipped = equipped===t.id, canAfford = state.coins>=t.cost;
      // Pack items locked unless pack is purchased
      let packLockLabel = null;
      if (t.packId && !state.unlockedPacks.includes(t.packId)) {
        const packDef = PACKS.find(p=>p.id===t.packId);
        packLockLabel = '🔒 ' + (packDef ? packDef.name : t.packId.toUpperCase()) + ' PACK';
      }
      drawCard(cx, cy, cardX, cardY, isOwned, isEquipped, canAfford, t.name, t.cost,
        () => {
          ctx.save(); ctx.translate(cx-CARD_W*0.22, cardY+CARD_H*0.40); ctx.scale(0.55,0.55);
          const mbb=0, mbw=28;
          ctx.beginPath(); ctx.moveTo(-mbw*0.4,mbb); ctx.lineTo(mbw*0.4,mbb); ctx.lineTo(mbw*0.5,mbb+10); ctx.lineTo(-mbw*0.5,mbb+10); ctx.closePath();
          ctx.fillStyle='#7a7a8a'; ctx.fill();
          if (!packLockLabel) t.drawFn(mbb, mbw, 10);
          ctx.restore();
        },
        isOwned ? 'equip_tail' : 'unlock_tail', t.id, packLockLabel);
    }
  } else if (state.shopTab === 'backgrounds') {
    // ── Backgrounds grid ──────────────────────────────
    const unlocked = state.unlockedBgs, equipped = state.equippedBg;
    // Hide wheel-only and secret items unless the player has already unlocked them
    const shopBgList = BACKGROUNDS.filter(b => !b.wheelOnly && (!b.secret || unlocked.includes(b.id)));
    for (let i = 0; i < shopBgList.length; i++) {
      const b = shopBgList[i], col = i%2, row = Math.floor(i/2);
      const cx = gridLeft + col*(CARD_W+GAP) + CARD_W/2, cy = gridTop + row*(CARD_H+GAP) + CARD_H/2;
      const cardX = cx-CARD_W/2, cardY = cy-CARD_H/2;
      const isOwned = unlocked.includes(b.id), isEquipped = equipped===b.id, canAfford = state.coins>=b.cost;
      // Pack items locked unless pack is purchased
      let packLockLabel = null;
      if (b.packId && !state.unlockedPacks.includes(b.packId)) {
        const packDef = PACKS.find(p=>p.id===b.packId);
        packLockLabel = '🔒 ' + (packDef ? packDef.name : b.packId.toUpperCase()) + ' PACK';
      }
      drawCard(cx, cy, cardX, cardY, isOwned, isEquipped, canAfford, b.name, b.cost,
        () => { if (!packLockLabel) drawBgPreview(b.id, cardX+8, cardY+8, CARD_W*0.48, CARD_H*0.52); },
        isOwned ? 'equip_bg' : 'unlock_bg', b.id, packLockLabel);
    }
  } else if (state.shopTab === 'packs') {
    // ── Packs grid — 1 column, tall cards ──────────────
    const PCARD_W = CARD_W * 2 + GAP, PCARD_H = 148;
    const pGridLeft = (CANVAS_W - PCARD_W) / 2;
    for (let i = 0; i < PACKS.length; i++) {
      const pk = PACKS[i];
      const cardX = pGridLeft, cardY = gridTop + i * (PCARD_H + GAP);
      const cx = cardX + PCARD_W / 2, cy = cardY + PCARD_H / 2;
      const isOwned = state.unlockedPacks.includes(pk.id);
      // A pack is considered "equipped" when all three of its items are currently active
      const isEquipped = state.equippedRocket === pk.id+'_rocket' &&
                         state.equippedTail   === pk.id+'_tail'   &&
                         state.equippedBg     === pk.id+'_bg';
      const canAfford = state.coins >= pk.cost;
      // Card background
      ctx.beginPath(); ctx.roundRect(cardX, cardY, PCARD_W, PCARD_H, 14);
      ctx.fillStyle = isEquipped ? 'rgba(255,220,60,0.10)' : (isOwned ? 'rgba(30,30,60,0.85)' : 'rgba(18,18,34,0.85)');
      ctx.fill();
      ctx.strokeStyle = isEquipped ? '#ffd700' : (isOwned ? 'rgba(80,80,160,0.6)' : 'rgba(50,50,80,0.4)');
      ctx.lineWidth = isEquipped ? 2 : 1; ctx.stroke();
      // Mini previews: bg + rocket + meteor sample
      ctx.save(); ctx.beginPath(); ctx.roundRect(cardX+6, cardY+6, PCARD_W*0.38, PCARD_H-12, 10); ctx.clip();
      // Scale down and draw bg preview
      ctx.save(); ctx.translate(cardX+6, cardY+6); ctx.scale((PCARD_W*0.38)/CANVAS_W, (PCARD_H-12)/CANVAS_H);
      pk.drawBg(); ctx.restore();
      ctx.restore();
      // Mini rocket
      ctx.save(); ctx.translate(cx - PCARD_W*0.12, cy - 5); ctx.scale(0.38, 0.38); pk.drawRocket(0, 0); ctx.restore();
      // Pack name
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.emoji + ' ' + pk.name, cx + PCARD_W*0.18, cardY + PCARD_H * 0.30);
      // Description
      ctx.fillStyle = 'rgba(180,180,210,0.8)'; ctx.font = '10px monospace';
      ctx.fillText('Rocket  Trail  Background  Meteors', cx + PCARD_W*0.18, cardY + PCARD_H * 0.52);
      // Button
      const btnW = 140, btnH = 28, btnX = cx + PCARD_W*0.18, btnY = cardY + PCARD_H - 22;
      let lbl, bgCol, bdCol, txtCol;
      if (isEquipped) {
        lbl = '✓ EQUIPPED'; bgCol = '#ff6b35'; bdCol = '#ff8c55'; txtCol = '#fff';
      } else if (isOwned) {
        lbl = 'EQUIP PACK'; bgCol = 'rgba(40,40,80,0.9)'; bdCol = '#4444aa'; txtCol = '#aaaaff';
      } else {
        if (pk.vip) {
          lbl = '👑 VIP EXCLUSIVE'; bgCol = 'rgba(80,0,120,0.5)'; bdCol = '#cc88ff'; txtCol = '#dd99ff';
        } else {
          lbl = canAfford ? `UNLOCK  ${pk.cost} coins` : `LOCKED  ${pk.cost} coins`;
          bgCol = canAfford ? 'rgba(255,160,0,0.15)' : 'rgba(20,20,30,0.8)';
          bdCol = canAfford ? '#ff9900' : 'rgba(60,60,80,0.4)';
          txtCol = canAfford ? '#ffcc44' : '#555577';
        }
      }
      ctx.beginPath(); ctx.roundRect(btnX - btnW/2, btnY - btnH/2, btnW, btnH, 10);
      ctx.fillStyle = bgCol; ctx.fill();
      ctx.strokeStyle = bdCol; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = txtCol; ctx.font = 'bold 11px monospace';
      ctx.fillText(lbl, btnX, btnY);
      const action = isOwned ? 'equip_pack' : (canAfford ? 'unlock_pack' : null);
      if (action) shopButtons.push({ id: pk.id, cost: pk.cost, action, x: btnX, y: btnY, w: btnW, h: btnH, canAfford });
    }
  }

  // End scroll clip
  ctx.restore();

  // Scroll indicator
  const visH = CLIP_BOTTOM - GRID_TOP_BASE;
  const contentH = shopContentHeight();
  if (contentH > visH) {
    const trackH = visH, trackX = CANVAS_W - 5;
    const thumbH = Math.max(30, visH * (visH / contentH));
    const thumbY = GRID_TOP_BASE + (scrollY / (contentH - visH)) * (trackH - thumbH);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(trackX - 3, GRID_TOP_BASE, 4, trackH, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath(); ctx.roundRect(trackX - 3, thumbY, 4, thumbH, 2); ctx.fill();
  }

  const backBtn = { x: CANVAS_W/2, y: CANVAS_H-38, w: 250, h: 52 };
  drawMenuButton(backBtn, '← BACK', '#1a1a60', '#2828a0', '#8888ff');
  shopButtons.push({ action: 'back', x: backBtn.x, y: backBtn.y, w: backBtn.w, h: backBtn.h });
}

function drawLeaderboardScreen() {
  drawDayScene(0);

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 20, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = 'rgba(0, 0, 30, 0.88)';
  ctx.beginPath();
  ctx.roundRect(30, 120, CANVAS_W - 60, 590, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 200, 60, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  ctx.fillStyle    = '#ffd060';
  ctx.font         = 'bold 28px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆  LEADERBOARD', CANVAS_W / 2, 172);

  // Subtitle
  ctx.fillStyle = '#8888aa';
  ctx.font      = '11px monospace';
  ctx.fillText('FASTEST TRIPS TO JUPITER  •  GLOBAL', CANVAS_W / 2, 204);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(55, 220); ctx.lineTo(CANVAS_W - 55, 220);
  ctx.stroke();

  // Use global leaderboard if available, else fall back to local
  const board = state.globalLeaderboard.length
    ? state.globalLeaderboard
    : (state.leaderboard.length ? state.leaderboard : null);
  const isGlobal = state.globalLeaderboard.length > 0;
  const medals = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];
  const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#aaaacc', '#aaaacc',
                       '#aaaacc', '#aaaacc', '#aaaacc', '#aaaacc', '#aaaacc'];
  const myName = state.authUser?.username || '';

  if (state.globalLbLoading && !board) {
    ctx.fillStyle    = '#8888aa';
    ctx.font         = '14px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading...', CANVAS_W / 2, 360);
  } else if (!board) {
    ctx.fillStyle    = '#555577';
    ctx.font         = '14px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No records yet!', CANVAS_W / 2, 360);
    ctx.font = '12px monospace';
    ctx.fillText('Reach Jupiter to set your first time.', CANVAS_W / 2, 390);
  } else {
    const maxRows = Math.min(board.length, isGlobal ? 10 : 5);
    const rowH = isGlobal ? 54 : 68;
    for (let i = 0; i < maxRows; i++) {
      const rowY  = 258 + i * rowH;
      const isTop = i === 0;
      const isMe  = myName && (board[i]?.name || '').toUpperCase() === myName.toUpperCase();

      // Row highlight
      if (isTop || isMe) {
        ctx.fillStyle = isMe ? 'rgba(100,200,255,0.08)' : 'rgba(255,200,40,0.08)';
        ctx.beginPath();
        ctx.roundRect(50, rowY - 20, CANVAS_W - 100, rowH - 6, 8);
        ctx.fill();
      }

      // Rank
      ctx.font         = isTop ? 'bold 22px monospace' : '16px monospace';
      ctx.fillStyle    = medalColors[i];
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(medals[i], 84, rowY);

      // Time
      ctx.font      = isTop ? 'bold 22px monospace' : 'bold 16px monospace';
      ctx.fillStyle = isMe ? '#88ddff' : medalColors[i];
      ctx.textAlign = 'left';
      ctx.fillText(formatTime(board[i]?.time || 0), 110, rowY);

      // Player name (capped at 10 chars so it doesn't overflow)
      ctx.fillStyle = isMe ? '#88ddff' : 'rgba(255,255,255,0.55)';
      ctx.font      = isMe ? 'bold 12px monospace' : '12px monospace';
      ctx.textAlign = 'right';
      const nameStr = (board[i]?.name || 'PILOT').toUpperCase().slice(0, 10);
      ctx.fillText(nameStr, CANVAS_W - 52, rowY);
    }
  }

  ctx.textBaseline = 'alphabetic';

  // Back button
  drawMenuButton(LEADERBOARD_BACK, '← BACK', '#1a1a60', '#2828a0', '#8888ff');
}

// ── Back-button egg counter (called from every back→start transition) ─────────
function countBackEgg() {
  const now = Date.now();
  if (now - state.backLastTap > 5000) state.backTaps = 0;
  state.backTaps++; state.backLastTap = now;
  if (state.backTaps >= 5) {
    state.backTaps = 0;
    if (!state.unlockedBgs.includes('matrix')) {
      state.unlockedBgs = [...state.unlockedBgs, 'matrix'];
      saveUnlockedBgs(state.unlockedBgs);
    }
    state.equippedBg = 'matrix';
    saveEquippedBg('matrix');
    state.secretFlash = { life: 3.5, msg: '💻  MATRIX UNLOCKED  💻', sub: 'Secret theme equipped!' };
  }
}

// ── Easter egg unlock flash ────────────────────
function drawEggFlash() {
  const alpha = Math.min(1, state.eggFlash, (3 - state.eggFlash + 0.3) * 5);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Banner
  const bw = 280, bh = 54, bx = CANVAS_W / 2 - bw / 2, by = CANVAS_H / 2 - bh / 2;
  ctx.fillStyle = 'rgba(20, 10, 0, 0.92)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.stroke();

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffd700';
  ctx.font         = 'bold 14px monospace';
  ctx.fillText('⭐  SECRET UNLOCKED  ⭐', CANVAS_W / 2, by + bh / 2 - 8);
  ctx.fillStyle = 'rgba(255,220,100,0.75)';
  ctx.font      = '11px monospace';
  ctx.fillText('Everything in the shop is yours!', CANVAS_W / 2, by + bh / 2 + 12);

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ── Generic secret flash banner ───────────────
function drawSecretFlash() {
  const { life, msg, sub } = state.secretFlash;
  const alpha = Math.min(1, life, (3 - life + 0.3) * 5);
  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = 300, bh = 56, bx = CANVAS_W / 2 - bw / 2, by = CANVAS_H / 2 - bh / 2;
  ctx.fillStyle = 'rgba(10, 5, 0, 0.94)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px monospace';
  ctx.fillText(msg, CANVAS_W / 2, by + bh / 2 - 9);
  ctx.fillStyle = 'rgba(255,220,100,0.8)'; ctx.font = '11px monospace';
  ctx.fillText(sub, CANVAS_W / 2, by + bh / 2 + 12);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ── Sign-in prompt (guest restriction) ────────
function drawSignInPrompt() {
  // Dim overlay
  ctx.fillStyle = 'rgba(0, 0, 10, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  const pw = 280, ph = 200, px = CANVAS_W / 2 - pw / 2, py = CANVAS_H / 2 - ph / 2;
  ctx.fillStyle = 'rgba(0, 0, 30, 0.95)';
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 180, 60, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Lock icon
  ctx.font         = '36px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔒', CANVAS_W / 2, py + 52);

  // Title
  ctx.fillStyle = '#ffd060';
  ctx.font      = 'bold 22px monospace';
  ctx.fillText('SIGN IN', CANVAS_W / 2, py + 98);

  // Subtitle
  ctx.fillStyle = 'rgba(180, 180, 220, 0.85)';
  ctx.font      = '12px monospace';
  ctx.fillText('Create an account to access', CANVAS_W / 2, py + 126);
  ctx.fillText('all features.', CANVAS_W / 2, py + 144);

  // Tap-anywhere hint
  ctx.fillStyle = 'rgba(120, 120, 160, 0.7)';
  ctx.font      = '11px monospace';
  ctx.fillText('tap anywhere to dismiss', CANVAS_W / 2, py + 174);

  ctx.textBaseline = 'alphabetic';
}

// ── Ghost-time popup (trophy easter egg) ──────
function drawGhostTimePopup() {
  // Dim overlay (lighter than sign-in so you can still see the start screen)
  ctx.fillStyle = 'rgba(0, 0, 16, 0.62)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  const pw = 290, ph = 210;
  const px = CANVAS_W / 2 - pw / 2;
  const py = CANVAS_H / 2 - ph / 2;

  // Panel background
  ctx.fillStyle = 'rgba(4, 0, 24, 0.96)';
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 20); ctx.fill();

  // Neon border (cyan glow)
  ctx.strokeStyle = 'rgba(0, 220, 255, 0.65)';
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 20); ctx.stroke();
  ctx.shadowBlur  = 14;
  ctx.shadowColor = 'rgba(0, 220, 255, 0.5)';
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 20); ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Ghost emoji
  ctx.font = '36px monospace';
  ctx.fillText('👻', CANVAS_W / 2, py + 52);

  // "SHADOW PILOT" label
  ctx.fillStyle = 'rgba(0, 220, 255, 0.9)';
  ctx.font      = 'bold 13px monospace';
  ctx.fillText('S H A D O W   P I L O T', CANVAS_W / 2, py + 90);

  // Time display
  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 38px monospace';
  ctx.fillText('1:28.4', CANVAS_W / 2, py + 132);

  // Challenge line
  ctx.fillStyle = 'rgba(180, 230, 255, 0.75)';
  ctx.font      = '12px monospace';
  ctx.fillText('Can you beat this ghost time?', CANVAS_W / 2, py + 166);

  // Dismiss hint
  ctx.fillStyle = 'rgba(100, 140, 180, 0.55)';
  ctx.font      = '11px monospace';
  ctx.fillText('tap anywhere to dismiss', CANVAS_W / 2, py + 192);

  ctx.textBaseline = 'alphabetic';
}

// ── Tutorial screen ────────────────────────────
function drawTutorialScreen() {
  drawDayScene(0);

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 20, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = 'rgba(0, 0, 30, 0.88)';
  ctx.beginPath();
  ctx.roundRect(30, 100, CANVAS_W - 60, 620, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 180, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  ctx.fillStyle    = '#60d0ff';
  ctx.font         = 'bold 28px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('❓  HOW TO PLAY', CANVAS_W / 2, 152);

  // Subtitle
  ctx.fillStyle = '#8888aa';
  ctx.font      = '11px monospace';
  ctx.fillText('JOURNEY TO JUPITER — QUICK GUIDE', CANVAS_W / 2, 184);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(55, 200); ctx.lineTo(CANVAS_W - 55, 200);
  ctx.stroke();

  // Tutorial steps
  const steps = [
    { icon: '🎯', title: 'GOAL',        body: 'Fly your rocket to Jupiter!' },
    { icon: '↔',  title: 'STEER',       body: 'Swipe L/R  •  Arrow keys on desktop' },
    { icon: '☄️', title: 'METEORS',     body: 'Dodge meteors — hits slow you down' },
    { icon: '🪙', title: 'COINS',       body: 'Collect coins to unlock shop gear' },
    { icon: '🚀', title: 'ZONES',       body: 'Gets faster across all 4 zones' },
    { icon: '🏆', title: 'LEADERBOARD', body: 'Fastest trip tops the global board' },
  ];

  const startY = 230;
  const rowH   = 68;

  // Clip text to panel interior
  ctx.save();
  ctx.beginPath();
  ctx.rect(55, 205, CANVAS_W - 110, 490);
  ctx.clip();

  steps.forEach((step, i) => {
    const rowY = startY + i * rowH;

    // Row separator (except first)
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(55, rowY - 8); ctx.lineTo(CANVAS_W - 55, rowY - 8);
      ctx.stroke();
    }

    // Icon
    ctx.font         = '24px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.fillText(step.icon, 76, rowY + 16);

    // Step title
    ctx.font      = 'bold 13px monospace';
    ctx.fillStyle = '#60d0ff';
    ctx.textAlign = 'left';
    ctx.fillText(step.title, 104, rowY + 6);

    // Step body
    ctx.font      = '11px monospace';
    ctx.fillStyle = 'rgba(200,200,230,0.80)';
    ctx.fillText(step.body, 104, rowY + 26);
  });

  ctx.restore();

  ctx.textBaseline = 'alphabetic';

  // Back button
  drawMenuButton(TUTORIAL_BACK, '← BACK', '#1a1a60', '#2828a0', '#8888ff');
}

// ── Start screen ──────────────────────────────
function drawSettingsScreen() {
  drawDayScene(0);

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 20, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = 'rgba(0, 0, 30, 0.88)';
  ctx.beginPath();
  ctx.roundRect(30, 160, CANVAS_W - 60, 320, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 160, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  ctx.fillStyle    = '#aac8ff';
  ctx.font         = 'bold 30px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚙  SETTINGS', CANVAS_W / 2, 220);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(55, 255); ctx.lineTo(CANVAS_W - 55, 255);
  ctx.stroke();

  // Sound toggle row
  const on = settings.soundEnabled;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.roundRect(SOUND_TOGGLE.x - SOUND_TOGGLE.w / 2, SOUND_TOGGLE.y - SOUND_TOGGLE.h / 2,
                SOUND_TOGGLE.w, SOUND_TOGGLE.h, 14);
  ctx.fill();

  // Label
  ctx.fillStyle    = '#ddeeff';
  ctx.font         = 'bold 18px monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔊  Sound Effects', CANVAS_W / 2 - 120, SOUND_TOGGLE.y);

  // Toggle pill
  const tx = CANVAS_W / 2 + 70;
  const ty = SOUND_TOGGLE.y;
  const tw = 58, th = 30;
  ctx.beginPath();
  ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, th / 2);
  ctx.fillStyle = on ? '#28a030' : '#444466';
  ctx.fill();

  // Toggle knob
  const knobX = on ? tx + tw / 2 - th / 2 : tx - tw / 2 + th / 2;
  ctx.beginPath();
  ctx.arc(knobX, ty, th / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // ON / OFF label
  ctx.fillStyle    = on ? '#88ffaa' : '#8888aa';
  ctx.font         = 'bold 12px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(on ? 'ON' : 'OFF', tx, ty);

  ctx.textBaseline = 'alphabetic';

  // Signed-in-as label
  if (state.authUser) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('signed in as  ' + state.authUser.username, CANVAS_W / 2, 440);
  }

  // Sign out button
  const SO_BTN = { x: CANVAS_W / 2, y: 478, w: 200, h: 44 };
  ctx.fillStyle = 'rgba(200,50,50,0.18)';
  ctx.beginPath(); ctx.roundRect(SO_BTN.x - SO_BTN.w/2, SO_BTN.y - SO_BTN.h/2, SO_BTN.w, SO_BTN.h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(220,80,80,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ff8888'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SIGN OUT', SO_BTN.x, SO_BTN.y);
  ctx.textBaseline = 'alphabetic';

  // Back button
  drawMenuButton(SETTINGS_BACK, '← BACK', '#1a1a60', '#2828a0', '#8888ff');
}


// ── Auth Screen ───────────────────────────────
const AUTH_NUMPAD = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['←','0','✓']
];
const AUTH_BTN_W = 88, AUTH_BTN_H = 64, AUTH_BTN_GAP = 10;
const AUTH_PAD_X = (CANVAS_W - (3*AUTH_BTN_W + 2*AUTH_BTN_GAP)) / 2;
const AUTH_PAD_Y = 430;

function drawAuthScreen() {
  // Background
  const bg = ctx.createLinearGradient(0,0,0,CANVAS_H);
  bg.addColorStop(0,'#000018'); bg.addColorStop(1,'#00040e');
  ctx.fillStyle=bg; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  // Stars
  for(let i=0;i<60;i++){
    const sx=Math.sin(i*127.1)*CANVAS_W*0.5+CANVAS_W*0.5;
    const sy=Math.sin(i*311.7)*CANVAS_H*0.5+CANVAS_H*0.5;
    const sa=0.3+Math.abs(Math.sin(i*0.7+gameTime*0.5))*0.5;
    ctx.fillStyle=`rgba(255,255,255,${sa})`;
    ctx.beginPath(); ctx.arc(sx,sy,0.8,0,Math.PI*2); ctx.fill();
  }

  // Title
  ctx.textAlign='center';
  ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='bold 18px monospace';
  ctx.fillText('JOURNEY TO',CANVAS_W/2,60);
  ctx.fillStyle='#ffd700'; ctx.font='bold 38px monospace';
  ctx.fillText('JUPITER',CANVAS_W/2,100);

  // Mode toggle
  const toggleX=CANVAS_W/2, toggleY=155;
  const modes=[{id:'login',label:'LOG IN'},{id:'signup',label:'SIGN UP'}];
  modes.forEach((m,i)=>{
    const tx=toggleX+(i===0?-70:70);
    const active=state.authMode===m.id;
    ctx.fillStyle=active?'#ffd700':'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.roundRect(tx-52,toggleY-18,104,36,8); ctx.fill();
    ctx.fillStyle=active?'#000':'rgba(255,255,255,0.7)';
    ctx.font=`bold 14px monospace`; ctx.textAlign='center';
    ctx.fillText(m.label,tx,toggleY+5);
  });

  // Username label + display
  ctx.textAlign='center';
  ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='13px monospace';
  ctx.fillText('USERNAME',CANVAS_W/2,215);

  const uname=state.authUsername||'tap to enter';
  const isEmpty=!state.authUsername;
  ctx.fillStyle=isEmpty?'rgba(255,255,255,0.25)':'#fff';
  ctx.font=`bold 22px monospace`; ctx.textAlign='center';
  ctx.fillText(uname.toUpperCase(),CANVAS_W/2,248);

  // Underline
  ctx.strokeStyle=isEmpty?'rgba(255,255,255,0.2)':'#ffd700';
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(CANVAS_W/2-100,255); ctx.lineTo(CANVAS_W/2+100,255); ctx.stroke();

  // PIN label
  ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='13px monospace'; ctx.textAlign='center';
  ctx.fillText('PIN',CANVAS_W/2,285);

  // PIN dots
  for(let i=0;i<4;i++){
    const dx=CANVAS_W/2-45+i*30, dy=308;
    const filled=i<state.authPin.length;
    ctx.beginPath(); ctx.arc(dx,dy,10,0,Math.PI*2);
    ctx.fillStyle=filled?'#ffd700':'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.strokeStyle=filled?'#ffd700':'rgba(255,255,255,0.35)'; ctx.lineWidth=2; ctx.stroke();
  }

  // Error / loading message
  if(state.authError){
    ctx.fillStyle='#ff6b6b'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
    ctx.fillText(state.authError,CANVAS_W/2,348);
  } else if(state.authLoading){
    ctx.fillStyle='#ffd700'; ctx.font='bold 15px monospace'; ctx.textAlign='center';
    ctx.fillText('CHECKING...',CANVAS_W/2,348);
  }

  // Numpad
  AUTH_NUMPAD.forEach((row,ri)=>{
    row.forEach((key,ci)=>{
      const bx=AUTH_PAD_X+ci*(AUTH_BTN_W+AUTH_BTN_GAP);
      const by=AUTH_PAD_Y+ri*(AUTH_BTN_H+AUTH_BTN_GAP);
      const isConfirm=key==='✓';
      const isBack=key==='←';
      ctx.fillStyle=isConfirm?'rgba(255,215,0,0.25)':isBack?'rgba(255,100,100,0.2)':'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(bx,by,AUTH_BTN_W,AUTH_BTN_H,10); ctx.fill();
      ctx.strokeStyle=isConfirm?'rgba(255,215,0,0.5)':'rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=isConfirm?'#ffd700':isBack?'#ff8888':'#fff';
      ctx.font=`bold 22px monospace`; ctx.textAlign='center';
      ctx.fillText(key,bx+AUTH_BTN_W/2,by+AUTH_BTN_H/2+8);
    });
  });

  // Play as Guest button
  const guestY = AUTH_PAD_Y + 4*(AUTH_BTN_H+AUTH_BTN_GAP) + 12;
  const guestW = 230, guestH = 44;
  ctx.beginPath(); ctx.roundRect(CANVAS_W/2-guestW/2, guestY, guestW, guestH, 22);
  ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
  ctx.fillText('▶  PLAY AS GUEST', CANVAS_W/2, guestY+guestH/2+5);
}

function authNumpadHit(x,y){
  for(let ri=0;ri<AUTH_NUMPAD.length;ri++){
    for(let ci=0;ci<AUTH_NUMPAD[ri].length;ci++){
      const bx=AUTH_PAD_X+ci*(AUTH_BTN_W+AUTH_BTN_GAP);
      const by=AUTH_PAD_Y+ri*(AUTH_BTN_H+AUTH_BTN_GAP);
      if(x>=bx&&x<=bx+AUTH_BTN_W&&y>=by&&y<=by+AUTH_BTN_H) return AUTH_NUMPAD[ri][ci];
    }
  }
  return null;
}

function loadOrCreateProfileForUser(username) {
  const profiles = loadProfiles();
  let idx = profiles.findIndex(p => p.name === username);
  if (idx === -1) {
    // New user — create a fresh profile
    profiles.push({ name: username, coins: 0 });
    saveProfiles(profiles);
    idx = profiles.length - 1;
  }
  setActiveProfileIdx(idx);
  loadProfileIntoSession(idx);
}

function loadLocalAccounts(){
  try { return JSON.parse(localStorage.getItem('jtj_local_accounts')||'{}'); } catch{ return {}; }
}
function saveLocalAccounts(obj){ localStorage.setItem('jtj_local_accounts', JSON.stringify(obj)); }

function submitAuth(){
  if(!state.authUsername.trim()){ state.authError='Enter a username'; return; }
  if(state.authPin.length<4){ state.authError='Enter 4-digit PIN'; return; }
  state.authLoading=true; state.authError='';
  const pinHash=hashPIN(state.authPin);
  const uname=state.authUsername.trim().toUpperCase();
  const accounts=loadLocalAccounts();

  if(state.authMode==='signup'){
    if(accounts[uname]){ state.authError='Username taken'; state.authLoading=false; return; }
    accounts[uname]={pinHash};
    saveLocalAccounts(accounts);
    // Sync to Supabase (best effort)
    try { supaInsert('jtj_players',{username:uname,pin_hash:pinHash}); } catch(e){}
    finishAuth(uname);
  } else {
    if(accounts[uname]){
      // Found locally
      if(accounts[uname].pinHash!==pinHash){ state.authError='Wrong PIN'; state.authLoading=false; return; }
      finishAuth(uname);
    } else {
      // Not in localStorage — check Supabase (handles cross-device login)
      supaSelect('jtj_players', { username: uname })
        .then(rows => {
          if(!rows || rows.length===0){ state.authError='User not found'; state.authLoading=false; return; }
          if(rows[0].pin_hash!==pinHash){ state.authError='Wrong PIN'; state.authLoading=false; return; }
          // Cache locally for next time
          accounts[uname]={pinHash};
          saveLocalAccounts(accounts);
          finishAuth(uname);
        })
        .catch(()=>{ state.authError='Network error — try again'; state.authLoading=false; });
    }
  }
}

function finishAuth(uname){
  const session={username:uname};
  saveAuthSession(session); state.authUser=session;
  loadOrCreateProfileForUser(uname);
  state.authLoading=false; state.authPin='';
  state.screen='splash';
}

function playAsGuest() {
  // Temporary session — not saved to localStorage, won't persist on reload
  state.authUser = { username: 'GUEST', isGuest: true };
  state.authPin = ''; state.authError = '';
  loadOrCreateProfileForUser('GUEST');
  state.screen = 'start';
}

function drawSplashScreen() {
  // ── Background ────────────────────────────────
  ctx.fillStyle = '#12121e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Scattered stars ───────────────────────────
  const starSeeds = [
    [42,110,2.2],[180,60,1.5],[310,30,1],[60,290,1.8],[340,210,1.2],
    [20,420,1],[280,380,1.4],[90,500,1.8],[350,490,1],[155,200,1.2],
    [260,160,1],[70,650,1.5],[330,600,1.2],[200,700,1],[120,740,1.8],
  ];
  for (const [sx,sy,sr] of starSeeds) {
    ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fill();
  }

  // ── Gold five-pointed stars ───────────────────
  function drawGoldStar(gx,gy,gr) {
    ctx.save(); ctx.translate(gx,gy);
    ctx.beginPath();
    for (let p=0;p<5;p++) {
      const outerA = (p*4*Math.PI/5)-Math.PI/2;
      const innerA = outerA+Math.PI/5;
      if (p===0) ctx.moveTo(Math.cos(outerA)*gr,Math.sin(outerA)*gr);
      else ctx.lineTo(Math.cos(outerA)*gr,Math.sin(outerA)*gr);
      ctx.lineTo(Math.cos(innerA)*gr*0.4,Math.sin(innerA)*gr*0.4);
    }
    ctx.closePath();
    ctx.fillStyle='#f0c830'; ctx.fill();
    ctx.restore();
  }
  drawGoldStar(62, 120, 16);
  drawGoldStar(104, 490, 12);
  drawGoldStar(298, 640, 10);

  // ── Jupiter (upper-right, large, partially clipped) ──
  ctx.save();
  const jx=360, jy=175, jr=175;
  ctx.beginPath(); ctx.arc(jx,jy,jr,0,Math.PI*2); ctx.clip();

  // Base
  const jBase=ctx.createRadialGradient(jx-jr*0.3,jy-jr*0.3,jr*0.1,jx,jy,jr);
  jBase.addColorStop(0,'#f0c090'); jBase.addColorStop(0.4,'#d4884a');
  jBase.addColorStop(0.7,'#c06030'); jBase.addColorStop(1,'#7a3010');
  ctx.fillStyle=jBase; ctx.fillRect(jx-jr,jy-jr,jr*2,jr*2);

  // Bands
  const bands=[
    {y:-0.55,h:0.10,c:'rgba(240,200,150,0.55)'},
    {y:-0.30,h:0.14,c:'rgba(160,80,30,0.5)'},
    {y:-0.05,h:0.18,c:'rgba(230,170,100,0.5)'},
    {y:0.20,h:0.10,c:'rgba(140,60,20,0.45)'},
    {y:0.45,h:0.16,c:'rgba(200,130,70,0.4)'},
  ];
  for (const b of bands) {
    ctx.fillStyle=b.c;
    ctx.fillRect(jx-jr,jy+b.y*jr,jr*2+10,b.h*jr);
  }
  // Red spot
  ctx.save(); ctx.translate(jx+jr*0.12,jy+jr*0.1); ctx.scale(1.7,1);
  const spot=ctx.createRadialGradient(0,0,0,0,0,jr*0.14);
  spot.addColorStop(0,'rgba(180,40,10,0.85)'); spot.addColorStop(1,'rgba(200,80,30,0)');
  ctx.beginPath(); ctx.arc(0,0,jr*0.14,0,Math.PI*2); ctx.fillStyle=spot; ctx.fill();
  ctx.restore();
  // Limb darkening
  const limb=ctx.createRadialGradient(jx,jy,jr*0.5,jx,jy,jr);
  limb.addColorStop(0,'rgba(0,0,0,0)'); limb.addColorStop(1,'rgba(0,0,0,0.6)');
  ctx.fillStyle=limb; ctx.fillRect(jx-jr,jy-jr,jr*2,jr*2);
  ctx.restore();
  // Dark border ring
  ctx.beginPath(); ctx.arc(jx,jy,jr,0,Math.PI*2);
  ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=6; ctx.stroke();

  // ── Small asteroid (upper-left) ───────────────
  ctx.save(); ctx.translate(88,158); ctx.rotate(-0.35);
  // Speed trail
  for (let t=1;t<=3;t++) {
    ctx.beginPath(); ctx.ellipse(-t*14,0,22-t*3,10-t*2,0,0,Math.PI*2);
    ctx.fillStyle=`rgba(80,80,100,${0.12-t*0.03})`; ctx.fill();
  }
  // Body
  const aGrd=ctx.createRadialGradient(-4,-4,2,0,0,22);
  aGrd.addColorStop(0,'#7a7888'); aGrd.addColorStop(1,'#3a3848');
  ctx.beginPath(); ctx.ellipse(0,0,22,14,0,0,Math.PI*2);
  ctx.fillStyle=aGrd; ctx.fill();
  // Craters
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(-6,2,5,4,0.3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(8,-3,3.5,3,-.2,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // ── Tilted rocket (center of canvas) ─────────
  ctx.save();
  ctx.translate(155, 455);
  ctx.rotate(0.22); // ~13 degrees clockwise
  drawRocket(0, 0);
  ctx.restore();

  // ── Bottom text panel ─────────────────────────
  // Decorative horizontal rules
  const rulesY = 620;
  ctx.strokeStyle = '#c04820';
  ctx.lineWidth   = 1.5;
  // Left rule
  ctx.beginPath(); ctx.moveTo(18, rulesY); ctx.lineTo(130, rulesY); ctx.stroke();
  ctx.fillStyle='#c04820'; ctx.fillRect(14,rulesY-4,8,8); // end square
  // Right rule
  ctx.beginPath(); ctx.moveTo(260, rulesY); ctx.lineTo(372, rulesY); ctx.stroke();
  ctx.fillStyle='#c04820'; ctx.fillRect(368,rulesY-4,8,8);

  // "JOURNEY TO"
  ctx.fillStyle    = '#d05828';
  ctx.font         = 'bold 22px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('JOURNEY  TO', CANVAS_W / 2, 614);

  // "JUPITER"
  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 82px serif';
  ctx.textBaseline = 'top';
  ctx.fillText('JUPITER', CANVAS_W / 2, 632);

  // Fade-out hint (tap to skip)
  const fadeAlpha = Math.min(1, state.splashTimer * 0.8) * 0.45;
  ctx.fillStyle    = `rgba(255,255,255,${fadeAlpha})`;
  ctx.font         = '13px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('tap to continue', CANVAS_W / 2, CANVAS_H - 30);

  // Countdown progress bar at very bottom
  const frac = Math.max(0, state.splashTimer / 5.0);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, CANVAS_H - 4, CANVAS_W, 4);
  ctx.fillStyle = 'rgba(200,80,40,0.7)';
  ctx.fillRect(0, CANVAS_H - 4, CANVAS_W * frac, 4);
}


function drawProfileScreen() {
  profileButtons.length = 0;

  // Dark background + subtle stars
  ctx.fillStyle = '#12121e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const s of starsFar) {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,210,255,${s.alpha * 0.35})`; ctx.fill();
  }

  // Header
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(200,150,100,0.55)';
  ctx.font         = '11px monospace';
  ctx.fillText('JOURNEY  TO  JUPITER', CANVAS_W / 2, 30);

  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 28px monospace';
  ctx.fillText('SELECT PILOT', CANVAS_W / 2, 65);

  ctx.strokeStyle = '#ff6b35'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 108, 82); ctx.lineTo(CANVAS_W / 2 + 108, 82);
  ctx.stroke();

  // ── Profile cards ────────────────────────────
  const profiles = loadProfiles();
  const CARD_X = 18, CARD_W = CANVAS_W - 36, CARD_H = 132, CARD_GAP = 10;
  const GRID_Y  = 96;

  for (let i = 0; i < MAX_PROFILES; i++) {
    const p      = profiles[i];
    const cardY  = GRID_Y + i * (CARD_H + CARD_GAP);
    const isSel  = profileScreen.selectedIdx === i;

    // Card bg
    ctx.beginPath(); ctx.roundRect(CARD_X, cardY, CARD_W, CARD_H, 14);
    ctx.fillStyle = p
      ? (isSel ? 'rgba(55,15,5,0.97)' : 'rgba(18,18,34,0.90)')
      : 'rgba(13,13,26,0.72)';
    ctx.fill();
    ctx.strokeStyle = isSel ? '#ff6b35' : (p ? 'rgba(70,70,110,0.45)' : 'rgba(55,55,88,0.3)');
    ctx.lineWidth   = isSel ? 2.5 : 1;
    ctx.stroke();

    if (p) {
      // Rocket preview
      ctx.save();
      ctx.translate(CARD_X + 68, cardY + CARD_H / 2 + 8);
      ctx.scale(0.52, 0.52);
      drawRocket(0, 0, ROCKETS.find(r => r.id === p.equippedRocket) || ROCKETS[0]);
      ctx.restore();

      // Checkmark badge (selected)
      if (isSel) {
        ctx.beginPath(); ctx.arc(CARD_X + CARD_W - 22, cardY + 22, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6b35'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✓', CARD_X + CARD_W - 22, cardY + 22);
      }

      const tx = CARD_X + 118;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

      // Name
      ctx.fillStyle = '#ffffff';
      ctx.font      = 'bold 17px monospace';
      ctx.fillText(p.name, tx, cardY + 26);

      // Rank badge
      const rank  = getProfileRank(p);
      const badgeW = ctx.measureText(rank).width + 18;
      ctx.beginPath(); ctx.roundRect(tx, cardY + 40, badgeW, 20, 10);
      ctx.fillStyle = isSel ? '#b83a18' : '#2a2a48'; ctx.fill();
      ctx.fillStyle = isSel ? '#fff' : '#9090b8';
      ctx.font      = 'bold 10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(rank, tx + 9, cardY + 50);

      // COINS label
      ctx.fillStyle    = 'rgba(255,255,255,0.38)';
      ctx.font         = '10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText('COINS', tx, cardY + 76);

      // Coin value
      ctx.fillStyle = '#cc88ff';
      ctx.font      = 'bold 22px monospace';
      ctx.fillText((p.coins || 0).toLocaleString(), tx, cardY + 98);

      // Rocket name
      const rName = (ROCKETS.find(r => r.id === p.equippedRocket) || ROCKETS[0]).name;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font      = '10px monospace';
      ctx.fillText(`ROCKET · ${rName}`, tx, cardY + 117);

      profileButtons.push({ action: 'select', idx: i, x: CARD_X + CARD_W / 2, y: cardY + CARD_H / 2, w: CARD_W, h: CARD_H });

    } else {
      // Empty slot
      const cx2 = CARD_X + 68, cy2 = cardY + CARD_H / 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(110,110,150,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle    = 'rgba(130,130,165,0.45)';
      ctx.font         = 'bold 30px monospace';
      ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', cx2, cy2 + 1);

      ctx.fillStyle    = 'rgba(185,185,215,0.55)';
      ctx.font         = 'bold 13px monospace';
      ctx.textAlign    = 'left';
      ctx.fillText('NEW  PILOT', CARD_X + 118, cardY + CARD_H / 2 - 11);
      ctx.fillStyle = 'rgba(135,135,168,0.42)';
      ctx.font      = '11px monospace';
      ctx.fillText('tap to create a new save slot', CARD_X + 118, cardY + CARD_H / 2 + 12);

      profileButtons.push({ action: 'new', idx: i, x: CARD_X + CARD_W / 2, y: cardY + CARD_H / 2, w: CARD_W, h: CARD_H });
    }
  }

  // ── Bottom section ────────────────────────────
  ctx.textBaseline = 'alphabetic';
  const selP = profiles[profileScreen.selectedIdx];

  const BOTTOM_Y = GRID_Y + MAX_PROFILES * (CARD_H + CARD_GAP) + 12;

  if (selP) {
    // "NAME IS SELECTED" label
    ctx.fillStyle = 'rgba(200,180,148,0.5)';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${selP.name} IS SELECTED`, CANVAS_W / 2, BOTTOM_Y + 20);

    // Three action buttons
    const BW = 108, BH = 44, BGAP = 7;
    const totalW = 3 * BW + 2 * BGAP;
    const bLeft  = (CANVAS_W - totalW) / 2;
    const BY     = BOTTOM_Y + 32;
    const actions = [
      { action: 'delete',      label: '✕  DELETE'  },
      { action: 'viewprofile', label: '≡  PROFILE' },
      { action: 'rename',      label: '✎  RENAME'  },
    ];
    actions.forEach((ab, ai) => {
      const bx = bLeft + ai * (BW + BGAP) + BW / 2;
      const by = BY + BH / 2;
      ctx.beginPath(); ctx.roundRect(bx - BW / 2, BY, BW, BH, 10);
      ctx.fillStyle = 'rgba(22,22,42,0.9)'; ctx.fill();
      ctx.strokeStyle = 'rgba(90,90,130,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle    = 'rgba(200,200,230,0.72)';
      ctx.font         = 'bold 11px monospace';
      ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ab.label, bx, by);
      profileButtons.push({ action: ab.action, idx: profileScreen.selectedIdx, x: bx, y: by, w: BW, h: BH });
    });

    // LAUNCH button
    const LY = BY + BH + 16;
    const lg = ctx.createLinearGradient(18, LY, CANVAS_W - 18, LY);
    lg.addColorStop(0,   '#dd3a08');
    lg.addColorStop(0.5, '#ff7030');
    lg.addColorStop(1,   '#dd3a08');
    ctx.beginPath(); ctx.roundRect(18, LY, CANVAS_W - 36, 66, 14);
    ctx.fillStyle = lg; ctx.fill();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 22px monospace';
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('L A U N C H   →', CANVAS_W / 2, LY + 33);
    profileButtons.push({ action: 'launch', idx: profileScreen.selectedIdx, x: CANVAS_W / 2, y: LY + 33, w: CANVAS_W - 36, h: 66 });

  } else {
    ctx.fillStyle    = 'rgba(160,160,190,0.38)';
    ctx.font         = '13px monospace';
    ctx.textAlign    = 'center';
    ctx.fillText('select or create a pilot to play', CANVAS_W / 2, BOTTOM_Y + 30);
  }
}

function drawStartScreen() {
  drawDayScene(0);

  // ── Rocket on pad ─────────────────────────────
  const padCX   = CANVAS_W / 2;
  const rocketCY = 652 - 37;
  drawRocket(padCX, rocketCY);

  // ── Title panel ───────────────────────────────
  ctx.fillStyle = 'rgba(0, 0, 20, 0.55)';
  ctx.beginPath();
  ctx.roundRect(28, 44, CANVAS_W - 56, 128, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 190, 60, 0.45)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.fillStyle    = '#ffe090';
  ctx.font         = 'bold 30px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JOURNEY TO', CANVAS_W / 2, 90);

  ctx.fillStyle = '#ff9030';
  ctx.font      = 'bold 58px monospace';
  ctx.fillText('JUPITER', CANVAS_W / 2, 144);

  // ── LAUNCH ROCKET button ──────────────────────
  const btn   = LAUNCH_BTN;
  const pulse = 0.65 + 0.35 * Math.sin(gameTime * 3.2);
  ctx.shadowColor = '#ff6020';
  ctx.shadowBlur  = 18 * pulse;

  ctx.beginPath();
  ctx.roundRect(btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h, btn.h / 2);
  const btnGrad = ctx.createLinearGradient(btn.x - btn.w / 2, btn.y, btn.x + btn.w / 2, btn.y);
  btnGrad.addColorStop(0,   '#b83200');
  btnGrad.addColorStop(0.5, '#ff5c18');
  btnGrad.addColorStop(1,   '#b83200');
  ctx.fillStyle = btnGrad;
  ctx.fill();
  ctx.strokeStyle = '#ffaa50';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 21px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LAUNCH ROCKET', btn.x, btn.y);
  ctx.textBaseline = 'alphabetic';

  // ── Icon buttons (top-right area) ─────────────
  function drawIconBtn(btn, emoji) {
    ctx.fillStyle = 'rgba(0, 0, 20, 0.55)';
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ccccdd';
    ctx.fillText(emoji, btn.x, btn.y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  drawIconBtn(SHOP_BTN,        '🛒');
  drawIconBtn(LEADERBOARD_BTN, '🏆');
  drawIconBtn(SETTINGS_BTN,    '⚙');
  drawIconBtn(PROFILE_BTN,     '🚀');
  drawIconBtn(TUTORIAL_BTN,    '?');

  // ── Daily Spin banner ────────────────────────
  {
    const bx=WHEEL_BTN.x-WHEEL_BTN.w/2, by=WHEEL_BTN.y-WHEEL_BTN.h/2;
    const bw=WHEEL_BTN.w, bh=WHEEL_BTN.h;
    const ready=canSpinToday();
    const pulse=0.55+0.45*Math.sin(gameTime*3.8);
    // Glow
    if(ready){ ctx.shadowColor='#ffd700'; ctx.shadowBlur=14*pulse; }
    // Background
    ctx.beginPath();ctx.roundRect(bx,by,bw,bh,14);
    if(ready){
      const g=ctx.createLinearGradient(bx,by,bx+bw,by);
      g.addColorStop(0,`hsla(${(gameTime*40)%360},80%,25%,0.92)`);
      g.addColorStop(0.5,`hsla(${(gameTime*40+120)%360},80%,22%,0.92)`);
      g.addColorStop(1,`hsla(${(gameTime*40+240)%360},80%,25%,0.92)`);
      ctx.fillStyle=g;
    } else {
      ctx.fillStyle='rgba(20,20,30,0.80)';
    }
    ctx.fill();
    ctx.strokeStyle=ready?`hsla(${(gameTime*60)%360},100%,65%,0.9)`:'rgba(80,80,100,0.4)';
    ctx.lineWidth=2;ctx.stroke();
    ctx.shadowBlur=0;
    // Icon
    ctx.font='22px monospace';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText('🎡', bx+14, by+bh/2);
    // Label
    ctx.font='bold 15px monospace';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillStyle=ready?'#ffffff':'#666688';
    ctx.fillText('DAILY SPIN', bx+48, by+bh/2-8);
    ctx.font='bold 11px monospace';
    ctx.fillStyle=ready?'#aaffaa':'#aa8888';
    ctx.fillText(ready?'Spin available!':'Come back tomorrow', bx+48, by+bh/2+10);
    // Arrow
    ctx.font='bold 18px monospace';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillStyle=ready?'rgba(255,255,255,0.7)':'rgba(80,80,100,0.5)';
    ctx.fillText('›', bx+bw-14, by+bh/2);
  }

  // Coin balance — top-left corner
  const coinTotal = state.coins;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(12, 18, 94, 36, 18);
  ctx.fill();
  ctx.font         = 'bold 17px monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffd700';
  ctx.fillText(`🪙 ${coinTotal}`, 22, 36);
  ctx.restore();

  // ── Daily challenge card ─────────────────────
  const dc = state.dailyChallenge;
  if (dc && !state.dailyChallengeHidden) {
    const cX = CANVAS_W / 2, cY = CANVAS_H - 138;
    const cW = CANVAS_W - 40, cH = 62, cR = 14;
    const cL = cX - cW / 2, cT = cY - cH / 2;
    ctx.save();
    // background + border
    ctx.fillStyle = dc.completed ? 'rgba(0,40,10,0.88)' : 'rgba(10,10,35,0.88)';
    ctx.beginPath(); ctx.roundRect(cL, cT, cW, cH, cR); ctx.fill();
    ctx.strokeStyle = dc.completed ? '#44dd66' : 'rgba(100,120,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cL, cT, cW, cH, cR); ctx.stroke();
    ctx.textBaseline = 'middle';
    // top row: label (left) + reward (right)
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = dc.completed ? '#44ff88' : '#8899ff';
    ctx.textAlign = 'left';
    ctx.fillText('DAILY CHALLENGE', cL + 12, cT + 16);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(dc.completed ? 'DONE!' : `+${dc.reward} coins`, cL + cW - 12, cT + 16);
    // description row
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = dc.completed ? '#aaffcc' : '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(dc.desc, cL + 12, cT + 36);
    // progress bar
    if (!dc.completed) {
      const prog = Math.min(1, dc.progress / dc.target);
      const bX = cL + 12, bY = cT + cH - 10, bW = cW - 24, bH = 5;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 3); ctx.fill();
      ctx.fillStyle = '#6688ff';
      if (prog > 0) { ctx.beginPath(); ctx.roundRect(bX, bY, bW * prog, bH, 3); ctx.fill(); }
    }
    // ✕ dismiss button — top-right corner
    const xBtnX = cL + cW - 2, xBtnY = cT + 2;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(xBtnX, xBtnY, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    const d = 3.5;
    ctx.beginPath(); ctx.moveTo(xBtnX - d, xBtnY - d); ctx.lineTo(xBtnX + d, xBtnY + d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xBtnX + d, xBtnY - d); ctx.lineTo(xBtnX - d, xBtnY + d); ctx.stroke();
    ctx.restore();
  }

  // ── Achievement notifications ─────────────────
  if (state.newAchievements && state.newAchievements.length > 0) {
    const ach = state.newAchievements[0]; // show one at a time
    if (!state.achPopupLife) state.achPopupLife = 4.0;
    if (state.achPopupLife > 0) {
      const alpha = Math.min(1, state.achPopupLife, (4 - state.achPopupLife + 0.3) * 6);
      const aY = CANVAS_H * 0.58;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(40,30,0,0.90)';
      ctx.beginPath(); ctx.roundRect(CANVAS_W/2 - 130, aY - 36, 260, 72, 16); ctx.fill();
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(CANVAS_W/2 - 130, aY - 36, 260, 72, 16); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace';
      ctx.fillText('🏆 ACHIEVEMENT UNLOCKED', CANVAS_W/2, aY - 16);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace';
      ctx.fillText(ach.name, CANVAS_W/2, aY + 4);
      ctx.fillStyle = '#aaaacc'; ctx.font = '11px monospace';
      ctx.fillText(`${ach.desc}  •  +${ach.reward}🪙`, CANVAS_W/2, aY + 22);
      ctx.restore();
    }
  }

  // ── Daily bonus popup ────────────────────────
  const db = state.dailyBonus;
  if (db && db.show && db.life > 0) {
    const alpha  = Math.min(1, db.life, (5 - db.life + 0.5) * 4); // fade in + fade out
    const cy     = CANVAS_H * 0.38;
    ctx.save();
    ctx.globalAlpha = alpha;
    // card
    ctx.fillStyle = 'rgba(10,30,10,0.88)';
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2 - 120, cy - 44, 240, 88, 18); ctx.fill();
    ctx.strokeStyle = '#44dd66'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(CANVAS_W/2 - 120, cy - 44, 240, 88, 18); ctx.stroke();
    // headline
    ctx.fillStyle = '#44ff88'; ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const streakLabel = db.streak > 1 ? ` — DAY ${db.streak} STREAK 🔥` : '';
    ctx.fillText(`DAILY LOGIN${streakLabel}`, CANVAS_W/2, cy - 18);
    // coin award
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 26px monospace';
    ctx.fillText(`+${db.coins} 🪙`, CANVAS_W/2, cy + 14);
    ctx.restore();
  }
}

// ── Shared daytime scene (sky + terrain + pad) ─
// yOffset scrolls the whole scene downward (used during launch animation)
function drawDayScene(yOffset) {
  ctx.save();
  ctx.translate(0, yOffset);

  // Sky gradient (drawn tall enough to cover canvas even when shifted)
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0,    '#1560a8');
  sky.addColorStop(0.4,  '#4aa3e0');
  sky.addColorStop(0.68, '#a8d4f0');
  sky.addColorStop(0.78, '#f0c840');
  sky.addColorStop(0.88, '#e07020');
  sky.addColorStop(1,    '#b84010');
  ctx.fillStyle = sky;
  ctx.fillRect(0, -yOffset, CANVAS_W, CANVAS_H + Math.abs(yOffset) + 100);

  // Sun
  const sunX = 310, sunY = 115, sunR = 46;
  const sunHalo = ctx.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, sunR * 2.8);
  sunHalo.addColorStop(0, 'rgba(255, 240, 120, 0.35)');
  sunHalo.addColorStop(1, 'rgba(255, 200, 50,  0)');
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 2.8, 0, Math.PI * 2);
  ctx.fillStyle = sunHalo;
  ctx.fill();

  ctx.save();
  ctx.translate(sunX, sunY);
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI * 2 / 16);
    ctx.beginPath();
    ctx.moveTo(0, sunR + 5);
    ctx.lineTo(-3, sunR + 22);
    ctx.lineTo(3, sunR + 22);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 230, 80, 0.45)';
    ctx.fill();
  }
  ctx.restore();

  const sunDisk = ctx.createRadialGradient(sunX - 14, sunY - 14, 2, sunX, sunY, sunR);
  sunDisk.addColorStop(0,    '#fffde8');
  sunDisk.addColorStop(0.55, '#ffe050');
  sunDisk.addColorStop(1,    '#ffc020');
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = sunDisk;
  ctx.fill();

  // Clouds
  drawCloud(70,  220, 0.88);
  drawCloud(255, 270, 0.72);
  drawCloud(155, 340, 0.80);
  drawCloud(330, 355, 0.60);
  drawCloud(30,  390, 0.50);

  // Far mountains
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H);
  ctx.lineTo(0, 580);
  ctx.bezierCurveTo(40,  540, 90,  510, 130, 520);
  ctx.bezierCurveTo(170, 530, 195, 495, 230, 488);
  ctx.bezierCurveTo(265, 482, 295, 508, 335, 500);
  ctx.bezierCurveTo(365, 494, 385, 520, 390, 512);
  ctx.lineTo(390, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(110, 135, 175, 0.60)';
  ctx.fill();

  // Mid mountains
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H);
  ctx.lineTo(0, 610);
  ctx.bezierCurveTo(25, 572, 65, 548, 105, 554);
  ctx.bezierCurveTo(145, 560, 168, 530, 205, 526);
  ctx.bezierCurveTo(240, 522, 270, 540, 308, 534);
  ctx.bezierCurveTo(342, 528, 375, 548, 390, 540);
  ctx.lineTo(390, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(60, 90, 55, 0.78)';
  ctx.fill();

  // Near hills
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_H);
  ctx.lineTo(0, 635);
  ctx.bezierCurveTo(35, 618, 80, 600, 118, 604);
  ctx.bezierCurveTo(155, 608, 178, 588, 195, 592);
  ctx.bezierCurveTo(212, 596, 240, 604, 280, 600);
  ctx.bezierCurveTo(320, 596, 360, 610, 390, 604);
  ctx.lineTo(390, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = '#2a5c1e';
  ctx.fill();

  // Ground
  const groundGrad = ctx.createLinearGradient(0, 648, 0, CANVAS_H);
  groundGrad.addColorStop(0,   '#358024');
  groundGrad.addColorStop(0.2, '#2a5c1e');
  groundGrad.addColorStop(1,   '#163010');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, 648, CANVAS_W, CANVAS_H - 648 + 60);  // extra 60 covers seam

  // Launchpad
  const padCX   = CANVAS_W / 2;
  const padTopY = 652;
  const padW    = 124;
  const padH    = 22;

  ctx.strokeStyle = '#8a8a96';
  ctx.lineWidth   = 7;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(padCX - padW * 0.34, padTopY + padH);
  ctx.lineTo(padCX - padW * 0.54, padTopY + padH + 38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(padCX + padW * 0.34, padTopY + padH);
  ctx.lineTo(padCX + padW * 0.54, padTopY + padH + 38);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(padCX - padW * 0.48, padTopY + padH + 22);
  ctx.lineTo(padCX + padW * 0.48, padTopY + padH + 22);
  ctx.stroke();

  const padGrad = ctx.createLinearGradient(0, padTopY, 0, padTopY + padH);
  padGrad.addColorStop(0,   '#c8c8d0');
  padGrad.addColorStop(0.5, '#e0e0e8');
  padGrad.addColorStop(1,   '#a8a8b0');
  ctx.fillStyle = padGrad;
  ctx.beginPath();
  ctx.roundRect(padCX - padW / 2, padTopY, padW, padH, 4);
  ctx.fill();
  ctx.strokeStyle = '#909098';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(padCX, padTopY + padH * 0.55, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warning lights
  const blinkA = Math.sin(gameTime * Math.PI * 2.5) > 0;
  drawWarningLight(padCX - padW * 0.38, padTopY - 3, blinkA);
  drawWarningLight(padCX + padW * 0.38, padTopY - 3, !blinkA);

  // Idle steam wisps
  const wisp = 0.10 + 0.06 * Math.sin(gameTime * 2.2);
  for (let i = 0; i < 5; i++) {
    const wx = padCX + (i - 2) * 20 + Math.sin(gameTime * 1.5 + i * 1.3) * 4;
    const wy = padTopY - 8 + Math.sin(gameTime * 1.8 + i) * 6;
    const wr = 12 + i * 3.5;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240, 245, 255, ${wisp})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── Launch animation (takeoff + transition to space) ──
function drawLaunchAnim() {
  const raw      = Math.min(launchAnim.t, LAUNCH_DURATION);
  // liftFrac: 0 during rumble (first 0.35s), then ramps 0→1 for the flight
  const liftRaw  = Math.max(0, raw - 0.35);
  const liftFrac = Math.min(liftRaw / (LAUNCH_DURATION - 0.35), 1);

  // How much space/stars to show (0 = none, 1 = full)
  const spaceAlpha = Math.pow(Math.max(0, (liftFrac - 0.08) / 0.75), 1.5);
  // How opaque the day scene still is
  const dayAlpha   = Math.max(0, 1 - spaceAlpha * 1.5);
  // How far the terrain scrolls downward (px)
  const sceneOff   = liftFrac * liftFrac * 750;

  // ── 1. Space background (always underneath) ────
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0,   '#000008');
  bg.addColorStop(0.4, '#080420');
  bg.addColorStop(1,   '#1a0a50');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── 2. Background stars fading in ─────────────
  if (spaceAlpha > 0.01) {
    ctx.globalAlpha = spaceAlpha;
    for (const s of starsFar) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,210,255,${s.alpha})`;
      ctx.fill();
    }
    for (const s of starsNear) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── 3. Daytime scene scrolling down + fading ───
  if (dayAlpha > 0.01) {
    ctx.globalAlpha = dayAlpha;
    drawDayScene(sceneOff);
    ctx.globalAlpha = 1;
  }

  // ── 4. Launch exhaust plume ────────────────────
  const padCX  = CANVAS_W / 2;
  const plumeY = 652 + sceneOff;   // follows pad as it slides off
  if (plumeY < CANVAS_H + 80) {
    // Orange glow at nozzle base
    const glowR = 55 + liftFrac * 40;
    const glow  = ctx.createRadialGradient(padCX, plumeY, 0, padCX, plumeY, glowR);
    glow.addColorStop(0,   'rgba(255, 230, 80, 0.85)');
    glow.addColorStop(0.35, 'rgba(255, 110, 20, 0.45)');
    glow.addColorStop(1,   'rgba(255, 60, 0, 0)');
    ctx.beginPath();
    ctx.arc(padCX, plumeY, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Billowing smoke rings expanding outward
    const smokeAlpha = Math.max(0, 0.22 - liftFrac * 0.12);
    for (let i = 0; i < 9; i++) {
      const angle  = (i / 9) * Math.PI * 2 + gameTime * 0.8;
      const spread = 28 + liftFrac * 80;
      const sx = padCX + Math.cos(angle) * spread;
      const sy = plumeY + Math.sin(angle * 0.6) * spread * 0.4 + spread * 0.25;
      const sr = 22 + Math.sin(gameTime * 2.5 + i) * 6 + liftFrac * 22;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210, 215, 230, ${smokeAlpha})`;
      ctx.fill();
    }
  }

  // ── 5. Rocket flying upward ────────────────────
  const rocketY = 615 - 1050 * liftFrac * liftFrac;
  // Rumble shake before liftoff
  const rumbleX = raw < 0.38 ? Math.sin(gameTime * 55) * 5 * (1 - raw / 0.38) : 0;
  if (rocketY > -200) {
    drawRocket(padCX + rumbleX, rocketY);
  }
}

// Small helper: one pulsing red warning light
function drawWarningLight(x, y, lit) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  if (lit) {
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#ff2200';
  } else {
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#550000';
  }
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Puffy cloud at (cx, cy) with given opacity
function drawCloud(cx, cy, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  const blobs = [
    { dx:  0,   dy:  0,  r: 22 },
    { dx:  26,  dy:  8,  r: 17 },
    { dx: -24,  dy:  9,  r: 15 },
    { dx:  12,  dy: -10, r: 19 },
    { dx: -11,  dy: -9,  r: 17 },
    { dx:  40,  dy:  2,  r: 12 },
    { dx: -38,  dy:  3,  r: 11 },
  ];
  for (const b of blobs) {
    ctx.moveTo(cx + b.dx + b.r, cy + b.dy);
    ctx.arc(cx + b.dx, cy + b.dy, b.r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

// ── Zone background colour blending ──────────
function getZoneBgColors() {
  const score = state.score;
  // Which two palette slots are we between?
  let lo = 0;
  for (let i = 0; i < ZONE_THRESHOLDS.length - 1; i++) {
    if (score >= ZONE_THRESHOLDS[i]) lo = i;
  }
  const hi   = Math.min(lo + 1, ZONE_PALETTES.length - 1);
  const low  = ZONE_THRESHOLDS[lo];
  const high = ZONE_THRESHOLDS[hi] ?? low + 500;
  const frac = hi === lo ? 0 : Math.min((score - low) / (high - low), 1);

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const mix  = (a, b) => a.map((v, i) => lerp(v, b[i], frac));

  const t = mix(ZONE_PALETTES[lo].t, ZONE_PALETTES[hi].t);
  const m = mix(ZONE_PALETTES[lo].m, ZONE_PALETTES[hi].m);
  const b = mix(ZONE_PALETTES[lo].b, ZONE_PALETTES[hi].b);
  return { t: t.join(','), m: m.join(','), b: b.join(',') };
}

// ── Nebula wisps (zone 2+) ────────────────────
function drawNebula() {
  if (state.backgroundZone < 2) return;

  // Fade in over the first 200 points of zone 2
  const raw   = Math.min((state.score - ZONE_THRESHOLDS[1]) / 200, 1);
  const alpha = raw * 0.18;

  // Purple cloud — upper-left
  const n1 = ctx.createRadialGradient(70, 180, 0, 70, 180, 130);
  n1.addColorStop(0, `rgba(170, 80, 255, ${alpha})`);
  n1.addColorStop(1, 'rgba(170, 80, 255, 0)');
  ctx.fillStyle = n1;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Teal cloud — right side
  const n2 = ctx.createRadialGradient(330, 420, 0, 330, 420, 110);
  n2.addColorStop(0, `rgba(60, 200, 255, ${alpha * 0.8})`);
  n2.addColorStop(1, 'rgba(60, 200, 255, 0)');
  ctx.fillStyle = n2;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Zone 3: add a third pink cloud centre-top
  if (state.backgroundZone >= 3) {
    const raw3  = Math.min((state.score - ZONE_THRESHOLDS[2]) / 200, 1);
    const n3 = ctx.createRadialGradient(195, 120, 0, 195, 120, 150);
    n3.addColorStop(0, `rgba(255, 80, 160, ${raw3 * 0.14})`);
    n3.addColorStop(1, 'rgba(255, 80, 160, 0)');
    ctx.fillStyle = n3;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Zone 4: Jupiter glow peeks in from the top
  if (state.backgroundZone >= 4) {
    const raw4 = Math.min((state.score - ZONE_THRESHOLDS[3]) / 300, 1);
    const jGlow = ctx.createRadialGradient(CANVAS_W / 2, -30, 0, CANVAS_W / 2, -30, 220);
    jGlow.addColorStop(0,   `rgba(240, 160, 60, ${raw4 * 0.5})`);
    jGlow.addColorStop(0.5, `rgba(200, 100, 30, ${raw4 * 0.25})`);
    jGlow.addColorStop(1,   'rgba(200, 100, 30, 0)');
    ctx.fillStyle = jGlow;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

// ── Zone announce banner ──────────────────────
function drawZoneBanner() {
  const life = state.zoneAnnounce.life;
  // Fade in for first 0.4s, hold, fade out in last 0.6s
  const a = Math.min(life / 0.6, 1) * Math.min((2.5 - life) / 0.4, 1);
  // Slide down from above
  const slideY = CANVAS_H / 2 - 30 + (1 - Math.min(life / 0.4, 1)) * -20;

  ctx.save();
  ctx.globalAlpha = a;

  ctx.fillStyle = 'rgba(0, 0, 20, 0.75)';
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 160, slideY - 20, 320, 56, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 180, 255, 0.5)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.fillStyle    = '#a8c8ff';
  ctx.font         = 'bold 20px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.zoneAnnounce.text, CANVAS_W / 2, slideY + 8);

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawLevelBanner() {
  const life = state.levelAnnounce.life;
  const a    = Math.min(life / 0.4, 1) * Math.min((2.0 - life) / 0.5, 1);
  // Slide in from top, positioned lower than zone banner to avoid overlap
  const slideY = CANVAS_H / 2 + 50 + (1 - Math.min(life / 0.4, 1)) * 20;

  ctx.save();
  ctx.globalAlpha = a;

  ctx.fillStyle = 'rgba(10, 6, 0, 0.8)';
  ctx.beginPath();
  ctx.roundRect(CANVAS_W / 2 - 130, slideY - 18, 260, 50, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 220, 80, 0.7)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.fillStyle    = '#ffe066';
  ctx.font         = 'bold 22px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`⬆ LEVEL ${state.level}`, CANVAS_W / 2, slideY + 7);

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ── Rage-mode timer bar ───────────────────────
function drawRageBar() {
  const frac = Math.max(0, state.rageTimer / 12);
  const bw = 160, bh = 10;
  const bx = CANVAS_W / 2 - bw / 2;
  const by = 54;

  // Label
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = 'bold 11px monospace';
  // Pulsing red label
  const pulse = 0.8 + 0.2 * Math.sin(gameTime * 10);
  ctx.fillStyle = `rgba(255, 60, 0, ${pulse})`;
  ctx.fillText('🔥 RAGE MODE', CANVAS_W / 2, by - 8);

  // Track
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();

  // Fill
  const fillG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  fillG.addColorStop(0,   '#ff2000');
  fillG.addColorStop(0.5, '#ff6600');
  fillG.addColorStop(1,   '#ffaa00');
  ctx.fillStyle = fillG;
  ctx.beginPath(); ctx.roundRect(bx, by, bw * frac, bh, bh / 2); ctx.fill();

  ctx.textBaseline = 'alphabetic';
}

// ── HUD bar ───────────────────────────────────

function drawArrowButtons() {
  const btns = [
    { btn: ARROW_L, label: '◀', pressed: arrowTouch.left  },
    { btn: ARROW_R, label: '▶', pressed: arrowTouch.right },
  ];
  for (const { btn, label, pressed } of btns) {
    const alpha = pressed ? 0.75 : 0.35;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Background circle
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, 36, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,40,0.55)';
    ctx.fill();
    ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow label
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 26px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, btn.x, btn.y + 1);

    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
}

function drawExitBtn() {
  const { x, y, w, h } = EXIT_BTN;
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(0, 0, 20, 0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 12px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✕ EXIT', x, y);
  ctx.restore();
}

function drawHUD() {
  const HUD_H = 68;

  ctx.fillStyle = 'rgba(0, 0, 8, 0.6)';
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H);
  ctx.lineTo(CANVAS_W, HUD_H);
  ctx.stroke();

  // Row 1: Score + Lives
  drawHUDPill(CANVAS_W * 0.27, 20, `SCORE ${state.score}`, '#ff6b35', '#ffaa80');
  const hearts = '♥'.repeat(state.lives) + '○'.repeat(3 - state.lives);
  drawHUDPill(CANVAS_W * 0.73, 20, hearts, '#e03355', '#ff7090');

  // Row 2: Level + Timer
  drawHUDPill(CANVAS_W * 0.27, 50, `LEVEL ${state.level}`, '#5bcab8', '#7ed6c8');
  drawHUDPill(CANVAS_W * 0.73, 50, `⏱ ${formatTime(state.elapsedTime)}`, '#c8a0ff', '#ddc0ff');
}

function drawHUDPill(cx, cy, text, borderColor, textColor) {
  const pw = 112, ph = 30, r = 14;

  ctx.beginPath();
  ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, r);
  ctx.fillStyle = 'rgba(0, 0, 20, 0.7)';
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.fillStyle    = textColor;
  ctx.font         = 'bold 13px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.textBaseline = 'alphabetic';
}

// ── Draw the rocket ───────────────────────────

// ══════════════════════════════════════════════
//  Custom rocket skins
// ══════════════════════════════════════════════

function drawRocketRetro(x, y) {
  ctx.save(); ctx.translate(x, y);
  const bw=38,bh=58,nh=44,fw=24,fh=32,bt=-bh/2,bb=bh/2;
  // Antenna
  ctx.strokeStyle='#d4aa50'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,bt-nh); ctx.lineTo(0,bt-nh-20); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,bt-nh-23,4,0,Math.PI*2);
  ctx.fillStyle='#ffd060'; ctx.fill();
  // Wide swept fins
  const fL=ctx.createLinearGradient(-bw/2-fw,0,-bw/2,0);
  fL.addColorStop(0,'#7a5818'); fL.addColorStop(1,'#c09030');
  ctx.beginPath(); ctx.moveTo(-bw/2,bb-fh*0.55); ctx.lineTo(-bw/2-fw,bb+fh*0.75); ctx.lineTo(-bw/2,bb+4); ctx.closePath();
  ctx.fillStyle=fL; ctx.fill();
  const fR=ctx.createLinearGradient(bw/2,0,bw/2+fw,0);
  fR.addColorStop(0,'#c09030'); fR.addColorStop(1,'#7a5818');
  ctx.beginPath(); ctx.moveTo(bw/2,bb-fh*0.55); ctx.lineTo(bw/2+fw,bb+fh*0.75); ctx.lineTo(bw/2,bb+4); ctx.closePath();
  ctx.fillStyle=fR; ctx.fill();
  // Body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#7a6020'); bg.addColorStop(0.25,'#e8c870'); bg.addColorStop(0.75,'#d0aa50'); bg.addColorStop(1,'#7a6020');
  ctx.fillStyle=bg; ctx.fillRect(-bw/2,bt,bw,bh);
  // Nose
  ctx.beginPath(); ctx.moveTo(-bw/2,bt); ctx.quadraticCurveTo(-bw/2,bt-nh*0.55,0,bt-nh); ctx.quadraticCurveTo(bw/2,bt-nh*0.55,bw/2,bt); ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#7a2808'); ng.addColorStop(0.5,'#c04c18'); ng.addColorStop(1,'#7a2808');
  ctx.fillStyle=ng; ctx.fill();
  // Gold band
  ctx.fillStyle='#c49020'; ctx.fillRect(-bw/2,bt+bh*0.72,bw,8);
  ctx.fillStyle='#eebb44'; ctx.fillRect(-bw/2,bt+bh*0.87,bw,3);
  // Large porthole
  const py=bt+bh*0.22;
  ctx.beginPath(); ctx.arc(0,py,13,0,Math.PI*2); ctx.fillStyle='#5a3a10'; ctx.fill();
  ctx.beginPath(); ctx.arc(0,py,10,0,Math.PI*2);
  const gg=ctx.createRadialGradient(-3,py-3,1,0,py,10);
  gg.addColorStop(0,'#ffcc88'); gg.addColorStop(0.5,'#c07830'); gg.addColorStop(1,'#6a3410');
  ctx.fillStyle=gg; ctx.fill();
  ctx.beginPath(); ctx.arc(-3,py-3,3.5,0,Math.PI*2); ctx.fillStyle='rgba(255,200,100,0.5)'; ctx.fill();
  // Nozzle
  ctx.beginPath(); ctx.moveTo(-bw*0.38,bb); ctx.lineTo(bw*0.38,bb); ctx.lineTo(bw*0.48,bb+12); ctx.lineTo(-bw*0.48,bb+12); ctx.closePath();
  ctx.fillStyle='#6a5018'; ctx.fill();
  drawActiveTail(bb, bw, 12);
  ctx.restore();
}

function drawRocketStealth(x, y) {
  ctx.save(); ctx.translate(x, y);
  const bw=28,bh=60,nh=58,fw=15,fh=22,bt=-bh/2,bb=bh/2;
  // Slim swept fins
  const fL=ctx.createLinearGradient(-bw/2-fw,0,-bw/2,0);
  fL.addColorStop(0,'#12121a'); fL.addColorStop(1,'#222230');
  ctx.beginPath(); ctx.moveTo(-bw/2,bb-fh); ctx.lineTo(-bw/2-fw,bb+5); ctx.lineTo(-bw/2,bb+2); ctx.closePath(); ctx.fillStyle=fL; ctx.fill();
  const fR=ctx.createLinearGradient(bw/2,0,bw/2+fw,0);
  fR.addColorStop(0,'#222230'); fR.addColorStop(1,'#12121a');
  ctx.beginPath(); ctx.moveTo(bw/2,bb-fh); ctx.lineTo(bw/2+fw,bb+5); ctx.lineTo(bw/2,bb+2); ctx.closePath(); ctx.fillStyle=fR; ctx.fill();
  // Body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#14141e'); bg.addColorStop(0.3,'#2a2a3c'); bg.addColorStop(0.7,'#222232'); bg.addColorStop(1,'#14141e');
  ctx.fillStyle=bg; ctx.fillRect(-bw/2,bt,bw,bh);
  // Pencil-thin nose
  ctx.beginPath(); ctx.moveTo(-bw/2,bt); ctx.quadraticCurveTo(-bw/3,bt-nh*0.7,0,bt-nh); ctx.quadraticCurveTo(bw/3,bt-nh*0.7,bw/2,bt); ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#101018'); ng.addColorStop(0.5,'#242432'); ng.addColorStop(1,'#101018');
  ctx.fillStyle=ng; ctx.fill();
  // Green LED stripe + glow
  ctx.shadowColor='#00ff44'; ctx.shadowBlur=10;
  ctx.fillStyle='#00dd44'; ctx.fillRect(-bw/2+3,bt+bh*0.40,bw-6,5);
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(0,180,60,0.35)'; ctx.fillRect(-bw/2,bt+bh*0.60,bw,2);
  // Sensor porthole
  const py=bt+bh*0.20;
  ctx.beginPath(); ctx.arc(0,py,7,0,Math.PI*2); ctx.fillStyle='#0a1020'; ctx.fill();
  ctx.beginPath(); ctx.arc(0,py,5,0,Math.PI*2); ctx.fillStyle='#00993a'; ctx.fill();
  ctx.shadowColor='#00ff44'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.arc(0,py,3,0,Math.PI*2); ctx.fillStyle='#88ffaa'; ctx.fill();
  ctx.shadowBlur=0;
  // Nozzle
  ctx.beginPath(); ctx.moveTo(-bw*0.3,bb); ctx.lineTo(bw*0.3,bb); ctx.lineTo(bw*0.36,bb+10); ctx.lineTo(-bw*0.36,bb+10); ctx.closePath();
  ctx.fillStyle='#1a1a28'; ctx.fill();
  drawActiveTail(bb, bw, 10);
  ctx.restore();
}

function drawRocketAlien(x, y) {
  ctx.save(); ctx.translate(x, y);
  const bw=34,bh=52,nh=42,bt=-bh/2,bb=bh/2;
  // Antenna dot
  ctx.shadowColor='#00ff44'; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.arc(0,bt-nh-8,4,0,Math.PI*2); ctx.fillStyle='#88ff88'; ctx.fill();
  ctx.shadowBlur=0;
  // Organic leaf fins (ellipses)
  ctx.save();
  ctx.translate(-bw/2-10, bb-12); ctx.rotate(-0.32);
  ctx.beginPath(); ctx.ellipse(0,0,10,18,0,0,Math.PI*2);
  ctx.fillStyle='#185518'; ctx.fill(); ctx.strokeStyle='#268826'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(bw/2+10, bb-12); ctx.rotate(0.32);
  ctx.beginPath(); ctx.ellipse(0,0,10,18,0,0,Math.PI*2);
  ctx.fillStyle='#185518'; ctx.fill(); ctx.strokeStyle='#268826'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();
  // Body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#164416'); bg.addColorStop(0.3,'#287228'); bg.addColorStop(0.7,'#206020'); bg.addColorStop(1,'#164416');
  ctx.fillStyle=bg; ctx.fillRect(-bw/2,bt,bw,bh);
  // Rounded nose
  ctx.beginPath(); ctx.moveTo(-bw/2,bt); ctx.quadraticCurveTo(-bw/2,bt-nh*0.52,0,bt-nh); ctx.quadraticCurveTo(bw/2,bt-nh*0.52,bw/2,bt); ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#124412'); ng.addColorStop(0.5,'#247824'); ng.addColorStop(1,'#124412');
  ctx.fillStyle=ng; ctx.fill();
  // Decorative orbit ring
  ctx.strokeStyle='rgba(0,200,70,0.5)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(0,bt+bh*0.68,bw*0.52,bh*0.1,0,0,Math.PI*2); ctx.stroke();
  // Nose line pattern
  ctx.strokeStyle='rgba(80,210,80,0.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-bw*0.2,bt-6); ctx.quadraticCurveTo(0,bt-nh*0.48,bw*0.2,bt-6); ctx.stroke();
  // Glowing porthole
  const py=bt+bh*0.28;
  ctx.beginPath(); ctx.arc(0,py,12,0,Math.PI*2); ctx.fillStyle='#0c280c'; ctx.fill();
  ctx.strokeStyle='#20941a'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(0,py,9,0,Math.PI*2); ctx.stroke();
  ctx.shadowColor='#00ff44'; ctx.shadowBlur=14;
  ctx.beginPath(); ctx.arc(0,py,5,0,Math.PI*2); ctx.fillStyle='#44ff44'; ctx.fill();
  ctx.shadowBlur=0;
  ctx.beginPath(); ctx.arc(-2,py-2,2,0,Math.PI*2); ctx.fillStyle='rgba(200,255,200,0.7)'; ctx.fill();
  // Nozzle
  ctx.beginPath(); ctx.moveTo(-bw*0.28,bb); ctx.lineTo(bw*0.28,bb); ctx.lineTo(bw*0.22,bb+10); ctx.lineTo(-bw*0.22,bb+10); ctx.closePath();
  ctx.fillStyle='#164416'; ctx.fill();
  drawActiveTail(bb, bw, 10);
  ctx.restore();
}

function drawRocketNova(x, y) {
  ctx.save(); ctx.translate(x, y);
  const bw=30,bh=58,nh=50,fw=20,fh=28,bt=-bh/2,bb=bh/2;
  // Blue swept fins
  const fL=ctx.createLinearGradient(-bw/2-fw,0,-bw/2,0);
  fL.addColorStop(0,'#080e38'); fL.addColorStop(1,'#162270');
  ctx.beginPath(); ctx.moveTo(-bw/2,bt+bh*0.58); ctx.lineTo(-bw/2-fw,bb+fh*0.4); ctx.lineTo(-bw/2,bb+4); ctx.closePath(); ctx.fillStyle=fL; ctx.fill();
  const fR=ctx.createLinearGradient(bw/2,0,bw/2+fw,0);
  fR.addColorStop(0,'#162270'); fR.addColorStop(1,'#080e38');
  ctx.beginPath(); ctx.moveTo(bw/2,bt+bh*0.58); ctx.lineTo(bw/2+fw,bb+fh*0.4); ctx.lineTo(bw/2,bb+4); ctx.closePath(); ctx.fillStyle=fR; ctx.fill();
  // White/silver body
  const bg=ctx.createLinearGradient(-bw/2,0,bw/2,0);
  bg.addColorStop(0,'#8888a8'); bg.addColorStop(0.25,'#efefff'); bg.addColorStop(0.75,'#d5d5ee'); bg.addColorStop(1,'#8888a8');
  ctx.fillStyle=bg; ctx.fillRect(-bw/2,bt,bw,bh);
  // Sharp blue nose
  ctx.beginPath(); ctx.moveTo(-bw/2,bt); ctx.quadraticCurveTo(-bw/2*0.85,bt-nh*0.68,0,bt-nh); ctx.quadraticCurveTo(bw/2*0.85,bt-nh*0.68,bw/2,bt); ctx.closePath();
  const ng=ctx.createLinearGradient(-bw/2,bt,bw/2,bt);
  ng.addColorStop(0,'#080e52'); ng.addColorStop(0.5,'#142caa'); ng.addColorStop(1,'#080e52');
  ctx.fillStyle=ng; ctx.fill();
  // Rectangular window
  const py=bt+bh*0.22, pw=20, ph=13;
  ctx.fillStyle='#0a1440'; ctx.fillRect(-pw/2,py-ph/2,pw,ph);
  ctx.strokeStyle='#7878bb'; ctx.lineWidth=1.5; ctx.strokeRect(-pw/2,py-ph/2,pw,ph);
  ctx.fillStyle='rgba(140,140,255,0.35)'; ctx.fillRect(-pw/2+2,py-ph/2+2,pw-4,ph-4);
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fillRect(-pw/2+2,py-ph/2+2,pw/3,ph/3);
  // Blue accent stripe
  ctx.fillStyle='#1428aa'; ctx.fillRect(-bw/2,bt+bh*0.54,bw,5);
  ctx.fillStyle='rgba(80,110,240,0.4)'; ctx.fillRect(-bw/2,bt+bh*0.72,bw,2);
  // Nozzle
  ctx.beginPath(); ctx.moveTo(-bw*0.32,bb); ctx.lineTo(bw*0.32,bb); ctx.lineTo(bw*0.4,bb+11); ctx.lineTo(-bw*0.4,bb+11); ctx.closePath();
  ctx.fillStyle='#303050'; ctx.fill();
  drawActiveTail(bb, bw, 11);
  ctx.restore();
}

function drawRocket(x, y, cfg) {
  if (!cfg) {
    // Check pack rocket IDs first
    const pk = PACKS.find(p => state.equippedRocket === p.id + '_rocket');
    if (pk) { pk.drawRocket(x, y); return; }
  }
  // Use the equipped rocket's colours unless a specific config is passed
  if (!cfg) cfg = ROCKETS.find(r => r.id === state.equippedRocket) || ROCKETS[0];
  // Custom-shaped rockets delegate to their own draw function
  if (cfg.drawFn) { cfg.drawFn(x, y); return; }
  ctx.save();
  ctx.translate(x, y);

  const bw = 36;
  const bh = 55;
  const nh = 40;
  const fw = 18;
  const fh = 26;

  const bt = -bh / 2;
  const bb =  bh / 2;

  // Fins
  const finGrad = ctx.createLinearGradient(-bw / 2 - fw, 0, -bw / 2, 0);
  finGrad.addColorStop(0, cfg.fin[0]);
  finGrad.addColorStop(1, cfg.fin[1]);

  ctx.beginPath();
  ctx.moveTo(-bw / 2, bb - fh * 0.4);
  ctx.lineTo(-bw / 2 - fw, bb + fh);
  ctx.lineTo(-bw / 2, bb);
  ctx.closePath();
  ctx.fillStyle = finGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bw / 2, bb - fh * 0.4);
  ctx.lineTo(bw / 2 + fw, bb + fh);
  ctx.lineTo(bw / 2, bb);
  ctx.closePath();
  ctx.fillStyle = finGrad;
  ctx.fill();

  // Body
  const bodyGrad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  bodyGrad.addColorStop(0,   cfg.body[0]);
  bodyGrad.addColorStop(0.3, cfg.body[1]);
  bodyGrad.addColorStop(0.7, cfg.body[2]);
  bodyGrad.addColorStop(1,   cfg.body[0]);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(-bw / 2, bt, bw, bh);

  // Nose cone
  ctx.beginPath();
  ctx.moveTo(-bw / 2, bt);
  ctx.quadraticCurveTo(-bw / 2, bt - nh * 0.6, 0, bt - nh);
  ctx.quadraticCurveTo( bw / 2, bt - nh * 0.6, bw / 2, bt);
  ctx.closePath();
  const noseGrad = ctx.createLinearGradient(-bw / 2, bt, bw / 2, bt);
  noseGrad.addColorStop(0,   cfg.nose[0]);
  noseGrad.addColorStop(0.5, cfg.nose[1]);
  noseGrad.addColorStop(1,   cfg.nose[0]);
  ctx.fillStyle = noseGrad;
  ctx.fill();

  // Accent band
  ctx.fillStyle = cfg.band;
  ctx.fillRect(-bw / 2, bt + bh * 0.38, bw, 7);

  // Thin stripe
  ctx.fillStyle = cfg.stripe;
  ctx.fillRect(-bw / 2, bt + bh * 0.58, bw, 3);

  // Porthole
  const py = bt + bh * 0.18;
  ctx.beginPath();
  ctx.arc(0, py, 11, 0, Math.PI * 2);
  ctx.fillStyle = cfg.body[0];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, py, 9, 0, Math.PI * 2);
  const glassGrad = ctx.createRadialGradient(-3, py - 3, 1, 0, py, 9);
  glassGrad.addColorStop(0,   cfg.glass[0]);
  glassGrad.addColorStop(0.5, cfg.glass[1]);
  glassGrad.addColorStop(1,   cfg.glass[2]);
  ctx.fillStyle = glassGrad;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-3, py - 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // Nozzle
  ctx.beginPath();
  ctx.moveTo(-bw * 0.3, bb);
  ctx.lineTo( bw * 0.3, bb);
  ctx.lineTo( bw * 0.4, bb + 10);
  ctx.lineTo(-bw * 0.4, bb + 10);
  ctx.closePath();
  ctx.fillStyle = '#7a7a8a';
  ctx.fill();

  // Tail (equipped cosmetic)
  drawActiveTail(bb, bw, 10);

  ctx.restore();
}

// ── Draw a collectible gold star ──────────────
function drawAltitudeBar() {
  const barW  = 6;
  const barH  = CANVAS_H - 80;  // leave room for HUD at top
  const barX  = CANVAS_W - 14;
  const barY  = 66;
  const frac  = Math.min(state.score / WIN_SCORE, 1);

  // Track background
  ctx.fillStyle = 'rgba(0, 0, 20, 0.5)';
  ctx.beginPath();
  ctx.roundRect(barX - barW / 2, barY, barW, barH, 3);
  ctx.fill();

  // Filled portion (bottom to top)
  if (frac > 0) {
    const fillH = barH * frac;
    const grad  = ctx.createLinearGradient(0, barY + barH, 0, barY + barH - fillH);
    grad.addColorStop(0,   '#3a8fff');
    grad.addColorStop(0.5, '#a040ff');
    grad.addColorStop(1,   '#ff8800');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX - barW / 2, barY + barH - fillH, barW, fillH, 3);
    ctx.fill();
  }

  // Jupiter icon at the top
  drawJupiterIcon(barX, barY - 10, 10);
  ctx.textBaseline = 'alphabetic';
}

function drawJupiterIcon(cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Base colour
  ctx.fillStyle = '#c8823a';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Horizontal bands
  const bands = [
    { y: -0.75, h: 0.22, color: '#e8c080' },
    { y: -0.35, h: 0.18, color: '#a05a28' },
    { y:  0.05, h: 0.20, color: '#dda050' },
    { y:  0.38, h: 0.16, color: '#8a4820' },
    { y:  0.62, h: 0.22, color: '#c87838' },
  ];
  for (const b of bands) {
    ctx.fillStyle = b.color;
    ctx.fillRect(cx - r, cy + b.y * r, r * 2, b.h * r * 2);
  }

  // Great Red Spot
  ctx.save();
  ctx.translate(cx + r * 0.25, cy + r * 0.12);
  ctx.scale(1.5, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#cc3322';
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,200,100,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawSpeedLines() {
  const magnetBoost = state.magnetTimer > 0 ? 0.45 : 0;
  const levelBoost  = Math.max(0, (state.level - 2) * 0.18);
  const alpha       = Math.min(magnetBoost + levelBoost, 0.55);
  if (alpha <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 14; i++) {
    // Each line has a stable lane + scrolls downward at speed proportional to gameTime
    const x   = ((i * 41 + 17)  % (CANVAS_W - 20)) + 10;
    const y   = ((i * 67 + gameTime * 500) % (CANVAS_H + 80)) - 40;
    const len = 20 + (i % 5) * 12;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(200,220,255,0.8)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = i % 4 === 0 ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMagnetOrb(p) {
  const pulse = 0.75 + 0.25 * Math.sin(gameTime * 5);
  ctx.save();
  // Outer glow
  const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 2.2);
  grd.addColorStop(0,   `rgba(255, 220, 60, ${0.6 * pulse})`);
  grd.addColorStop(0.5, `rgba(255, 170, 20, ${0.35 * pulse})`);
  grd.addColorStop(1,   'rgba(200, 100, 0, 0)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  // Core orb
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 230, 100, ${0.9 * pulse})`;
  ctx.fill();
  // Icon
  ctx.font = `bold ${p.r * 1.2}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧲', p.x, p.y + 1);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawMagnetAura(x, y) {
  const frac  = Math.min(state.magnetTimer / MAGNET_DURATION, 1);
  const pulse = 0.6 + 0.4 * Math.sin(gameTime * 6);
  const r     = 50;
  ctx.save();
  const grd = ctx.createRadialGradient(x, y, r * 0.4, x, y, r);
  grd.addColorStop(0,   'rgba(255, 220, 0, 0)');
  grd.addColorStop(0.6, `rgba(255, 200, 0, ${0.12 * pulse * frac})`);
  grd.addColorStop(1,   `rgba(255, 160, 0, ${0.5 * pulse * frac})`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 220, 60, ${0.7 * pulse * frac})`;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawShieldOrb(p) {
  const pulse = 0.75 + 0.25 * Math.sin(gameTime * 4);
  ctx.save();
  // Outer glow
  const grd = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 2.2);
  grd.addColorStop(0,   `rgba(100, 200, 255, ${0.5 * pulse})`);
  grd.addColorStop(0.5, `rgba(60,  140, 255, ${0.3 * pulse})`);
  grd.addColorStop(1,   'rgba(0, 80, 200, 0)');
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  // Core orb
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(160, 230, 255, ${0.85 * pulse})`;
  ctx.fill();
  // Icon: shield symbol
  ctx.fillStyle = 'rgba(20, 60, 160, 0.9)';
  ctx.font = `bold ${p.r * 1.2}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🛡', p.x, p.y + 1);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawShieldBubble(x, y) {
  const pulse = 0.7 + 0.3 * Math.sin(gameTime * 5);
  const r = 38;
  ctx.save();
  const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
  grd.addColorStop(0,   'rgba(80, 180, 255, 0)');
  grd.addColorStop(0.6, `rgba(80, 180, 255, ${0.15 * pulse})`);
  grd.addColorStop(1,   `rgba(160, 230, 255, ${0.6 * pulse})`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = `rgba(160, 230, 255, ${0.8 * pulse})`;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBoostOrb(p) {
  const pulse = 0.7 + 0.3 * Math.sin(gameTime * 8);
  const spin  = gameTime * 3;
  ctx.save();
  ctx.translate(p.x, p.y);

  // Outer electric glow
  const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, p.r * 2.6);
  grd.addColorStop(0,   `rgba(255, 255, 120, ${0.7 * pulse})`);
  grd.addColorStop(0.4, `rgba(255, 160,   0, ${0.45 * pulse})`);
  grd.addColorStop(1,   'rgba(255, 80, 0, 0)');
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 2.6, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Spinning ring
  ctx.strokeStyle = `rgba(255, 220, 60, ${0.6 * pulse})`;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.r + 4, spin, spin + Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, p.r + 4, spin + Math.PI, spin + Math.PI * 2.4);
  ctx.stroke();

  // Core orb
  const core = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
  core.addColorStop(0,   '#ffffff');
  core.addColorStop(0.3, '#ffee60');
  core.addColorStop(1,   '#ff8800');
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();

  // Lightning bolt icon
  ctx.font         = `bold ${p.r * 1.3}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', 0, 1);

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawBoostAura(x, y) {
  const frac  = Math.min(state.boostTimer / BOOST_DURATION, 1);
  const pulse = 0.5 + 0.5 * Math.sin(gameTime * 12);

  // Side flame streaks (speed lines behind rocket)
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const angle  = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const len    = (30 + Math.random() * 40) * frac;
    const sx     = x + (Math.random() - 0.5) * 20;
    const sy     = y + 28;
    ctx.strokeStyle = `rgba(255, ${160 + Math.floor(Math.random() * 80)}, 0, ${0.5 * pulse * frac})`;
    ctx.lineWidth   = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();

  // Outer aura ring
  const r   = 44;
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  grd.addColorStop(0,   'rgba(255, 200, 0, 0)');
  grd.addColorStop(0.5, `rgba(255, 160, 0, ${0.08 * pulse * frac})`);
  grd.addColorStop(1,   `rgba(255, 80,  0, ${0.4 * pulse * frac})`);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 200, 60, ${0.65 * pulse * frac})`;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  // "BOOST" text indicator while active (fades near end)
  if (frac > 0.15) {
    ctx.save();
    ctx.globalAlpha  = Math.min(frac * 3, 1) * (0.7 + 0.3 * pulse);
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffee60';
    ctx.fillText('⚡ BOOST', x, y - 52);
    ctx.restore();
  }
}

function drawCoinPickup(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const isTreasure = c.type === 'treasure';
  const r = c.r;
  // Spinning coin squish effect
  const sq = Math.abs(Math.cos(c.spin));

  // Glow halo
  const haloR = r * (isTreasure ? 3.2 : 2.5);
  const glow = ctx.createRadialGradient(0,0,0,0,0,haloR);
  glow.addColorStop(0, isTreasure ? 'rgba(255,220,50,0.55)' : 'rgba(255,200,50,0.30)');
  glow.addColorStop(1, 'rgba(255,180,0,0)');
  ctx.beginPath(); ctx.arc(0,0,haloR,0,Math.PI*2);
  ctx.fillStyle=glow; ctx.fill();

  // Coin body (squished on X to simulate spin)
  ctx.save();
  ctx.scale(sq < 0.08 ? 0.08 : sq, 1);
  const grad = ctx.createRadialGradient(-r*0.3,-r*0.3,0,0,0,r);
  grad.addColorStop(0, '#ffe566');
  grad.addColorStop(0.55, '#ffc000');
  grad.addColorStop(1, '#b86800');
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
  ctx.fillStyle=grad; ctx.fill();
  ctx.strokeStyle='rgba(160,80,0,0.6)'; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();

  // Treasure sparkle ring
  if (isTreasure) {
    const f = 0.55 + 0.35*Math.sin(gameTime*4);
    ctx.strokeStyle=`rgba(255,240,80,${f})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,r+5,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle=`rgba(255,200,50,${f*0.5})`; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,r+9,0,Math.PI*2); ctx.stroke();
  }

  ctx.restore();
}

function drawCoinMultOrb(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const r = p.r;
  const pulse = 0.78 + 0.22*Math.sin(gameTime*3.5);

  // Outer glow
  const glow = ctx.createRadialGradient(0,0,0,0,0,r*2.6);
  glow.addColorStop(0, `rgba(80,255,180,${0.50*pulse})`);
  glow.addColorStop(1, 'rgba(0,200,120,0)');
  ctx.beginPath(); ctx.arc(0,0,r*2.6,0,Math.PI*2);
  ctx.fillStyle=glow; ctx.fill();

  // Body
  const grad = ctx.createRadialGradient(-r*0.25,-r*0.25,0,0,0,r);
  grad.addColorStop(0,'#90ffcc'); grad.addColorStop(0.6,'#00cc88'); grad.addColorStop(1,'#005c3e');
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
  ctx.fillStyle=grad; ctx.fill();

  // ×2 label
  ctx.fillStyle='#003322'; ctx.font='bold 12px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('×2', 0, 0);

  ctx.restore();
}

function drawCoinMultHUD() {
  // Pill indicator top-left when multiplier is active
  const frac = state.coinMultiplierTimer / COIN_MULT_DURATION;
  const pulse = 0.8 + 0.2*Math.sin(gameTime*4);
  ctx.save();
  ctx.globalAlpha = Math.min(frac * 4, 1) * pulse;
  const px = 12, py = 90, pw = 72, ph = 22, pr = 11;
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, pr);
  ctx.fillStyle='rgba(0,180,100,0.75)'; ctx.fill();
  ctx.strokeStyle='rgba(100,255,180,0.9)'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#ffffff'; ctx.font='bold 11px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(`×2 COINS  ${Math.ceil(state.coinMultiplierTimer)}s`, px+pw/2, py+ph/2);
  ctx.restore();
}
function drawFirstRunHUD() {
  // Star pill — shown the whole first run of the day
  const pulse = 0.85 + 0.15*Math.sin(gameTime*3);
  ctx.save();
  ctx.globalAlpha = pulse;
  const px = 12, py = 116, pw = 92, ph = 22, pr = 11;
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, pr);
  ctx.fillStyle='rgba(180,120,0,0.80)'; ctx.fill();
  ctx.strokeStyle='rgba(255,210,60,0.9)'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#ffffff'; ctx.font='bold 11px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('⭐ FIRST RUN ×2', px+pw/2, py+ph/2);
  ctx.restore();
}

function drawCollectibleStar(s) {
  ctx.save();
  ctx.translate(s.x, s.y);

  const outerR = s.r;
  const innerR = s.r * 0.42;
  const points = 5;

  // Soft glow halo
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR * 2);
  glow.addColorStop(0, 'rgba(255, 220, 50, 0.35)');
  glow.addColorStop(1, 'rgba(255, 220, 50, 0)');
  ctx.beginPath();
  ctx.arc(0, 0, outerR * 2, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // 5-pointed star shape
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r     = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else         ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -outerR, 0, outerR);
  grad.addColorStop(0, '#fff5a0');
  grad.addColorStop(1, '#ffcc20');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(80, 30, 0, 0.95)';
  ctx.lineWidth = outerR * 0.25;
  ctx.stroke();

  ctx.restore();
}

// ── Draw a meteor ─────────────────────────────
function drawMeteor(m) {
  // Meteor skin follows the equipped rocket's pack
  const pk = PACKS.find(p => state.equippedRocket === p.id + '_rocket');
  if (pk) { pk.drawMeteor(m); return; }
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.rotation);

  // Type-specific colours
  const isSpeeder = m.type === 'speeder';
  const isGiant   = m.type === 'giant';
  const trailColor = isSpeeder ? 'rgba(160, 220, 255,' : isGiant ? 'rgba(255, 120, 40,' : 'rgba(255, 180, 80,';
  const bodyHi     = isSpeeder ? '#9ab8d0' : isGiant ? '#6a3820' : '#7a6050';
  const bodyMid    = isSpeeder ? '#607090' : isGiant ? '#4a2210' : '#5a4030';
  const bodyLo     = isSpeeder ? '#304060' : isGiant ? '#2a1008' : '#3a2818';

  // Streak trail (longer for speeders)
  const trailLen = m.ry * (isSpeeder ? 7 : isGiant ? 2.5 : 4);
  const trail = ctx.createLinearGradient(0, -trailLen, 0, 0);
  trail.addColorStop(0, trailColor + ' 0)');
  trail.addColorStop(1, trailColor + (isSpeeder ? ' 0.55)' : ' 0.35)'));
  ctx.beginPath();
  ctx.ellipse(0, -trailLen / 2, m.rx * 0.5, trailLen / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = trail;
  ctx.fill();

  // Rocky body
  const bodyGrad = ctx.createRadialGradient(-m.rx * 0.3, -m.ry * 0.3, 1, 0, 0, m.rx * 1.2);
  bodyGrad.addColorStop(0,   bodyHi);
  bodyGrad.addColorStop(0.6, bodyMid);
  bodyGrad.addColorStop(1,   bodyLo);
  ctx.beginPath();
  ctx.ellipse(0, 0, m.rx, m.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Speed glow outline for speeders
  if (isSpeeder) {
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.6)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // Craters (giants get more)
  ctx.fillStyle = `rgba(${isGiant ? '20,8,2' : '30,15,5'}, 0.55)`;
  const craters = isGiant
    ? [ { cx: -m.rx*0.35, cy: -m.ry*0.25, cr: m.rx*0.2 },
        { cx:  m.rx*0.3,  cy:  m.ry*0.2,  cr: m.rx*0.16 },
        { cx:  m.rx*0.05, cy:  m.ry*0.4,  cr: m.rx*0.13 },
        { cx: -m.rx*0.15, cy:  m.ry*0.1,  cr: m.rx*0.1  }, ]
    : [ { cx: -m.rx*0.3,  cy: -m.ry*0.2,  cr: m.rx*0.22 },
        { cx:  m.rx*0.3,  cy:  m.ry*0.25, cr: m.rx*0.18 },
        { cx: -m.rx*0.1,  cy:  m.ry*0.35, cr: m.rx*0.13 }, ];
  for (const c of craters) {
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, c.cr, c.cr * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Kick things off ───────────────────────────
// If already logged in from a previous session, load their profile
const _existingSession = loadAuthSession();
if (_existingSession) loadOrCreateProfileForUser(_existingSession.username);

checkDailyLogin();          // award daily login coins before first frame
initDailyChallenge();       // load or create today's challenge
requestAnimationFrame(loop);

// ── Register service worker (PWA) ─────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
