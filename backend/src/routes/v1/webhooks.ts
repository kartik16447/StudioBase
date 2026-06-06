import { Hono } from 'hono'
import { Env, Variables } from '../../types/hono'

export const webhookRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

const KV_KEY = 'sb:build_error:latest'

// ─── Vercel → KV ────────────────────────────────────────────────────────────
// POST /v1/webhooks/vercel
// Vercel fires this on deployment.error. We fetch the error lines and store
// them in KV so the local poll script can pick them up within 30 seconds.
webhookRoutes.post('/vercel', async (c) => {
  const body = await c.req.text()

  // Verify Vercel webhook signature (HMAC-SHA1)
  const signature = c.req.header('x-vercel-signature')
  const secret = c.env.VERCEL_WEBHOOK_SECRET
  if (secret && signature) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (signature !== expected) return c.json({ error: 'invalid signature' }, 401)
  }

  let event: any
  try { event = JSON.parse(body) } catch { return c.json({ error: 'bad json' }, 400) }

  if (event.type !== 'deployment.error') return c.json({ ok: true, skipped: event.type })

  const deployment = event.payload?.deployment ?? {}
  const deploymentId: string = deployment.id ?? ''
  const commitMsg: string = deployment.meta?.githubCommitMessage ?? 'unknown commit'

  // Fetch stderr lines from Vercel API (capped at 3000 chars)
  let errorLines = ''
  if (c.env.VERCEL_TOKEN && deploymentId) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v3/deployments/${deploymentId}/events?type=stderr&limit=100`,
        { headers: { Authorization: `Bearer ${c.env.VERCEL_TOKEN}` } }
      )
      if (res.ok) {
        const logs = await res.json() as any[]
        errorLines = logs
          .map((e: any) => (e.text ?? e.payload?.text ?? '').trim())
          .filter(Boolean)
          .join('\n')
          .slice(0, 3000)
      }
    } catch { /* fall through to link-only fallback */ }
  }

  if (!errorLines) {
    errorLines = `No logs fetched. Check: https://vercel.com/deployments/${deploymentId}`
  }

  // Claude-ready prompt — local script feeds this directly to claude CLI
  const prompt = [
    `Vercel build failed: ${commitMsg}`,
    '',
    errorLines,
    '',
    'Fix the error. grep only, no agents, token efficient. State what you changed after each fix.',
  ].join('\n')

  // Store in KV — local poller picks this up within 30s
  await c.env.TOKEN_CACHE.put(KV_KEY, JSON.stringify({
    prompt,
    commitMsg,
    deploymentId,
    timestamp: Date.now(),
    acked: false,
  }), { expirationTtl: 3600 }) // auto-expire after 1h if never acked

  return c.json({ ok: true, stored: true })
})

// ─── Local poller → read error ───────────────────────────────────────────────
// GET /v1/webhooks/build-error
// Called by the local poll script every 30s. Returns the error if unacked.
webhookRoutes.get('/build-error', async (c) => {
  const secret = c.req.header('x-poll-secret')
  if (secret !== (c.env as any).POLL_SECRET) return c.json({ error: 'unauthorized' }, 401)

  const raw = await c.env.TOKEN_CACHE.get(KV_KEY)
  if (!raw) return c.json({ pending: false })

  const data = JSON.parse(raw)
  if (data.acked) return c.json({ pending: false })

  return c.json({ pending: true, prompt: data.prompt, commitMsg: data.commitMsg })
})

// ─── Local poller → ack after Claude picks it up ─────────────────────────────
// POST /v1/webhooks/build-error/ack
// Called by the local poll script right before launching Claude so we don't
// trigger it twice.
webhookRoutes.post('/build-error/ack', async (c) => {
  const secret = c.req.header('x-poll-secret')
  if (secret !== (c.env as any).POLL_SECRET) return c.json({ error: 'unauthorized' }, 401)

  const raw = await c.env.TOKEN_CACHE.get(KV_KEY)
  if (!raw) return c.json({ ok: true })

  const data = JSON.parse(raw)
  data.acked = true
  await c.env.TOKEN_CACHE.put(KV_KEY, JSON.stringify(data), { expirationTtl: 3600 })

  return c.json({ ok: true })
})
