<div align="center">

# SafeShare

### Share the document. Not your data.

SafeShare finds sensitive information in PDFs and images, draws redaction masks automatically, and creates a safe copy — entirely in your browser.

**Local-first · Direct editing · WebMCP-enabled**

</div>

> SafeShare helps you find sensitive data. It does not replace a careful human review.

## How it works

1. **Import** a PDF or image.
2. **Adjust** the automatic masks: move, resize or delete them. Drag anywhere outside a mask to draw a new one.
3. Choose **Download** or, on supported browsers, **Share…** to create a flattened copy in which every visible mask is permanently fused into the pixels.

The opacity slider changes only the editing preview. Downloaded masks are always fully opaque.

Your original file is never changed or uploaded.

Native sharing opens the operating system's share sheet after a human click. The available destinations depend on the browser, device and installed apps. If file sharing is unsupported, SafeShare simply keeps the Download action. The selected destination receives the finished copy directly; SafeShare does not upload it to its own server.

## Try it

You need Node.js 20 or newer.

```bash
git clone https://github.com/mathieuworoniecki/safeshare-webmcp.git
cd safeshare-webmcp
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173).

Choose **“Try a sample document”** or open [http://localhost:4173/?demo=1](http://localhost:4173/?demo=1) to load the demo directly.

SafeShare uses the browser language automatically: French browsers get French; every other language currently falls back to English. To test a language explicitly, add [`?lang=en`](http://localhost:4173/?demo=1&lang=en) or [`?lang=fr`](http://localhost:4173/?demo=1&lang=fr) to the URL.

## Why WebMCP?

SafeShare exposes the actions of its live mask editor as structured browser tools. An agent can help inspect and edit zones without scraping the page or requiring a separate MCP server.

| Tool | What the agent can do |
|---|---|
| `get_mask_editor_state` | Check the editor state |
| `list_redaction_zones` | List safe metadata about active masks |
| `focus_redaction_zone` | Show a mask in the visible interface |
| `explain_redaction_zone` | Explain a detection without revealing its value |
| `add_redaction_zone` | Add a rectangular mask |
| `delete_redaction_zone` | Remove a mask |
| `undo_last_mask_change` | Reverse the last mask change |
| `run_download_safety_check` | Check blockers without downloading |
| `prepare_safe_download` | Point the user to the final Download button |

The tools never return document text, file names, images or sensitive values. They also cannot download or share the result. **Only the user can confirm the final export.**

SafeShare uses the imperative `document.modelContext.registerTool()` API from the [WebMCP proposal](https://github.com/webmachinelearning/webmcp) and follows [OpenAI’s WebMCP guidance](https://learn.chatgpt.com/docs/webmcp).

## Privacy by design

```text
File → local detection → direct mask editing → flattened local copy
          no document upload
```

- The document stays in the current browser tab.
- The source file is never modified or saved by SafeShare.
- OCR and redaction run on the device.
- Mask edits are reversible with Undo and Redo.
- Refreshing or closing the tab clears the review.
- The first OCR use may download a language model, but document pixels are not sent with that request.

More detail: [Security policy](./SECURITY.md).

## Supported files

- PDF: up to 12 pages
- PNG, JPEG and WEBP
- Maximum file size: 18 MB

## Verify the project

```bash
npm test
npm run build
```

## Current limits

- OCR and pattern matching can miss data or produce false positives.
- Flattened PDFs preserve their appearance, but not selectable text or accessibility structure.
- WebMCP browser support is experimental. The visual interface remains fully usable without it.

## License

[MIT](./LICENSE)
