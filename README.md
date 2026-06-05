# TimeScript: Free Web MP4 Transcriber

TimeScript is a static web app for GitHub Pages. It transcribes MP4 audio in the visitor's browser using Transformers.js and Whisper ONNX models, then creates word-level timestamps, local summaries, and transcript exports.

## Local use

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Push this folder to the repository.
3. Run:

```powershell
npm run deploy
```

The app is static. The first transcription downloads the selected Whisper model into the browser cache. Audio is processed locally in the browser and is not sent to your own server.

## Notes

- `public/media/1.mp4` and `public/media/2.mp4` are bundled so anyone with the page link can access them.
- Use `English` for faster English-only transcription.
- Use `Auto / Multilingual` when the MP4 is not English.
- Word timestamps are approximate and intended for review/subtitles, not legal-grade alignment.
