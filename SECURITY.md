# Security policy

## Design boundaries

SafeShare handles potentially sensitive documents, so its security boundary is intentionally narrow:

1. A selected document stays in browser memory.
2. The application has no upload endpoint, account system, analytics SDK or remote persistence.
3. WebMCP read tools return review metadata only, never content or raw values.
4. Agent-triggered actions remain visible and reversible in the review interface.
5. No WebMCP tool can complete a download. Export requires a human checkbox and click.
6. Approved masks are rasterized into a new file so hidden PDF text is not retained underneath them.

## Reporting a vulnerability

Please open a private GitHub security advisory for the repository. Do not include a real confidential document in the report; use the synthetic demo or a fully fabricated sample.

Useful reports include a minimal reproduction, affected browser/version, expected behavior and observed behavior.

## Non-goals

SafeShare is not a compliance certification, a forensic redaction suite or a guarantee that every sensitive value will be detected. Human review remains mandatory.
