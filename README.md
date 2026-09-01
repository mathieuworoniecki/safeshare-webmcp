# SafeShare · WebMCP

**Share the document, not your data.** SafeShare is a local-first privacy review desk for PDFs and images. It finds likely personal data, places reversible masks over the source, asks a human to decide on every finding, and exports a flattened copy.

The application is also a WebMCP provider. A browser agent can understand the review state and help organize decisions through structured tools, while the page remains the primary interface and the final download always requires an explicit human confirmation.

> Experimental challenge project. Detection is an aid, not a guarantee. Always review the full document before sharing it.

## What works

- PDF, PNG, JPEG and WEBP import (18 MB, up to 12 PDF pages)
- browser-side PDF rendering and OCR
- detection of e-mail addresses, French phone numbers, IBANs, identity references, dates and postal addresses
- visible, reversible `pending` / `approved` / `dismissed` review states
- manual rectangle drawing for anything the detector misses
- flattened PNG or PDF export: approved masks are fused into pixels, not laid over extractable source text
- built-in synthetic demo available from the empty state or at `/?demo=1`
- responsive review workspace and reduced-motion support
- six imperative WebMCP tools registered with `document.modelContext.registerTool()`

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open `http://localhost:4173`. The regular UI continues to work in a browser without WebMCP; the status badge reports whether the API is available.

```bash
npm test
npm run build
```

## WebMCP tools

| Tool | Effect | Data returned | Read-only hint |
|---|---|---|---|
| `get_privacy_review` | Summarizes review progress | File kind, page count, decision counts | Yes |
| `list_privacy_findings` | Lists safe metadata for findings | ID, category, page, confidence, status | Yes |
| `focus_privacy_finding` | Focuses a finding in the visible UI | Success and finding ID | No |
| `decide_privacy_finding` | Approves or dismisses one/all pending findings | Decision outcome | No |
| `add_manual_redaction` | Adds a normalized rectangular proposal | New finding ID, still pending | No |
| `prepare_safe_export` | Checks blockers and opens the confirmation dialog | Readiness and blocker count | No |

Tool schemas reject extra parameters. Read tools never expose document text, file names, raw values, masked previews, image data or bounding boxes. The export tool intentionally **does not download anything**: only the person in front of the page can check the confirmation and create the file.

The tools follow the current imperative API in the [WebMCP proposal](https://github.com/webmachinelearning/webmcp) and the browser integration guidance in [OpenAI’s WebMCP documentation](https://learn.chatgpt.com/docs/webmcp). Registrations are tied to the page lifetime through a shared `AbortSignal`.

## Privacy model

```text
local file → browser memory → local parsing/OCR → human review → flattened local download
                  └──────────── no document upload ────────────┘
```

- Source files are never modified or persisted by SafeShare.
- Rendering, pattern matching, review state and export happen in the tab.
- OCR runs in the browser. On first use, Tesseract may fetch its language model; document pixels are not sent with that request.
- WebMCP outputs are deliberately data-minimized to reduce cross-context leakage.
- The synthetic demo contains no real personal data.
- Closing or refreshing the tab clears the review state.

See [SECURITY.md](./SECURITY.md) for the threat model and safe disclosure guidance.

## Project structure

```text
src/
├── App.tsx                 review workflow and human confirmation
├── lib/
│   ├── demo.ts             synthetic document
│   ├── detection.ts        deterministic sensitive-data patterns
│   ├── document.ts         PDF/image parsing, OCR and flattened export
│   └── webmcp.ts           scoped WebMCP tool registration
└── styles.css              responsive visual system
```

## Known limits

- Pattern matching and OCR can produce false positives or miss unusual formats.
- Named-entity recognition is intentionally conservative in this prototype.
- Flattened PDF export preserves appearance, not selectable text or accessibility structure.
- Browser WebMCP support is experimental; SafeShare treats the visual UI as the canonical fallback.

## License

[MIT](./LICENSE)
