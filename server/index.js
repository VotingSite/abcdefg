import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GENERATIVE_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.error('Server: GENERATIVE_API_KEY (or VITE_GEMINI_API_KEY) is not set. Exiting.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Basic CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// POST /api/generate
// body: { prompt: string }
app.post('/api/generate', async (req, res) => {
  const { prompt, modelPreference } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt string' });

  try {
    // Attempt to pick a supported model. Prefer modelPreference if provided.
    let modelId = modelPreference || 'gemini-1.5-pro';
    try {
      if (typeof genAI.listModels === 'function') {
        const listRes = await genAI.listModels();
        const modelsArr = listRes?.models || listRes?.model || [];
        if (Array.isArray(modelsArr) && modelsArr.length > 0) {
          const exact = modelsArr.find((m) => {
            const id = (m.name || m.id || m.model || '').toString();
            return id === modelId || id.endsWith(modelId);
          });
          if (!exact) {
            const candidate = modelsArr.find((m) => {
              const methods = m.supportedMethods || m.methods || m.supported || [];
              if (Array.isArray(methods) && methods.includes('generateContent')) return true;
              const id = (m.name || m.id || '').toString().toLowerCase();
              return id.includes('gemini') || id.includes('bison') || id.includes('text-bison');
            });
            if (candidate) modelId = candidate.name || candidate.id || candidate.model || modelId;
          }
        }
      }
    } catch (err) {
      console.warn('Server: failed to list models, will try the preferred model', err?.message || err);
    }

    const model = genAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return res.json({ text, model: modelId });
  } catch (err) {
    console.error('Server generation error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Generative proxy server listening on http://localhost:${PORT}`);
});
