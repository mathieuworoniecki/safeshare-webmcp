# Security policy

## Design boundaries

SafeShare handles potentially sensitive documents, so its security boundary is intentionally narrow:

1. A selected document stays in browser memory.
2. The application has no upload endpoint, account system, analytics SDK or remote persistence.
3. WebMCP read tools return mask metadata only, never content or raw values.
4. Agent-triggered mask changes remain visible and reversible in the editor.
5. No WebMCP tool can complete a download. Export requires a human click on the visible Download button.
6. Every active mask is rasterized into a new file so hidden PDF text is not retained underneath it.
7. Uploads are checked by their binary signature instead of trusting the filename or MIME label.
8. Agent and human mask changes share the same undo history.
9. A read-only safety check blocks export when mask coordinates are invalid.
10. Preview opacity never affects export opacity; downloaded masks are always solid.

## Reporting a vulnerability

Please open a private GitHub security advisory for the repository. Do not include a real confidential document in the report; use the synthetic demo or a fully fabricated sample.

Useful reports include a minimal reproduction, affected browser/version, expected behavior and observed behavior.

## Non-goals

SafeShare is not a compliance certification, a forensic redaction suite or a guarantee that every sensitive value will be detected. Human review remains mandatory.
