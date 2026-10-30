# Third-party notices

The application code is MIT licensed. Third-party components retain their own licenses:

- [Tesseract.js 6](https://github.com/naptha/tesseract.js): Apache-2.0.
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core): Apache-2.0, with bundled upstream notices in its LICENSE.
- [Tesseract tessdata_fast 4.1.0](https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0): Apache-2.0. The build downloads the Korean and English LSTM models from this fixed version.
- Playwright (development/test only): Apache-2.0.
- pngjs (development/test only): MIT.

The build includes the OCR component license texts in `dist/licenses/`. OCR models and WebAssembly are hosted with the app; they do not use an external image-processing service.

FreeStyle Libre and LibreLink are trademarks of their respective owners. Libre Lens is an independent project and is not affiliated with or endorsed by Abbott. The public demonstration image contains fictional values and original artwork. The user's source screenshot is excluded from this repository.
