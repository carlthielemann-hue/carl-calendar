// One-time server secrets: asks for your sign-in password, generates the encryption key and
// push-notification keys, and uploads all of them to Cloudflare (never written to the repo).
// Run after the first deploy:  node scripts/setup-secrets.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => (s.includes(q) ? process.stdout.write(s) : process.stdout.write(''))
    rl.question(q, (a) => {
      rl.close()
      process.stdout.write('\n')
      resolve(a.trim())
    })
  })
}

let pw = ''
while (pw.length < 10) {
  pw = await askHidden('Choose your Command Center password (10+ characters, typing is hidden): ')
  if (pw.length < 10) console.log('Too short — try again.')
}
const again = await askHidden('Type it again: ')
if (again !== pw) {
  console.log('The two passwords don’t match. Run the script again.')
  process.exit(1)
}

const { subtle } = globalThis.crypto
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey))
const jwk = await subtle.exportKey('jwk', kp.privateKey)

const secrets = {
  OWNER_PASSWORD: pw,
  ENCRYPTION_KEY: randomBytes(48).toString('base64'),
  VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'),
  VAPID_PRIVATE_JWK: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }),
  VAPID_SUBJECT: 'mailto:owner@command-center.invalid',
}

const dir = mkdtempSync(join(tmpdir(), 'cc-secrets-'))
const file = join(dir, 'secrets.json')
try {
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 })
  execFileSync('npx', ['wrangler', 'secret', 'bulk', file], { stdio: 'inherit' })
  console.log('\n✅ Secrets saved on Cloudflare. Sign in with the password you just chose.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
