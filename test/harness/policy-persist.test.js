/**
 * deepseek-chan-sleep-shutdown — shutdown-condition policy persistence test.
 * Mounts the REAL index.js against a temporary DSH_HOME, flips the policy
 * through the real POST /policy route, and proves the setting lands on disk
 * ($DSH_HOME/deepseek-chan-sleep-shutdown.json) and is read back on a fresh
 * mount. No real shutdown.exe is ever spawned (no armShutdown is triggered).
 *
 * Launch:  node test/harness/policy-persist.test.js    (exit 0 = all passed)
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert')

const PLUGIN_PATH = path.join(__dirname, '..', '..', 'index.js')
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dcs-policy-test-'))
process.env.DSH_HOME = HOME
const SETTINGS = path.join(HOME, 'deepseek-chan-sleep-shutdown.json')

function mockCtx(routes) {
  return {
    get(name) {
      if (name === 'agents') return { roots: () => [] }
      if (name === 'subprocess') return {}
      if (name === 'webServer') {
        return {
          register: (r) => { routes.push(r); return () => {} },
          tapIndex: () => () => {},
        }
      }
      return undefined
    },
    on: () => () => {},
    setTimeout: () => () => {},
  }
}
function mockReq(body) {
  return {
    headers: {},
    setEncoding() {},
    on(ev, cb) {
      if (ev === 'data' && body) cb(body)
      else if (ev === 'end') cb()
      /* error: never */
    },
  }
}
function mockRes() {
  const r = { status: 0, body: '' }
  r.writeHead = (code) => { r.status = code }
  r.end = (b) => { r.body = String(b) }
  return r
}
function handler(routes, p) {
  const r = routes.find((x) => x.path === p)
  assert.ok(r, 'route registered: ' + p)
  return r.handler
}
async function freshPlugin() {
  delete require.cache[require.resolve(PLUGIN_PATH)]
  return require(PLUGIN_PATH)
}

;(async () => {
  // ---- mount #1: no settings file yet -> seeded from config default (true) ----
  let plugin = await freshPlugin()
  let routes = []
  let dispose = plugin.apply(mockCtx(routes), {})
  assert.ok(fs.existsSync(SETTINGS), 'settings file seeded on first mount')
  assert.strictEqual(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')).onlyOnSuccess, true)

  let st = mockRes()
  handler(routes, '/api/deepseek-chan-sleep-shutdown/state')(mockReq(''), st)
  assert.strictEqual(st.status, 200)
  assert.strictEqual(JSON.parse(st.body).onlyOnSuccess, true, '/state exposes onlyOnSuccess=true')

  // ---- POST /policy { false } -> 200, cfg updated, file written ----
  let pr = mockRes()
  await handler(routes, '/api/deepseek-chan-sleep-shutdown/policy')(
    mockReq('{"onlyOnSuccess":false}'), pr)
  assert.strictEqual(pr.status, 200)
  assert.strictEqual(JSON.parse(pr.body).onlyOnSuccess, false, 'policy response echoes false')
  const onDisk = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))
  assert.strictEqual(onDisk.onlyOnSuccess, false, 'policy persisted to disk')
  console.log('[policy-persist] settings file content after POST /policy:',
    JSON.stringify(fs.readFileSync(SETTINGS, 'utf8')))

  st = mockRes()
  handler(routes, '/api/deepseek-chan-sleep-shutdown/state')(mockReq(''), st)
  assert.strictEqual(JSON.parse(st.body).onlyOnSuccess, false, '/state now false')

  // ---- bad bodies -> 400 ----
  for (const bad of ['not json at all', '{"onlyOnSuccess":"yes"}', '{"other":1}', '']) {
    const r = mockRes()
    await handler(routes, '/api/deepseek-chan-sleep-shutdown/policy')(mockReq(bad), r)
    assert.strictEqual(r.status, 400, 'bad body rejected -> 400: ' + JSON.stringify(bad))
  }

  // ---- origin guard still applies to /policy ----
  const fr = mockRes()
  await handler(routes, '/api/deepseek-chan-sleep-shutdown/policy')(
    { ...mockReq('{"onlyOnSuccess":true}'), headers: { origin: 'http://evil.example' } }, fr)
  assert.strictEqual(fr.status, 403, 'non-loopback origin rejected')

  dispose()

  // ---- mount #2: fresh require -> reads the persisted false back ----
  plugin = await freshPlugin()
  routes = []
  plugin.apply(mockCtx(routes), {})
  st = mockRes()
  handler(routes, '/api/deepseek-chan-sleep-shutdown/state')(mockReq(''), st)
  assert.strictEqual(JSON.parse(st.body).onlyOnSuccess, false,
    'fresh mount loads the persisted policy from disk')

  console.log('[policy-persist] DSH_HOME:', HOME)
  console.log('[policy-persist] ALL ASSERTIONS PASSED')
})().catch((err) => {
  console.error('[policy-persist] FAILED:', err && err.message)
  process.exit(1)
})
