import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let currentPipeline = null;
let currentModel = null;

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type !== 'transcribe') return;

  try {
    const { audio, model, language } = message;
    postStatus(`Loading ${model}`);
    if (!currentPipeline || currentModel !== model) {
      currentPipeline = await pipeline('automatic-speech-recognition', model, {
        dtype: 'q4',
        progress_callback: (progress) => {
          const file = progress.file ? ` ${progress.file}` : '';
          const pct = typeof progress.progress === 'number' ? progress.progress : 0;
          postProgress(Math.min(45, pct * 0.45), `Downloading model${file}`);
        },
      });
      currentModel = model;
    }

    postProgress(50, 'Running speech recognition');
    const result = await currentPipeline(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
      language: language || undefined,
      task: 'transcribe',
    });
    postProgress(98, 'Formatting timestamps');
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error?.message ||
        'The browser could not run the transcription model. Try Chrome/Edge and a shorter file.',
    });
  }
};

function postStatus(message) {
  self.postMessage({ type: 'status', message });
}

function postProgress(progress, message) {
  self.postMessage({ type: 'progress', progress, message });
}
