const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { analyzeVideoUrl, analyzeVideoFile, getBodyAnalysisPrompt } = require('./gemini');
const { handleElevenLabsWebhook } = require('./webhook');
const { getDefaultScorePrompt } = require('./openai');
const { handleSimPage } = require('./sim-page');

const app = express();
const prisma = new PrismaClient();

// Multer: store uploads in OS temp dir, accept up to 500 MB
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
    if (file.mimetype === 'application/octet-stream') return cb(null, true);
    const name = (file.originalname || '').toLowerCase();
    if (/\.(webm|mp4|mov|avi|mkv)$/.test(name)) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
});

app.use(cors());

// ElevenLabs webhook needs raw body for HMAC verification — register BEFORE express.json()
app.post('/api/webhook/elevenlabs', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    await handleElevenLabsWebhook(req, res, prisma);
  } catch (err) {
    console.error('POST /api/webhook/elevenlabs error:', err.message);
    console.error(err.stack);
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
const VALID_PROMPT_TYPES = ['system', 'first_message', 'media_analysis', 'score'];

app.get('/api/prompts/default-score', async (_req, res) => {
  try {
    const content = getDefaultScorePrompt();
    res.json({ content });
  } catch (err) {
    console.error('GET /api/prompts/default-score', err);
    res.status(500).json({ error: 'Failed to get default' });
  }
});

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

// Get the current (active) prompts grouped by type → language for the UI
app.get('/api/prompts/current', async (req, res) => {
  try {
    const prompts = await prisma.prompt.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    // Group: { system: [...], first_message: { en: {...}, es: {...}, ... }, media_analysis: [...] }
    const grouped = {};
    for (const p of prompts) {
      if (!grouped[p.type]) grouped[p.type] = [];
      grouped[p.type].push(p);
    }
    res.json(grouped);
  } catch (err) {
    console.error('GET /api/prompts/current', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// Get version history for a specific prompt (all ancestors + descendants in chain)
app.get('/api/prompts/:id/history', async (req, res) => {
  try {
    const prompt = await prisma.prompt.findUnique({ where: { id: req.params.id } });
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });

    // Walk up to find root
    let rootId = prompt.id;
    let current = prompt;
    while (current.parentId) {
      current = await prisma.prompt.findUnique({ where: { id: current.parentId } });
      if (!current) break;
      rootId = current.id;
    }

    // Get all prompts that share same root (walk entire tree)
    const allVersions = [];
    const queue = [rootId];
    const visited = new Set();
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const p = await prisma.prompt.findUnique({ where: { id } });
      if (p) {
        allVersions.push(p);
        const children = await prisma.prompt.findMany({ where: { parentId: id } });
        children.forEach(c => queue.push(c.id));
      }
    }

    allVersions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(allVersions);
  } catch (err) {
    console.error('GET /api/prompts/:id/history', err);
    res.status(500).json({ error: 'Failed to get history' });
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
    const { type, name, language, content, isActive, organizationId, companyId, clientId, caseId } = req.body;
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
        organizationId: organizationId || null,
        companyId: companyId || null,
        clientId: clientId || null,
        caseId: caseId || null,
      },
    });
    res.status(201).json(p);
  } catch (err) {
    console.error('POST /api/prompts', err);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PATCH = create a NEW version (old becomes inactive, new one inherits)
app.patch('/api/prompts/:id', async (req, res) => {
  try {
    const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Prompt not found' });

    const { name, language, content, isActive } = req.body;

    // If only toggling isActive, update in place (no version needed)
    if (isActive !== undefined && content === undefined && name === undefined) {
      const p = await prisma.prompt.update({
        where: { id: req.params.id },
        data: { isActive: Boolean(isActive) },
      });
      return res.json(p);
    }

    // Create new version, deactivate old one
    const [newPrompt] = await prisma.$transaction([
      prisma.prompt.create({
        data: {
          type: existing.type,
          name: name != null ? String(name).trim() : existing.name,
          language: language !== undefined ? (language != null && language !== '' ? String(language) : null) : existing.language,
          content: content != null ? String(content).trim() : existing.content,
          isActive: true,
          parentId: existing.id,
          organizationId: existing.organizationId,
          companyId: existing.companyId,
          clientId: existing.clientId,
          caseId: existing.caseId,
        },
      }),
      prisma.prompt.update({
        where: { id: req.params.id },
        data: { isActive: false },
      }),
    ]);

    res.json(newPrompt);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Prompt not found' });
    console.error('PATCH /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

app.delete('/api/prompts/:id', async (req, res) => {
  try {
    await prisma.prompt.update({ where: { id: req.params.id }, data: { isActive: false } });
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
    const analysisText = typeof result.text === 'string' ? result.text : JSON.stringify(result.text || '');
    const durationMs = typeof result.durationMs === 'number' ? Math.round(result.durationMs) : null;
    const record = await prisma.videoAnalysis.create({
      data: {
        youtubeUrl: 'upload://' + String(originalName).slice(0, 500),
        promptId: promptId || null,
        model: String(result.model || 'gemini-2.5-flash'),
        analysisText,
        durationMs,
      },
    });

    res.status(201).json(record);
  } catch (err) {
    console.error('POST /api/analyze-video/upload', err);
    const msg = err.code ? `${err.message} (code: ${err.code})` : err.message;
    res.status(500).json({ error: msg || 'Video upload analysis failed' });
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
      include: { case: { select: { id: true, firstName: true, lastName: true, caseNumber: true } } },
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

// ---------- Upload body-language video for a simulation ----------
// Accepts :id (simulation id), ?conversationId=xxx, or ?caseId=xxx (finds most recent sim for case)
app.post('/api/simulations/:id/video', upload.single('video'), async (req, res) => {
  try {
    const simId = req.params.id;
    const conversationId = req.query.conversationId || req.body?.conversationId;
    const caseId = req.query.caseId || req.body?.caseId;

    // Find the simulation - try by ID first, then by conversationId, then by caseId (most recent)
    let sim = null;
    if (simId && simId !== 'by-conversation' && simId !== 'by-case') {
      sim = await prisma.simulation.findUnique({ where: { id: simId } });
    }
    if (!sim && conversationId) {
      // Webhook may not have created the sim yet; retry for up to ~30s
      for (let attempt = 0; attempt < 10 && !sim; attempt++) {
        sim = await prisma.simulation.findFirst({ where: { conversationId: String(conversationId) } });
        if (!sim && attempt < 9) await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!sim && caseId) {
      // Find most recent simulation for this case (created in last 5 min)
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      for (let attempt = 0; attempt < 10 && !sim; attempt++) {
        sim = await prisma.simulation.findFirst({
          where: { caseId: String(caseId), createdAt: { gte: cutoff } },
          orderBy: { createdAt: 'desc' },
        });
        if (!sim && attempt < 9) await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!sim && caseId) {
      // Race: webhook may not have created the simulation yet. Create a stub so the video has a home.
      // The webhook will update this record when it runs.
      const caseExists = await prisma.case.findUnique({ where: { id: String(caseId) } });
      if (caseExists) {
        sim = await prisma.simulation.create({
          data: {
            caseId: String(caseId),
            conversationId: conversationId ? String(conversationId) : null,
            status: 'completed',
          },
        });
      }
    }
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

    // Normalize mimetype (browser may send application/octet-stream for webm)
    let mimeType = req.file.mimetype || '';
    if (!mimeType.startsWith('video/')) {
      const ext = (req.file.originalname || '').toLowerCase().match(/\.(webm|mp4|mov|avi|mkv)$/);
      mimeType = ext ? (ext[1] === 'webm' ? 'video/webm' : ext[1] === 'mp4' ? 'video/mp4' : 'video/' + ext[1]) : 'video/webm';
    }

    // Body analysis uses hardcoded system prompt (not user-editable)
    const promptText = getBodyAnalysisPrompt();

    // Run Gemini analysis
    const result = await analyzeVideoFile(req.file.path, mimeType, promptText);

    // Save analysis to the simulation
    const updated = await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        bodyAnalysis: String(result.text || ''),
        bodyAnalysisModel: String(result.model || 'gemini-2.5-flash'),
      },
    });

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    res.json({ ok: true, bodyAnalysis: updated.bodyAnalysis, bodyAnalysisModel: updated.bodyAnalysisModel });
  } catch (err) {
    console.error('POST /api/simulations/:id/video', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message || 'Video analysis failed' });
  }
});

// ---------- Sim: signed URL for React SDK (agent + dynamic vars) ----------
app.post('/api/sim/signed-url', async (req, res) => {
  try {
    const { caseId } = req.body || {};
    if (!caseId || typeof caseId !== 'string') return res.status(400).json({ error: 'caseId required' });

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const firstName = caseRecord.firstName || '';
    const lastName = caseRecord.lastName || '';
    const name = `${firstName} ${lastName}`.trim() || 'Deponent';
    const caseNumber = caseRecord.caseNumber || '';
    const desc = caseRecord.description || '';
    const phone = caseRecord.phone || '';
    const caseInfo = `Case Number: ${caseNumber}\nDeponent: ${name}\nPhone: ${phone}\nDescription: ${desc}`;

    let depoPrompt = '';
    let firstMessage = '';
    let primerMensaje = '';
    try {
      const [sysPrompt, fmEn, fmEs] = await Promise.all([
        prisma.prompt.findFirst({ where: { type: 'system', isActive: true }, orderBy: { updatedAt: 'desc' } }),
        prisma.prompt.findFirst({ where: { type: 'first_message', isActive: true, OR: [{ language: 'en' }, { language: null }] }, orderBy: { updatedAt: 'desc' } }),
        prisma.prompt.findFirst({ where: { type: 'first_message', isActive: true, language: 'es' }, orderBy: { updatedAt: 'desc' } }),
      ]);
      depoPrompt = sysPrompt?.content || 'No system prompt configured.';
      firstMessage = fmEn?.content || 'Hello, I will be conducting your deposition practice today.';
      primerMensaje = fmEs?.content || '';
    } catch (e) {
      console.error('[sim] Error loading prompts:', e.message);
    }

    const agentId = process.env.ELEVENLABS_AGENT_ID || 'agent_4901kgr2443mem1t7s9gnrbmhaq1';
    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_XI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });

    const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
    url.searchParams.set('agent_id', agentId);
    url.searchParams.set('include_conversation_id', 'true');

    const elevenRes = await fetch(url.toString(), {
      headers: { 'xi-api-key': apiKey },
    });
    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error('[sim] ElevenLabs signed-url error:', elevenRes.status, errText);
      return res.status(502).json({ error: 'Failed to get signed URL', detail: errText });
    }
    const { signed_url: signedUrl } = await elevenRes.json();
    if (!signedUrl) return res.status(502).json({ error: 'No signed_url in response' });

    const dynamicVariables = {
      depo_prompt: depoPrompt,
      first_message: firstMessage,
      primer_mensaje: primerMensaje,
      case_id: caseId,
      case_info: caseInfo,
    };

    res.json({ signedUrl, dynamicVariables, case: { name, caseNumber } });
  } catch (err) {
    console.error('POST /api/sim/signed-url', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ---------- Sim page (legacy HTML - redirect to React) ----------
app.get('/api/sim/:caseId', (req, res) => {
  res.redirect(302, `/sim/${req.params.caseId}`);
});

// ---------- AI Coach Chat (simulation analysis & deposition coaching) ----------
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const { messages, simulationId } = req.body;
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'messages array is required' });

    // Build context from simulation if provided
    let simContext = '';
    if (simulationId) {
      const sim = await prisma.simulation.findUnique({
        where: { id: simulationId },
        include: { case: true },
      });
      if (sim) {
        const caseName = sim.case ? `${sim.case.firstName} ${sim.case.lastName}` : 'Unknown';
        const caseNum = sim.case?.caseNumber || '';
        const caseDesc = sim.case?.description || '';
        const transcriptText = Array.isArray(sim.transcript)
          ? sim.transcript.map(t => `${t.role === 'agent' ? 'Q' : 'A'}: ${t.message || t.original_message || ''}`).join('\n')
          : '';

        simContext = `
--- SIMULATION CONTEXT ---
Case: #${caseNum} — ${caseName}
Case Description: ${caseDesc}
Score: ${sim.score != null ? sim.score + '%' : 'N/A'}
Score Reason: ${sim.scoreReason || 'N/A'}
Duration: ${sim.callDurationSecs ? Math.floor(sim.callDurationSecs / 60) + 'm ' + (sim.callDurationSecs % 60) + 's' : 'N/A'}
Status: ${sim.status || 'N/A'}
Summary: ${sim.callSummaryTitle || 'N/A'}
Transcript Summary: ${sim.transcriptSummary || 'N/A'}
Full Analysis: ${sim.fullAnalysis || 'N/A'}
Body Language Analysis: ${sim.bodyAnalysis || 'N/A'}
${transcriptText ? '\n--- TRANSCRIPT ---\n' + transcriptText : ''}
--- END CONTEXT ---`;
      }
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert deposition preparation coach and AI simulation analyst for DepoSim, a legal technology platform. You help attorneys and legal professionals:

1. **Analyze simulation results**: Explain why scores are high or low, identify weak points in the deponent's performance, and suggest specific improvements.
2. **Strategic coaching**: Provide actionable advice on deposition preparation strategy, common pitfalls, and how to better prepare clients for their next deposition.

Be concise but thorough. Use bullet points for clarity. When discussing scores, reference specific parts of the transcript or analysis.

${simContext}`,
    };

    // Only take last 20 messages to stay within context limits
    const chatMessages = [
      systemMessage,
      ...messages.slice(-20).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'o3-mini',
        messages: chatMessages,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const data = await resp.json();
    if (data.error) {
      return res.status(502).json({ error: 'OpenAI error: ' + (data.error.message || JSON.stringify(data.error)) });
    }

    const reply = data.choices?.[0]?.message?.content || '';
    res.json({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('POST /api/chat', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// ---------- AI Coach for Prompt Adjustment (works on any prompt type) ----------
app.post('/api/chat/prompt-coach', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const { messages, promptId, promptType, promptContent, promptName } = req.body;
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'messages array is required' });

    let content = promptContent;
    let type = promptType;
    let name = promptName;
    if (promptId && !content) {
      const p = await prisma.prompt.findUnique({ where: { id: promptId } });
      if (p) {
        content = p.content;
        type = p.type;
        name = p.name;
      }
    }

    const typeLabels = { system: 'System Prompt', first_message: 'First Message', media_analysis: 'Media Analysis', score: 'Score Analysis' };
    const typeLabel = typeLabels[type] || type || 'this prompt';

    const systemContent = `You are an AI Coach for DepoSim that helps users refine prompts. The user is working on the **${name || typeLabel}** prompt (type: ${type || 'unknown'}).

--- CURRENT PROMPT ---
${content || '(Empty or not provided)'}
--- END CURRENT PROMPT ---

Help the user adjust the prompt based on what they want to do. When you propose a revised prompt, wrap the complete new prompt in this exact format:
---SUGGESTED_PROMPT---
(here put the full revised prompt text)
---END_SUGGESTED_PROMPT---

Be concise. When suggesting changes, provide the full revised prompt so the user can apply it with one click. For "score" type prompts, the output format (JSON with score/score_reason) is appended automatically — don't duplicate it.`;

    const chatMessages = [
      { role: 'system', content: systemContent },
      ...messages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'o3-mini', messages: chatMessages }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: 'OpenAI error: ' + (data.error.message || JSON.stringify(data.error)) });

    const reply = data.choices?.[0]?.message?.content || '';
    const match = reply.match(/---SUGGESTED_PROMPT---\s*([\s\S]*?)---END_SUGGESTED_PROMPT---/);
    const suggestedPrompt = match ? match[1].trim() : null;
    res.json({ role: 'assistant', content: reply, suggestedPrompt });
  } catch (err) {
    console.error('POST /api/chat/prompt-coach', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// ---------- Translate first_message to all languages ----------
app.post('/api/prompts/translate-all', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const { englishContent } = req.body;
    if (!englishContent || !String(englishContent).trim())
      return res.status(400).json({ error: 'englishContent is required' });

    const content = String(englishContent).trim();

    // All supported language codes (minus English)
    const targetLangs = {
      es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      pt: 'Portuguese', 'pt-br': 'Brazilian Portuguese', pl: 'Polish', nl: 'Dutch',
      ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese (Simplified)',
      hi: 'Hindi', ar: 'Arabic', tr: 'Turkish', sv: 'Swedish', da: 'Danish',
      no: 'Norwegian', fi: 'Finnish', el: 'Greek', cs: 'Czech', ro: 'Romanian',
      hu: 'Hungarian', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese',
      bg: 'Bulgarian', hr: 'Croatian', fil: 'Filipino', ms: 'Malay',
      sk: 'Slovak', ta: 'Tamil', uk: 'Ukrainian',
    };

    const langList = Object.entries(targetLangs).map(([code, name]) => `"${code}": "${name}"`).join(', ');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the given English text into ALL of the following languages. Maintain the same tone, meaning, and formatting. Return ONLY a JSON object where each key is the language code and the value is the translated text. No markdown, no explanation, just the JSON object.\n\nLanguages: {${langList}}`,
          },
          { role: 'user', content },
        ],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: 'OpenAI: ' + (data.error.message || JSON.stringify(data.error)) });

    let reply = data.choices?.[0]?.message?.content || '';
    // Strip markdown code fences if present
    reply = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let translations;
    try { translations = JSON.parse(reply); } catch {
      return res.status(502).json({ error: 'Failed to parse translations from AI response' });
    }

    // Now update/create prompts for each language
    const results = { updated: 0, created: 0, errors: [] };

    for (const [lang, translated] of Object.entries(translations)) {
      if (!translated || typeof translated !== 'string') continue;
      try {
        // Find current active first_message for this language
        const existing = await prisma.prompt.findFirst({
          where: { type: 'first_message', isActive: true, language: lang },
          orderBy: { updatedAt: 'desc' },
        });

        if (existing) {
          // Create new version (deactivate old)
          await prisma.$transaction([
            prisma.prompt.create({
              data: {
                type: 'first_message',
                name: existing.name,
                language: lang,
                content: String(translated).trim(),
                isActive: true,
                parentId: existing.id,
                organizationId: existing.organizationId,
                companyId: existing.companyId,
                clientId: existing.clientId,
                caseId: existing.caseId,
              },
            }),
            prisma.prompt.update({ where: { id: existing.id }, data: { isActive: false } }),
          ]);
          results.updated++;
        } else {
          // Create new
          const langNames = {
            es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
            'pt-br': 'Portuguese (BR)', pl: 'Polish', nl: 'Dutch', ru: 'Russian',
            ja: 'Japanese', ko: 'Korean', zh: 'Chinese', hi: 'Hindi', ar: 'Arabic',
            tr: 'Turkish', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
            el: 'Greek', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', id: 'Indonesian',
            th: 'Thai', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian', fil: 'Filipino',
            ms: 'Malay', sk: 'Slovak', ta: 'Tamil', uk: 'Ukrainian',
          };
          await prisma.prompt.create({
            data: {
              type: 'first_message',
              name: `Berman Law Group - ${langNames[lang] || lang}`,
              language: lang,
              content: String(translated).trim(),
              isActive: true,
            },
          });
          results.created++;
        }
      } catch (err) {
        results.errors.push(`${lang}: ${err.message}`);
      }
    }

    res.json({ ok: true, ...results, languageCount: Object.keys(translations).length });
  } catch (err) {
    console.error('POST /api/prompts/translate-all', err);
    res.status(500).json({ error: err.message || 'Translation failed' });
  }
});

// 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
