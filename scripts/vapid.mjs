// Generate VAPID keys for Web Push. Run: node scripts/vapid.mjs
// Then: wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_JWK (paste the printed values).
const { subtle } = globalThis.crypto
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey))
const jwk = await subtle.exportKey('jwk', kp.privateKey)
const b64url = (b) => Buffer.from(b).toString('base64url')
console.log('VAPID_PUBLIC_KEY=' + b64url(raw))
console.log('VAPID_PRIVATE_JWK=' + JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }))
