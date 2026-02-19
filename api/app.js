const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { clerkMiddleware, createClerkClient } = require('@clerk/express');
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const { analyzeVideoUrl, analyzeVideoFile, getBodyAnalysisPrompt } = require('./gemini');
const { handleElevenLabsWebhook } = require('./webhook');
const { getDefaultScorePrompt } = require('./openai');
const { handleSimPage } = require('./sim-page');
const {
  generateRecordingKey,
  createMultipartUpload,
  getPresignedUploadUrls,
  completeMultipartUpload,
  downloadToTemp,
  getPresignedViewUrl,
} = require('./s3-upload');
const { Resend } = require('resend');
const betterstack = require('./betterstack');
const requestContext = require('./requestContext');

const app = express();

// ---------- Route description map for human-readable log messages ----------
const ROUTE_DESCRIPTIONS = [
  // Health
  ['GET',    '/api/health',                        'Health check'],
  // Webhooks
  ['POST',   '/api/webhook/elevenlabs',            'ElevenLabs webhook received'],
  ['POST',   '/api/webhook/clerk',                 'Clerk webhook received'],
  // Client-portal
  ['GET',    '/api/client/cases',                  'Client fetched their cases'],
  ['GET',    '/api/client/cases/:id',              'Client viewed case details'],
  ['GET',    '/api/client/cases/:id/simulations',  'Client listed case simulations'],
  ['GET',    '/api/client/simulations/:simId',     'Client viewed simulation'],
  ['GET',    '/api/client/cases/:id/stages',       'Client viewed case stages'],
  ['GET',    '/api/client/me',                     'Client fetched their profile'],
  ['PATCH',  '/api/client/me/language',            'Client changed language'],
  // Cases
  ['GET',    '/api/cases',                         'Listed cases'],
  ['GET',    '/api/cases/:id',                     'Viewed case'],
  ['POST',   '/api/cases',                         'Created case'],
  ['PATCH',  '/api/cases/:id',                     'Updated case'],
  ['DELETE', '/api/cases/:id',                     'Deleted case'],
  ['POST',   '/api/cases/:id/record-consent',      'Recorded consent for case'],
  ['POST',   '/api/cases/:id/notify-deposim-sent', 'Sent DepoSim notification'],
  ['GET',    '/api/cases/:id/clients',             'Listed case clients'],
  ['POST',   '/api/cases/:id/clients',             'Added client to case'],
  ['DELETE', '/api/cases/:id/clients/:clientId',   'Removed client from case'],
  ['GET',    '/api/cases/:id/stages',              'Fetched case stages'],
  ['POST',   '/api/cases/:id/stage-summary',       'Generated stage summary'],
  // Organizations
  ['GET',    '/api/organizations',                 'Listed organizations'],
  ['GET',    '/api/organizations/:id',             'Viewed organization'],
  ['POST',   '/api/organizations',                 'Created organization'],
  ['PATCH',  '/api/organizations/:id',             'Updated organization'],
  ['DELETE', '/api/organizations/:id',             'Deleted organization'],
  // Locations
  ['GET',    '/api/locations',                     'Listed locations'],
  ['GET',    '/api/locations/:id',                 'Viewed location'],
  ['POST',   '/api/locations',                     'Created location'],
  ['PATCH',  '/api/locations/:id',                 'Updated location'],
  ['DELETE', '/api/locations/:id',                 'Deleted location'],
  ['GET',    '/api/locations/:id/users',           'Listed location users'],
  ['POST',   '/api/locations/:id/users',           'Assigned user to location'],
  ['DELETE', '/api/locations/:id/users/:userId',   'Removed user from location'],
  // Users
  ['GET',    '/api/users',                         'Listed users'],
  ['GET',    '/api/users/:id/locations',           'Listed user locations'],
  ['PATCH',  '/api/users/:id',                     'Updated user'],
  ['DELETE', '/api/users/:id',                     'Deleted user'],
  // Invites
  ['GET',    '/api/invites',                       'Listed invites'],
  ['POST',   '/api/invites',                       'Created invite'],
  ['DELETE', '/api/invites/:id',                   'Deleted invite'],
  ['POST',   '/api/invites/claim',                 'Claimed invite'],
  // Clients
  ['GET',    '/api/clients',                       'Listed clients'],
  ['GET',    '/api/clients/:id',                   'Viewed client'],
  ['POST',   '/api/clients',                       'Created client'],
  ['PATCH',  '/api/clients/:id',                   'Updated client'],
  ['DELETE', '/api/clients/:id',                   'Deleted client'],
  // Brandings
  ['GET',    '/api/brandings',                     'Listed brandings'],
  ['GET',    '/api/brandings/:id',                 'Viewed branding'],
  ['POST',   '/api/brandings',                     'Created branding'],
  ['PATCH',  '/api/brandings/:id',                 'Updated branding'],
  ['DELETE', '/api/brandings/:id',                 'Deleted branding'],
  // Settings
  ['GET',    '/api/settings',                      'Fetched settings'],
  ['PATCH',  '/api/settings',                      'Updated settings'],
  // Prompts
  ['GET',    '/api/prompts/default-score',         'Fetched default score prompt'],
  ['GET',    '/api/prompts',                       'Listed prompts'],
  ['GET',    '/api/prompts/current',               'Fetched current prompts'],
  ['GET',    '/api/prompts/:id/history',           'Viewed prompt history'],
  ['GET',    '/api/prompts/:id',                   'Viewed prompt'],
  ['POST',   '/api/prompts',                       'Created prompt'],
  ['PATCH',  '/api/prompts/:id',                   'Updated prompt'],
  ['DELETE', '/api/prompts/:id',                   'Deleted prompt'],
  ['POST',   '/api/prompts/translate-all',         'Translated all prompts'],
  // Video analysis
  ['POST',   '/api/analyze-video',                 'Analyzed video (URL)'],
  ['POST',   '/api/analyze-video/upload',          'Analyzed video (upload)'],
  ['GET',    '/api/video-analyses',                'Listed video analyses'],
  ['GET',    '/api/video-analyses/:id',            'Viewed video analysis'],
  // Simulations
  ['GET',    '/api/simulations',                   'Listed simulations'],
  ['GET',    '/api/simulations/:id/recording-url', 'Fetched simulation recording URL'],
  ['GET',    '/api/simulations/:id',               'Viewed simulation'],
  ['POST',   '/api/simulations/video/upload-init', 'Initiated simulation video upload'],
  ['POST',   '/api/simulations/video/upload-urls', 'Generated simulation upload URLs'],
  ['POST',   '/api/simulations/video/upload-complete', 'Completed simulation video upload'],
  ['POST',   '/api/simulations/:id/video',         'Uploaded simulation video'],
  ['POST',   '/api/simulations/:id/evaluate-stage','Evaluated simulation stage'],
  // Sim
  ['POST',   '/api/sim/signed-url',               'Generated sim signed URL'],
  ['GET',    '/api/sim/:caseId',                   'Opened sim page'],
  // Chat
  ['POST',   '/api/chat',                          'Sent chat message'],
  ['POST',   '/api/chat/prompt-coach',             'Sent prompt coach message'],
];

// Build compiled matchers (convert :param segments to regex) for fast lookup
const compiledRoutes = ROUTE_DESCRIPTIONS.map(([method, pattern, desc]) => {
  const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
  return { method, re, desc };
});

function describeRoute(method, path) {
  for (const r of compiledRoutes) {
    if (r.method === method && r.re.test(path)) return r.desc;
  }
  return `${method} ${path}`;
}

// ---------- Request-scoped instanceID (GUID) + request/response logging ----------
app.use((req, res, next) => {
  req.instanceID = crypto.randomUUID();
  res.setHeader('X-Instance-ID', req.instanceID);
  requestContext.runWith(req, next);
});
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();

  const desc = describeRoute(req.method, req.path);
  betterstack.debug(`→ ${desc}`, {
    method: req.method,
    path: req.path,
  });

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const msg = `${desc} → ${status} (${ms}ms)`;
    betterstack.send(msg, {
      level,
      context: {
        method: req.method,
        path: req.path,
        statusCode: status,
        durationMs: ms,
        description: desc,
      },
    });
  });
  next();
});

const resend = process.env.RESEND_KEY ? new Resend(process.env.RESEND_KEY) : null;
const resendFrom = process.env.RESEND_FROM || 'DepoSim <onboarding@resend.dev>';
const prisma = new PrismaClient();

// ---------- Clerk profile sync helper ----------
async function syncClerkProfile(userId) {
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
    const phone = clerkUser.phoneNumbers?.[0]?.phoneNumber || null;
    const data = {
      email,
      firstName: clerkUser.firstName || null,
      lastName: clerkUser.lastName || null,
      phone,
      imageUrl: clerkUser.imageUrl || null,
    };
    await prisma.user.update({ where: { id: userId }, data });
    return data;
  } catch (err) {
    console.warn('[syncClerkProfile] Could not sync profile for', userId, err.message);
    betterstack.warn('[syncClerkProfile] Could not sync profile', { userId, error_message: err.message });
    return null;
  }
}

// ---------- Auth helpers ----------
// requireAuthApi: like requireAuth() but returns 401 JSON instead of 302 redirect.
// Clerk's requireAuth() redirects unauthenticated requests; for API routes we must return JSON.
function requireAuthApi(req, res, next) {
  const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
  if (!auth?.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// resolveAccess: DB-only access middleware (Clerk = authentication only)
// Sets req.accessLevel (scope) and req.userRole (permissions) from the local DB
//   Roles:  super | admin | user
//   Scopes: super | org | user | client
//   admin = full access (manage team, locations, cases)
//   user  = read-only
async function resolveAccess(req, res, next) {
  const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userLocations: { select: { locationId: true } } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { id: userId },
        include: { userLocations: { select: { locationId: true } } },
      });
      syncClerkProfile(userId);
    } else if (!user.email) {
      syncClerkProfile(userId);
    }

    req.userRole = user.role;
    req.userLanguage = user.language || 'en';

    requestContext.setUser({
      userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      accessLevel: null, // updated below
    });
    betterstack.info('User identified', {
      userId,
      email: user.email || undefined,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      role: user.role,
    });

    if (user.role === 'super') {
      req.accessLevel = 'super';
      req.orgId = user.organizationId || null;
      return next();
    }

    // Admin or user with org → scoped to that org's locations
    if (user.organizationId) {
      if (user.userLocations.length > 0) {
        req.accessLevel = 'user';
        req.orgId = user.organizationId;
        req.locationIds = user.userLocations.map(ul => ul.locationId);
      } else {
        const orgLocs = await prisma.location.findMany({ where: { organizationId: user.organizationId }, select: { id: true } });
        req.accessLevel = 'user';
        req.orgId = user.organizationId;
        req.locationIds = orgLocs.map(l => l.id);
      }
      return next();
    }

    // Admin or user with location assignments only (no org)
    if (user.userLocations.length > 0) {
      req.accessLevel = 'user';
      req.orgId = null;
      req.locationIds = user.userLocations.map(ul => ul.locationId);
      return next();
    }

    // Check if this Clerk user is a Client
    const clients = await prisma.client.findMany({
      where: { clerkUserId: userId },
      select: { id: true, locationId: true },
    });
    if (clients.length > 0) {
      req.accessLevel = 'client';
      req.clientIds = clients.map(c => c.id);
      return next();
    }

    // No access yet: if user has (or can get) an email, check for a pending invite by email and auto-claim
    let email = user.email;
    if (!email) {
      const synced = await syncClerkProfile(userId);
      if (synced?.email) {
        email = synced.email;
        user = await prisma.user.findUnique({
          where: { id: userId },
          include: { userLocations: { select: { locationId: true } } },
        });
      }
    }
    if (email) {
      const invite = await prisma.invite.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, usedBy: null },
      });
      if (invite) {
        const upsertData = { role: invite.role || 'user' };
        if (invite.role === 'admin') upsertData.organizationId = invite.organizationId;
        await prisma.user.update({
          where: { id: userId },
          data: upsertData,
        });
        if (invite.locationIds?.length) {
          for (const locId of invite.locationIds) {
            await prisma.userLocation.upsert({
              where: { userId_locationId: { userId, locationId: locId } },
              update: {},
              create: { userId, locationId: locId },
            });
          }
        }
        await prisma.invite.update({ where: { id: invite.id }, data: { usedBy: userId } });
        console.log(`[resolveAccess] Auto-claimed invite ${invite.id} for user ${userId} (${email})`);
        betterstack.info('[resolveAccess] Auto-claimed invite by email', { inviteId: invite.id, userId, email });
        // Re-fetch user with locations and resolve access
        user = await prisma.user.findUnique({
          where: { id: userId },
          include: { userLocations: { select: { locationId: true } } },
        });
        req.userRole = user.role;
        if (user.organizationId) {
          if (user.userLocations.length > 0) {
            req.accessLevel = 'user';
            req.orgId = user.organizationId;
            req.locationIds = user.userLocations.map(ul => ul.locationId);
          } else {
            const orgLocs = await prisma.location.findMany({ where: { organizationId: user.organizationId }, select: { id: true } });
            req.accessLevel = 'user';
            req.orgId = user.organizationId;
            req.locationIds = orgLocs.map(l => l.id);
          }
          return next();
        }
        if (user.userLocations.length > 0) {
          req.accessLevel = 'user';
          req.orgId = null;
          req.locationIds = user.userLocations.map(ul => ul.locationId);
          return next();
        }
      }
    }

    return res.status(403).json({ error: 'No access. Use an invite link to join a location, or contact your administrator.' });
  } catch (err) {
    betterstack.logApiError('[resolveAccess]', err);
    res.status(500).json({ error: 'Failed to resolve access' });
  }
}

// requireAdmin: super or admin role (can manage team, locations, etc.)
function requireAdmin(req, res, next) {
  if (req.userRole === 'super' || req.userRole === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

// requireStaff: any non-client user (admins + users can view)
function requireStaff(req, res, next) {
  if (req.accessLevel === 'client') {
    return res.status(403).json({ error: 'Staff access required.' });
  }
  next();
}

// requireWriteAccess: super or admin role (users are read-only)
function requireWriteAccess(req, res, next) {
  if (req.userRole === 'super' || req.userRole === 'admin') return next();
  return res.status(403).json({ error: 'Write access required. Users have read-only access.' });
}

// requireSuper: only super users (for destructive/global actions like full case delete)
function requireSuper(req, res, next) {
  if (req.accessLevel === 'super') return next();
  return res.status(403).json({ error: 'Super user access required.' });
}

// Shorthand middleware arrays (use requireAuthApi so API always returns 401/403 JSON, never 302)
const authAndAccess = [requireAuthApi, resolveAccess];                         // any tier
const authAndAdmin = [requireAuthApi, resolveAccess, requireAdmin];            // super + admin
const authAndStaff = [requireAuthApi, resolveAccess, requireStaff];            // super + admin + user (read)
const authAndOrg = [requireAuthApi, resolveAccess, requireStaff];             // alias
const authAndWrite = [requireAuthApi, resolveAccess, requireWriteAccess];      // super + admin (write)
const authAndSuper = [requireAuthApi, resolveAccess, requireSuper];            // super only
const authAndClient = [requireAuthApi, resolveAccess];                         // any tier

// Helper: build a where clause scoped to the user's access level
function scopedWhere(req, extraWhere = {}) {
  if (req.accessLevel === 'super') return { ...extraWhere };
  if (req.accessLevel === 'user') {
    if (req.locationIds.length === 0) return { id: '__none__', ...extraWhere };
    return { locationId: { in: req.locationIds }, ...extraWhere };
  }
  return extraWhere;
}

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
app.use(clerkMiddleware());

// ElevenLabs webhook needs raw body for HMAC verification — register BEFORE express.json()
app.post('/api/webhook/elevenlabs', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    await handleElevenLabsWebhook(req, res, prisma);
  } catch (err) {
    betterstack.logApiError('POST /api/webhook/elevenlabs', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', detail: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }
  }
});

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'deposim-api' });
});

// ---------- Clerk webhook: sync users to local DB ----------
app.post('/api/webhook/clerk', async (req, res) => {
  try {
    const evt = req.body;
    const type = evt?.type;
    const data = evt?.data;
    if (!type || !data) return res.status(400).json({ error: 'Invalid webhook payload' });

    if (type === 'user.created' || type === 'user.updated') {
      const email = data.email_addresses?.[0]?.email_address || null;
      const phone = data.phone_numbers?.[0]?.phone_number || null;
      await prisma.user.upsert({
        where: { id: data.id },
        update: {
          email,
          firstName: data.first_name || null,
          lastName: data.last_name || null,
          phone,
          imageUrl: data.image_url || null,
        },
        create: {
          id: data.id,
          email,
          firstName: data.first_name || null,
          lastName: data.last_name || null,
          phone,
          imageUrl: data.image_url || null,
        },
      });
      console.log(`[clerk-webhook] User ${type}: ${data.id} (${email})`);
      betterstack.info('[clerk-webhook] User event', { type, userId: data.id, email });

      // Auto-link: if a Client record has this email but no clerkUserId, link it now
      if (email) {
        const unlinked = await prisma.client.findMany({
          where: { email: { equals: email, mode: 'insensitive' }, clerkUserId: null },
        });
        for (const c of unlinked) {
          await prisma.client.update({ where: { id: c.id }, data: { clerkUserId: data.id } });
          // Also ensure a CaseClient row exists for every case this client owns
          const cases = await prisma.case.findMany({ where: { clientId: c.id }, select: { id: true } });
          for (const cs of cases) {
            await prisma.caseClient.upsert({
              where: { caseId_clientId: { caseId: cs.id, clientId: c.id } },
              update: {},
              create: { caseId: cs.id, clientId: c.id, role: 'deponent' },
            });
          }
          console.log(`[clerk-webhook] Auto-linked client ${c.id} (${email}) to Clerk user ${data.id}, synced ${cases.length} case(s)`);
          betterstack.info('[clerk-webhook] Auto-linked client to Clerk user', { clientId: c.id, userId: data.id, email, casesSynced: cases.length });
        }

        // Auto-claim: if a pending Invite matches this email, claim it
        const invite = await prisma.invite.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, usedBy: null },
        });
        if (invite) {
          await prisma.user.update({
            where: { id: data.id },
            data: { organizationId: invite.organizationId, role: invite.role || 'user' },
          });
          await prisma.invite.update({ where: { id: invite.id }, data: { usedBy: data.id } });
          console.log(`[clerk-webhook] Auto-claimed invite ${invite.id} for user ${data.id} (${email})`);
          betterstack.info('[clerk-webhook] Auto-claimed invite', { inviteId: invite.id, userId: data.id, email });
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    betterstack.logApiError('POST /api/webhook/clerk', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ---------- Client Portal API (auth + client-scoped) ----------

// Client: list my cases (only cases linked via CaseClient)
app.get('/api/client/cases', ...authAndClient, async (req, res) => {
  try {
    const caseClients = await prisma.caseClient.findMany({
      where: { clientId: { in: req.clientIds } },
      include: {
        case: {
          include: {
            client: true,
            simulations: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    const cases = caseClients.map(cc => cc.case);
    res.json(cases);
  } catch (err) {
    betterstack.logApiError('GET /api/client/cases', err);
    res.status(500).json({ error: 'Failed to list client cases' });
  }
});

// Client: get a single case (only if linked)
app.get('/api/client/cases/:id', ...authAndClient, async (req, res) => {
  try {
    const link = await prisma.caseClient.findFirst({
      where: { caseId: req.params.id, clientId: { in: req.clientIds } },
    });
    if (!link) return res.status(404).json({ error: 'Case not found or access denied' });
    const caseData = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { client: true, location: true },
    });
    res.json(caseData);
  } catch (err) {
    betterstack.logApiError('GET /api/client/cases/:id', err);
    res.status(500).json({ error: 'Failed to get case' });
  }
});

// Client: list simulations for a case (ONLY sims the client personally ran)
app.get('/api/client/cases/:id/simulations', ...authAndClient, async (req, res) => {
  try {
    if (req.accessLevel !== 'client') return res.status(403).json({ error: 'Client access only' });
    const link = await prisma.caseClient.findFirst({
      where: { caseId: req.params.id, clientId: { in: req.clientIds } },
    });
    if (!link) return res.status(404).json({ error: 'Case not found or access denied' });
    const sims = await prisma.simulation.findMany({
      where: { caseId: req.params.id, clientId: { in: req.clientIds } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sims);
  } catch (err) {
    betterstack.logApiError('GET /api/client/cases/:id/simulations', err);
    res.status(500).json({ error: 'Failed to list simulations' });
  }
});

// Client: get a single simulation (only if they personally ran it)
app.get('/api/client/simulations/:simId', ...authAndClient, async (req, res) => {
  try {
    if (req.accessLevel !== 'client') return res.status(403).json({ error: 'Client access only' });
    const sim = await prisma.simulation.findUnique({
      where: { id: req.params.simId },
      include: { case: true },
    });
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });
    if (!sim.clientId || !req.clientIds.includes(sim.clientId)) {
      return res.status(404).json({ error: 'Simulation not found or access denied' });
    }
    res.json(sim);
  } catch (err) {
    betterstack.logApiError('GET /api/client/simulations/:simId', err);
    res.status(500).json({ error: 'Failed to get simulation' });
  }
});

// Client: get stage completion status for a case (only sims they ran)
app.get('/api/client/cases/:id/stages', ...authAndClient, async (req, res) => {
  try {
    if (req.accessLevel !== 'client') return res.status(403).json({ error: 'Client access only' });
    const link = await prisma.caseClient.findFirst({
      where: { caseId: req.params.id, clientId: { in: req.clientIds } },
    });
    if (!link) return res.status(404).json({ error: 'Case not found or access denied' });
    const sims = await prisma.simulation.findMany({
      where: { caseId: req.params.id, stage: { not: null }, clientId: { in: req.clientIds } },
      orderBy: { createdAt: 'desc' },
    });
    const stages = [1, 2, 3, 4].map(n => {
      const stageSims = sims.filter(s => s.stage === n);
      const completed = stageSims.some(s => s.stageStatus === 'completed');
      return { stage: n, completed, simCount: stageSims.length };
    });
    const currentStage = stages.find(s => !s.completed)?.stage || 5;
    res.json({ stages, currentStage });
  } catch (err) {
    betterstack.logApiError('GET /api/client/cases/:id/stages', err);
    res.status(500).json({ error: 'Failed to get stage data' });
  }
});

// Auth status: returns accessLevel, role, locations for the current user
app.get('/api/client/me', requireAuthApi, resolveAccess, async (req, res) => {
  try {
    const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
    const userId = auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const clients = await prisma.client.findMany({
      where: { clerkUserId: userId },
      select: { id: true, firstName: true, lastName: true, email: true, locationId: true, language: true },
    });

    // Resolve location objects based on access level
    let locations = [];
    const locationIds = req.locationIds || [];
    if (req.accessLevel === 'super') {
      locations = await prisma.location.findMany({
        select: { id: true, name: true, organizationId: true, organization: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      });
    } else if (req.accessLevel === 'user' && locationIds.length > 0) {
      locations = await prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, name: true, organizationId: true, organization: { select: { id: true, name: true } } },
      });
    }

    let organizations = [];
    if (req.accessLevel === 'super') {
      organizations = await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    } else if (req.orgId) {
      const org = await prisma.organization.findUnique({ where: { id: req.orgId }, select: { id: true, name: true } });
      if (org) organizations = [org];
    }

    const language = req.accessLevel === 'client'
      ? (clients[0]?.language || 'en')
      : (req.userLanguage || 'en');

    res.json({
      userId,
      accessLevel: req.accessLevel,
      userRole: req.userRole,
      isAdmin: req.userRole === 'super' || req.userRole === 'admin',
      isSuper: req.accessLevel === 'super',
      orgId: req.orgId || null,
      locationIds,
      locations,
      organizations,
      language,
      isClient: clients.length > 0,
      clients,
    });
  } catch (err) {
    betterstack.logApiError('GET /api/client/me', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

app.patch('/api/client/me/language', requireAuthApi, resolveAccess, async (req, res) => {
  try {
    const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
    const userId = auth?.userId;
    const { language } = req.body;
    if (!language || !['en', 'es'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language. Use "en" or "es".' });
    }

    if (req.accessLevel === 'client') {
      const clients = await prisma.client.findMany({ where: { clerkUserId: userId } });
      for (const c of clients) {
        await prisma.client.update({ where: { id: c.id }, data: { language } });
      }
    } else {
      await prisma.user.update({ where: { id: userId }, data: { language } });
    }

    res.json({ language });
  } catch (err) {
    betterstack.logApiError('PATCH /api/client/me/language', err);
    res.status(500).json({ error: 'Failed to update language' });
  }
});

// ---------- Staff API routes (auth + staff-scoped: org admin or user) ----------

// List cases
app.get('/api/cases', ...authAndStaff, async (req, res) => {
  try {
    const where = scopedWhere(req);
    if (req.query.organizationId) where.organizationId = req.query.organizationId;
    if (req.query.locationId) where.locationId = req.query.locationId;
    const cases = await prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        location: true,
        client: true,
        caseClients: { include: { client: true } },
      },
    });
    res.json(cases);
  } catch (err) {
    betterstack.logApiError('GET /api/cases', err);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

// Record that the client granted camera/mic consent (when user enables it during a simulation)
app.post('/api/cases/:id/record-consent', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { client: true },
    });
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (!c.clientId) return res.status(400).json({ error: 'Case has no client' });
    await prisma.client.update({
      where: { id: c.clientId },
      data: { consentCamera: true, consentMicrophone: true },
    });
    res.json({ ok: true });
  } catch (err) {
    betterstack.logApiError('POST /api/cases/:id/record-consent', err);
    res.status(500).json({ error: err.message || 'Failed to record consent' });
  }
});

// Get one case
app.get('/api/cases/:id', ...authAndStaff, async (req, res) => {
  try {
    const c = await prisma.case.findFirst({
      where: scopedWhere(req, { id: req.params.id }),
      include: { organization: true, location: true, client: true, caseClients: { include: { client: true } } },
    });
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(c);
  } catch (err) {
    betterstack.logApiError('GET /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to get case' });
  }
});

// Create case — staff (org admin + user)
// Accepts `clients` array (each { clientId } or { client: { firstName, lastName, phone, email } })
// OR legacy single `clientId` / `client` object for backward compat
app.post('/api/cases', ...authAndWrite, async (req, res) => {
  try {
    const { organizationId, locationId, clientId, caseNumber, name, description, client, clients } = req.body;
    if (!caseNumber || !description) {
      return res.status(400).json({
        error: 'Missing required fields: caseNumber, description',
      });
    }
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required.' });
    }

    // Users can only create cases in their assigned locations
    if (req.accessLevel === 'user') {
      if (!req.locationIds.includes(String(locationId))) {
        return res.status(403).json({ error: 'You are not assigned to this location.' });
      }
    }

    const resolveOrCreateClient = async (entry) => {
      if (entry.clientId && String(entry.clientId).trim()) return String(entry.clientId).trim();
      const c = entry.client || entry;
      const { firstName, lastName, phone, email } = c;
      if (!firstName?.trim() || !lastName?.trim()) {
        throw new Error('Client firstName and lastName are required');
      }
      const newClient = await prisma.client.create({
        data: {
          organizationId: req.orgId,
          locationId: locationId != null && locationId !== '' ? String(locationId) : null,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
          email: email != null && String(email).trim() ? String(email).trim() : null,
        },
      });
      return newClient.id;
    };

    // Build list of client IDs to link
    const clientIds = [];
    if (Array.isArray(clients) && clients.length > 0) {
      for (const entry of clients) {
        clientIds.push(await resolveOrCreateClient(entry));
      }
    } else if (clientId && String(clientId).trim()) {
      clientIds.push(String(clientId).trim());
    } else if (client && typeof client === 'object') {
      clientIds.push(await resolveOrCreateClient({ client }));
    }

    if (clientIds.length === 0) {
      return res.status(400).json({
        error: 'At least one client is required (clients array, clientId, or client object)',
      });
    }

    const primaryClientId = clientIds[0];

    const c = await prisma.case.create({
      data: {
        organizationId: req.orgId,
        locationId: locationId != null && locationId !== '' ? String(locationId) : null,
        clientId: primaryClientId,
        name: name != null && String(name).trim() ? String(name).trim() : null,
        caseNumber: String(caseNumber),
        description: String(description),
      },
      include: { client: true },
    });

    // Create CaseClient join rows for all clients
    for (const cid of clientIds) {
      await prisma.caseClient.upsert({
        where: { caseId_clientId: { caseId: c.id, clientId: cid } },
        update: {},
        create: { caseId: c.id, clientId: cid, role: 'deponent' },
      });
    }

    const full = await prisma.case.findUnique({
      where: { id: c.id },
      include: { client: true, caseClients: { include: { client: true } } },
    });
    res.status(201).json(full);
  } catch (err) {
    betterstack.logApiError('POST /api/cases', err);
    res.status(500).json({ error: err.message || 'Failed to create case' });
  }
});

// Send DepoSim link to client + notify moderators (triggered by toast)
// Accepts optional `clientId` in body to target a specific client; defaults to primary case client
app.post('/api/cases/:id/notify-deposim-sent', ...authAndStaff, async (req, res) => {
  try {
    const caseId = req.params.id;
    const targetClientId = req.body?.clientId || null;
    console.log('[sms] notify-deposim-sent hit for case', caseId, 'targetClient:', targetClientId);

    const c = await prisma.case.findUnique({
      where: { id: caseId },
      include: { client: true, caseClients: { include: { client: true } } },
    });
    if (!c) {
      console.log('[sms] Case not found:', caseId);
      return res.status(404).json({ error: 'Case not found' });
    }

    // Resolve the target client: specific clientId, or fall back to primary
    let targetClient = c.client;
    if (targetClientId) {
      const cc = c.caseClients.find(cc => cc.clientId === targetClientId);
      if (cc?.client) targetClient = cc.client;
    }

    const simLink = (req.body?.simUrl || '').trim() || `${req.protocol}://${req.get('host')}/sim/${c.id}`;
    // '9175979964' - jeremy
    const moderatorPhones = ['8018366183'];
    const moderatorEmails = ['t@vsfy.com'];
    const name = targetClient ? `${targetClient.lastName}, ${targetClient.firstName}` : 'Deponent';

    const clientMsg = `Your DepoSim simulated deposition is ready. Start here: ${simLink}`;
    const moderatorMsg = `DepoSim link sent to client #${c.caseNumber} – ${name}. ${simLink}`;

    const sendSms = async (to, msg, label) => {
      const smsUrl = `https://vsfy.com/txt/?to=${encodeURIComponent(to)}&msg=${encodeURIComponent(msg)}`;
      try {
        const r = await fetch(smsUrl);
        console.log(`[sms] ${label} to ${to}: ${r.status}`);
        if (!r.ok) {
          const errBody = await r.text();
          console.error(`[sms] ${label} failed:`, errBody);
          betterstack.warn(`[sms] ${label} failed`, { to, label, caseId, status: r.status, body: errBody });
        }
      } catch (err) {
        console.error(`[sms] ${label} to ${to}:`, err.message);
        betterstack.warn(`[sms] ${label} to ${to} error`, { to, label, caseId, error_message: err.message });
      }
    };

    const sendEmail = async (to, subject, text, label) => {
      if (!resend || !to) return;
      const email = String(to).trim();
      if (!email || !email.includes('@')) return;
      try {
        const { data, error } = await resend.emails.send({
          from: resendFrom,
          to: email,
          subject,
          text,
        });
        if (error) {
          console.error(`[email] ${label} to ${email}:`, error.message);
          betterstack.warn(`[email] ${label} failed`, { email, label, caseId, error_message: error.message });
        } else {
          console.log(`[email] ${label} to ${email}: sent`, data?.id || '');
        }
      } catch (err) {
        console.error(`[email] ${label} to ${email}:`, err.message);
        betterstack.warn(`[email] ${label} to ${email} error`, { email, label, caseId, error_message: err.message });
      }
    };

    const clientPhone = (targetClient?.phone || '').replace(/\D/g, '');
    if (clientPhone) {
      await sendSms(clientPhone, clientMsg, 'client');
    } else {
      console.log('[sms] No client phone for case', caseId);
    }

    const clientEmail = (targetClient?.email || '').trim();
    if (clientEmail && clientEmail.includes('@')) {
      await sendEmail(
        clientEmail,
        'Your DepoSim simulated deposition is ready',
        `Your DepoSim simulated deposition is ready. Start here: ${simLink}`,
        'client'
      );
    } else {
      console.log('[email] No client email for case', caseId);
    }

    for (const to of moderatorPhones) {
      await sendSms(to, moderatorMsg, 'moderator');
    }

    for (const to of moderatorEmails) {
      await sendEmail(to, `DepoSim link sent – Case #${c.caseNumber} – ${name}`, moderatorMsg, 'moderator');
    }

    res.status(204).send();
  } catch (err) {
    betterstack.logApiError('POST /api/cases/:id/notify-deposim-sent', err);
    res.status(500).json({ error: 'Failed to notify' });
  }
});

// Update case (client info via clientId or PATCH /clients/:id) — org-level only
app.patch('/api/cases/:id', ...authAndWrite, async (req, res) => {
  try {
    const { organizationId, locationId, clientId, caseNumber, name, description } = req.body;
    const c = await prisma.case.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId !== undefined && { organizationId: organizationId === null || organizationId === '' ? null : String(organizationId) }),
        ...(locationId !== undefined && { locationId: locationId === null || locationId === '' ? null : String(locationId) }),
        ...(clientId !== undefined && { clientId: clientId === null || clientId === '' ? null : String(clientId) }),
        ...(name !== undefined && { name: name === null || name === '' ? null : String(name).trim() }),
        ...(caseNumber != null && { caseNumber: String(caseNumber) }),
        ...(description != null && { description: String(description) }),
      },
      include: { client: true },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case not found' });
    betterstack.logApiError('PATCH /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

// Delete case — super users only. Thorough delete: case + all case_clients links + all simulations.
// Prompts with this caseId are unlinked (SetNull). Clients are never deleted.
app.delete('/api/cases/:id', ...authAndSuper, async (req, res) => {
  try {
    const caseId = req.params.id;
    const existing = await prisma.case.findUnique({
      where: { id: caseId },
      include: { caseClients: true, simulations: { select: { id: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Case not found' });

    await prisma.$transaction(async (tx) => {
      // Delete case: DB cascades CaseClient (removes links) and Simulation. Prompt.caseId set to null. Clients untouched.
      await tx.case.delete({ where: { id: caseId } });
    });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case not found' });
    betterstack.logApiError('DELETE /api/cases/:id', err);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// ---------- Case-Client management ----------

// List clients assigned to a case
app.get('/api/cases/:id/clients', ...authAndStaff, async (req, res) => {
  try {
    const caseClients = await prisma.caseClient.findMany({
      where: { caseId: req.params.id },
      include: { client: true },
      orderBy: { client: { lastName: 'asc' } },
    });
    res.json(caseClients);
  } catch (err) {
    betterstack.logApiError('GET /api/cases/:id/clients', err);
    res.status(500).json({ error: 'Failed to list case clients' });
  }
});

// Add a client to a case (existing clientId or create inline)
app.post('/api/cases/:id/clients', ...authAndWrite, async (req, res) => {
  try {
    const caseId = req.params.id;
    const { clientId, client, role } = req.body;
    const resolvedRole = role || 'deponent';

    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    let resolvedClientId = clientId && String(clientId).trim() ? String(clientId).trim() : null;

    if (!resolvedClientId && client && typeof client === 'object') {
      const { firstName, lastName, phone, email } = client;
      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({ error: 'firstName and lastName are required' });
      }
      const newClient = await prisma.client.create({
        data: {
          organizationId: req.orgId,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
          email: email != null && String(email).trim() ? String(email).trim() : null,
        },
      });
      resolvedClientId = newClient.id;
    }

    if (!resolvedClientId) {
      return res.status(400).json({ error: 'clientId or client object is required' });
    }

    const cc = await prisma.caseClient.upsert({
      where: { caseId_clientId: { caseId, clientId: resolvedClientId } },
      update: { role: resolvedRole },
      create: { caseId, clientId: resolvedClientId, role: resolvedRole },
    });
    const full = await prisma.caseClient.findUnique({
      where: { id: cc.id },
      include: { client: true },
    });
    res.status(201).json(full);
  } catch (err) {
    betterstack.logApiError('POST /api/cases/:id/clients', err);
    res.status(500).json({ error: 'Failed to add client to case' });
  }
});

// Remove a client from a case
app.delete('/api/cases/:id/clients/:clientId', ...authAndWrite, async (req, res) => {
  try {
    const { id: caseId, clientId } = req.params;
    await prisma.caseClient.delete({
      where: { caseId_clientId: { caseId, clientId } },
    });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case-client link not found' });
    betterstack.logApiError('DELETE /api/cases/:id/clients/:clientId', err);
    res.status(500).json({ error: 'Failed to remove client from case' });
  }
});

// ---------- Organizations (admin only) ----------
app.get('/api/organizations', ...authAndAdmin, async (req, res) => {
  try {
    const list = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, locations: true, cases: true } } },
    });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/organizations', err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});
app.get('/api/organizations/:id', ...authAndAdmin, async (req, res) => {
  try {
    const o = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: { locations: true, clients: true, cases: true, brandings: true },
    });
    if (!o) return res.status(404).json({ error: 'Organization not found' });
    res.json(o);
  } catch (err) {
    betterstack.logApiError('GET /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});
app.post('/api/organizations', ...authAndAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const o = await prisma.organization.create({ data: { name: String(name).trim() } });
    res.status(201).json(o);
  } catch (err) {
    betterstack.logApiError('POST /api/organizations', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});
app.patch('/api/organizations/:id', ...authAndAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const o = await prisma.organization.update({
      where: { id: req.params.id },
      data: { ...(name != null && { name: String(name).trim() }) },
    });
    res.json(o);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Organization not found' });
    betterstack.logApiError('PATCH /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});
app.delete('/api/organizations/:id', ...authAndAdmin, async (req, res) => {
  try {
    await prisma.organization.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Organization not found' });
    betterstack.logApiError('DELETE /api/organizations/:id', err);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// ---------- Locations ----------
app.get('/api/locations', ...authAndStaff, async (req, res) => {
  try {
    let where;
    if (req.accessLevel === 'super') {
      where = req.query.organizationId ? { organizationId: req.query.organizationId } : {};
    } else if (req.accessLevel === 'user') {
      where = req.locationIds?.length > 0 ? { id: { in: req.locationIds } } : { id: '__none__' };
    } else {
      where = { id: '__none__' };
    }
    const list = await prisma.location.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true },
    });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/locations', err);
    res.status(500).json({ error: 'Failed to list locations' });
  }
});
app.get('/api/locations/:id', ...authAndStaff, async (req, res) => {
  try {
    if (req.accessLevel === 'user' && !req.locationIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Access denied: you are not assigned to this location.' });
    }
    const c = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: { organization: true, clients: true, cases: true, brandings: true },
    });
    if (!c) return res.status(404).json({ error: 'Location not found' });
    res.json(c);
  } catch (err) {
    betterstack.logApiError('GET /api/locations/:id', err);
    res.status(500).json({ error: 'Failed to get location' });
  }
});
app.post('/api/locations', ...authAndAdmin, async (req, res) => {
  try {
    const { name, organizationId } = req.body;
    if (!name || !String(name).trim())
      return res.status(400).json({ error: 'name is required' });
    const orgId = (req.userRole === 'super' ? organizationId : req.orgId);
    if (!orgId) return res.status(400).json({ error: 'organizationId is required.' });
    const c = await prisma.location.create({
      data: { organizationId: orgId, name: String(name).trim() },
    });
    res.status(201).json(c);
  } catch (err) {
    betterstack.logApiError('POST /api/locations', err);
    res.status(500).json({ error: 'Failed to create location' });
  }
});
app.patch('/api/locations/:id', ...authAndAdmin, async (req, res) => {
  try {
    const { organizationId, name } = req.body;
    const c = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId != null && { organizationId: String(organizationId) }),
        ...(name != null && { name: String(name).trim() }),
      },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Location not found' });
    betterstack.logApiError('PATCH /api/locations/:id', err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});
app.delete('/api/locations/:id', ...authAndAdmin, async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Location not found' });
    betterstack.logApiError('DELETE /api/locations/:id', err);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ---------- User-Location assignments (admin only) ----------
app.get('/api/locations/:id/users', ...authAndAdmin, async (req, res) => {
  try {
    const rows = await prisma.userLocation.findMany({
      where: { locationId: req.params.id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, imageUrl: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(r => ({ ...r.user, userLocationId: r.id, assignedAt: r.createdAt })));
  } catch (err) {
    betterstack.logApiError('GET /api/locations/:id/users', err);
    res.status(500).json({ error: 'Failed to list location users' });
  }
});

app.post('/api/locations/:id/users', ...authAndAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const loc = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!loc) return res.status(404).json({ error: 'Location not found' });
    if (req.userRole !== 'super' && loc.organizationId !== req.orgId) {
      return res.status(403).json({ error: 'Location does not belong to your organization' });
    }
    const ul = await prisma.userLocation.upsert({
      where: { userId_locationId: { userId: String(userId), locationId: req.params.id } },
      update: {},
      create: { userId: String(userId), locationId: req.params.id },
    });
    res.status(201).json(ul);
  } catch (err) {
    betterstack.logApiError('POST /api/locations/:id/users', err);
    res.status(500).json({ error: 'Failed to assign user to location' });
  }
});

app.delete('/api/locations/:id/users/:userId', ...authAndAdmin, async (req, res) => {
  try {
    await prisma.userLocation.delete({
      where: { userId_locationId: { userId: req.params.userId, locationId: req.params.id } },
    });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User-location assignment not found' });
    betterstack.logApiError('DELETE /api/locations/:id/users/:userId', err);
    res.status(500).json({ error: 'Failed to remove user from location' });
  }
});

// ---------- Users (admin only) ----------
app.get('/api/users', ...authAndAdmin, async (req, res) => {
  try {
    let where = {};
    if (req.accessLevel === 'super' && req.query.organizationId && req.query.unassigned !== 'true') {
      where.organizationId = req.query.organizationId;
    } else if (req.accessLevel === 'super' && req.query.unassigned === 'true') {
      // Users assignable to an org: unassigned (no org) or in a different org. Exclude super.
      const assignableToOrgId = req.query.assignableToOrg || req.query.organizationId;
      if (assignableToOrgId) {
        where = { role: { not: 'super' }, OR: [{ organizationId: null }, { organizationId: { not: assignableToOrgId } }] };
      } else {
        where = { organizationId: null };
      }
    } else if (req.accessLevel === 'super') {
      // Only users with at least one assignment (org or location), so "removed" users drop out of the list
      where = {
        OR: [
          { organizationId: { not: null } },
          { userLocations: { some: {} } },
        ],
      };
    } else {
      // Non-super admin: users with this org OR users on any of this org's locations
      const orgLocations = await prisma.location.findMany({ where: { organizationId: req.orgId }, select: { id: true } });
      const orgLocIds = orgLocations.map(l => l.id);
      where = {
        OR: [
          { organizationId: req.orgId },
          { userLocations: { some: { locationId: { in: orgLocIds } } } },
        ],
      };
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, firstName: true, lastName: true, imageUrl: true, role: true, organizationId: true, userLocations: { select: { locationId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    betterstack.logApiError('GET /api/users', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.get('/api/users/:id/locations', ...authAndAdmin, async (req, res) => {
  try {
    const rows = await prisma.userLocation.findMany({
      where: { userId: req.params.id },
      include: { location: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(r => ({ ...r.location, userLocationId: r.id, assignedAt: r.createdAt })));
  } catch (err) {
    betterstack.logApiError('GET /api/users/:id/locations', err);
    res.status(500).json({ error: 'Failed to list user locations' });
  }
});

app.patch('/api/users/:id', ...authAndAdmin, async (req, res) => {
  try {
    const { role, organizationId } = req.body;
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "user".' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Non-super admins can only manage users in their own org
    if (req.userRole !== 'super' && user.organizationId !== req.orgId) {
      return res.status(404).json({ error: 'User not found in this organization.' });
    }

    const data = {};
    if (role) data.role = role;
    // Only super users can reassign org membership
    if (req.userRole === 'super' && organizationId !== undefined) {
      data.organizationId = organizationId || null;
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, organizationId: true },
    });
    res.json(updated);
  } catch (err) {
    betterstack.logApiError('PATCH /api/users/:id', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', ...authAndAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { userLocations: { select: { locationId: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'super') return res.status(403).json({ error: 'Cannot remove a super admin.' });

    const orgLocIds = req.orgId
      ? (await prisma.location.findMany({ where: { organizationId: req.orgId }, select: { id: true } })).map(l => l.id)
      : [];

    let canRemove = false;
    if (req.userRole === 'super') {
      canRemove = true;
    } else {
      if (user.organizationId === req.orgId) canRemove = true;
      if (!canRemove && user.userLocations.some(ul => orgLocIds.includes(ul.locationId))) canRemove = true;
    }
    if (!canRemove) return res.status(404).json({ error: 'User not found in this organization.' });

    const updateData = { role: 'user' };
    if (req.userRole === 'super' || user.organizationId === req.orgId) {
      updateData.organizationId = null;
    }
    await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
    });
    if (orgLocIds.length > 0) {
      await prisma.userLocation.deleteMany({
        where: { userId: req.params.id, locationId: { in: orgLocIds } },
      });
    } else {
      await prisma.userLocation.deleteMany({ where: { userId: req.params.id } });
    }
    res.status(204).send();
  } catch (err) {
    betterstack.logApiError('DELETE /api/users/:id', err);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

// ---------- Invites (admin only) ----------

app.get('/api/invites', ...authAndAdmin, async (req, res) => {
  try {
    const where = {};
    if (req.accessLevel === 'super' && req.query.organizationId) {
      where.organizationId = req.query.organizationId;
    } else if (req.accessLevel === 'super') {
      // no filter — all invites
    } else {
      where.organizationId = req.orgId;
    }
    const invites = await prisma.invite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true } } },
    });
    res.json(invites);
  } catch (err) {
    betterstack.logApiError('GET /api/invites', err);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

app.post('/api/invites', ...authAndAdmin, async (req, res) => {
  try {
    const { email, role, organizationId, locationIds } = req.body;
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    let orgId = req.userRole === 'super' ? organizationId : req.orgId;

    // Derive org from the selected locations
    if (!orgId && locationIds?.length) {
      const firstLoc = await prisma.location.findUnique({ where: { id: locationIds[0] } });
      if (!firstLoc) return res.status(404).json({ error: 'Location not found.' });
      orgId = firstLoc.organizationId;
    }

    if (!orgId) return res.status(400).json({ error: 'Select at least one location or organization.' });

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    const code = crypto.randomBytes(16).toString('hex');
    const invite = await prisma.invite.create({
      data: {
        organizationId: orgId,
        email: email?.trim() || null,
        role: role || 'user',
        code,
        ...(locationIds?.length ? { locationIds } : {}),
      },
    });

    // Send invite email (fire-and-forget)
    const inviteEmail = (email || '').trim();
    if (resend && inviteEmail && inviteEmail.includes('@')) {
      const inviteUrl = `${req.protocol}://${req.get('host')}/invite/${code}`;
      resend.emails.send({
        from: resendFrom,
        to: inviteEmail,
        subject: `You've been invited to join ${org.name} on DepoSim`,
        html: [
          `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 0">`,
          `<h2 style="margin:0 0 16px">You're invited to DepoSim</h2>`,
          `<p style="color:#555;line-height:1.5">You've been invited to join <strong>${org.name}</strong> on DepoSim as ${(role || 'user') === 'admin' ? 'an Admin' : 'a User'}.</p>`,
          `<p style="margin:24px 0"><a href="${inviteUrl}" style="display:inline-block;background:#6236ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invite</a></p>`,
          `<p style="color:#888;font-size:13px">Or copy this link: <a href="${inviteUrl}" style="color:#6236ff">${inviteUrl}</a></p>`,
          `</div>`,
        ].join(''),
      }).then(({ error }) => {
        if (error) {
          console.error(`[email] invite to ${inviteEmail}:`, error.message);
          betterstack.warn('[email] invite failed', { inviteEmail, error_message: error.message });
        } else {
          console.log(`[email] invite sent to ${inviteEmail}`);
        }
      }).catch(err => {
        console.error(`[email] invite to ${inviteEmail}:`, err.message);
        betterstack.warn('[email] invite error', { inviteEmail, error_message: err.message });
      });
    }

    res.status(201).json(invite);
  } catch (err) {
    betterstack.logApiError('POST /api/invites', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

app.delete('/api/invites/:id', ...authAndAdmin, async (req, res) => {
  try {
    const invite = await prisma.invite.findUnique({ where: { id: req.params.id } });
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    if (req.userRole !== 'super' && invite.organizationId !== req.orgId) {
      return res.status(404).json({ error: 'Invite not found.' });
    }
    await prisma.invite.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    betterstack.logApiError('DELETE /api/invites/:id', err);
    res.status(500).json({ error: 'Failed to delete invite' });
  }
});

// Claim an invite (any authenticated user)
app.post('/api/invites/claim', requireAuthApi, async (req, res) => {
  try {
    const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
    const userId = auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Invite code is required.' });

    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite code.' });
    if (invite.usedBy) return res.status(410).json({ error: 'This invite has already been used.' });

    const upsertData = { role: invite.role || 'user' };
    // Admins get org assignment (they manage the org)
    if (invite.role === 'admin') {
      upsertData.organizationId = invite.organizationId;
    }

    await prisma.user.upsert({
      where: { id: userId },
      update: upsertData,
      create: { id: userId, ...upsertData },
    });

    // Create location assignments from the invite
    if (invite.locationIds?.length) {
      for (const locId of invite.locationIds) {
        await prisma.userLocation.upsert({
          where: { userId_locationId: { userId, locationId: locId } },
          update: {},
          create: { userId, locationId: locId },
        });
      }
    }

    await prisma.invite.update({ where: { id: invite.id }, data: { usedBy: userId } });

    // Sync profile data from Clerk (await so profile is saved before response)
    await syncClerkProfile(userId);

    res.json({ ok: true, organizationId: invite.organizationId, role: invite.role });
  } catch (err) {
    betterstack.logApiError('POST /api/invites/claim', err);
    res.status(500).json({ error: 'Failed to claim invite' });
  }
});

// ---------- Clients ----------
app.get('/api/clients', ...authAndOrg, async (req, res) => {
  try {
    const locationId = req.query.locationId;
    const search = (req.query.search || '').trim();
    const where = scopedWhere(req);
    if (locationId) where.locationId = locationId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    const list = await prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true, location: true },
    });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/clients', err);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});
app.get('/api/clients/:id', ...authAndOrg, async (req, res) => {
  try {
    const c = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { organization: true, location: true, cases: true, brandings: true },
    });
    if (!c) return res.status(404).json({ error: 'Client not found' });
    if (req.accessLevel === 'user' && (!c.locationId || !req.locationIds.includes(c.locationId))) {
      return res.status(403).json({ error: 'Access denied: client does not belong to your assigned locations.' });
    }
    res.json(c);
  } catch (err) {
    betterstack.logApiError('GET /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to get client' });
  }
});
app.post('/api/clients', ...authAndOrg, async (req, res) => {
  try {
    const { locationId, firstName, lastName, email, phone, consentCamera, consentMicrophone } = req.body;
    if (!firstName?.trim() || !lastName?.trim())
      return res.status(400).json({ error: 'firstName and lastName are required' });
    if (req.accessLevel === 'user' && locationId && !req.locationIds.includes(String(locationId))) {
      return res.status(403).json({ error: 'You are not assigned to this location.' });
    }
    const c = await prisma.client.create({
      data: {
        organizationId: req.orgId,
        locationId: locationId != null && locationId !== '' ? String(locationId) : null,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: email != null && email !== '' ? String(email) : null,
        phone: phone != null && phone !== '' ? String(phone) : null,
        consentCamera: Boolean(consentCamera),
        consentMicrophone: Boolean(consentMicrophone),
      },
    });
    res.status(201).json(c);
  } catch (err) {
    betterstack.logApiError('POST /api/clients', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});
app.patch('/api/clients/:id', ...authAndOrg, async (req, res) => {
  try {
    const { organizationId, locationId, firstName, lastName, email, phone, consentCamera, consentMicrophone } = req.body;
    const c = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...(organizationId != null && { organizationId: String(organizationId) }),
        ...(locationId !== undefined && { locationId: locationId === null || locationId === '' ? null : String(locationId) }),
        ...(firstName != null && { firstName: String(firstName).trim() }),
        ...(lastName != null && { lastName: String(lastName).trim() }),
        ...(email !== undefined && { email: email === null || email === '' ? null : String(email) }),
        ...(phone !== undefined && { phone: phone === null || phone === '' ? null : String(phone) }),
        ...(consentCamera !== undefined && { consentCamera: Boolean(consentCamera) }),
        ...(consentMicrophone !== undefined && { consentMicrophone: Boolean(consentMicrophone) }),
      },
    });
    res.json(c);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
    betterstack.logApiError('PATCH /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});
app.delete('/api/clients/:id', ...authAndOrg, async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found' });
    betterstack.logApiError('DELETE /api/clients/:id', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// ---------- Branding ----------
app.get('/api/brandings', ...authAndOrg, async (req, res) => {
  try {
    const locationId = req.query.locationId;
    const clientId = req.query.clientId;
    const where = scopedWhere(req);
    if (locationId) where.locationId = locationId;
    if (clientId) where.clientId = clientId;
    const list = await prisma.branding.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: true, location: true, client: true },
    });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/brandings', err);
    res.status(500).json({ error: 'Failed to list brandings' });
  }
});
app.get('/api/brandings/:id', ...authAndOrg, async (req, res) => {
  try {
    const b = await prisma.branding.findUnique({
      where: { id: req.params.id },
      include: { organization: true, location: true, client: true },
    });
    if (!b) return res.status(404).json({ error: 'Branding not found' });
    res.json(b);
  } catch (err) {
    betterstack.logApiError('GET /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to get branding' });
  }
});
app.post('/api/brandings', ...authAndOrg, async (req, res) => {
  try {
    const { locationId, clientId, accentColor, brandColor, logoUrl } = req.body;
    const b = await prisma.branding.create({
      data: {
        organizationId: req.orgId,
        locationId: locationId || null,
        clientId: clientId || null,
        accentColor: accentColor != null ? String(accentColor) : '#64d2ff',
        brandColor: brandColor != null ? String(brandColor) : '#0b0c10',
        logoUrl: logoUrl != null && logoUrl !== '' ? String(logoUrl) : null,
      },
    });
    res.status(201).json(b);
  } catch (err) {
    betterstack.logApiError('POST /api/brandings', err);
    res.status(500).json({ error: 'Failed to create branding' });
  }
});
app.patch('/api/brandings/:id', ...authAndOrg, async (req, res) => {
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
    betterstack.logApiError('PATCH /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});
app.delete('/api/brandings/:id', ...authAndOrg, async (req, res) => {
  try {
    await prisma.branding.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Branding not found' });
    betterstack.logApiError('DELETE /api/brandings/:id', err);
    res.status(500).json({ error: 'Failed to delete branding' });
  }
});

// ---------- App settings (theme: dark | light) ----------
const APP_SETTINGS_ID = 'app';
app.get('/api/settings', ...authAndOrg, async (req, res) => {
  try {
    let s = await prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (!s) {
      s = await prisma.appSettings.create({
        data: { id: APP_SETTINGS_ID, theme: 'dark' },
      });
    }
    res.json({ theme: s.theme });
  } catch (err) {
    betterstack.logApiError('GET /api/settings', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});
app.patch('/api/settings', ...authAndAdmin, async (req, res) => {
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
    betterstack.logApiError('PATCH /api/settings', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ---------- Prompts ----------
const VALID_PROMPT_TYPES = ['system', 'first_message', 'media_analysis', 'score'];

app.get('/api/prompts/default-score', ...authAndOrg, async (_req, res) => {
  try {
    const content = getDefaultScorePrompt();
    res.json({ content });
  } catch (err) {
    betterstack.logApiError('GET /api/prompts/default-score', err);
    res.status(500).json({ error: 'Failed to get default' });
  }
});

app.get('/api/prompts', ...authAndOrg, async (req, res) => {
  try {
    const type = req.query.type;
    const active = req.query.active;
    const language = req.query.language;
    const where = {};
    if (type && VALID_PROMPT_TYPES.includes(type)) where.type = type;
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (language !== undefined && language !== '') where.language = language || null;
    if (req.accessLevel === 'user') {
      const locFilter = req.locationIds.length > 0
        ? [{ locationId: { in: req.locationIds } }]
        : [];
      where.OR = [
        ...locFilter,
        { organizationId: req.orgId, locationId: null },
        { organizationId: null, locationId: null },
      ];
    }
    const list = await prisma.prompt.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/prompts', err);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// Get the current (active) prompts grouped by type → language for the UI
app.get('/api/prompts/current', ...authAndOrg, async (req, res) => {
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
    betterstack.logApiError('GET /api/prompts/current', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// Get version history for a specific prompt (all ancestors + descendants in chain)
app.get('/api/prompts/:id/history', ...authAndOrg, async (req, res) => {
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
    betterstack.logApiError('GET /api/prompts/:id/history', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

app.get('/api/prompts/:id', ...authAndOrg, async (req, res) => {
  try {
    const p = await prisma.prompt.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Prompt not found' });
    res.json(p);
  } catch (err) {
    betterstack.logApiError('GET /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

app.post('/api/prompts', ...authAndOrg, async (req, res) => {
  try {
    const { type, name, language, content, isActive, organizationId, locationId, clientId, caseId } = req.body;
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
        locationId: locationId || null,
        clientId: clientId || null,
        caseId: caseId || null,
      },
    });
    res.status(201).json(p);
  } catch (err) {
    betterstack.logApiError('POST /api/prompts', err);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// PATCH = create a NEW version (old becomes inactive, new one inherits)
app.patch('/api/prompts/:id', ...authAndOrg, async (req, res) => {
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
          locationId: existing.locationId,
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
    betterstack.logApiError('PATCH /api/prompts/:id', err);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

app.delete('/api/prompts/:id', ...authAndOrg, async (req, res) => {
  try {
    await prisma.prompt.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Prompt not found' });
    betterstack.logApiError('DELETE /api/prompts/:id', err);
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
app.post('/api/analyze-video', ...authAndOrg, async (req, res) => {
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
    betterstack.logApiError('POST /api/analyze-video', err);
    res.status(500).json({ error: err.message || 'Video analysis failed' });
  }
});

// --- Uploaded video analysis (video already compressed client-side to 640x480) ---
app.post('/api/analyze-video/upload', ...authAndOrg, upload.single('video'), async (req, res) => {
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
    betterstack.logApiError('POST /api/analyze-video/upload', err);
    const msg = err.code ? `${err.message} (code: ${err.code})` : err.message;
    res.status(500).json({ error: msg || 'Video upload analysis failed' });
  } finally {
    cleanupFiles(req.file?.path);
  }
});

// List past analyses
app.get('/api/video-analyses', ...authAndOrg, async (req, res) => {
  try {
    const list = await prisma.videoAnalysis.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/video-analyses', err);
    res.status(500).json({ error: 'Failed to list analyses' });
  }
});

// Get one analysis
app.get('/api/video-analyses/:id', ...authAndOrg, async (req, res) => {
  try {
    const a = await prisma.videoAnalysis.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: 'Analysis not found' });
    res.json(a);
  } catch (err) {
    betterstack.logApiError('GET /api/video-analyses/:id', err);
    res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// ---------- Simulations (call history) ----------
app.get('/api/simulations', ...authAndOrg, async (req, res) => {
  try {
    const caseId = req.query.caseId;
    const where = caseId ? { caseId } : {};
    if (req.accessLevel === 'user') {
      where.case = req.locationIds?.length > 0 ? { locationId: { in: req.locationIds } } : { id: '__none__' };
    }
    const list = await prisma.simulation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { case: { include: { client: true } } },
    });

    // For sims missing bodyAnalysis/recordingS3Key, try to copy from a sibling with same conversationId
    const byConv = new Map();
    for (const s of list) {
      if (s.conversationId) {
        const key = s.conversationId;
        if (!byConv.has(key)) byConv.set(key, []);
        byConv.get(key).push(s);
      }
    }
    for (const [, sims] of byConv) {
      const withBody = sims.find((s) => s.bodyAnalysis);
      const withRecording = sims.find((s) => s.recordingS3Key);
      const withTranscript = sims.find((s) => s.transcript || s.score != null);
      for (const s of sims) {
        if (!s.bodyAnalysis && withBody) s.bodyAnalysis = withBody.bodyAnalysis;
        if (!s.recordingS3Key && withRecording) s.recordingS3Key = withRecording.recordingS3Key;
        if (withTranscript) {
          if (!s.transcript && withTranscript.transcript) s.transcript = withTranscript.transcript;
          if (s.score == null && withTranscript.score != null) s.score = withTranscript.score;
          if (!s.scoreReason && withTranscript.scoreReason) s.scoreReason = withTranscript.scoreReason;
          if (!s.fullAnalysis && withTranscript.fullAnalysis) s.fullAnalysis = withTranscript.fullAnalysis;
          if (!s.turnScores && withTranscript.turnScores) s.turnScores = withTranscript.turnScores;
          if (s.callDurationSecs == null && withTranscript.callDurationSecs != null) s.callDurationSecs = withTranscript.callDurationSecs;
          if (!s.transcriptSummary && withTranscript.transcriptSummary) s.transcriptSummary = withTranscript.transcriptSummary;
          if (!s.callSummaryTitle && withTranscript.callSummaryTitle) s.callSummaryTitle = withTranscript.callSummaryTitle;
        }
      }
    }

    res.json(list);
  } catch (err) {
    betterstack.logApiError('GET /api/simulations', err);
    res.status(500).json({ error: 'Failed to list simulations' });
  }
});

// ---------- Presigned URL for recording playback (must be before generic :id) ----------
app.get('/api/simulations/:id/recording-url', ...authAndOrg, async (req, res) => {
  try {
    const s = await prisma.simulation.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: 'Simulation not found' });

    let key = s.recordingS3Key;
    // Fallback: this sim may not have the key (race with webhook); find one with same conversationId that does
    if (!key && s.conversationId) {
      const alt = await prisma.simulation.findFirst({
        where: { conversationId: s.conversationId, recordingS3Key: { not: null } },
      });
      if (alt) key = alt.recordingS3Key;
    }
    if (!key) return res.status(404).json({ error: 'No recording for this simulation' });

    const url = await getPresignedViewUrl(key);
    res.json({ url });
  } catch (err) {
    betterstack.logApiError('GET /api/simulations/:id/recording-url', err);
    res.status(500).json({ error: err.message || 'Failed to get recording URL' });
  }
});

app.get('/api/simulations/:id', ...authAndOrg, async (req, res) => {
  try {
    let s = await prisma.simulation.findUnique({
      where: { id: req.params.id },
      include: { case: { include: { client: true } } },
    });
    if (!s) return res.status(404).json({ error: 'Simulation not found' });
    // If missing transcript/score, try to merge from sibling with same conversationId (webhook may have updated a different record)
    if ((!s.transcript && s.score == null) && s.conversationId) {
      const sibling = await prisma.simulation.findFirst({
        where: { conversationId: s.conversationId, id: { not: s.id } },
      });
      if (sibling) {
        if (!s.transcript && sibling.transcript) s.transcript = sibling.transcript;
        if (s.score == null && sibling.score != null) s.score = sibling.score;
        if (!s.scoreReason && sibling.scoreReason) s.scoreReason = sibling.scoreReason;
        if (!s.fullAnalysis && sibling.fullAnalysis) s.fullAnalysis = sibling.fullAnalysis;
        if (!s.turnScores && sibling.turnScores) s.turnScores = sibling.turnScores;
        if (s.callDurationSecs == null && sibling.callDurationSecs != null) s.callDurationSecs = sibling.callDurationSecs;
        if (!s.transcriptSummary && sibling.transcriptSummary) s.transcriptSummary = sibling.transcriptSummary;
        if (!s.callSummaryTitle && sibling.callSummaryTitle) s.callSummaryTitle = sibling.callSummaryTitle;
      }
    }
    res.json(s);
  } catch (err) {
    betterstack.logApiError('GET /api/simulations/:id', err);
    res.status(500).json({ error: 'Failed to get simulation' });
  }
});

// ---------- Resolve simulation by id, conversationId, or caseId (shared for video uploads) ----------
async function resolveSimForVideo(prisma, simId, conversationId, caseId) {
  let sim = null;
  if (simId && simId !== 'by-conversation' && simId !== 'by-case') {
    sim = await prisma.simulation.findUnique({ where: { id: simId } });
  }
  if (!sim && conversationId) {
    for (let attempt = 0; attempt < 10 && !sim; attempt++) {
      sim = await prisma.simulation.findFirst({ where: { conversationId: String(conversationId) } });
      if (!sim && attempt < 9) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!sim && caseId) {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    for (let attempt = 0; attempt < 10 && !sim; attempt++) {
      sim = await prisma.simulation.findFirst({
        where: { caseId: String(caseId), createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
      });
      if (!sim && attempt < 9) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!sim && caseId) {
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
  return sim;
}

// ---------- S3 multipart upload: init (for large recordings) ----------
app.post('/api/simulations/video/upload-init', async (req, res) => {
  try {
    const { conversationId, caseId } = req.body || req.query || {};
    if (!caseId || typeof caseId !== 'string') return res.status(400).json({ error: 'caseId required' });

    const sim = await resolveSimForVideo(prisma, null, conversationId, caseId);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const ext = 'webm';
    const key = generateRecordingKey(caseId, conversationId, ext);
    const { uploadId } = await createMultipartUpload(key, 'video/webm');

    res.json({ ok: true, uploadId, key });
  } catch (err) {
    betterstack.logApiError('POST /api/simulations/video/upload-init', err);
    res.status(500).json({ error: err.message || 'Upload init failed' });
  }
});

// ---------- S3 multipart upload: get presigned URLs for parts ----------
app.post('/api/simulations/video/upload-urls', async (req, res) => {
  try {
    const { uploadId, key, partNumbers } = req.body || {};
    if (!uploadId || !key || !Array.isArray(partNumbers) || partNumbers.length === 0) {
      return res.status(400).json({ error: 'uploadId, key, and partNumbers required' });
    }

    const urls = await getPresignedUploadUrls(key, uploadId, partNumbers);
    res.json({ ok: true, urls });
  } catch (err) {
    betterstack.logApiError('POST /api/simulations/video/upload-urls', err);
    res.status(500).json({ error: err.message || 'Failed to get upload URLs' });
  }
});

// ---------- S3 multipart upload: complete, then run Gemini analysis ----------
app.post('/api/simulations/video/upload-complete', async (req, res) => {
  let tmpPath = null;
  try {
    const { uploadId, key, parts, conversationId, caseId } = req.body || {};
    if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'uploadId, key, and parts required' });
    }
    if (!caseId || typeof caseId !== 'string') return res.status(400).json({ error: 'caseId required' });

    await completeMultipartUpload(key, uploadId, parts);

    const sim = await resolveSimForVideo(prisma, null, conversationId, caseId);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    tmpPath = await downloadToTemp(key);
    const promptText = getBodyAnalysisPrompt();
    const mimeType = key.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    const result = await analyzeVideoFile(tmpPath, mimeType, promptText);

    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        bodyAnalysis: String(result.text || ''),
        bodyAnalysisModel: String(result.model || 'gemini-2.5-flash'),
        recordingS3Key: key,
      },
    });

    res.json({ ok: true, bodyAnalysis: result.text, bodyAnalysisModel: result.model });
  } catch (err) {
    betterstack.logApiError('POST /api/simulations/video/upload-complete', err);
    res.status(500).json({ error: err.message || 'Upload complete failed' });
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
});

// ---------- Upload body-language video (legacy FormData, kept for small files when S3 unavailable) ----------
app.post('/api/simulations/:id/video', upload.single('video'), async (req, res) => {
  try {
    const simId = req.params.id;
    const conversationId = req.query.conversationId || req.body?.conversationId;
    const caseId = req.query.caseId || req.body?.caseId;

    const sim = await resolveSimForVideo(prisma, simId, conversationId, caseId);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

    let mimeType = req.file.mimetype || '';
    if (!mimeType.startsWith('video/')) {
      const ext = (req.file.originalname || '').toLowerCase().match(/\.(webm|mp4|mov|avi|mkv)$/);
      mimeType = ext ? (ext[1] === 'webm' ? 'video/webm' : ext[1] === 'mp4' ? 'video/mp4' : 'video/' + ext[1]) : 'video/webm';
    }

    const promptText = getBodyAnalysisPrompt();
    const result = await analyzeVideoFile(req.file.path, mimeType, promptText);

    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        bodyAnalysis: String(result.text || ''),
        bodyAnalysisModel: String(result.model || 'gemini-2.5-flash'),
      },
    });

    fs.unlink(req.file.path, () => {});
    res.json({ ok: true, bodyAnalysis: result.text, bodyAnalysisModel: result.model });
  } catch (err) {
    betterstack.logApiError('POST /api/simulations/:id/video', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message || 'Video analysis failed' });
  }
});

// ---------- Sim: signed URL for React SDK (agent + dynamic vars) ----------
app.post('/api/sim/signed-url', async (req, res) => {
  try {
    const { caseId, stage } = req.body || {};
    if (!caseId || typeof caseId !== 'string') return res.status(400).json({ error: 'caseId required' });

    const stageNum = Math.max(1, Math.min(4, parseInt(stage, 10) || 1));

    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      include: { client: true },
    });
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const client = caseRecord.client;
    const firstName = client?.firstName || '';
    const lastName = client?.lastName || '';
    const name = `${firstName} ${lastName}`.trim() || 'Deponent';
    const caseNumber = caseRecord.caseNumber || '';
    const desc = caseRecord.description || '';
    const phone = client?.phone || '';
    const caseInfo = `Case Number: ${caseNumber}\nDeponent: ${name}\nPhone: ${phone}\nDescription: ${desc}`;

    let depoPrompt = '';
    let firstMessage = '';
    let primerMensaje = '';
    try {
      // Load stage-specific prompt from .txt file
      const stagePromptText = loadStagePrompt(stageNum);
      if (stagePromptText) {
        depoPrompt = stagePromptText.replace('{{case_info}}', caseInfo);

        // Inject previous stage summaries
        if (stageNum > 1) {
          const prevSims = await prisma.simulation.findMany({
            where: { caseId, stage: { lt: stageNum }, stageSummary: { not: null } },
            orderBy: { stage: 'asc' },
          });
          const summaryText = prevSims.length > 0
            ? prevSims.map((s) => `[Stage ${s.stage} — ${STAGE_NAMES[s.stage] || 'Unknown'} Summary]\n${s.stageSummary}`).join('\n\n')
            : 'No previous stage data available.';
          depoPrompt = depoPrompt.replace('{{previous_stage_summary}}', summaryText);
        } else {
          depoPrompt = depoPrompt.replace('{{previous_stage_summary}}', 'This is the first stage — no prior context.');
        }
      } else {
        // Fallback to DB prompt if stage file not found
        const sysPrompt = await prisma.prompt.findFirst({ where: { type: 'system', isActive: true }, orderBy: { updatedAt: 'desc' } });
        depoPrompt = sysPrompt?.content || 'No system prompt configured.';
      }

      const [fmEn, fmEs] = await Promise.all([
        prisma.prompt.findFirst({ where: { type: 'first_message', isActive: true, OR: [{ language: 'en' }, { language: null }] }, orderBy: { updatedAt: 'desc' } }),
        prisma.prompt.findFirst({ where: { type: 'first_message', isActive: true, language: 'es' }, orderBy: { updatedAt: 'desc' } }),
      ]);
      firstMessage = fmEn?.content || 'Hello, I will be conducting your deposition practice today.';
      primerMensaje = fmEs?.content || '';
    } catch (e) {
      console.error('[sim] Error loading prompts:', e.message);
      betterstack.warn('[sim] Error loading prompts', { error_message: e.message });
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
      betterstack.error('[sim] ElevenLabs signed-url error', { status: elevenRes.status, body: errText });
      return res.status(502).json({ error: 'Failed to get signed URL', detail: errText });
    }
    const { signed_url: signedUrl } = await elevenRes.json();
    if (!signedUrl) return res.status(502).json({ error: 'No signed_url in response' });

    // Resolve which client is running this sim (from auth if available, else case primary client)
    let simClientId = caseRecord.clientId;
    const simAuth = typeof req.auth === 'function' ? req.auth() : req.auth;
    const authUserId = simAuth?.userId;
    if (authUserId) {
      const linkedClient = await prisma.client.findFirst({
        where: { clerkUserId: authUserId },
        select: { id: true },
      });
      if (linkedClient) simClientId = linkedClient.id;
    }

    const dynamicVariables = {
      depo_prompt: depoPrompt,
      first_message: firstMessage,
      primer_mensaje: primerMensaje,
      case_id: caseId,
      case_info: caseInfo,
      stage: String(stageNum),
      client_id: simClientId,
    };

    res.json({ signedUrl, dynamicVariables, stage: stageNum, case: { name, caseNumber, firstName, lastName } });
  } catch (err) {
    betterstack.logApiError('POST /api/sim/signed-url', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ---------- Sim page (legacy HTML - redirect to React) ----------
app.get('/api/sim/:caseId', (req, res) => {
  res.redirect(302, `/sim/${req.params.caseId}`);
});

// ---------- AI Coach Chat (simulation analysis & deposition coaching) ----------
app.post('/api/chat', ...authAndOrg, async (req, res) => {
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
        include: { case: { include: { client: true } } },
      });
      if (sim) {
        const client = sim.case?.client;
        const caseName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Unknown' : 'Unknown';
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
    betterstack.logApiError('POST /api/chat', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// ---------- AI Coach for Prompt Adjustment (works on any prompt type) ----------
app.post('/api/chat/prompt-coach', ...authAndOrg, async (req, res) => {
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
    betterstack.logApiError('POST /api/chat/prompt-coach', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// ---------- Translate first_message to all languages ----------
app.post('/api/prompts/translate-all', ...authAndOrg, async (req, res) => {
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
                locationId: existing.locationId,
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
    betterstack.logApiError('POST /api/prompts/translate-all', err);
    res.status(500).json({ error: err.message || 'Translation failed' });
  }
});

// ---------- Stage system: helpers ----------
const STAGE_FILES = {
  1: 'stage-1-background.txt',
  2: 'stage-2-accident.txt',
  3: 'stage-3-medical.txt',
  4: 'stage-4-treatment.txt',
};

const STAGE_NAMES = {
  1: 'Background & Employment',
  2: 'Accident & Aftermath',
  3: 'Medical History & Treatment Discovery',
  4: 'Treatment Details & Current Condition',
};

function loadStagePrompt(stageNum) {
  const file = STAGE_FILES[stageNum];
  if (!file) return null;
  const promptPath = path.join(__dirname, 'prompts', file);
  try {
    return fs.readFileSync(promptPath, 'utf8');
  } catch {
    return null;
  }
}

// ---------- Stage: get completion status for a case ----------
app.get('/api/cases/:id/stages', async (req, res) => {
  try {
    const caseId = req.params.id;
    const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });

    const sims = await prisma.simulation.findMany({
      where: { caseId, stage: { not: null } },
      orderBy: [{ stage: 'asc' }, { createdAt: 'desc' }],
    });

    const stageMap = {};
    for (const s of sims) {
      if (!stageMap[s.stage]) stageMap[s.stage] = s;
    }

    let currentStage = 1;
    const stages = [1, 2, 3, 4].map((n) => {
      const sim = stageMap[n];
      if (!sim) {
        const prevCompleted = n === 1 || (stageMap[n - 1] && stageMap[n - 1].stageStatus === 'completed');
        return {
          stage: n,
          name: STAGE_NAMES[n],
          status: prevCompleted ? 'available' : 'locked',
          simulationId: null,
          score: null,
          retakeRecommended: false,
        };
      }
      if (sim.stageStatus === 'completed') {
        if (n + 1 <= 4 && !stageMap[n + 1]) currentStage = n + 1;
      } else {
        currentStage = n;
      }
      return {
        stage: n,
        name: STAGE_NAMES[n],
        status: sim.stageStatus || 'completed',
        simulationId: sim.id,
        score: sim.score,
        retakeRecommended: sim.retakeRecommended,
      };
    });

    if (stageMap[4]?.stageStatus === 'completed') currentStage = 4;

    res.json({ stages, currentStage });
  } catch (err) {
    betterstack.logApiError('GET /api/cases/:id/stages', err);
    res.status(500).json({ error: 'Failed to get stages' });
  }
});

// ---------- Stage: generate summary after stage completion ----------
app.post('/api/cases/:id/stage-summary', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const { simulationId } = req.body;
    if (!simulationId) return res.status(400).json({ error: 'simulationId is required' });

    const sim = await prisma.simulation.findUnique({
      where: { id: simulationId },
      include: { case: { include: { client: true } } },
    });
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const transcript = Array.isArray(sim.transcript)
      ? sim.transcript.map((t) => `${t.role === 'agent' ? 'Q' : 'A'}: ${t.message || t.original_message || ''}`).join('\n')
      : '';

    if (!transcript) return res.status(400).json({ error: 'No transcript to summarize' });

    const client = sim.case?.client;
    const stageName = STAGE_NAMES[sim.stage] || `Stage ${sim.stage}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are summarizing a deposition simulation stage for the AI conducting the next stage. Extract ONLY factual information the deponent confirmed. Be concise. Format as bullet points grouped by category.

Include:
- Key biographical facts confirmed (name, DOB, address, employment, etc.)
- Key case details confirmed
- Any notable admissions, inconsistencies, or areas of concern
- Any topics the deponent refused to answer or said "I don't know"
- Prior injuries or medical history mentioned (if any)

Do NOT include commentary or coaching advice. Only confirmed facts and notable responses.`,
          },
          {
            role: 'user',
            content: `Summarize this ${stageName} deposition stage transcript for the deponent "${client?.firstName || ''} ${client?.lastName || ''}":\n\n${transcript}`,
          },
        ],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: 'OpenAI: ' + (data.error.message || JSON.stringify(data.error)) });

    const summary = data.choices?.[0]?.message?.content || '';

    await prisma.simulation.update({
      where: { id: simulationId },
      data: { stageSummary: summary },
    });

    res.json({ ok: true, summary });
  } catch (err) {
    betterstack.logApiError('POST /api/cases/:id/stage-summary', err);
    res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
});

// ---------- Stage: evaluate whether retake is recommended ----------
app.post('/api/simulations/:id/evaluate-stage', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const sim = await prisma.simulation.findUnique({
      where: { id: req.params.id },
      include: { case: { include: { client: true } } },
    });
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    const transcript = Array.isArray(sim.transcript)
      ? sim.transcript.map((t) => `${t.role === 'agent' ? 'Q' : 'A'}: ${t.message || t.original_message || ''}`).join('\n')
      : '';

    const stageName = STAGE_NAMES[sim.stage] || `Stage ${sim.stage}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You evaluate whether a deposition simulation stage should be retaken. Consider:
1. Did the deponent answer enough questions to cover the stage topics?
2. Were there too many "I don't know" or "I don't remember" responses?
3. Was coverage of required topics sufficient?
4. Did the deponent show major issues (excessive volunteering, guessing, emotional responses)?
5. Was the session too short to meaningfully cover the material?

Return ONLY a JSON object: { "retakeRecommended": boolean, "reason": "brief explanation" }
Recommend retake ONLY if there are significant gaps or performance issues. A score under 40 or very short session (< 5 min of substantive Q&A) should generally trigger a retake recommendation.`,
          },
          {
            role: 'user',
            content: `Stage: ${stageName}\nScore: ${sim.score != null ? sim.score : 'N/A'}\nDuration: ${sim.callDurationSecs ? Math.floor(sim.callDurationSecs / 60) + 'm' : 'N/A'}\n\nTranscript:\n${transcript || '(No transcript available)'}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await resp.json();
    if (data.error) return res.status(502).json({ error: 'OpenAI: ' + (data.error.message || JSON.stringify(data.error)) });

    let result;
    try {
      result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch {
      result = { retakeRecommended: false, reason: 'Could not parse evaluation.' };
    }

    const retakeRecommended = Boolean(result.retakeRecommended);
    const reason = String(result.reason || '');

    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        retakeRecommended,
        stageStatus: 'completed',
      },
    });

    res.json({ retakeRecommended, reason });
  } catch (err) {
    betterstack.logApiError('POST /api/simulations/:id/evaluate-stage', err);
    res.status(500).json({ error: err.message || 'Evaluation failed' });
  }
});

// 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
