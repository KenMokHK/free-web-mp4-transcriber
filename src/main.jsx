import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Clock,
  FileAudio,
  FileJson,
  FileText,
  Globe2,
  Languages,
  ListChecks,
  Loader2,
  Play,
  Search,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import './styles.css';

const SAMPLE_FILES = [
  { id: 'sample-1', name: '1.mp4', url: './media/1.mp4', bundled: true },
  { id: 'sample-2', name: '2.mp4', url: './media/2.mp4', bundled: true },
];

const MODEL_OPTIONS = {
  multilingual: {
    label: 'Cantonese / Chinese / English',
    model: 'onnx-community/whisper-tiny_timestamped',
    language: null,
  },
  multilingualBetter: {
    label: 'Better accuracy (desktop)',
    model: 'onnx-community/whisper-small_timestamped',
    language: null,
  },
  english: {
    label: 'English only',
    model: 'onnx-community/whisper-tiny.en_timestamped',
    language: 'english',
  },
};

const EMPTY_TRANSCRIPT = {
  text: '',
  words: [],
  segments: [],
  raw: null,
};

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'that',
  'the',
  'their',
  'there',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'with',
  'you',
  'your',
]);

function App() {
  const mediaRef = useRef(null);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [sources, setSources] = useState(SAMPLE_FILES);
  const [selectedSource, setSelectedSource] = useState(SAMPLE_FILES[0]);
  const [modelKey, setModelKey] = useState('multilingual');
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState(EMPTY_TRANSCRIPT);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const worker = new Worker(new URL('./transcribeWorker.js', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'status') {
        setStatus(message.message);
      }
      if (message.type === 'progress') {
        setProgress(message.progress);
        setStatus(message.message);
      }
      if (message.type === 'result') {
        const normalized = normalizeTranscript(message.result);
        setTranscript(normalized);
        setSummary(createSummary(normalized));
        setStatus(`Transcript ready: ${normalized.words.length} timed words`);
        setProgress(100);
        setIsTranscribing(false);
      }
      if (message.type === 'error') {
        setError(message.message);
        setStatus('Transcription failed');
        setIsTranscribing(false);
      }
    };

    return () => {
      worker.terminate();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTranscript(EMPTY_TRANSCRIPT);
    setSummary(null);
    setError('');
    setProgress(0);
    setStatus('Ready');
  }, [selectedSource?.id]);

  const filteredSegments = useMemo(() => {
    if (!query.trim()) return transcript.segments;
    const needle = query.trim().toLowerCase();
    return transcript.segments.filter((segment) =>
      segment.text.toLowerCase().includes(needle),
    );
  }, [query, transcript.segments]);

  const activeWordIndex = useMemo(() => {
    return transcript.words.findIndex(
      (word) => currentTime >= word.start && currentTime <= word.end,
    );
  }, [currentTime, transcript.words]);

  const canTranscribe = selectedSource && !isTranscribing;

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.includes('mp4') && !file.name.toLowerCase().endsWith('.mp4')) {
      setError('Please choose an MP4 file.');
      return;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const uploaded = {
      id: `upload-${Date.now()}`,
      name: file.name,
      url,
      file,
      bundled: false,
    };
    setSources((current) => [uploaded, ...current.filter((item) => item.bundled)]);
    setSelectedSource(uploaded);
  }

  async function transcribeSelected() {
    setError('');
    setSummary(null);
    setTranscript(EMPTY_TRANSCRIPT);
    setIsTranscribing(true);
    setProgress(0);
    setStatus('Preparing audio');

    try {
      const audio = await loadAudioSamples(selectedSource);
      workerRef.current.postMessage({
        type: 'transcribe',
        audio,
        model: MODEL_OPTIONS[modelKey].model,
        language: MODEL_OPTIONS[modelKey].language,
      });
    } catch (err) {
      setError(err.message || 'Could not read the MP4 audio.');
      setStatus('Audio preparation failed');
      setIsTranscribing(false);
    }
  }

  function seekTo(time) {
    if (!mediaRef.current || Number.isNaN(time)) return;
    mediaRef.current.currentTime = Math.max(0, time);
    mediaRef.current.play().catch(() => {});
  }

  function exportTranscript(format) {
    const content = buildExport(format, transcript, summary);
    const type = format === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stripExtension(selectedSource.name)}-transcript.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Clock size={22} />
          </div>
          <div>
            <h1>TimeScript</h1>
            <p>Free browser transcription with word timecodes</p>
          </div>
        </div>
        <div className="privacy-note">
          <Globe2 size={16} />
          Audio stays in this browser
        </div>
      </header>

      <section className="workspace">
        <aside className="source-panel">
          <div className="panel-heading">
            <FileAudio size={18} />
            <span>Media</span>
          </div>
          <div className="source-list">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`source-item ${selectedSource?.id === source.id ? 'active' : ''}`}
                onClick={() => setSelectedSource(source)}
              >
                <span>{source.name}</span>
                <small>{source.bundled ? 'Bundled' : 'Uploaded'}</small>
              </button>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,audio/mp4,.mp4"
            onChange={handleUpload}
            hidden
          />
          <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={17} />
            Upload MP4
          </button>

          <label className="select-label" htmlFor="language">
            <Languages size={16} />
            Language model
          </label>
          <select
            id="language"
            value={modelKey}
            onChange={(event) => setModelKey(event.target.value)}
          >
            {Object.entries(MODEL_OPTIONS).map(([key, option]) => (
              <option key={key} value={key}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="status-box">
            <div className="status-row">
              {isTranscribing ? <Loader2 className="spin" size={16} /> : <ListChecks size={16} />}
              <span>{status}</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error ? <div className="error-box">{error}</div> : null}
        </aside>

        <section className="main-panel">
          <div className="media-card">
            <video
              ref={mediaRef}
              src={selectedSource?.url}
              controls
              preload="metadata"
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            />
            <div className="media-actions">
              <button onClick={() => mediaRef.current?.play()}>
                <Play size={17} />
                Play
              </button>
              <button
                className="primary"
                disabled={!canTranscribe}
                onClick={transcribeSelected}
              >
                {isTranscribing ? <Loader2 className="spin" size={17} /> : <Wand2 size={17} />}
                Transcribe
              </button>
              <span className="time-pill">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            </div>
            <Waveform words={transcript.words} currentTime={currentTime} onSeek={seekTo} />
          </div>

          <div className="transcript-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search transcript"
              />
            </div>
            <div className="stats">
              <span>{transcript.words.length} words</span>
              <span>{transcript.segments.length} segments</span>
            </div>
          </div>

          <TranscriptView
            segments={filteredSegments}
            activeWordIndex={activeWordIndex}
            query={query}
            onSeek={seekTo}
          />
        </section>

        <aside className="summary-panel">
          <div className="panel-heading">
            <Sparkles size={18} />
            <span>Summary</span>
          </div>
          {summary ? (
            <SummaryView summary={summary} onSeek={seekTo} />
          ) : (
            <div className="empty-state">
              Transcribe a file to create a local bullet summary, topics, and key moments.
            </div>
          )}

          <div className="exports">
            <h2>Export</h2>
            {[
              ['txt', FileText],
              ['srt', FileText],
              ['vtt', FileText],
              ['csv', FileText],
              ['json', FileJson],
            ].map(([format, Icon]) => (
              <button
                key={format}
                disabled={!transcript.words.length}
                onClick={() => exportTranscript(format)}
              >
                <Icon size={16} />
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function TranscriptView({ segments, activeWordIndex, query, onSeek }) {
  if (!segments.length) {
    return (
      <div className="transcript-panel empty-state">
        Transcript words and timestamps will appear here.
      </div>
    );
  }

  return (
    <div className="transcript-panel">
      {segments.map((segment) => (
        <article key={`${segment.start}-${segment.text}`} className="segment">
          <button className="segment-time" onClick={() => onSeek(segment.start)}>
            {formatTimestamp(segment.start)}
          </button>
          <p>
            {segment.words.map((word) => (
              <button
                key={`${word.index}-${word.start}`}
                className={`word-chip ${word.index === activeWordIndex ? 'active' : ''} ${
                  query && word.word.toLowerCase().includes(query.toLowerCase()) ? 'match' : ''
                }`}
                title={`${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}`}
                onClick={() => onSeek(word.start)}
              >
                <span>{word.word}</span>
                <small>{formatTimestamp(word.start)}</small>
              </button>
            ))}
          </p>
        </article>
      ))}
    </div>
  );
}

function SummaryView({ summary, onSeek }) {
  return (
    <div className="summary-content">
      <section>
        <h2>Bullets</h2>
        <ul>
          {summary.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Key topics</h2>
        <div className="topic-list">
          {summary.keyTopics.map((topic) => (
            <span key={topic.term}>{topic.term}</span>
          ))}
        </div>
      </section>
      <section>
        <h2>Moments</h2>
        <div className="moments">
          {summary.keyMoments.map((moment) => (
            <button key={`${moment.start}-${moment.text}`} onClick={() => onSeek(moment.start)}>
              <strong>{formatTimestamp(moment.start)}</strong>
              <span>{moment.text}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Waveform({ words, currentTime, onSeek }) {
  const bars = useMemo(() => {
    if (!words.length) return new Array(56).fill(0).map((_, index) => ({ index, level: 0.2 }));
    return words.slice(0, 160).map((word, index) => ({
      index,
      start: word.start,
      level: 0.25 + Math.min(0.72, Math.max(0.08, word.word.length / 14)),
    }));
  }, [words]);

  return (
    <div className="waveform" aria-label="Transcript timeline">
      {bars.map((bar) => (
        <button
          key={bar.index}
          className={bar.start <= currentTime ? 'passed' : ''}
          style={{ height: `${bar.level * 100}%` }}
          onClick={() => typeof bar.start === 'number' && onSeek(bar.start)}
        />
      ))}
    </div>
  );
}

async function loadAudioSamples(source) {
  const arrayBuffer = source.file
    ? await source.file.arrayBuffer()
    : await fetch(source.url).then((response) => {
        if (!response.ok) throw new Error(`Could not load ${source.name}`);
        return response.arrayBuffer();
      });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    return resampleTo16k(mono, decoded.sampleRate);
  } finally {
    await audioContext.close();
  }
}

function mixToMono(audioBuffer) {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      output[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return output;
}

function resampleTo16k(samples, sampleRate) {
  if (sampleRate === 16000) return samples;
  const ratio = sampleRate / 16000;
  const length = Math.round(samples.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourceIndex - left;
    output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function normalizeTranscript(result) {
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const timedWords = chunks
    .filter((chunk) => Array.isArray(chunk.timestamp))
    .map((chunk, index) => ({
      index,
      word: cleanWord(chunk.text),
      start: Number(chunk.timestamp[0]) || 0,
      end: Number(chunk.timestamp[1]) || Number(chunk.timestamp[0]) || 0,
    }))
    .filter((word) => word.word);

  const words = timedWords.length
    ? timedWords
    : String(result?.text || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => ({
          index,
          word,
          start: index,
          end: index + 0.5,
        }));

  const segments = [];
  let current = null;
  for (const word of words) {
    if (!current || current.words.length >= 18 || /[.!?。！？]$/.test(current.text)) {
      current = { start: word.start, end: word.end, words: [], text: '' };
      segments.push(current);
    }
    current.words.push(word);
    current.end = word.end;
    current.text = `${current.text} ${word.word}`.trim();
  }

  return {
    text: result?.text || words.map((word) => word.word).join(' '),
    words,
    segments,
    raw: result,
  };
}

function createSummary(transcript) {
  const sentences = splitSentences(transcript.text);
  const frequencies = new Map();
  for (const token of tokenize(transcript.text)) {
    if (!stopWords.has(token) && token.length > 1) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }

  const keyTopics = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  const scored = sentences.map((sentence) => ({
    sentence,
    score: tokenize(sentence).reduce((sum, token) => sum + (frequencies.get(token) || 0), 0),
  }));

  const bullets = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.sentence)
    .filter(Boolean);

  const keyMoments = transcript.segments
    .map((segment) => ({
      start: segment.start,
      text: segment.text,
      score: tokenize(segment.text).reduce((sum, token) => sum + (frequencies.get(token) || 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.start - b.start);

  return {
    bullets: bullets.length ? bullets : ['No strong summary could be generated from this transcript.'],
    keyTopics,
    keyMoments,
  };
}

function splitSentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenize(text) {
  const normalized = String(text).toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9']+/g) || [];
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/g) || [];
  const cjkTokens = cjkRuns.flatMap((run) => {
    if (run.length <= 2) return [run];
    const tokens = [];
    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.push(run.slice(i, i + 2));
    }
    return tokens;
  });
  return [...latinTokens, ...cjkTokens];
}

function buildExport(format, transcript, summary) {
  if (format === 'json') {
    return JSON.stringify(
      {
        transcript: {
          text: transcript.text,
          words: transcript.words,
          segments: transcript.segments,
        },
        summary,
      },
      null,
      2,
    );
  }
  if (format === 'csv') {
    return [
      'index,word,start,end',
      ...transcript.words.map((word) =>
        [word.index + 1, csvEscape(word.word), word.start.toFixed(3), word.end.toFixed(3)].join(','),
      ),
    ].join('\n');
  }
  if (format === 'srt') {
    return transcript.segments
      .map(
        (segment, index) =>
          `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`,
      )
      .join('\n');
  }
  if (format === 'vtt') {
    return `WEBVTT\n\n${transcript.segments
      .map(
        (segment) =>
          `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}\n${segment.text}\n`,
      )
      .join('\n')}`;
  }
  return [
    transcript.text,
    '',
    'Summary',
    ...(summary?.bullets || []).map((item) => `- ${item}`),
    '',
    'Word timestamps',
    ...transcript.words.map(
      (word) => `[${formatTimestamp(word.start)} - ${formatTimestamp(word.end)}] ${word.word}`,
    ),
  ].join('\n');
}

function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function cleanWord(value) {
  return String(value || '').trim();
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, '');
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}

function formatSrtTime(seconds) {
  return formatSubtitleTime(seconds, ',');
}

function formatVttTime(seconds) {
  return formatSubtitleTime(seconds, '.');
}

function formatSubtitleTime(seconds, decimal) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    wholeSeconds,
  ).padStart(2, '0')}${decimal}${String(milliseconds).padStart(3, '0')}`;
}

createRoot(document.getElementById('root')).render(<App />);
