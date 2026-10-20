/**
 * deepseek-chan-sleep-shutdown — UI_JS syntax gate.
 * Writes the plugin's exported UI_JS to a temp file and syntax-checks it with
 * node --check, so a broken emitted script can never pass harness acceptance
 * again (an HTTP 200 alone proves nothing about executability).
 *
 * Launch:  node test/harness/check-ui.js    (exit 0 = UI_JS parses cleanly)
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')

const plugin = require(path.join(__dirname, '..', '..', 'index.js'))
if (typeof plugin.UI_JS !== 'string' || plugin.UI_JS.length < 100) {
  console.error('FAIL: index.js does not export a usable UI_JS string')
  process.exit(1)
}
const tmp = path.join(os.tmpdir(), 'deepseek-chan-sleep-shutdown-ui.js')
fs.writeFileSync(tmp, plugin.UI_JS, 'utf8')
const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' })
if (r.status === 0) {
  console.log('UI_JS syntax OK (' + plugin.UI_JS.length + ' bytes) — node --check passed')
} else {
  console.error('UI_JS syntax FAILED — node --check reported:')
  console.error(r.stderr || r.stdout)
  process.exit(1)
}
