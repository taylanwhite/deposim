const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { analyzeVideoUrl, analyzeVideoFile } = require('./gemini');
const { handleElevenLabsWebhook } = require('./webhook');
const { handleSimPage } = require('./sim-page');

const app = express();
const prisma = new PrismaClient();

// Multer: store uploads in OS temp dir, accept up to 500 MB
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
});

app.use(cors());

// ElevenLabs webhook needs raw body for HMAC verification — register BEFORE express.json()
app.post('/api/webhook/elevenlabs', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    await handleElevenLabsWebhook(req, res, prisma);
  } catch (err) {
    console.error('POST /api/webhook/elevenlabs', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'deposim-api' });
});

// List cases
app.get('/api/cases', async (req, res) => {
  try {
    const cases = await prisma.case.findMany({
      orderBy: { createdAt: 'desc' },
      include: { organization: true, company: true, client: true },
    });
    res.json(cases);
  } catch (err) {
    console.error('GET /api/cases', err);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

// Get one case
app.get('/api/cases/:id', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { organization: true, company: true, client: true },
    });
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(c);
  } catch (err) {
    console.error('GET /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to get case' });
  }
});

// Create case
app.post('/api/cases', async (req, res) => {
  try {
    const { organizationId, companyId, clientId, caseNumber, firstName, lastName, phone, email, description } = req.body;
    if (!caseNumber || !firstName || !lastName || !phone || !description) {
      return res.status(400).json({
        error: 'Missing required fields: caseNumber, firstName, lastName, phone, description',
      });
    }
    const c = await prisma.case.create({
      data: {
        organizationId: organizationId != null && organizationId !== '' ? String(organizationId) : null,
        companyId: companyId != null && companyId !== '' ? String(companyId) : null,
        clientId: clientId != null && clientId !== '' ? String(clientId) : null,
        caseNumber: String(caseNumber),
        firstName: String(firstName),
        lastName: String(lastName),
        phone: String(phone),
        email: email != null ? String(email) : null,
        description: String(description),
      },
    });

    // Fire-and-forget SMS notification to moderators
    const moderatorPhones = (process.env.MODERATOR_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
    const smsMsg = `New DepoSim case created: #${caseNumber} – ${lastName}, ${firstName}`;
    for (const to of moderatorPhones) {
      const smsUrl = `https://vsfy.com/txt/?to=${encodeURIComponent(to)}&msg=${encodeURIComponent(smsMsg)}`;
      fetch(smsUrl).catch(err => console.error('[sms] failed to notify', to, err.message));
    }

    res.status(201).json(c);
  } catch (err) {
    console.error('POST /api/cases', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// Update case
app.patch('/api/cases/:id', async (req, res) => {
  try {
    const { organizationId, companyId, clientId, caseNumber, firstName, lastName, phone, email, description } = req.body;
    const c = await prisma.case.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId !== undefined && { organizationId: organizationId === null || organizationId === '' ? null : String(organizationId) }),
        ...(companyId !== undefined && { companyId: companyId === null || companyId === '' ? null : String(companyId) }),
        ...(clientId !== undefined && { clientId: clientId === null || clientId === '' ? null : String(clientId) }),
        ...(caseNumber != null && { caseNumber: String(caseNumber) }),
        ...(firstName != null && { firstName: String(firstName) }),
        ...(lastName != null && { lastName: String(lastName) }),
        ...(phone != null && { phone: String(phone) }),
        ...(email !== undefined && { email: email === null || email === '' ? null : String(email) }),
        ...(description != null && { description: String(description) }),
      },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case not found' });
    console.error('PATCH /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

// Delete case
app.delete('/api/cases/:id', async (req, res) => {
  try {
    await prisma.case.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case not found' });
    console.error('DELETE /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// ---------- Organizations ----------
app.get('/api/organizations', async (req, res) => {
  try {
    const list = await prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (err) {
    console.error('GET /api/organizations', err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});
app.get('/api/organizations/:id', async (req, res) => {
  try {
    const o = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: { companies: true, clients: true, cases: true, brandings: true },
    });
    if (!o) return res.status(404).json({ error: 'Organization not found' });
    res.json(o);
  } catch (err) {
    console.error('GET /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});
app.post('/api/organizations', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const o = await prisma.organization.create({ data: { name: String(name).trim() } });
    res.status(201).json(o);
  } catch (err) {
    console.error('POST /api/organizations', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});
app.patch('/api/organizations/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const o = await prisma.organization.update({
      where: { id: req.params.id },
      data: { ...(name != null && { name: String(name).trim() }) },
    });
    res.json(o);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Organization not found' });
    console.error('PATCH /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});
app.delete('/api/organizations/:id', async (req, res) => {
  try {
    await prisma.organization.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Organization not found' });
    console.error('DELETE /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// ---------- Companies ----------
app.get('/api/companies', async (req, res) => {
  try {
    const organizationId = req.query.organizationId;
    const where = organizationId ? { organizationId } : {};
    const list = await prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true },
    });
    res.json(list);
  } catch (err) {
    console.error('GET /api/companies', err);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});
app.get('/api/companies/:id', async (req, res) => {
  try {
    const c = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { organization: true, clients: true, cases: true, brandings: true },
    });
    if (!c) return res.status(404).json({ error: 'Company not found' });
    res.json(c);
  } catch (err) {
    console.error('GET /api/companies/:id', err);
    res.status(500).json({ error: 'Failed to get company' });
  }
});
app.post('/api/companies', async (req, res) => {
  try {
    const { organizationId, name } = req.body;
    if (!organizationId || !name || !String(name).trim())
      return res.status(400).json({ error: 'organizationId and name are required' });
    const c = await prisma.company.create({
      data: { organizationId: String(organizationId), name: String(name).trim() },
    });
    res.status(201).json(c);
  } catch (err) {
    console.error('POST /api/companies', err);
    res.status(500).json({ error: 'Failed to create company' });
  }
});
app.patch('/api/companies/:id', async (req, res) => {
  try {
    const { organizationId, name } = req.body;
    const c = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId != null && { organizationId: String(organizationId) }),
        ...(name != null && { name: String(name).trim() }),
      },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Company not found' });
    console.error('PATCH /api/companies/:id', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});
app.delete('/api/companies/:id', async (req, res) => {
  try {
    await prisma.company.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Company not found' });
    console.error('DELETE /api/companies/:id', err);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// ---------- Clients ----------
app.get('/api/clients', async (req, res) => {
  try {
    const organizationId = req.query.organizationId;
    const companyId = req.query.companyId;
    const where = {};
    if (organizationId) where.organizationId = organizationId;
    if (companyId) where.companyId = companyId;
    const list = await prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true, company: true },
    });
    res.json(list);
  } catch (err) {
    console.error('GET /api/clients', err);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});
app.get('/api/clients/:id', async (req, res) => {
  try {
    const c = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { organization: true, company: true, cases: true, brandings: true },
    });
    if (!c) return res.status(404).json({ error: 'Client not found' });
    res.json(c);
  } catch (err) {
    console.error('GET /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to get client' });
  }
});
app.post('/api/clients', async (req, res) => {
  try {
    const { organizationId, companyId, name, email, phone, consentCamera, consentMicrophone } = req.body;
    if (!organizationId || !name || !String(name).trim())
      return res.status(400).json({ error: 'organizationId and name are required' });
    const c = await prisma.client.create({
      data: {
        organizationId: String(organizationId),
        companyId: companyId != null && companyId !== '' ? String(companyId) : null,
        name: String(name).trim(),
        email: email != null && email !== '' ? String(email) : null,
        phone: phone != null && phone !== '' ? String(phone) : null,
        consentCamera: Boolean(consentCamera),
        consentMicrophone: Boolean(consentMicrophone),
      },
    });
    res.status(201).json(c);
  } catch (err) {
    console.error('POST /api/clients', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});
app.patch('/api/clients/:id', async (req, res) => {
  try {
    const { organizationId, companyId, name, email, phone, consentCamera, consentMicrophone } = req.body;
    const c = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId != null && { organizationId: String(organizationId) }),
        ...(companyId !== undefined && { companyId: companyId === null || companyId === '' ? null : String(companyId) }),
        ...(name != null && { name: String(name).trim() }),
        ...(email !== undefined && { email: email === null || email === '' ? null : String(email) }),
        ...(phone !== undefined && { phone: phone === null || phone === '' ? null : String(phone) }),
        ...(consentCamera !== undefined && { consentCamera: Boolean(consentCamera) }),
        ...(consentMicrophone !== undefined && { consentMicrophone: Boolean(consentMicrophone) }),
      },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
    console.error('PATCH /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});
app.delete('/api/clients/:id', async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
    console.error('DELETE /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// ---------- Branding ----------
app.get('/api/brandings', async (req, res) => {
  try {
    const organizationId = req.query.organizationId;
    const companyId = req.query.companyId;
    const clientId = req.query.clientId;
    const where = {};
    if (organizationId) where.organizationId = organizationId;
    if (companyId) where.companyId = companyId;
    if (clientId) where.clientId = clientId;
    const list = await prisma.branding.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true, company: true, client: true },
    });
    res.json(list);
  } catch (err) {
    console.error('GET /api/brandings', err);
    res.status(500).json({ error: 'Failed to list brandings' });
  }
});
app.get('/api/brandings/:id', async (req, res) => {
  try {
    const b = await prisma.branding.findUnique({
      where: { id: req.params.id },
      include: { organization: true, company: true, client: true },
    });
    if (!b) return res.status(404).json({ error: 'Branding not found' });
    res.json(b);
  } catch (err) {
    console.error('GET /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to get branding' });
  }
});
app.post('/api/brandings', async (req, res) => {
  try {
    const { organizationId, companyId, clientId, accentColor, brandColor, logoUrl } = req.body;
    const hasTarget = [organizationId, companyId, clientId].filter(Boolean).length === 1;
    if (!hasTarget)
      return res.status(400).json({ error: 'Exactly one of organizationId, companyId, or clientId is required' });
    const b = await prisma.branding.create({
      data: {
        organizationId: organizationId || null,
        companyId: companyId || null,
        clientId: clientId || null,
        accentColor: accentColor != null ? String(accentColor) : '#64d2ff',
        brandColor: brandColor != null ? String(brandColor) : '#0b0c10',
        logoUrl: logoUrl != null && logoUrl !== '' ? String(logoUrl) : null,
      },
    });
    res.status(201).json(b);
  } catch (err) {
    console.error('POST /api/brandings', err);
    res.status(500).json({ error: 'Failed to create branding' });
  }
});
app.patch('/api/brandings/:id', async (req, res) => {
  try {
    const { accentColor, brandColor, logoUrl } = req.body;
    const b = await prisma.branding.update({
      where: { id: req.params.id },
      data: {
        ...(accentColor != null && { accentColor: String(accentColor) }),
        ...(brandColor != null && { brandColor: String(brandColor) }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl === null || logoUrl === '' ? null : String(logoUrl) }),
      },
    });
    res.json(b);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Branding not found' });
    console.error('PATCH /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});
app.delete('/api/brandings/:id', async (req, res) => {
  try {
    await prisma.branding.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Branding not found' });
    console.error('DELETE /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to delete branding' });
  }
});

// ---------- App settings (theme: dark | light) ----------
const APP_SETTINGS_ID = 'app';
app.get('/api/settings', async (req, res) => {
  try {
    let s = await prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (!s) {
      s = await prisma.appSettings.create({
        data: { id: APP_SETTINGS_ID, theme: 'dark' },
      });
    }
    res.json({ theme: s.theme });
  } catch (err) {
    console.error('GET /api/settings', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});
app.patch('/api/settings', async (req, res) => {
  try {
    const { theme } = req.body;
    if (theme !== undefined && theme !== 'dark' && theme !== 'light')
      return res.status(400).json({ error: 'theme must be "dark" or "light"' });
    let s = await prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (!s) {
      s = await prisma.appSettings.create({
        data: { id: APP_SETTINGS_ID, theme: theme || 'dark' },
      });
    } else if (theme !== undefined) {
      s = await prisma.appSettings.update({
        where: { id: APP_SETTINGS_ID },
        data: { theme: String(theme) },
      });
    }
    res.json({ theme: s.theme });
  } catch (err) {
    console.error('PATCH /api/settings', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ---------- Prompts ----------
const VALID_PROMPT_TYPES = ['system', 'first_message', 'media_analysis'];

app.get('/api/prompts', async (req, res) => {
  try {
    const type = req.query.type;
    const active = req.query.active;
    const language = req.query.language;
    const where = {};
    if (type && VALID_PROMPT_TYPES.includes(type)) where.type = type;
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (language !== undefined && language !== '') where.language = language || null;
    const list = await prisma.prompt.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (err) {
    console.error('GET /api/prompts', err);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

app.get('/api/prompts/:id', async (req, res) => {
  try {
    const p = await prisma.prompt.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Prompt not found' });
    res.json(p);
  } catch (err) {
    console.error('GET /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

app.post('/api/prompts', async (req, res) => {
  try {
    const { type, name, language, content, isActive } = req.body;
    if (!type || !VALID_PROMPT_TYPES.includes(type))
      return res.status(400).json({ error: 'type must be one of: ' + VALID_PROMPT_TYPES.join(', ') });
    if (!name || !String(name).trim())
      return res.status(400).json({ error: 'name is required' });
    if (!content || !String(content).trim())
      return res.status(400).json({ error: 'content is required' });
    const p = await prisma.prompt.create({
      data: {
        type,
        name: String(name).trim(),
        language: language != null && language !== '' ? String(language) : null,
        content: String(content).trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });
    res.status(201).json(p);
  } catch (err) {
    console.error('POST /api/prompts', err);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

app.patch('/api/prompts/:id', async (req, res) => {
  try {
    const { type, name, language, content, isActive } = req.body;
    const data = {};
    if (type !== undefined) {
      if (!VALID_PROMPT_TYPES.includes(type))
        return res.status(400).json({ error: 'type must be one of: ' + VALID_PROMPT_TYPES.join(', ') });
      data.type = type;
    }
    if (name != null) data.name = String(name).trim();
    if (language !== undefined) data.language = language != null && language !== '' ? String(language) : null;
    if (content != null) data.content = String(content).trim();
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const p = await prisma.prompt.update({ where: { id: req.params.id }, data });
    res.json(p);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Prompt not found' });
    console.error('PATCH /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

app.delete('/api/prompts/:id', async (req, res) => {
  try {
    await prisma.prompt.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Prompt not found' });
    console.error('DELETE /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

// ---------- Video analysis (Gemini) ----------

/** Resolve which analysis prompt to use */
async function resolvePrompt(promptId) {
  if (promptId) {
    const p = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (!p) return null;
    return p.content;
  }
  const p = await prisma.prompt.findFirst({
    where: { type: 'media_analysis', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return p
    ? p.content
    : 'Analyze this video for body language, non-verbal cues, and behavioral signals. Provide a detailed assessment with timestamps.';
}

/** Safely remove temp files */
function cleanupFiles(...paths) {
  for (const p of paths) {
    if (p) fs.unlink(p, () => {});
  }
}

// --- YouTube URL analysis ---
app.post('/api/analyze-video', async (req, res) => {
  try {
    const { youtubeUrl, promptId } = req.body;

    if (!youtubeUrl || typeof youtubeUrl !== 'string')
      return res.status(400).json({ error: 'youtubeUrl is required' });
    const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/;
    if (!ytPattern.test(youtubeUrl))
      return res.status(400).json({ error: 'youtubeUrl must be a valid YouTube URL' });

    const promptText = await resolvePrompt(promptId);
    if (promptId && promptText === null)
      return res.status(404).json({ error: 'Prompt not found' });

    const result = await analyzeVideoUrl(youtubeUrl, promptText);

    const record = await prisma.videoAnalysis.create({
      data: {
        youtubeUrl,
        promptId: promptId || null,
        model: result.model,
        analysisText: result.text,
        durationMs: result.durationMs,
      },
    });

    res.status(201).json(record);
  } catch (err) {
    console.error('POST /api/analyze-video', err);
    res.status(500).json({ error: err.message || 'Video analysis failed' });
  }
});

// --- Uploaded video analysis (video already compressed client-side to 640x480) ---
app.post('/api/analyze-video/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

    const promptId = req.body.promptId || null;
    const promptText = await resolvePrompt(promptId);
    if (promptId && promptText === null) {
      cleanupFiles(req.file.path);
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Determine mime type from uploaded file
    const mimeType = req.file.mimetype || 'video/webm';

    // Analyze via Gemini Files API (no server-side resize; browser sends 640x480)
    const result = await analyzeVideoFile(req.file.path, mimeType, promptText);

    // Persist
    const originalName = req.file.originalname || 'recording.webm';
    const record = await prisma.videoAnalysis.create({
      data: {
        youtubeUrl: 'upload://' + originalName,
        promptId: promptId || null,
        model: result.model,
        analysisText: result.text,
        durationMs: result.durationMs,
      },
    });

    res.status(201).json(record);
  } catch (err) {
    console.error('POST /api/analyze-video/upload', err);
    res.status(500).json({ error: err.message || 'Video upload analysis failed' });
  } finally {
    cleanupFiles(req.file?.path);
  }
});

// List past analyses
app.get('/api/video-analyses', async (req, res) => {
  try {
    const list = await prisma.videoAnalysis.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(list);
  } catch (err) {
    console.error('GET /api/video-analyses', err);
    res.status(500).json({ error: 'Failed to list analyses' });
  }
});

// Get one analysis
app.get('/api/video-analyses/:id', async (req, res) => {
  try {
    const a = await prisma.videoAnalysis.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: 'Analysis not found' });
    res.json(a);
  } catch (err) {
    console.error('GET /api/video-analyses/:id', err);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// ---------- Simulations (call history) ----------
app.get('/api/simulations', async (req, res) => {
  try {
    const caseId = req.query.caseId;
    const where = caseId ? { caseId } : {};
    const list = await prisma.simulation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(list);
  } catch (err) {
    console.error('GET /api/simulations', err);
    res.status(500).json({ error: 'Failed to list simulations' });
  }
});

app.get('/api/simulations/:id', async (req, res) => {
  try {
    const s = await prisma.simulation.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: 'Simulation not found' });
    res.json(s);
  } catch (err) {
    console.error('GET /api/simulations/:id', err);
    res.status(500).json({ error: 'Failed to get simulation' });
  }
});

// ---------- Sim page (server-rendered ElevenLabs widget) ----------
app.get('/api/sim/:caseId', async (req, res) => {
  try {
    await handleSimPage(req, res, prisma);
  } catch (err) {
    console.error('GET /api/sim/:caseId', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
