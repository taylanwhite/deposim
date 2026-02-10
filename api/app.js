const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
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
    const { caseNumber, firstName, lastName, phone, email, description } = req.body;
    if (!caseNumber || !firstName || !lastName || !phone || !description) {
      return res.status(400).json({
        error: 'Missing required fields: caseNumber, firstName, lastName, phone, description',
      });
    }
    const c = await prisma.case.create({
      data: {
        caseNumber: String(caseNumber),
        firstName: String(firstName),
        lastName: String(lastName),
        phone: String(phone),
        email: email != null ? String(email) : null,
        description: String(description),
      },
    });
    res.status(201).json(c);
  } catch (err) {
    console.error('POST /api/cases', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// Update case
app.patch('/api/cases/:id', async (req, res) => {
  try {
    const { caseNumber, firstName, lastName, phone, email, description } = req.body;
    const c = await prisma.case.update({
      where: { id: req.params.id },
      data: {
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

// 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
