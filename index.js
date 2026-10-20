/**
 * deepseek-chan-sleep-shutdown — Night & moon themed shutdown plugin for DeepSeek Harness
 * 深夜月亮主题：鲸鱼娘睡觉形象按钮，任务完成后自动关机（DeepSeek Harness 插件）
 *
 * A zero-dependency cordis plugin for the DeepSeek Harness web profile:
 *   - A floating capsule button with a sleeping-whale mascot (DeepSeek-chan)
 *     sits at the bottom-right of the GUI (draggable — position persisted in
 *     localStorage). Idle shows the awake mascot + "任务完成后关机"; armed
 *     shows the sleeping mascot + "已开启·任务完成后关机" with a breathing
 *     glow, a moon crescent and a floating "Zzz". Deep-night palette:
 *     #1a1c2e base, #8b8ff5 accent, #ffd166 moon; glassmorphism + soft glow.
 *     Mascot image fails (assets missing) → the button degrades gracefully
 *     to a pure text capsule (img onerror hides itself, nothing else breaks).
 *   - Auto-dodge: when another plugin's corner popup (fixed overlay with
 *     clickable content) overlaps the button, the button steps aside and
 *     returns once the popup is gone.
 *   - When armed, once ALL root sessions go idle with no agent/error in the
 *     batch, a 60 s cancellable countdown starts and the OS "shutdown /s /t n"
 *     is issued. The countdown is drawn as a conic-gradient progress ring
 *     around the button's outer edge; remaining seconds show on the button.
 *     The GUI banner (same night design language) offers "取消关机 /
 *     Cancel shutdown" (POST /cancel → shutdown /a) and is anchored
 *     above the button wherever it currently sits.
 *   - Starting a new task during the countdown also aborts the shutdown
 *     automatically while keeping the mode armed.
 *   - Clicking "Cancel shutdown" aborts THIS shutdown AND disarms the mode.
 *
 * UI delivery (no client bundle, no build):
 *   - webServer.tapIndex injects a script tag for /api/deepseek-chan-sleep-shutdown/ui.js
 *     into every index.html response (applies on the next page load), plus
 *     the webserver/index-inject event channel for hosts that prefer it.
 *   - HTTP routes under /api/deepseek-chan-sleep-shutdown/*:
 *     GET /state, POST /arm, POST /disarm, POST /cancel, GET /ui.js,
 *     GET /img/sleep.webp, GET /img/awake.webp (served from ./assets;
 *     content-type image/webp, long cache. A failed image read is a plain
 *     404 and never affects the other routes).
 *     (POSTs reject non-loopback Origins.)
 *
 * Events (per @deepseek-ai/dsh-agent runtime-types):
 *   agent/status { agent, status: 'idle' | 'running' }; agent/error { agent, ... }
 * Only root agents (agents.roots()) count; subagents are folded into their root.
 *
 * Windows only: the plugin executes shutdown.exe. On other platforms it logs
 * and stays inert.
 *
 * Runtime log: $DSH_HOME/deepseek-chan-sleep-shutdown.log
 * License: MIT
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = '/api/deepseek-chan-sleep-shutdown'
const NAME = 'deepseek-chan-sleep-shutdown'

function dshHome() {
  const env = process.env.DSH_HOME && String(process.env.DSH_HOME).trim()
  return env ? path.resolve(env) : path.join(os.homedir(), '.dsh')
}
const LOG_PATH = path.join(dshHome(), NAME + '.log')

function log(...args) {
  const line = '[' + new Date().toISOString() + '] ' + args.map(String).join(' ')
  console.log('[' + NAME + ']', ...args)
  try { fs.appendFileSync(LOG_PATH, line + '\n', 'utf8') } catch { /* best-effort */ }
}

/** Normalize plugin config (no schema dependency; defaults match the prototype). */
function normalizeConfig(raw) {
  const c = (raw && typeof raw === 'object') ? raw : {}
  const clampInt = (v, def, min, max) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def
  }
  return {
    /** GUI countdown seconds before shutdown executes. */
    countdownSec: clampInt(c.countdownSec, 60, 10, 600),
    /** Extra seconds added to the OS shutdown /t command (startup slack). */
    marginSec: clampInt(c.marginSec, 5, 0, 60),
    /** Only shut down when the batch had no agent/error. */
    onlyOnSuccess: c.onlyOnSuccess !== false,
  }
}

// ---------- Injected UI script (plain JS, no build; no backticks, no dollar-brace inside) ----------
// Night & moon theme: sleeping whale-girl mascot button, glassmorphism,
// breathing glow when armed, conic-gradient countdown ring, Zzz micro-motion.
// Built as a string-array join so the emitted script is pure ES5-friendly JS.
const UI_JS = [
"(function () {",
"  if (window.__dshDcsLoaded) return",
"  window.__dshDcsLoaded = true",
"  var __dshDcsBoot = function () {",
"  var BASE = '/api/deepseek-chan-sleep-shutdown'",
"  var IMG_SLEEP = BASE + '/img/sleep.webp'",
"  var IMG_AWAKE = BASE + '/img/awake.webp'",
"  var btn = null, ring = null, mascot = null, label = null, banner = null, note = null, noteTimer = null",
"  var suppressClick = false, dodging = false, drag = null, scanTimer = null, imgOk = true",
"",
"  function makeEl(tag, cls, text) {",
"    var e = document.createElement(tag)",
"    if (cls) e.className = cls",
"    if (text !== undefined) e.textContent = text",
"    return e",
"  }",
"  function setVisible(e, show) { if (e) e.style.display = show ? 'block' : 'none' }",
"  function post(p) { return fetch(BASE + p, { method: 'POST' }).then(function (r) { return r.json() }).catch(function () { return null }) }",
"  function setLook(sleeping, text) {",
"    if (imgOk) mascot.src = sleeping ? IMG_SLEEP : IMG_AWAKE",
"    if (label.textContent !== text) label.textContent = text",
"  }",
"",
"  var style = document.createElement('style')",
"  style.textContent = [",
"    '.dsh-dcs-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;pointer-events:auto;cursor:grab;touch-action:none;',",
"    'display:flex;align-items:center;gap:9px;border:1px solid rgba(139,143,245,.38);border-radius:999px;padding:6px 15px 6px 7px;',",
"    'color:#cfd0e8;background:rgba(26,28,46,.82);user-select:none;',",
"    'font:13px/1.4 system-ui,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;',",
"    'backdrop-filter:blur(10px);box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 12px rgba(139,143,245,.10);',",
"    'transition:box-shadow .25s,border-color .25s,color .2s,background .2s,transform .18s ease;white-space:nowrap}',",
"    '.dsh-dcs-btn:hover{border-color:rgba(139,143,245,.65);color:#fff;background:rgba(30,32,54,.88);',",
"    'box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 18px rgba(139,143,245,.28)}',",
"    '.dsh-dcs-btn:active{cursor:grabbing}',",
"    '.dsh-dcs-btn.on{border-color:rgba(255,209,102,.60);color:#ffe3a1;animation:dshDcsBreath 2.8s ease-in-out infinite}',",
"    '.dsh-dcs-btn.on:hover{color:#fff}',",
"    '@keyframes dshDcsBreath{0%,100%{box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 10px 1px rgba(139,143,245,.30)}',",
"    '50%{box-shadow:0 4px 18px rgba(0,0,0,.45),0 0 24px 5px rgba(139,143,245,.55),0 0 12px rgba(255,209,102,.18)}}',",
"    '.dsh-dcs-mascot{display:block;height:30px;width:auto;max-width:none;flex:0 0 auto;object-fit:contain;',",
"    'border-radius:8px;pointer-events:none;background:rgba(139,143,245,.10);box-shadow:0 0 8px rgba(139,143,245,.18)}',",
"    '.dsh-dcs-moon{width:11px;height:11px;border-radius:50%;flex:0 0 11px;box-shadow:3px -2px 0 0 #ffd166;',",
"    'transform:rotate(-24deg);opacity:.75;transition:opacity .3s}',",
"    '.dsh-dcs-btn.on .dsh-dcs-moon{opacity:1;box-shadow:3px -2px 0 0 #ffd166,0 0 9px rgba(255,209,102,.55)}',",
"    '.dsh-dcs-zzz{display:none;position:absolute;left:33px;top:-4px;font-size:11px;font-weight:600;color:#ffd166;',",
"    'pointer-events:none;animation:dshDcsZ 2.2s ease-in-out infinite}',",
"    '.dsh-dcs-btn.on .dsh-dcs-zzz{display:block}',",
"    '@keyframes dshDcsZ{0%{opacity:0;transform:translateY(3px)}35%{opacity:1}100%{opacity:0;transform:translateY(-7px)}}',",
"    '.dsh-dcs-ring{position:absolute;inset:-7px;border-radius:999px;display:none;pointer-events:none}',",
"    '.dsh-dcs-panel{position:fixed;z-index:2147483000;pointer-events:auto;display:none;',",
"    'width:300px;background:rgba(20,22,38,.93);color:#e8e9f6;border:1px solid rgba(139,143,245,.35);border-radius:14px;',",
"    'padding:14px 16px;font:13px/1.5 system-ui,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;',",
"    'box-shadow:0 8px 30px rgba(0,0,0,.5),0 0 22px rgba(139,143,245,.10);backdrop-filter:blur(12px)}',",
"    '.dsh-dcs-panel .t{font-weight:600;font-size:14px;margin-bottom:4px}',",
"    '.dsh-dcs-panel .b{color:#b8bad4;margin-bottom:10px}',",
"    '.dsh-dcs-panel .cancel{pointer-events:auto;cursor:pointer;border:0;border-radius:9px;padding:6px 14px;',",
"    'font-size:13px;color:#fff;background:linear-gradient(135deg,#e5484d,#c93a3f);box-shadow:0 0 12px rgba(229,72,77,.30)}',",
"    '.dsh-dcs-panel .cancel:hover{background:linear-gradient(135deg,#f2555a,#d84348)}',",
"    '.dsh-dcs-panel.warn .t{color:#ffd166}',",
"    '.dsh-dcs-panel.err .t{color:#ff9aa2}'",
"  ].join('')",
"  document.head.appendChild(style)",
"",
"  // ---- capsule button: [mascot img][label][moon crescent] + Zzz + ring ----",
"  btn = makeEl('button', 'dsh-dcs-btn')",
"  btn.setAttribute('type', 'button')",
"  ring = makeEl('div', 'dsh-dcs-ring')",
"  btn.appendChild(ring)",
"  mascot = document.createElement('img')",
"  mascot.className = 'dsh-dcs-mascot'",
"  mascot.setAttribute('alt', '')",
"  mascot.onerror = function () { imgOk = false; mascot.style.display = 'none' }",
"  mascot.src = IMG_AWAKE",
"  btn.appendChild(mascot)",
"  label = makeEl('span', null, '任务完成后关机')",
"  btn.appendChild(label)",
"  btn.appendChild(makeEl('span', 'dsh-dcs-moon'))",
"  btn.appendChild(makeEl('span', 'dsh-dcs-zzz', 'Zzz'))",
"  document.body.appendChild(btn)",
"",
"  banner = makeEl('div', 'dsh-dcs-panel')",
"  banner.appendChild(makeEl('div', 't', '任务已完成'))",
"  banner.appendChild(makeEl('div', 'b', ''))",
"  var cancelBtn = makeEl('button', 'cancel', '取消关机')",
"  cancelBtn.addEventListener('click', function () {",
"    post('/cancel').then(function (s) { if (s) applyState(s) })",
"  })",
"  banner.appendChild(cancelBtn)",
"  document.body.appendChild(banner)",
"",
"  note = makeEl('div', 'dsh-dcs-panel warn')",
"  document.body.appendChild(note)",
"",
"  // ---- restore saved drag position (clamped to the current viewport) ----",
"  try {",
"    var saved = JSON.parse(localStorage.getItem('dsh-dcs-pos') || 'null')",
"    if (saved && typeof saved.l === 'number' && typeof saved.t === 'number') {",
"      var maxL = Math.max(8, window.innerWidth - btn.offsetWidth - 8)",
"      var maxT = Math.max(8, window.innerHeight - btn.offsetHeight - 8)",
"      var l = Math.min(Math.max(8, saved.l), maxL)",
"      var t = Math.min(Math.max(8, saved.t), maxT)",
"      btn.style.left = l + 'px'",
"      btn.style.top = t + 'px'",
"      btn.style.right = 'auto'",
"      btn.style.bottom = 'auto'",
"    }",
"  } catch (e) { /* ignore */ }",
"",
"  // ---- draggable: pointer events; a real drag suppresses the click ----",
"  btn.addEventListener('pointerdown', function (e) {",
"    if (e.button !== 0) return",
"    undodge()",
"    drag = { sx: e.clientX, sy: e.clientY, l: btn.offsetLeft, t: btn.offsetTop, moved: false }",
"    try { btn.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }",
"  })",
"  btn.addEventListener('pointermove', function (e) {",
"    if (!drag) return",
"    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true",
"    if (!drag.moved) return",
"    var l = Math.min(Math.max(8, drag.l + e.clientX - drag.sx), window.innerWidth - btn.offsetWidth - 8)",
"    var t = Math.min(Math.max(8, drag.t + e.clientY - drag.sy), window.innerHeight - btn.offsetHeight - 8)",
"    btn.style.left = l + 'px'",
"    btn.style.top = t + 'px'",
"    btn.style.right = 'auto'",
"    btn.style.bottom = 'auto'",
"  })",
"  function endDrag() {",
"    if (!drag) return",
"    suppressClick = drag.moved",
"    if (drag.moved) {",
"      try { localStorage.setItem('dsh-dcs-pos', JSON.stringify({ l: btn.offsetLeft, t: btn.offsetTop })) } catch (err) { /* ignore */ }",
"    }",
"    drag = null",
"  }",
"  btn.addEventListener('pointerup', endDrag)",
"  btn.addEventListener('pointercancel', endDrag)",
"  btn.addEventListener('click', function () {",
"    if (suppressClick) { suppressClick = false; return }",
"    var on = btn.classList.contains('on')",
"    post(on ? '/disarm' : '/arm').then(function (s) { if (s) applyState(s) })",
"  })",
"",
"  // ---- auto-dodge: step aside when another plugin's fixed popup with",
"  //      clickable content overlaps our button; restore when it goes away ----",
"  function isOurs(el) {",
"    return el === btn || el === banner || el === note ||",
"      (btn && btn.contains(el)) || (banner && banner.contains(el)) || (note && note.contains(el))",
"  }",
"  function fixedOverlay(el) {",
"    var cur = el",
"    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {",
"      if (isOurs(cur)) return null",
"      var st = window.getComputedStyle(cur)",
"      if (st.position === 'fixed' && st.display !== 'none' && st.visibility !== 'hidden') return cur",
"      cur = cur.parentElement",
"    }",
"    return null",
"  }",
"  function clickableAt(el) {",
"    var t = el && el.tagName",
"    if (!t) return false",
"    if (t === 'BUTTON' || t === 'A' || t === 'INPUT' || t === 'SELECT' || el.getAttribute('role') === 'button') return true",
"    return typeof el.onclick === 'function'",
"  }",
"  function area(r) { return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top) }",
"  function intersectArea(a, b) {",
"    var w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))",
"    var h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))",
"    return w * h",
"  }",
"  function findIntruder() {",
"    if (!btn) return null",
"    var r = btn.getBoundingClientRect()",
"    if (r.width < 4 || r.height < 4) return null",
"    var pts = [",
"      [r.left + r.width / 2, r.top + r.height / 2],",
"      [r.left + 2, r.top + 2], [r.right - 2, r.top + 2],",
"      [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]",
"    ]",
"    for (var i = 0; i < pts.length; i++) {",
"      var chain = document.elementsFromPoint(pts[i][0], pts[i][1])",
"      for (var j = 0; j < chain.length; j++) {",
"        var el = chain[j]",
"        if (el === btn || isOurs(el)) continue",
"        var ov = fixedOverlay(el)",
"        if (!ov || !clickableAt(el)) continue",
"        var or = ov.getBoundingClientRect()",
"        if (intersectArea(or, r) > area(r) * 0.3) return ov",
"      }",
"    }",
"    return null",
"  }",
"  function undodge() {",
"    if (dodging) { btn.style.transform = ''; dodging = false }",
"  }",
"  function dodgeScan() {",
"    if (!btn || drag) return",
"    var intr = findIntruder()",
"    if (intr && !dodging) {",
"      var br = btn.getBoundingClientRect()",
"      var ir = intr.getBoundingClientRect()",
"      var off = Math.max(0, br.bottom - ir.top) + 14",
"      btn.style.transform = 'translateY(-' + off + 'px)'",
"      dodging = true",
"    } else if (!intr && dodging) {",
"      btn.style.transform = ''",
"      dodging = false",
"    }",
"  }",
"  try {",
"    var mo = new MutationObserver(function () {",
"      clearTimeout(scanTimer)",
"      scanTimer = setTimeout(dodgeScan, 250)",
"    })",
"    mo.observe(document.body, { childList: true, subtree: true })",
"  } catch (e) { /* ignore */ }",
"",
"  // ---- countdown/notice panel follows the button's current position ----",
"  function placePanel(panelEl) {",
"    var r = btn.getBoundingClientRect()",
"    var pw = panelEl.offsetWidth || 300",
"    var ph = panelEl.offsetHeight || 120",
"    panelEl.style.right = 'auto'",
"    panelEl.style.bottom = 'auto'",
"    panelEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + 'px'",
"    var top = r.top - ph - 10",
"    panelEl.style.top = (top >= 8 ? top : r.bottom + 10) + 'px'",
"  }",
"",
"  function showBanner(title, body, cls, showCancel) {",
"    banner.className = 'dsh-dcs-panel' + (cls ? ' ' + cls : '')",
"    banner.querySelector('.t').textContent = title",
"    banner.querySelector('.b').textContent = body",
"    setVisible(cancelBtn, !!showCancel)",
"    placePanel(banner)",
"    setVisible(banner, true)",
"  }",
"  function hideBanner() { setVisible(banner, false) }",
"  function showNote(text, ms) {",
"    note.querySelector('.t').textContent = text",
"    placePanel(note)",
"    setVisible(note, true)",
"    clearTimeout(noteTimer)",
"    noteTimer = setTimeout(function () { setVisible(note, false) }, ms || 6000)",
"  }",
"  window.addEventListener('resize', function () {",
"    if (banner && banner.style.display === 'block') placePanel(banner)",
"    if (note && note.style.display === 'block') placePanel(note)",
"    dodgeScan()",
"  })",
"",
"  function applyState(s) {",
"    if (!s) return",
"    if (s.armed) btn.classList.add('on')",
"    else btn.classList.remove('on')",
"    if (s.state === 'countdown') {",
"      var total = (s.countdownSec && s.countdownSec > 0) ? s.countdownSec : 60",
"      var remain = Math.max(0, Math.ceil(((s.deadline || 0) - Date.now()) / 1000))",
"      var pct = Math.max(0, Math.min(100, (remain / total) * 100))",
"      ring.style.display = 'block'",
"      ring.style.background = 'conic-gradient(#8b8ff5 ' + pct + '%, rgba(139,143,245,.10) 0)'",
"      setLook(true, remain > 0 ? '已开启·' + remain + ' 秒后关机' : '已开启·正在关机…')",
"      showBanner('任务已完成', remain > 0 ? remain + ' 秒后自动关机' : '正在关机…', '', true)",
"    } else if (s.state === 'fired') {",
"      ring.style.display = 'none'",
"      setLook(true, '已开启·正在关机…')",
"      showBanner('系统即将关机', '关机指令已生效，无法取消', '', false)",
"    } else {",
"      ring.style.display = 'none'",
"      setLook(!!s.armed, s.armed ? '已开启·任务完成后关机' : '任务完成后关机')",
"      hideBanner()",
"    }",
"    if (s.lastSkip && (Date.now() - s.lastSkip.at) < 6000) {",
"      showNote(s.lastSkip.reason, 6000)",
"    }",
"  }",
"",
"  function tick() {",
"    fetch(BASE + '/state', { cache: 'no-store' }).then(function (r) { return r.json() }).then(applyState).catch(function () {})",
"  }",
"  tick()",
"  setInterval(tick, 1000)",
"  setInterval(dodgeScan, 1000)",
"  // ---- self-heal: re-attach our fixed elements if an SPA re-render dropped them ----",
"  setInterval(function () {",
"    try {",
"      if (style && !document.head.contains(style)) document.head.appendChild(style)",
"      if (btn && !document.body.contains(btn)) document.body.appendChild(btn)",
"      if (banner && !document.body.contains(banner)) document.body.appendChild(banner)",
"      if (note && !document.body.contains(note)) document.body.appendChild(note)",
"    } catch (e) { /* ignore */ }",
"  }, 500)",
"  }",
"  if (document.body) __dshDcsBoot()",
"  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { __dshDcsBoot() })",
"})();",
].join('\n')

module.exports = {
  name: NAME,
  inject: ['agents', 'subprocess', 'webServer'],
  apply(ctx, rawConfig) {
    const cfg = normalizeConfig(rawConfig)

    if (process.platform !== 'win32') {
      log('当前平台 ' + process.platform + ' 非 Windows（需要 shutdown.exe），插件保持惰性')
      return
    }

    const agents = ctx.get('agents')
    const subprocess = ctx.get('subprocess')
    const webServer = ctx.get('webServer')
    if (agents === undefined || subprocess === undefined) {
      log('缺少 agents/subprocess 服务，插件不加载')
      return
    }

    // ---------- state ----------
    let armed = false          // mode switch (button-controlled)
    let state = 'idle'         // idle | countdown | fired
    let errored = new Set()    // root agents that errored in this batch
    let deadline = 0
    let firedTimer = null
    let lastSkip = null        // { at, reason } most recent "errored, skipped" notice

    function roots() {
      try { return agents.roots() } catch { return [] }
    }
    function rootsRunning() {
      try { return roots().filter((a) => a && a.status === 'running').length } catch { return 0 }
    }
    function isRoot(agent) {
      try { return roots().includes(agent) } catch { return true }
    }

    async function spawnShutdown(args) {
      let argv = args
      try {
        const exe = await subprocess.resolveExecutable('shutdown')
        if (typeof exe === 'string' && exe.length > 0) argv = [exe, ...args]
      } catch { /* fall back to the bare command name (System32 is on PATH) */ }
      try {
        const handle = subprocess.spawn({
          argv,
          cwd: '/',
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
          graceMs: 15000,
        })
        handle.done.then((outcome) => log('shutdown 进程退出:', JSON.stringify(outcome)))
          .catch((err) => log('shutdown 进程启动失败:', err && err.message ? err.message : err))
      } catch (err) {
        log('spawn 失败:', err && err.message ? err.message : err)
      }
    }

    function reset() {
      state = 'idle'
      deadline = 0
      if (firedTimer !== null) { try { firedTimer() } catch { /* ignore */ } firedTimer = null }
    }

    function armShutdown() {
      if (state !== 'idle') return
      state = 'countdown'
      deadline = Date.now() + cfg.countdownSec * 1000
      log('★ 任务完成 → ' + cfg.countdownSec + ' 秒后关机（GUI 可取消）')
      void spawnShutdown(['/s', '/t', String(cfg.countdownSec + cfg.marginSec)])
      firedTimer = ctx.setTimeout(() => {
        state = 'fired'
        log('系统关机指令已生效（无法取消）')
      }, (cfg.countdownSec + cfg.marginSec + 5) * 1000)
    }

    /** Cancel the pending OS shutdown; also disarms the mode (user clicked Cancel). */
    function cancelShutdown() {
      if (state !== 'countdown' && state !== 'fired') return false
      void spawnShutdown(['/a'])
      reset()
      if (armed) {
        armed = false
        errored = new Set()
        log('已取消关机（shutdown /a），模式已关闭')
      } else {
        log('已取消关机（shutdown /a）')
      }
      return true
    }

    function setArmed(next) {
      if (next === armed) return armed
      armed = next
      errored = new Set()
      if (!next && state !== 'idle') cancelShutdown()
      log(armed ? '已开启：任务完成后自动关机' : '已关闭：任务完成后自动关机')
      return armed
    }

    // ---------- events ----------
    ctx.on('agent/status', ({ agent, status }) => {
      if (!agent || !isRoot(agent)) return
      if (status === 'running') {
        errored = new Set() // new activity: fresh error window
        if (state === 'countdown') {
          log('倒计时期间新任务开始，取消关机（模式保持开启）')
          cancelShutdown()
        }
        return
      }
      // status === 'idle'
      if (!armed || state !== 'idle') return
      if (rootsRunning() > 0) return
      if (cfg.onlyOnSuccess && errored.size > 0) {
        lastSkip = { at: Date.now(), reason: '本批次有 ' + errored.size + ' 个会话出错，仅成功时关机（模式保持开启）' }
        log(lastSkip.reason)
        return
      }
      armShutdown()
    })

    ctx.on('agent/error', ({ agent }) => {
      if (!agent || !isRoot(agent)) return
      errored.add(String(agent.id))
      log('root 会话出错:', String(agent.id))
    })

    // ---------- HTTP routes & UI injection ----------
    const disposers = []
    if (webServer !== undefined) {
      const json = (res, status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      const text = (res, status, body, type) => {
        res.writeHead(status, { 'content-type': type || 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end(body)
      }
      // Mascot images ship inside the package under ./assets; a failed read is
      // a plain 404 and never affects the other routes.
      const imgAsset = (res, fileName) => {
        try {
          const buf = fs.readFileSync(path.join(__dirname, 'assets', fileName))
          res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800, immutable' })
          res.end(buf)
        } catch {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('not found')
        }
      }
      const originOk = (req) => {
        const origin = req.headers.origin
        if (origin === undefined) return true
        try { const u = new URL(origin); return u.hostname === '127.0.0.1' || u.hostname === 'localhost' } catch { return false }
      }
      const statePayload = () => ({
        armed, state, deadline, countdownSec: cfg.countdownSec, erroredCount: errored.size, lastSkip,
      })

      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/state',
        handler: (req, res) => json(res, 200, statePayload()),
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/arm',
        handler: (req, res) => { if (!originOk(req)) return json(res, 403, { error: 'origin rejected' }); setArmed(true); json(res, 200, statePayload()) },
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/disarm',
        handler: (req, res) => { if (!originOk(req)) return json(res, 403, { error: 'origin rejected' }); setArmed(false); json(res, 200, statePayload()) },
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/cancel',
        handler: (req, res) => { if (!originOk(req)) return json(res, 403, { error: 'origin rejected' }); const ok = cancelShutdown(); json(res, 200, { ok, ...statePayload() }) },
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/ui.js',
        handler: (req, res) => text(res, 200, UI_JS, 'text/javascript; charset=utf-8'),
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/img/sleep.webp',
        handler: (req, res) => imgAsset(res, 'mascot-sleep.webp'),
      }))
      disposers.push(webServer.register({
        kind: 'exact', path: BASE + '/img/awake.webp',
        handler: (req, res) => imgAsset(res, 'mascot-awake.webp'),
      }))

      disposers.push(webServer.tapIndex((html) => {
        if (html.includes(NAME)) return html
        const tag = '<script defer src="' + BASE + '/ui.js"></script>'
        return html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag
      }))
      log('HTTP 路由与 UI 注入已注册')
      const offIndexInject = ctx.on('webserver/index-inject', (table) => {
        table.push({ kind: 'script-src', src: BASE + '/ui.js', placement: 'body' })
      })
      disposers.push(() => {
        try { if (typeof offIndexInject === 'function') offIndexInject() } catch { /* ignore */ }
      })
    }

    log('插件已挂载：root 会话 ' + roots().length + ' 个，运行中 ' + rootsRunning() + ' 个（模式默认关闭，点右下角鲸鱼娘按钮开启）')
    return () => { for (const d of disposers) { try { d() } catch { /* ignore */ } } }
  },
}

// Exposed for the local test harness (test/harness/server.js). Harmless for
// cordis: it only reads .name/.inject/.apply.
module.exports.UI_JS = UI_JS
module.exports.BASE = BASE
