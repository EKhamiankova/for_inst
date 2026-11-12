const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// ===== НАСТРОЙКИ =====
const VERIFY_TOKEN = 'Enter830'; // придумайте любой
const APP_SECRET = 'ваш_app_secret_из_meta'; // App Secret из панели Meta
const MAKE_WEBHOOK_URL = 'https://hook.make.com/ваш_вебхук'; // URL из Make.com
const PAGE_ACCESS_TOKEN = 'ваш_page_access_token'; // нужен для отправки сообщений позже

// ===== 1. ВЕРИФИКАЦИЯ ВЕБХУКА (GET) =====
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ===== 2. ПРИЁМ СОБЫТИЙ (POST) =====
app.post('/webhook', async (req, res) => {
  // Проверка подписи Meta
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

  // Отвечаем Meta сразу (требование: 200 OK в течение 5 секунд)[citation:8]
  res.status(200).send('EVENT_RECEIVED');

  // Обрабатываем асинхронно
  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const messaging of entry.messaging || []) {
        // Пропускаем эхо (сообщения, отправленные нами же)
        if (messaging.message && messaging.message.is_echo) continue;

        const senderId = messaging.sender?.id; // IGSID
        const text = messaging.message?.text || '';
        const timestamp = messaging.timestamp;

        if (!senderId) continue;

        // Пересылаем в Make.com
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

// ===== 3. (ОПЦИОНАЛЬНО) ОТПРАВКА СООБЩЕНИЯ =====
// Эту функцию вы будете вызывать позже для ответов по ключевым словам
async function sendMessage(igsid, messageText) {
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  await axios.post(url, {
    recipient: { id: igsid },
    message: { text: messageText }
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
