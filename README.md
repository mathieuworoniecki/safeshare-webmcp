<div align="center">

# SafeShare

### Share the document. Not your data.

SafeShare finds sensitive information in PDFs and images, lets you review every redaction, and creates a safe copy — entirely in your browser.

**Local-first · Human-reviewed · WebMCP-enabled**

</div>

> SafeShare helps you find sensitive data. It does not replace a careful human review.

## How it works

1. **Import** a PDF or image.
2. **Review** each detected e-mail, phone number, IBAN, identity reference, date or address.
3. **Export** a flattened copy in which approved redactions are permanently fused into the pixels.

Your original file is never changed or uploaded.

## Try it

You need Node.js 20 or newer.

```bash
git clone https://github.com/mathieuworoniecki/safeshare-webmcp.git
cd safeshare-webmcp
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173).

Choose **“Try with a fictional document”** or open [http://localhost:4173/?demo=1](http://localhost:4173/?demo=1) to load the demo directly.

## Why WebMCP?

SafeShare exposes the actions of its live interface as structured browser tools. An agent can help navigate the privacy review without scraping the page or requiring a separate MCP server.

| Tool | What the agent can do |
|---|---|
| `get_privacy_review` | Check the review progress |
| `list_privacy_findings` | List safe metadata about detected zones |
| `focus_privacy_finding` | Show a zone in the visible interface |
| `decide_privacy_finding` | Mark a zone to redact or preserve |
| `add_manual_redaction` | Propose a rectangular redaction |
| `prepare_safe_export` | Check blockers and open the final review |

The tools never return document text, file names, images or sensitive values. They also cannot download the result. **Only the user can confirm the final export.**

SafeShare uses the imperative `document.modelContext.registerTool()` API from the [WebMCP proposal](https://github.com/webmachinelearning/webmcp) and follows [OpenAI’s WebMCP guidance](https://learn.chatgpt.com/docs/webmcp).

## Privacy by design

```text
File → local analysis → human review → flattened local copy
          no document upload
```

- The document stays in the current browser tab.
- The source file is never modified or saved by SafeShare.
- OCR and redaction run on the device.
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
