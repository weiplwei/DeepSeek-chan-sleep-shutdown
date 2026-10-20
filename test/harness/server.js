/**
 * deepseek-chan-sleep-shutdown — local UI test harness (zero-dependency).
 * Serves the plugin's real UI_JS on a mock night-themed page with mock state,
 * so the whale-mascot button can be exercised without a running DSH.
 *
 * Launch:  node test/harness/server.js   (listens on a random port)
 */
'use strict'
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const plugin = require(path.join(__dirname, '..', '..', 'index.js'))
const UI_JS = plugin.UI_JS
const BASE = plugin.BASE || '/api/deepseek-chan-sleep-shutdown'
const ASSETS = path.join(__dirname, '..', '..', 'assets')

// ---- mock state (no real agents, no real shutdown.exe) ----
const mock = {
  armed: false,
  state: 'idle', // idle | countdown | fired
  deadline: 0,
  countdownSec: 60,
  erroredCount: 0,
  lastSkip: null,
}
function statePayload() {
  return {
    armed: mock.armed, state: mock.state, deadline: mock.deadline,
    countdownSec: mock.countdownSec, erroredCount: mock.erroredCount, lastSkip: mock.lastSkip,
  }
}
function startCountdown() {
  mock.state = 'countdown'
  mock.deadline = Date.now() + mock.countdownSec * 1000
}
function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
function serveImage(res, fileName) {
  try {
    const buf = fs.readFileSync(path.join(ASSETS, fileName))
    res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800' })
    res.end(buf)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found (assets/' + fileName + ' missing — button degrades to text)')
  }
}

const INDEX_HTML = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>deepseek-chan-sleep-shutdown — harness</title>',
  '<style>',
  'body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 75% -10%,#232747 0%,#1a1c2e 55%,#0d0e1a 100%);',
  'color:#cfd0e8;font:15px/1.6 system-ui,\'Segoe UI\',\'Microsoft YaHei\',sans-serif}',
  'h1{color:#ffd166;font-weight:600}',
  '.card{max-width:640px;margin:8vh auto 0;padding:24px 28px;background:rgba(20,22,38,.6);',
  'border:1px solid rgba(139,143,245,.30);border-radius:16px;backdrop-filter:blur(8px)}',
  'code{color:#8b8ff5}',
  '.moon{display:inline-block;width:14px;height:14px;border-radius:50%;',
  'box-shadow:3.5px -2.5px 0 0 #ffd166;transform:rotate(-24deg);margin-right:6px}',
  '</style>',
  '</head>',
  '<body>',
  '<div class="card">',
  '<h1><span class="moon"></span>deepseek-chan-sleep-shutdown UI harness</h1>',
  '<p>这是插件的完整 UI_JS 注入页：右下角应出现鲸鱼娘胶囊按钮。</p>',
  '<p>点击按钮 = POST ' + BASE + '/arm（mock）；再点 = /disarm。</p>',
  '<p>手动触发一次倒计时演示：</p>',
  '<p><button onclick="armThenCountdown()" style="cursor:pointer;border:1px solid rgba(139,143,245,.5);',
  'border-radius:9px;padding:6px 14px;color:#cfd0e8;background:rgba(26,28,46,.9)">',
  '演示：进入倒计时</button> <button onclick="fireDemo()" style="cursor:pointer;',
  'border:1px solid rgba(229,72,77,.5);border-radius:9px;padding:6px 14px;color:#ff9aa2;background:rgba(40,20,26,.9)">',
  '演示：fired</button></p>',
  '<p>提示：<code>/img/sleep.webp</code> 与 <code>/img/awake.webp</code> 来自包内 <code>assets/</code>；',
  '图片不存在时返回 404，按钮自动降级为纯文本胶囊。</p>',
  '</div>',
  '<script>',
  'function armThenCountdown(){ fetch("' + BASE + '/arm", { method: "POST" });',
  ' fetch("' + BASE + '/state").then(function(){}) }',
  // countdown demo: arm then flip mock.state via a tiny extra route below
  '</script>',
  '<script defer src="' + BASE + '/ui.js"></script>',
  '</body>',
  '</html>',
  '',
].join('\n')

const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0]
  // strip the plugin BASE prefix so the real UI_JS paths work unchanged
  if (u.startsWith(BASE)) u = u.slice(BASE.length)
  if (u === '') u = '/'
  if (u[0] !== '/') u = '/' + u

  if (req.method === 'GET' && u === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(INDEX_HTML)
    return
  }
  if (req.method === 'GET' && u === '/ui.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    res.end(UI_JS)
    return
  }
  if (req.method === 'GET' && u === '/img/sleep.webp') { serveImage(res, 'mascot-sleep.webp'); return }
  if (req.method === 'GET' && u === '/img/awake.webp') { serveImage(res, 'mascot-awake.webp'); return }
  if (req.method === 'GET' && u === '/state') { json(res, statePayload()); return }
  // demo helper: arm + immediately enter countdown (drives the ring UI)
  if (req.method === 'POST' && u === '/demo-countdown') {
    mock.armed = true
    startCountdown()
    json(res, statePayload())
    return
  }
  if (req.method === 'POST' && u === '/demo-fired') {
    mock.armed = true
    mock.state = 'fired'
    mock.deadline = 0
    json(res, statePayload())
    return
  }
  if (req.method === 'POST' && u === '/arm') { mock.armed = true; json(res, statePayload()); return }
  if (req.method === 'POST' && u === '/disarm') {
    mock.armed = false
    mock.state = 'idle'
    mock.deadline = 0
    json(res, statePayload())
    return
  }
  if (req.method === 'POST' && u === '/cancel') {
    mock.armed = false
    mock.state = 'idle'
    mock.deadline = 0
    json(res, { ok: true, ...statePayload() })
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found: ' + req.method + ' ' + req.url)
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  console.log('deepseek-chan-sleep-shutdown harness: http://127.0.0.1:' + port)
  console.log('  routes: GET /  GET ' + BASE + '/ui.js  GET ' + BASE + '/state')
  console.log('          GET ' + BASE + '/img/sleep.webp  GET ' + BASE + '/img/awake.webp')
  console.log('          POST ' + BASE + '/arm  /disarm  /cancel  /demo-countdown  /demo-fired')
})
