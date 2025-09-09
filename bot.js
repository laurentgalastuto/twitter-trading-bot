console.log('🚀 Starting bot...');

require('dotenv').config();

console.log('📋 Checking environment variables...');
console.log('TWITTER_BEARER_TOKEN:', process.env.TWITTER_BEARER_TOKEN ? 'OK' : '❌ MISSING');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'OK' : '❌ MISSING');
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID ? 'OK' : '❌ MISSING');
console.log('HUGGINGFACE_API_KEY:', process.env.HUGGINGFACE_API_KEY ? 'OK' : '❌ MISSING');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'Bot test running!', timestamp: new Date() });
});

console.log('🚀 Starting server...');

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('🎯 All environment variables loaded successfully!');
});
