# SafeShare — WebMCP Challenge notes

SafeShare was created on September 1, 2026, during the WebMCP Challenge submission period. The complete, timestamped implementation history is available in this repository's Git commits.

## Why WebMCP belongs here

Redaction is a shared visual decision. An agent can inventory masks, focus the user's attention, explain a detection, make a reversible edit, and check export readiness. The person remains in the same live document view and makes the final judgment before exporting.

Without WebMCP, an agent would have to infer controls from pixels or depend on a separate server integration. SafeShare instead exposes narrow actions backed by the editor's existing state and validation.

## Human–agent contract

The agent can:

- inspect non-sensitive editor state;
- list mask IDs, categories, pages, sources and confidence levels;
- focus or explain a mask without receiving its raw value or coordinates;
- add and delete masks through visible, reversible editor actions;
- undo the latest mask change;
- run the same safety check used before export;
- direct the person's attention to the final export action.

The agent cannot:

- receive document text, file names, images or detected sensitive values from a tool;
- download or share the resulting file;
- modify the original source file;
- bypass the visible interface or the final human click.

## WebMCP implementation

SafeShare feature-detects `document.modelContext.registerTool()` and registers nine imperative tools from the top-level React application. Each tool has a narrow JSON schema, explicit side-effect language, appropriate annotations, and a result that makes the outcome verifiable. Registrations share an `AbortSignal` so they are removed with the page lifecycle.

| Tool | Role |
|---|---|
| `get_mask_editor_state` | Read a privacy-filtered editor summary |
| `list_redaction_zones` | List safe mask metadata |
| `focus_redaction_zone` | Select a mask in the visible editor |
| `explain_redaction_zone` | Explain generic detection signals |
| `add_redaction_zone` | Add a normalized rectangular mask |
| `delete_redaction_zone` | Delete a visible, reversible mask |
| `undo_last_mask_change` | Reverse the latest mask edit |
| `run_download_safety_check` | Validate the document and mask geometry |
| `prepare_safe_download` | Highlight the human-only export step |

The normal interface remains fully functional when WebMCP is unavailable.

## Local-first execution

PDF rendering, bilingual OCR, pattern detection, mask editing and pixel flattening all run in the browser. SafeShare has no application server and does not upload documents to one. Tool responses deliberately expose metadata rather than document content. The final PDF or PNG is rasterized so masks are fused into the exported pixels, regardless of preview opacity.

## Test path for judges

1. Open the live demo with WebMCP enabled.
2. Open the browser's Site tools panel and inspect the nine registered tools.
3. Ask the agent: “List the redaction zones. Temporarily remove the date-of-birth mask, undo that change, run the download safety check, and prepare the safe download.”
4. Watch the mask disappear and return in the visible page.
5. Confirm that the tool results contain mask metadata but no raw document value.
6. Click **Download** yourself to create the flattened copy.

## Verification

```bash
npm ci
npm test
npm run build
```

The automated suite covers detection, file-signature validation, export geometry, native sharing, locale selection, reversible history, and WebMCP privacy boundaries.
