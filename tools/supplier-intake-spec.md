# Supplier Intake Tool — Spec

## Tool Purpose

A single-page web form that creates vendors, manufacturers, and contacts in Aligni without navigating multiple pages. The actual Aligni API work (multi-step mutations in the correct order) lives in a dedicated Cloudflare Worker endpoint (`stackabl-supplier-intake`). The UI is a thin form on top of that endpoint. Future scripts and agents can call the same endpoint directly.

---

## The Three Modes

| Mode | When to Use |
|------|-------------|
| **Mode 1 — New Everything** | Brand-new supplier relationship: create manufacturer + vendor + linecard link + optional contact all at once |
| **Mode 2 — Existing Manufacturer, New Vendor** | Most common for Stacklab. A manufacturer already exists; you're adding a new distributor/reseller. Creates vendor, links to manufacturer's linecard, optionally adds a contact. |
| **Mode 3 — Existing Vendor, Manage Contacts** | Vendor already exists. Add a new contact to them and/or delete existing contacts in one submit. |

---

## Smart Endpoint

**URL:** `https://stackabl-supplier-intake.operations-dae.workers.dev`

**Source:** `worker/supplier-intake/index.js`

**Deploy:** `cd worker/supplier-intake && npx wrangler deploy`

**Secret:** `npx wrangler secret put ALIGNI_TOKEN` (same token as the proxy worker)

**CORS:** Allows `https://stacklaboperations.github.io` only (plus localhost for dev).

---

## Endpoint Reference

### POST /search

Search existing manufacturers or vendors by name. Uses an in-memory cache (5-minute TTL) to avoid hammering the API on each keystroke.

**Request:**
```json
{ "type": "manufacturer", "q": "fil" }
```
`type`: `"manufacturer"` or `"vendor"`
`q`: substring to match (case-insensitive); omit to return first 20 records

**Response:**
```json
{
  "results": [
    { "id": "mfr_01KEFPA0EF1X5WC81JZRPGCC1R", "legacyId": "42", "name": "FilzFelt", "website": "https://www.filzfelt.com/" }
  ]
}
```

---

### POST /vendor-contacts

Fetch all contacts for a specific vendor (used by Mode 3 to show the existing-contacts panel).

**Request:**
```json
{ "vendor_id": "ven_01KKCS8GMBKM3YWWG9RNHEJWFG" }
```

**Response:**
```json
{
  "contacts": [
    {
      "id": "ctc_01KKCSAKMD5F2BEF7NSSDDA0XP",
      "legacyId": "17",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@vendor.com",
      "jobPosition": "Account Manager",
      "canReceivePos": true,
      "canReceiveRfqs": false
    }
  ]
}
```

---

### POST /parse

Extract structured supplier fields from pasted text or a screenshot image using Cloudflare Workers AI.

**Request (text):**
```json
{ "text": "Jane Smith\nAccount Manager\nAcme Distributors\njane@acme.com\n+1 604 555 1234" }
```

**Request (image):**
```json
{ "image_base64": "data:image/png;base64,..." }
```

**Response:**
```json
{
  "manufacturer": { "name": "Acme Corp", "website": "" },
  "vendor":       { "name": "Acme Distributors", "website": "" },
  "contact":      { "firstName": "Jane", "lastName": "Smith", "email": "jane@acme.com", "jobPosition": "Account Manager" }
}
```
Fields not found are returned as empty string. A `_parse_warning` key is included if the AI could not extract structured data.

**Models used:**
- Text: `@cf/meta/llama-3.1-8b-instruct`
- Image: `@cf/llava-hf/llava-1.5-7b-hf`

---

### POST /check-duplicates

Fuzzy-match proposed names/email against existing Aligni records. UI calls this before submit; shows a warning modal if matches found.

**Request:**
```json
{
  "manufacturer_name": "Acme Corp",
  "vendor_name": "Acme Distributors",
  "contact_email": "jane@acme.com"
}
```
All fields optional. Only checks the ones provided.

**Response:**
```json
{
  "manufacturer_matches": [{ "id": "...", "name": "Acme Corporation", "website": "..." }],
  "vendor_matches": [],
  "contact_matches": []
}
```
Up to 5 matches per category. Matching uses substring inclusion + trigram similarity (threshold 0.65).

---

### POST /submit

Main workflow endpoint. Executes Aligni mutations in the correct order with rate-limit delays between each call.

**Request:**
```json
{
  "mode": "existing_manufacturer_new_vendor",
  "manufacturer": { "id": "mfr_01KEFPA0EF1X5WC81JZRPGCC1R" },
  "vendor": {
    "name": "New Distributor Inc",
    "website": "https://newdist.com",
    "accountNumber": "ACCT-001",
    "approved": true
  },
  "contact": {
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@newdist.com",
    "jobPosition": "Account Manager",
    "canReceivePos": true,
    "canReceiveRfqs": false
  },
  "contacts_to_remove": [],
  "options": { "skip_duplicate_check": false }
}
```

**Mode field values:**
- `"new_everything"` — requires `manufacturer.name` + `vendor.name`
- `"existing_manufacturer_new_vendor"` — requires `manufacturer.id` + `vendor.name`
- `"existing_vendor_new_contact"` — requires `vendor.id` (pass `legacyId` too if known); requires `contact` or `contacts_to_remove`

**manufacturer object:**
- New: `{ name, website?, shortName? }`
- Existing: `{ id }`

**vendor object:**
- New: `{ name, website?, shortName?, accountNumber?, approved? }`
- Existing: `{ id, legacyId? }` — include `legacyId` to avoid an extra API call when creating a contact

**contact object (optional):**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@co.com",
  "jobPosition": "Account Manager",
  "canReceivePos": true,
  "canReceiveRfqs": false
}
```

**contacts_to_remove array:**
```json
[{ "id": "ctc_xxx", "action": "delete" }]
```

**Response:**
```json
{
  "success": true,
  "created": {
    "manufacturer_id": "mfr_xxx",
    "vendor_id": "ven_xxx",
    "contact_id": "ctc_xxx"
  },
  "removed": [{ "id": "ctc_yyy", "action": "deleted" }],
  "linecard_added": true,
  "warnings": [],
  "errors": []
}
```
On partial failure: `success: false`, `errors` describes what failed, `created` shows what was already made so you can clean up manually.

---

## Aligni Mutations Used

All confirmed by live schema introspection on 2026-04-29.

| Mutation | Args | What it does |
|----------|------|-------------|
| `manufacturerCreate` | `manufacturerInput: ManufacturerCreateInput!` | Creates a new manufacturer. Required: `name`. Optional: `shortName`, `website`, `nextPartNumber`, `partnumberKey`. |
| `vendorCreate` | `vendorInput: VendorCreateInput!` | Creates a new vendor. Required: `name`. Optional: `shortName`, `website`, `accountNumber`, `approvedAt`, `approvalExpiresAt`, `currencyId`, `defaultPaymentTerms`, `portalEnabled`. |
| `linecardCreate` | `linecardInput: LinecardInput!` | Links a manufacturer to a vendor's linecard. Required: `manufacturerId` (ID), `vendorId` (ID). Both are ULID-style IDs. |
| `contactCreate` | `contactInput: ContactCreateInput!` | Creates a new contact. Required: `lastName`. Optional: `firstName`, `email`, `jobPosition`, `vendorId` (Int — see quirk below), `canReceivePos`, `canReceiveRfqs`. |
| `contactDelete` | `contactId: ID!` | Hard-deletes a contact. No deactivate mutation exists in the schema. |
| `contactUpdate` | `contactId: ID!`, `contactInput: ContactInput!` | Updates a contact's fields. Same fields as ContactCreateInput. |

**Queries used:**
- `manufacturers(first: N) { nodes { id legacyId name website } }`
- `vendors(first: N) { nodes { id legacyId name website } }`
- `vendor(id: ID) { contacts { nodes { id legacyId firstName lastName email jobPosition canReceivePos canReceiveRfqs } } }`
- `contacts(first: N) { nodes { id firstName lastName email jobPosition } }` (for email dupe check)

---

## Aligni Discoveries / Quirks

**`contactCreate.vendorId` is `Int`, not `ID`.** The contacts GraphQL mutation expects the legacy integer ID (the `legacyId` field on the Vendor object), not the ULID-style `id`. Always fetch or pass `legacyId` when creating a contact for a vendor.

**No contact deactivation.** The schema has no `contactDeactivate` mutation and `ContactInput` has no `active` field. The only option is `contactDelete` (hard delete). This was verified by full schema introspection.

**Filter syntax.** The `manufacturers` and `vendors` queries accept `filters: [FiltersInput!]` with structure `{ field: String!, value: OperatorValueInput! }`. Available operators: `eq`, `gt`, `lt`, `gte`, `lte`, `in`, `notIn`. There is **no** `contains`/`cont` operator. All name searching is done by fetching all records and filtering in the Worker.

**OperatorScalar rejects GraphQL variables.** Filter values must be string-interpolated directly into query text (not passed as `$variables`). This is consistent with the BOM importer behavior documented in DEV_ENVIRONMENT.md.

**`errors` field is a String scalar.** On all mutation payloads, `errors` is queried as a plain scalar, not `errors { message }`.

**Manufacturer `address` and `phone` not in create input.** `ManufacturerCreateInput` and `VendorCreateInput` do not accept `address` or `phone` directly. These are separate entities (likely via `addressCreate` / `phoneNumberCreate`) not implemented in Phase 1.

---

## Rate Limit Handling

Current confirmed rate limit: **10 requests/minute** (6100ms delay between calls).

The worker's `aligni()` function tracks the last call time in module-level state (best-effort across warm isolate) and waits the remainder of the delay window before each call. Within a single `/submit` request, all calls are sequential — never parallel.

**Drop delay to 2100ms** once Aligni upgrades the account to 30 req/min. Change `RATE_DELAY` constant in `worker/supplier-intake/index.js` line 8.

---

## Phase 1 Scope Boundaries

- **No address/phone creation** for manufacturers or vendors (separate Aligni mutations, not in scope)
- **No contact deactivation** (schema doesn't support it — only hard delete)
- **No bulk import** (single-entry + smart paste covers Stacklab's realistic volume)
- **No MCP wrapper** (Phase 2)
- **No automated rollback** on partial failure — surface partial state and let operator clean up manually

---

## How to Call from a Script

**curl example (Mode 2 — most common):**
```bash
curl -X POST https://stackabl-supplier-intake.operations-dae.workers.dev/submit \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "existing_manufacturer_new_vendor",
    "manufacturer": { "id": "mfr_01KEFPA0EF1X5WC81JZRPGCC1R" },
    "vendor": {
      "name": "New Distributor Inc",
      "website": "https://newdist.com",
      "approved": true
    },
    "contact": {
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@newdist.com",
      "jobPosition": "Account Manager",
      "canReceivePos": true
    },
    "contacts_to_remove": []
  }'
```

**JavaScript fetch example:**
```javascript
const result = await fetch('https://stackabl-supplier-intake.operations-dae.workers.dev/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'existing_manufacturer_new_vendor',
    manufacturer: { id: 'mfr_01KEFPA0EF1X5WC81JZRPGCC1R' },
    vendor: { name: 'New Distributor Inc', approved: true },
    contact: { firstName: 'Jane', lastName: 'Smith', email: 'jane@newdist.com', canReceivePos: true },
    contacts_to_remove: [],
  }),
}).then(r => r.json());

if (result.success) {
  console.log('Vendor created:', result.created.vendor_id);
  console.log('Linecard linked:', result.linecard_added);
}
```

**Search manufacturers (for typeahead):**
```javascript
const { results } = await fetch('https://stackabl-supplier-intake.operations-dae.workers.dev/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'manufacturer', q: 'stacklab' }),
}).then(r => r.json());
```
