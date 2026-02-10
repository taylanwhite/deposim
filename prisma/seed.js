const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/** Deterministic UUID from string (for idempotent first_message seeds). */
function uuidFromSeed(seed) {
  const hex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Fixed UUIDs for idempotent seeds. */
const SYSTEM_PROMPT_PI_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MEDIA_ANALYSIS_BODY_LANGUAGE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

async function main() {
  // System prompt: Opposing Counsel PI
  const systemPath = path.join(__dirname, 'seeds', 'system-prompt-personal-injury.txt');
  const systemContent = fs.readFileSync(systemPath, 'utf8').trim();
  await prisma.prompt.upsert({
    where: { id: SYSTEM_PROMPT_PI_ID },
    create: {
      id: SYSTEM_PROMPT_PI_ID,
      type: 'system',
      name: 'Opposing Counsel - Personal Injury Edition',
      content: systemContent,
      isActive: true,
    },
    update: {
      name: 'Opposing Counsel - Personal Injury Edition',
      content: systemContent,
      isActive: true,
    },
  });
  console.log('Seeded system prompt (UUID):', SYSTEM_PROMPT_PI_ID);

  // Media analysis: body language / behavioral analyst
  const mediaPath = path.join(__dirname, 'seeds', 'media-analysis-body-language.txt');
  const mediaContent = fs.readFileSync(mediaPath, 'utf8').trim();
  await prisma.prompt.upsert({
    where: { id: MEDIA_ANALYSIS_BODY_LANGUAGE_ID },
    create: {
      id: MEDIA_ANALYSIS_BODY_LANGUAGE_ID,
      type: 'media_analysis',
      name: 'Body Language & Behavioral Analysis',
      content: mediaContent,
      isActive: true,
    },
    update: {
      name: 'Body Language & Behavioral Analysis',
      content: mediaContent,
      isActive: true,
    },
  });
  console.log('Seeded media_analysis prompt (UUID):', MEDIA_ANALYSIS_BODY_LANGUAGE_ID);

  // First messages: all languages from first-message.json (ElevenLabs-supported)
  const firstMessagePath = path.join(__dirname, 'seeds', 'first-message.json');
  const firstMessages = JSON.parse(fs.readFileSync(firstMessagePath, 'utf8'));
  const langNames = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', 'pt-br': 'Portuguese (Brazil)', pl: 'Polish', nl: 'Dutch',
    ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', hi: 'Hindi',
    ar: 'Arabic', tr: 'Turkish', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
    fi: 'Finnish', el: 'Greek', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian',
    id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian',
    fil: 'Filipino', ms: 'Malay', sk: 'Slovak', ta: 'Tamil', uk: 'Ukrainian',
  };
  for (const [lang, content] of Object.entries(firstMessages)) {
    const id = uuidFromSeed('first_message_' + lang);
    const name = langNames[lang] ? `Berman Law Group - ${langNames[lang]}` : `Berman Law Group - ${lang}`;
    await prisma.prompt.upsert({
      where: { id },
      create: {
        id,
        type: 'first_message',
        name,
        language: lang,
        content: String(content).trim(),
        isActive: true,
      },
      update: {
        name,
        language: lang,
        content: String(content).trim(),
        isActive: true,
      },
    });
    console.log('Seeded first_message (' + lang + ') prompt (UUID):', id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
