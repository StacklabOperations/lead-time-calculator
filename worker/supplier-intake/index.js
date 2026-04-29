// stackabl-supplier-intake — smart endpoint for Supplier Intake tool
// Handles multi-step Aligni operations: manufacturer + vendor + linecard + contact
// All Aligni API logic lives here; the UI is a thin form on top.

const ALIGNI_URL = 'https://stacklab.aligni.com/api/v3/graphql';

// 10 req/min confirmed rate limit. Drop to 2100 once Aligni upgrades account.
const RATE_DELAY = 6100;

// Allowed CORS origins
const ALLOWED_ORIGINS = new Set([
  'https://stacklaboperations.github.io',
  'http://localhost',
  'http://127.0.0.1',
]);

// ─── In-memory caches (warm isolate) ──────────────────────────────────────────
let _mfrCache = null, _mfrCacheAt = 0;
let _venCache = null, _venCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

// Rate-limit tracker (best-effort within an isolate)
let _lastAlignI = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function aligni(token, query) {
  const since = Date.now() - _lastAlignI;
  if (since < RATE_DELAY) await wait(RATE_DELAY - since);
  _lastAlignI = Date.now();

  const resp = await fetch(ALIGNI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Aligni HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// Escape a value for inline GraphQL string interpolation
function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://stacklaboperations.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResp(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status ?? 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ─── Manufacturer / vendor list helpers (cached) ─────────────────────────────

async function getAllManufacturers(token) {
  if (_mfrCache && Date.now() - _mfrCacheAt < CACHE_TTL) return _mfrCache;
  const data = await aligni(token, `{ manufacturers(first: 500) { nodes { id legacyId name website } } }`);
  _mfrCache = data?.data?.manufacturers?.nodes ?? [];
  _mfrCacheAt = Date.now();
  return _mfrCache;
}

async function getAllVendors(token) {
  if (_venCache && Date.now() - _venCacheAt < CACHE_TTL) return _venCache;
  const data = await aligni(token, `{ vendors(first: 500) { nodes { id legacyId name website } } }`);
  _venCache = data?.data?.vendors?.nodes ?? [];
  _venCacheAt = Date.now();
  return _venCache;
}

// Simple trigram-based similarity [0–1]
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tri = s => {
    const g = new Set();
    for (let i = 0; i <= s.length - 3; i++) g.add(s.slice(i, i + 3));
    return g;
  };
  const ta = tri(a), tb = tri(b);
  const inter = [...ta].filter(t => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Route: POST /search ──────────────────────────────────────────────────────
// Body: { type: "manufacturer"|"vendor", q: "..." }
// Returns: { results: [{ id, legacyId, name, website }] }

async function handleSearch(body, token, origin) {
  const { type, q } = body;
  if (!type || !['manufacturer', 'vendor'].includes(type)) {
    return jsonResp({ error: 'type must be "manufacturer" or "vendor"' }, 400, origin);
  }

  const query = (q ?? '').trim().toLowerCase();

  const list = type === 'manufacturer'
    ? await getAllManufacturers(token)
    : await getAllVendors(token);

  const results = query
    ? list.filter(r => r.name.toLowerCase().includes(query)).slice(0, 20)
    : list.slice(0, 20);

  return jsonResp({ results }, 200, origin);
}

// ─── Route: POST /vendor-contacts ─────────────────────────────────────────────
// Body: { vendor_id: "ven_xxx" }
// Returns: { contacts: [...] }

async function handleVendorContacts(body, token, origin) {
  const { vendor_id } = body;
  if (!vendor_id) return jsonResp({ error: 'vendor_id required' }, 400, origin);

  const data = await aligni(token, `{
    vendor(id: "${esc(vendor_id)}") {
      contacts {
        nodes {
          id legacyId firstName lastName email jobPosition canReceivePos canReceiveRfqs
        }
      }
    }
  }`);

  const contacts = data?.data?.vendor?.contacts?.nodes ?? [];
  return jsonResp({ contacts }, 200, origin);
}

// ─── Route: POST /parse ───────────────────────────────────────────────────────
// Body: { text: "..." } OR { image_base64: "..." }
// Returns: { manufacturer: {...}, vendor: {...}, contact: {...} }

const PARSE_SCHEMA = `{"manufacturer":{"name":"","website":""},"vendor":{"name":"","website":""},"contact":{"firstName":"","lastName":"","email":"","jobPosition":""}}`;

async function handleParse(body, env, origin) {
  const { text, image_base64 } = body;
  if (!text && !image_base64) {
    return jsonResp({ error: 'text or image_base64 required' }, 400, origin);
  }
  if (!env.AI) {
    return jsonResp({ error: 'AI binding not configured on this worker' }, 500, origin);
  }

  const systemPrompt = `Extract supplier contact information from the input. Return ONLY valid JSON with exactly this structure: ${PARSE_SCHEMA}. Leave fields as empty string if not found. No markdown, no explanation.`;

  let aiResult;
  try {
    if (text) {
      aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract supplier info:\n\n${text}` },
        ],
      });
    } else {
      // Vision model for images
      const imageData = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
      aiResult = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        image: [...atob(imageData)].map(c => c.charCodeAt(0)),
        prompt: `${systemPrompt}\n\nImage content:`,
        max_tokens: 512,
      });
    }
  } catch (err) {
    return jsonResp({ error: `AI model error: ${err.message}` }, 500, origin);
  }

  const responseText = aiResult?.response ?? aiResult?.result?.response ?? '';
  try {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON block in response');
    const parsed = JSON.parse(match[0]);
    return jsonResp(parsed, 200, origin);
  } catch {
    // Return empty scaffold so the UI can still pre-fill partial results
    return jsonResp({
      manufacturer: { name: '', website: '' },
      vendor: { name: '', website: '' },
      contact: { firstName: '', lastName: '', email: '', jobPosition: '' },
      _parse_warning: 'AI could not extract structured fields — fill in manually',
    }, 200, origin);
  }
}

// ─── Route: POST /check-duplicates ────────────────────────────────────────────
// Body: { manufacturer_name?: "...", vendor_name?: "...", contact_email?: "..." }
// Returns: { manufacturer_matches, vendor_matches, contact_matches }

async function handleCheckDuplicates(body, token, origin) {
  const { manufacturer_name, vendor_name, contact_email } = body;
  const results = { manufacturer_matches: [], vendor_matches: [], contact_matches: [] };

  if (manufacturer_name) {
    const mfrs = await getAllManufacturers(token);
    const q = manufacturer_name.toLowerCase();
    results.manufacturer_matches = mfrs
      .filter(m => m.name.toLowerCase().includes(q) || similarity(m.name.toLowerCase(), q) > 0.65)
      .slice(0, 5);
  }

  if (vendor_name) {
    const vens = await getAllVendors(token);
    const q = vendor_name.toLowerCase();
    results.vendor_matches = vens
      .filter(v => v.name.toLowerCase().includes(q) || similarity(v.name.toLowerCase(), q) > 0.65)
      .slice(0, 5);
  }

  if (contact_email) {
    const data = await aligni(token, `{
      contacts(first: 500) {
        nodes { id firstName lastName email jobPosition }
      }
    }`);
    const contacts = data?.data?.contacts?.nodes ?? [];
    results.contact_matches = contacts
      .filter(c => c.email?.toLowerCase() === contact_email.toLowerCase())
      .slice(0, 5);
  }

  return jsonResp(results, 200, origin);
}

// ─── Route: POST /submit ──────────────────────────────────────────────────────

async function handleSubmit(body, token, origin) {
  const { mode, manufacturer, vendor, contact, contacts_to_remove = [], options = {} } = body;

  const created = { manufacturer_id: null, vendor_id: null, contact_id: null };
  const removed = [];
  let linecard_added = false;
  const warnings = [];
  const errors = [];

  // ── Validate mode ──────────────────────────────────────────────────────────
  const VALID_MODES = ['new_everything', 'existing_manufacturer_new_vendor', 'existing_vendor_new_contact'];
  if (!VALID_MODES.includes(mode)) {
    return jsonResp({ success: false, errors: [`Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`] }, 400, origin);
  }

  if (mode === 'new_everything') {
    if (!manufacturer?.name) return jsonResp({ success: false, errors: ['manufacturer.name required'] }, 400, origin);
    if (!vendor?.name) return jsonResp({ success: false, errors: ['vendor.name required'] }, 400, origin);
  }
  if (mode === 'existing_manufacturer_new_vendor') {
    if (!manufacturer?.id) return jsonResp({ success: false, errors: ['manufacturer.id required'] }, 400, origin);
    if (!vendor?.name) return jsonResp({ success: false, errors: ['vendor.name required'] }, 400, origin);
  }
  if (mode === 'existing_vendor_new_contact') {
    if (!vendor?.id) return jsonResp({ success: false, errors: ['vendor.id required'] }, 400, origin);
    if (!contact && contacts_to_remove.length === 0) {
      return jsonResp({ success: false, errors: ['contact or contacts_to_remove required'] }, 400, origin);
    }
  }

  try {
    // ── Step 1: Create manufacturer (new_everything only) ───────────────────
    if (mode === 'new_everything') {
      const fields = [`name: "${esc(manufacturer.name)}"`];
      if (manufacturer.website) fields.push(`website: "${esc(manufacturer.website)}"`);
      if (manufacturer.shortName) fields.push(`shortName: "${esc(manufacturer.shortName)}"`);

      const r = await aligni(token, `mutation {
        manufacturerCreate(manufacturerInput: {
          ${fields.join(', ')}
        }) {
          manufacturer { id legacyId name }
          errors
        }
      }`);

      const p = r?.data?.manufacturerCreate;
      if (p?.errors?.length) {
        errors.push(`Manufacturer creation failed: ${p.errors.join(', ')}`);
        return jsonResp({ success: false, created, removed, linecard_added, warnings, errors }, 200, origin);
      }
      created.manufacturer_id = p?.manufacturer?.id;

      // Bust manufacturer cache so typeahead reflects new record
      _mfrCache = null;
    } else if (manufacturer?.id) {
      created.manufacturer_id = manufacturer.id;
    }

    // ── Step 2: Create vendor ───────────────────────────────────────────────
    let vendorId = vendor?.id ?? null;
    let vendorLegacyId = vendor?.legacyId ?? null;

    if (mode === 'new_everything' || mode === 'existing_manufacturer_new_vendor') {
      const fields = [`name: "${esc(vendor.name)}"`];
      if (vendor.website) fields.push(`website: "${esc(vendor.website)}"`);
      if (vendor.shortName) fields.push(`shortName: "${esc(vendor.shortName)}"`);
      if (vendor.approved || vendor.approvedAt) {
        fields.push(`approvedAt: "${new Date().toISOString()}"`);
      }
      if (vendor.accountNumber) fields.push(`accountNumber: "${esc(vendor.accountNumber)}"`);

      const r = await aligni(token, `mutation {
        vendorCreate(vendorInput: {
          ${fields.join(', ')}
        }) {
          vendor { id legacyId name }
          errors
        }
      }`);

      const p = r?.data?.vendorCreate;
      if (p?.errors?.length) {
        errors.push(`Vendor creation failed: ${p.errors.join(', ')}`);
        return jsonResp({ success: false, created, removed, linecard_added, warnings, errors }, 200, origin);
      }
      vendorId = p?.vendor?.id;
      vendorLegacyId = p?.vendor?.legacyId;
      created.vendor_id = vendorId;

      // Bust vendor cache
      _venCache = null;
    }

    // ── Step 3: Linecard link ────────────────────────────────────────────────
    const needsLinecard = (mode === 'new_everything' || mode === 'existing_manufacturer_new_vendor')
      && created.manufacturer_id && created.vendor_id;

    if (needsLinecard) {
      const r = await aligni(token, `mutation {
        linecardCreate(linecardInput: {
          manufacturerId: "${esc(created.manufacturer_id)}"
          vendorId: "${esc(created.vendor_id)}"
        }) {
          errors
        }
      }`);

      const lcErrors = r?.data?.linecardCreate?.errors ?? [];
      if (lcErrors.length) {
        warnings.push(`Linecard link failed: ${lcErrors.join(', ')}`);
      } else {
        linecard_added = true;
      }
    }

    // ── Step 4: Create contact ───────────────────────────────────────────────
    if (contact) {
      // Resolve first/last name from combined "name" field if needed
      let firstName = contact.firstName ?? '';
      let lastName = contact.lastName ?? '';
      if (!lastName && contact.name) {
        const parts = contact.name.trim().split(/\s+/);
        lastName = parts.pop();
        firstName = parts.join(' ');
      }

      if (!lastName) {
        warnings.push('Contact skipped: lastName is required');
      } else {
        const fields = [`lastName: "${esc(lastName)}"`];
        if (firstName) fields.push(`firstName: "${esc(firstName)}"`);
        if (contact.email) fields.push(`email: "${esc(contact.email)}"`);
        if (contact.jobPosition || contact.title) fields.push(`jobPosition: "${esc(contact.jobPosition || contact.title)}"`);
        if (contact.canReceivePos !== undefined) fields.push(`canReceivePos: ${Boolean(contact.canReceivePos)}`);
        if (contact.canReceiveRfqs !== undefined) fields.push(`canReceiveRfqs: ${Boolean(contact.canReceiveRfqs)}`);

        // contactCreate.vendorId is Int (legacyId), not the ULID string ID
        const targetVendorId = vendorId ?? vendor?.id;
        if (targetVendorId) {
          let legacyId = vendorLegacyId ?? vendor?.legacyId;
          if (!legacyId) {
            // Fetch legacyId — costs one API call
            const vd = await aligni(token, `{ vendor(id: "${esc(targetVendorId)}") { legacyId } }`);
            legacyId = vd?.data?.vendor?.legacyId;
          }
          if (legacyId) fields.push(`vendorId: ${parseInt(legacyId, 10)}`);
        }

        const r = await aligni(token, `mutation {
          contactCreate(contactInput: {
            ${fields.join(', ')}
          }) {
            contact { id firstName lastName }
            errors
          }
        }`);

        const p = r?.data?.contactCreate;
        if (p?.errors?.length) {
          warnings.push(`Contact creation failed: ${p.errors.join(', ')}`);
        } else {
          created.contact_id = p?.contact?.id;
        }
      }
    }

    // ── Step 5: Remove contacts ──────────────────────────────────────────────
    // Schema has no contactDeactivate — contactDelete is the only option.
    for (const item of contacts_to_remove) {
      if (!item.id) continue;
      const r = await aligni(token, `mutation {
        contactDelete(contactId: "${esc(item.id)}") {
          errors
        }
      }`);
      const errs = r?.data?.contactDelete?.errors ?? [];
      if (errs.length) {
        warnings.push(`Contact ${item.id} deletion failed: ${errs.join(', ')}`);
      } else {
        removed.push({ id: item.id, action: 'deleted' });
      }
    }

    return jsonResp({ success: true, created, removed, linecard_added, warnings, errors }, 200, origin);

  } catch (err) {
    errors.push(
      `Unexpected error: ${err.message}. ` +
      `Partial state — manufacturer_id: ${created.manufacturer_id ?? 'none'}, ` +
      `vendor_id: ${created.vendor_id ?? 'none'}. ` +
      `Clean up manually if needed.`
    );
    return jsonResp({ success: false, created, removed, linecard_added, warnings, errors }, 200, origin);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const path = new URL(request.url).pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return jsonResp({ error: 'Method not allowed' }, 405, origin);
    }

    const token = env.ALIGNI_TOKEN;
    if (!token) return jsonResp({ error: 'ALIGNI_TOKEN secret not set' }, 500, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ error: 'Request body must be valid JSON' }, 400, origin);
    }

    if (path === '/parse')             return handleParse(body, env, origin);
    if (path === '/search')            return handleSearch(body, token, origin);
    if (path === '/vendor-contacts')   return handleVendorContacts(body, token, origin);
    if (path === '/check-duplicates')  return handleCheckDuplicates(body, token, origin);
    if (path === '/submit')            return handleSubmit(body, token, origin);

    return jsonResp({
      error: 'Unknown route',
      routes: ['/parse', '/search', '/vendor-contacts', '/check-duplicates', '/submit'],
    }, 404, origin);
  },
};
