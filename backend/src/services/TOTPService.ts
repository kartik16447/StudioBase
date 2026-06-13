// RFC 6238 TOTP using Web Crypto (works in Cloudflare Workers)

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Uint8Array): string {
  let out = '';
  let bits = 0, val = 0;
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_CHARS[(val >> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_CHARS[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, '');
  const buf = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0, val = 0, idx = 0;
  for (const ch of clean) {
    const n = BASE32_CHARS.indexOf(ch);
    if (n < 0) continue;
    val = (val << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      buf[idx++] = (val >> bits) & 0xff;
    }
  }
  return buf;
}

async function hotp(secretBytes: Uint8Array, counter: bigint): Promise<number> {
  const counterBuf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const key = await crypto.subtle.importKey(
    'raw', secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = mac[19] & 0xf;
  const code = ((mac[offset] & 0x7f) << 24) |
               ((mac[offset + 1] & 0xff) << 16) |
               ((mac[offset + 2] & 0xff) << 8) |
               (mac[offset + 3] & 0xff);
  return code % 1_000_000;
}

export class TOTPService {
  // Generate a new random 160-bit (20-byte) TOTP secret
  static generateSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return base32Encode(bytes);
  }

  // Returns an otpauth:// URI for QR code rendering
  static otpauthUri(secret: string, email: string, issuer = 'StudioBase'): string {
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params}`;
  }

  // Verify a 6-digit TOTP code. Allows ±1 step (30-second window on each side).
  static async verify(secret: string, code: string): Promise<boolean> {
    const num = parseInt(code.replace(/\s/g, ''), 10);
    if (isNaN(num) || code.replace(/\s/g, '').length !== 6) return false;
    const secretBytes = base32Decode(secret);
    const step = BigInt(Math.floor(Date.now() / 1000 / 30));
    for (const delta of [-1n, 0n, 1n]) {
      const expected = await hotp(secretBytes, step + delta);
      if (expected === num) return true;
    }
    return false;
  }

  // Generate 10 random backup codes (8 hex chars each)
  static generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () => {
      const b = crypto.getRandomValues(new Uint8Array(4));
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    });
  }
}
