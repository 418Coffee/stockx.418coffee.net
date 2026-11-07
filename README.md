# StockX Label Modifier

A static website that saves paper by combining StockX the order information and shipping label onto one A4 PDF.

## Table of contents

- [Overview](#overview)
- [Usage](#usage)
- [Stack](#stack)
- [Development](#development)
- [Deployment](#deployment)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

## Overview

This tool removes shipping instructions and unnecessary headings while retaining the order details, StockX identification QR code, and complete shipping label at its original size.

Currently, only the supplied two-page English A4 DPD format is supported. Other layouts are rejected. Carrier-specific validation and crop rules live in separate [format modules](src/formats/), ready for additional formats when examples are available. Automatic label detection is not implemented yet.

PDFs are processed entirely in the browser and are never uploaded. No accounts, extensions, or software installation are required for users.

## Usage

Choose a PDF file or paste a PDF URL, then select **Convert file** or **Convert URL**. The modified PDF opens in a new tab, where it can be saved or printed using the browser's PDF viewer.

The maximum PDF size is **10 MB**. URL imports accept only HTTPS URLs on `stockx.com` and its subdomains, using port 443. Redirects are blocked, and the host must allow cross-origin browser access. Links requiring login cookies are not supported; use the file option instead.

## Stack

- HTML, CSS, JavaScript
- [pdf-lib](https://pdf-lib.js.org/) for PDF composition
- [PDF.js](https://mozilla.github.io/pdf.js/) for document inspection
- Vite for development and static builds
- Node.js test runner and Playwright for testing
- Cloudflare Pages

## Development

Use Node.js 22.12+ or Node.js 24 LTS:

```sh
npm ci
npm run dev
```

To run tests, place the original example PDF in the project root. Browser tests also require OpenSSL for their temporary local TLS certificate:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

To use an installed Chrome, run `CHROME_PATH=/path/to/chrome npm run test:browser`.

`npm run sample` generates `artifacts/modified-label.pdf` from the example.

## Deployment

### Docker

```sh
docker build -t stockx-label-modifier .
docker run --rm -p 8080:8080 stockx-label-modifier
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

For another carrier or template, supply a representative PDF, add a format module with measured validation and crop rules, and include regression tests. Remove personal information from any fixtures committed to the repository.

## License

[GNU GPL v3](LICENSE)

## Disclaimer

Not affiliated with or endorsed by StockX. This project was made with the help of OpenAI Codex (GPT-6.1-Sol).
