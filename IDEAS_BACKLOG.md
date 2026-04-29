# Ops Toolkit — Ideas Backlog

## Active
- [Phase 1] Supplier Intake Tool — in development

## Next up
(nothing yet)

## Ideas
- [Phase 2] MCP server wrapping the supplier-intake endpoint so
  Claude sessions can call `add_supplier` directly as a tool

## Refactors
- Endpoint-ify the BOM importer's core operation (currently UI-coupled)
- Endpoint-ify the lead time calculator
- Endpoint-ify the safety stock calculator
- Pattern rule: every new tool is built endpoint-first; existing
  tools get refactored when next touched

## Won't do (yet)
- Bulk supplier import — single-entry + paste-parse covers the
  realistic volume for Stacklab; revisit only if a real bulk need surfaces
