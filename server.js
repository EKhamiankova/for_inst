const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// ===== ЗНАЧЕНИЯ БЕРУТСЯ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ RENDER =====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ===== 1. ВЕРИФИКАЦИЯ ВЕБХУКА (GET) =====
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verification failed');
    res.sendStatus(403);
  }
});

// ===== 2. ПРИЁМ СОБЫТИЙ (POST) =====
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (signature && APP_SECRET) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      console.log('❌ Invalid signature');
      return res.sendStatus(403);
    }
  }

  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const messaging of entry.messaging || []) {
        if (messaging.message && messaging.message.is_echo) continue;

        const senderId = messaging.sender?.id;
        const text = messaging.message?.text || '';
        const timestamp = messaging.timestamp;

        if (!senderId) continue;

        await axios.post(MAKE_WEBHOOK_URL, {
          igsid: senderId,
          text: text,
          timestamp: timestamp,
          source: 'instagram_webhook'
        });
        console.log(`📨 Forwarded message from IGSID ${senderId}`);
      }
    }
  } catch (err) {
    console.error('Forward error:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
