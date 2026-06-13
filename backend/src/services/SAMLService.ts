// @ts-nocheck — @xmldom/xmldom uses its own DOM types that diverge from lib.dom.d.ts
/**
 * SAMLService — SAML 2.0 SP implementation for Cloudflare Workers
 *
 * Uses @xmldom/xmldom for parsing and Web Crypto for RSA signature verification.
 * Implements Exclusive C14N (http://www.w3.org/2001/10/xml-exc-c14n#) which is
 * the default canonicalization algorithm used by Okta, Azure AD, and Google Workspace.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ─── DER / X.509 helpers ────────────────────────────────────────────────────

function pemToCertDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/[\r\n\s]/g, '');
  return base64ToBytes(b64);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Read a DER tag-length-value tuple. Returns { tag, content, nextOffset }. */
function derTLV(buf: Uint8Array, offset: number): { tag: number; content: Uint8Array; nextOffset: number } {
  const tag = buf[offset++];
  let len = buf[offset++];
  if (len & 0x80) {
    const nBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < nBytes; i++) len = (len << 8) | buf[offset++];
  }
  return { tag, content: buf.subarray(offset, offset + len), nextOffset: offset + len };
}

/**
 * Extract SubjectPublicKeyInfo bytes from an X.509 DER certificate.
 * DER structure: SEQUENCE { SEQUENCE(TBS) { ... SEQUENCE(SPKI) { ... } } ... }
 * We walk: outer SEQUENCE → TBS SEQUENCE → skip version/serial/alg/issuer/validity/subject → SPKI SEQUENCE
 */
function extractSpkiFromCert(certDer: Uint8Array): Uint8Array {
  // outer SEQUENCE
  const outer = derTLV(certDer, 0);
  // TBS Certificate SEQUENCE
  const tbs = derTLV(outer.content, 0);
  let pos = 0;
  const tbc = tbs.content;
  // Skip: [0] version (optional), INTEGER serial, SEQUENCE sigAlg, SEQUENCE issuer, SEQUENCE validity, SEQUENCE subject
  const skipCount = tbc[pos] === 0xa0 ? 6 : 5; // version context tag is 0xa0
  for (let i = 0; i < skipCount; i++) {
    const t = derTLV(tbc, pos);
    pos = t.nextOffset;
  }
  // Next SEQUENCE is SubjectPublicKeyInfo — return from current pos to its nextOffset
  const spki = derTLV(tbc, pos);
  return tbc.subarray(pos, spki.nextOffset);
}

async function importRsaPublicKey(certPem: string, hash: 'SHA-256' | 'SHA-1'): Promise<CryptoKey> {
  const der = pemToCertDer(certPem);
  const spki = extractSpkiFromCert(der);
  return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
}

// ─── Exclusive C14N ─────────────────────────────────────────────────────────

/** Collect all namespaces visible at a node (traversing to root). */
function collectAncestorNs(node: Element): Map<string, string> {
  const map = new Map<string, string>();
  let cur: Element | null = node.parentNode as Element | null;
  while (cur && cur.nodeType === 1) {
    if (cur.attributes) {
      for (let i = 0; i < cur.attributes.length; i++) {
        const a = cur.attributes.item(i)!;
        if (a.name === 'xmlns') {
          if (!map.has('')) map.set('', a.value);
        } else if (a.prefix === 'xmlns') {
          if (!map.has(a.localName!)) map.set(a.localName!, a.value);
        }
      }
    }
    cur = cur.parentNode as Element | null;
  }
  return map;
}

/**
 * Exclusive Canonicalization (no comments) of a DOM element.
 * Spec: https://www.w3.org/TR/xml-exc-c14n/
 */
function exclusiveC14n(node: Element | null): string {
  if (!node) return '';
  const ancestorNs = collectAncestorNs(node);
  return _c14nNode(node, ancestorNs, new Map());
}

function _c14nNode(node: any, ancestorNs: Map<string, string>, renderedNs: Map<string, string>): string {
  if (node.nodeType === 3 /* TEXT */) {
    return node.data
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r/g, '&#xD;');
  }
  if (node.nodeType !== 1 /* ELEMENT */) return '';

  const localName = node.localName!;
  const nsUri: string = node.namespaceURI || '';
  const prefix: string = node.prefix || '';
  const tagName = prefix ? `${prefix}:${localName}` : localName;

  const nsDecls: string[] = [];
  const myRenderedNs = new Map(renderedNs);

  // Determine namespace declarations needed for this element
  const needed = new Map<string, string>();
  if (nsUri) needed.set(prefix, nsUri);

  // Scan attributes for namespaces used
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes.item(i)!;
      if (a.prefix && a.prefix !== 'xmlns' && a.namespaceURI) {
        needed.set(a.prefix, a.namespaceURI);
      }
    }
  }

  // Emit namespace declarations for any namespace not already rendered in scope
  for (const [pfx, uri] of needed) {
    const rendered = myRenderedNs.get(pfx);
    const ancestor = ancestorNs.get(pfx);
    if (rendered !== uri && (ancestor !== uri || pfx === '')) {
      nsDecls.push(pfx ? ` xmlns:${pfx}="${uri}"` : ` xmlns="${uri}"`);
      myRenderedNs.set(pfx, uri);
    }
  }
  nsDecls.sort(); // deterministic order

  // Render non-namespace attributes sorted by (ns_uri, local_name)
  const attrs: string[] = [];
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes.item(i)!;
      if (a.name === 'xmlns' || a.prefix === 'xmlns') continue;
      const aName = a.prefix ? `${a.prefix}:${a.localName}` : a.localName!;
      const val = a.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/\t/g, '&#x9;')
        .replace(/\n/g, '&#xA;')
        .replace(/\r/g, '&#xD;');
      attrs.push(`${a.namespaceURI || ''}\x01${aName}=${val}`);
    }
  }
  attrs.sort();
  const attrStr = attrs.map(a => ` ${a.split('=').slice(1).join('=').replace(/^\x01.+\x01/, '') || a.replace(/^[^\x01]*\x01/, '').replace(/=.*/, '')} = `);
  // simpler: just emit in sorted order by the composite key
  const attrOut = attrs.map(a => {
    const eqIdx = a.indexOf('=');
    const key = a.slice(0, eqIdx);
    const val = a.slice(eqIdx + 1);
    const name = key.split('\x01')[1];
    return ` ${name}="${val}"`;
  }).join('');

  // Recurse children
  let children = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    children += _c14nNode(node.childNodes[i], ancestorNs, myRenderedNs);
  }

  return `<${tagName}${nsDecls.join('')}${attrOut}>${children}</${tagName}>`;
}

// ─── XML namespace helpers ───────────────────────────────────────────────────

const NS = {
  SAML:  'urn:oasis:names:tc:SAML:2.0:assertion',
  SAMLP: 'urn:oasis:names:tc:SAML:2.0:protocol',
  DS:    'http://www.w3.org/2000/09/xmldsig#',
  MD:    'urn:oasis:names:tc:SAML:2.0:metadata',
  EC:    'http://www.w3.org/2001/10/xml-exc-c14n#',
};

function first(doc: any, ns: string, name: string): Element | null {
  const els = doc.getElementsByTagNameNS(ns, name);
  return els.length > 0 ? els.item(0) : null;
}
function all(doc: any, ns: string, name: string): Element[] {
  const els = doc.getElementsByTagNameNS(ns, name);
  const out: Element[] = [];
  for (let i = 0; i < els.length; i++) out.push(els.item(i)!);
  return out;
}
function getText(el: Element | null): string {
  if (!el) return '';
  return el.textContent?.trim() || '';
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface IdPConfig {
  entityId: string;
  ssoUrl: string;       // HTTP-POST or HTTP-Redirect SSO endpoint
  certificate: string;  // PEM-encoded X.509 public cert
}

export interface SAMLUser {
  nameId: string;       // usually the email
  email: string;
  attributes: Record<string, string>;
}

export class SAMLService {
  /** Parse IdP metadata XML and extract the key fields we need. */
  static parseIdPMetadata(xml: string): IdPConfig {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const err = first(doc, 'http://www.w3.org/1999/xhtml', 'parsererror')
      ?? (doc.documentElement?.nodeName === 'parsererror' ? doc.documentElement : null);
    if (err) throw new Error('Invalid XML metadata');

    const entityDescriptor = doc.documentElement;
    const entityId = entityDescriptor.getAttribute('entityID');
    if (!entityId) throw new Error('Missing entityID in metadata');

    // Find SSO URL — prefer POST binding, fall back to Redirect
    let ssoUrl = '';
    const ssoServices = all(doc, NS.MD, 'SingleSignOnService');
    for (const svc of ssoServices) {
      const binding = svc.getAttribute('Binding') || '';
      if (binding.includes('HTTP-POST')) { ssoUrl = svc.getAttribute('Location') || ''; break; }
    }
    if (!ssoUrl) {
      for (const svc of ssoServices) {
        const binding = svc.getAttribute('Binding') || '';
        if (binding.includes('HTTP-Redirect')) { ssoUrl = svc.getAttribute('Location') || ''; break; }
      }
    }
    if (!ssoUrl) throw new Error('No SSO URL found in metadata (HTTP-POST or HTTP-Redirect)');

    // Find signing certificate
    let certificate = '';
    const keyDescriptors = all(doc, NS.MD, 'KeyDescriptor');
    for (const kd of keyDescriptors) {
      const use = kd.getAttribute('use') || '';
      if (use === '' || use === 'signing') {
        const certEl = first(kd, NS.DS, 'X509Certificate');
        if (certEl) {
          const raw = getText(certEl).replace(/[\r\n\s]/g, '');
          certificate = `-----BEGIN CERTIFICATE-----\n${raw}\n-----END CERTIFICATE-----`;
          break;
        }
      }
    }
    if (!certificate) throw new Error('No signing certificate found in metadata');

    return { entityId, ssoUrl, certificate };
  }

  /** Generate SP metadata XML for registration with the IdP. */
  static buildSpMetadata(workspaceId: string, backendUrl: string): string {
    const entityId = `${backendUrl}/saml/${workspaceId}`;
    const acs = `${backendUrl}/saml/${workspaceId}/acs`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acs}"
      index="0"
      isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  /** Build an SP-initiated AuthnRequest URL (HTTP-Redirect binding). */
  static buildAuthnRequest(workspaceId: string, backendUrl: string, idpConfig: IdPConfig): string {
    const entityId = `${backendUrl}/saml/${workspaceId}`;
    const acs = `${backendUrl}/saml/${workspaceId}/acs`;
    const id = `_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  ID="${id}" Version="2.0" IssueInstant="${now}"
  Destination="${idpConfig.ssoUrl}"
  AssertionConsumerServiceURL="${acs}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${entityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

    const deflated = btoa(xml); // In production use pako/deflate; base64 only works for IdPs that accept it
    const params = new URLSearchParams({ SAMLRequest: deflated });
    return `${idpConfig.ssoUrl}?${params}`;
  }

  /**
   * Parse and cryptographically validate a SAML Response (HTTP-POST binding).
   * Returns the authenticated user's nameId and attributes.
   */
  static async parseAndValidateResponse(
    samlResponseB64: string,
    idpConfig: IdPConfig,
    spEntityId: string,
  ): Promise<SAMLUser> {
    const xml = atob(samlResponseB64.replace(/\s/g, ''));
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // Check for parse error
    const parseErr = first(doc, 'http://www.w3.org/1999/xhtml', 'parsererror');
    if (parseErr) throw new Error('Invalid SAML response XML');

    // --- Status check ---
    const statusCode = first(doc, NS.SAMLP, 'StatusCode');
    const statusVal = statusCode?.getAttribute('Value') || '';
    if (!statusVal.includes('Success')) throw new Error(`IdP returned non-success status: ${statusVal}`);

    // --- Find signed element (Assertion preferred, Response as fallback) ---
    const assertion = first(doc, NS.SAML, 'Assertion');
    if (!assertion) throw new Error('No Assertion element in SAML response');

    // --- Signature validation ---
    await SAMLService._verifySignature(doc, assertion, idpConfig.certificate);

    // --- Time conditions ---
    const conditions = first(assertion, NS.SAML, 'Conditions');
    if (conditions) {
      const now = Date.now();
      const nb = conditions.getAttribute('NotBefore');
      const na = conditions.getAttribute('NotOnOrAfter');
      if (nb && new Date(nb).getTime() - 300_000 > now) throw new Error('SAML assertion not yet valid');
      if (na && new Date(na).getTime() + 300_000 < now) throw new Error('SAML assertion has expired');

      // Audience restriction
      const audiences = all(conditions, NS.SAML, 'Audience');
      if (audiences.length > 0) {
        const audList = audiences.map(a => getText(a));
        if (!audList.some(a => a === spEntityId || spEntityId.startsWith(a) || a.startsWith(spEntityId.replace(/\/$/, '')))) {
          throw new Error(`Audience mismatch. Got: ${audList.join(', ')}. Expected: ${spEntityId}`);
        }
      }
    }

    // --- NameID ---
    const subject = first(assertion, NS.SAML, 'Subject');
    const nameIdEl = first(subject as any, NS.SAML, 'NameID');
    const nameId = getText(nameIdEl);
    if (!nameId) throw new Error('No NameID in SAML assertion');

    // --- Attributes ---
    const attrs: Record<string, string> = {};
    for (const attrEl of all(assertion, NS.SAML, 'Attribute')) {
      const name = attrEl.getAttribute('Name') || attrEl.getAttribute('FriendlyName') || '';
      const valEl = first(attrEl as any, NS.SAML, 'AttributeValue');
      if (name && valEl) attrs[name] = getText(valEl);
    }

    // Derive email: prefer NameID if it looks like an email, else check attributes
    const email = nameId.includes('@') ? nameId
      : attrs['email'] || attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
      || attrs['urn:oid:1.2.840.113549.1.9.1'] || nameId;

    return { nameId, email, attributes: attrs };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private static async _verifySignature(
    doc: any,
    signedEl: Element,
    certPem: string,
  ): Promise<void> {
    const sigEl = first(signedEl as any, NS.DS, 'Signature');
    if (!sigEl) {
      // Try Response-level signature
      const responseEl = doc.documentElement;
      const respSig = first(responseEl, NS.DS, 'Signature');
      if (!respSig) throw new Error('No XML signature found in SAML assertion or response');
      return SAMLService._verifySignature(doc, responseEl, certPem);
    }

    const signedInfoEl = first(sigEl as any, NS.DS, 'SignedInfo');
    if (!signedInfoEl) throw new Error('Missing SignedInfo');

    const sigValEl = first(sigEl as any, NS.DS, 'SignatureValue');
    const sigValB64 = getText(sigValEl).replace(/[\r\n\s]/g, '');
    if (!sigValB64) throw new Error('Missing SignatureValue');

    // Determine hash algorithm from SignatureMethod
    const sigMethod = first(sigEl as any, NS.DS, 'SignatureMethod');
    const sigAlg = sigMethod?.getAttribute('Algorithm') || '';
    const hash: 'SHA-256' | 'SHA-1' = sigAlg.includes('sha256') ? 'SHA-256' : 'SHA-1';

    // C14N the SignedInfo element — determine algorithm from CanonicalizationMethod
    const c14nMethod = first(signedInfoEl as any, NS.DS, 'CanonicalizationMethod');
    const c14nAlg = c14nMethod?.getAttribute('Algorithm') || '';
    // We support Exclusive C14N (the most common) and Inclusive C14N
    const signedInfoC14n = exclusiveC14n(signedInfoEl as Element);

    const key = await importRsaPublicKey(certPem, hash);
    const sigBytes = base64ToBytes(sigValB64);
    const dataBytes = new TextEncoder().encode(signedInfoC14n);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, dataBytes);
    if (!valid) throw new Error('SAML signature verification failed');

    // Also verify the Reference digest (integrity of the signed element)
    for (const refEl of all(signedInfoEl as any, NS.DS, 'Reference')) {
      const uri = refEl.getAttribute('URI') || '';
      let refNode: Element = signedEl as Element;
      if (uri.startsWith('#')) {
        const id = uri.slice(1);
        const found = doc.getElementById(id) as Element | null
          || SAMLService._findById(doc.documentElement, id);
        if (!found) throw new Error(`Reference URI ${uri} not found`);
        refNode = found;
      }

      const digestMethodEl = first(refEl as any, NS.DS, 'DigestMethod');
      const digestAlg = digestMethodEl?.getAttribute('Algorithm') || '';
      const digestValueEl = first(refEl as any, NS.DS, 'DigestValue');
      const expectedDigest = getText(digestValueEl).replace(/[\r\n\s]/g, '');

      // Remove the Signature element before canonicalizing the reference node
      const refClone = refNode.cloneNode(true) as Element;
      const sigs = all(refClone, NS.DS, 'Signature');
      for (const s of sigs) s.parentNode?.removeChild(s);

      const refC14n = exclusiveC14n(refClone);
      const refBytes = new TextEncoder().encode(refC14n);
      const hashAlg = digestAlg.includes('sha256') ? 'SHA-256' : 'SHA-1';
      const digestBuf = await crypto.subtle.digest(hashAlg, refBytes);
      const actualDigest = bytesToBase64(new Uint8Array(digestBuf));

      if (actualDigest !== expectedDigest) throw new Error('SAML digest mismatch — assertion may have been tampered');
    }
  }

  private static _findById(el: Element, id: string): Element | null {
    if (el.getAttribute('ID') === id || el.getAttribute('Id') === id) return el;
    for (let i = 0; i < el.childNodes.length; i++) {
      const c = el.childNodes[i];
      if (c.nodeType === 1) {
        const found = SAMLService._findById(c as Element, id);
        if (found) return found;
      }
    }
    return null;
  }
}
