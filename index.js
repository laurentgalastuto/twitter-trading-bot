console.log('🚀 Starting bot...');

require('dotenv').config();

console.log('📋 Checking environment variables...');
console.log('TWITTER_BEARER_TOKEN:', process.env.TWITTER_BEARER_TOKEN ? 'OK' : '❌ MISSING');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'OK' : '❌ MISSING');
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID ? 'OK' : '❌ MISSING');
console.log('HUGGINGFACE_API_KEY:', process.env.HUGGINGFACE_API_KEY ? 'OK' : '❌ MISSING');

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('⚙️ Setting up configuration...');

// Configuration
const CONFIG = {
  TWITTER_USER: 'Deltaone0',
  CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes  
  CONFIDENCE_THRESHOLD: 60,
  MAX_TWEETS_CACHE: 50
};

// Stockage en mémoire
let processedTweets = [];
let signals = [];

console.log('🌐 Setting up Express server...');

// Keep-alive pour éviter sleep Render
app.get('/', (req, res) => {
  res.json({ 
    status: '🤖 Bot Trading Running!',
    uptime: Math.floor(process.uptime()),
    lastCheck: new Date().toISOString(),
    totalSignals: signals.length
  });
});

console.log('📱 Initializing services...');

// SERVICE TWITTER
class TwitterService {
  constructor() {
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
    console.log('Twitter service initialized');
  }

  async getLatestTweets() {
    try {
      console.log('Fetching tweets from Twitter API...');
      
      // Get user ID
      const userResponse = await axios.get(
        `https://api.twitter.com/2/users/by/username/${CONFIG.TWITTER_USER}`,
        { headers: { 'Authorization': `Bearer ${this.bearerToken}` }}
      );
      
      const userId = userResponse.data.data.id;
      
      // Get tweets
      const tweetsResponse = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets`,
        {
          headers: { 'Authorization': `Bearer ${this.bearerToken}` },
          params: {
            'max_results': 5,
            'tweet.fields': 'created_at',
            'exclude': 'retweets,replies'
          }
        }
      );

      const tweets = tweetsResponse.data.data || [];
      return this.filterNewTweets(tweets);
      
    } catch (error) {
      console.error('Twitter Error:', error.response?.status, error.message);
      return [];
    }
  }

  filterNewTweets(tweets) {
    const processedIds = new Set(processedTweets.map(t => t.id));
    const newTweets = tweets.filter(tweet => !processedIds.has(tweet.id));
    
    // Ajouter aux traités
    newTweets.forEach(tweet => {
      processedTweets.push({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at
      });
    });
    
    return newTweets;
  }
}

// SERVICE IA
class AIService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.sentimentModel = 'cardiffnlp/twitter-roberta-base-sentiment-latest';
    console.log('AI service initialized');
  }

  async analyzeText(text) {
    try {
      console.log('🧠 Analyzing with RoBERTa...');
      
      const cleanText = this.cleanText(text);
      const symbols = this.extractSymbols(text);
      const sentiment = await this.getSentimentHuggingFace(cleanText);
      const signal = this.classifySignal(cleanText, sentiment, symbols);
      
      return {
        signal: signal.type,
        confidence: signal.confidence,
        symbols: symbols,
        reasoning: signal.reasoning,
        sentiment_score: sentiment.score
      };

    } catch (error) {
      console.error('AI Analysis Error:', error.message);
      return this.fallbackAnalysis(text);
    }
  }

  cleanText(text) {
    return text
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/@[^\s]+/g, '')
      .replace(/#[^\s]+/g, '')
      .trim();
  }

  extractSymbols(text) {
    const symbolRegex = /\$([A-Z]{2,6})/g;
    const matches = [...text.matchAll(symbolRegex)];
    return [...new Set(matches.map(match => match[1]))];
  }

  async getSentimentHuggingFace(text) {
    try {
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${this.sentimentModel}`,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const result = response.data[0];
      const sentimentMap = {
        'LABEL_0': -0.8,
        'LABEL_1': 0,    
        'LABEL_2': 0.8
      };

      console.log(`✅ RoBERTa result: ${result.label}`);

      return {
        label: result.label,
        score: sentimentMap[result.label] || 0,
        confidence: result.score
      };

    } catch (error) {
      console.error('Hugging Face API Error:', error.message);
      return { label: 'NEUTRAL', score: 0, confidence: 0.5 };
    }
  }

  classifySignal(text, sentiment, symbols) {
    const textLower = text.toLowerCase();
    
    const bullishWords = ['moon', 'pump', 'bull', 'buy', 'long', 'up', 'rise', 'surge'];
    const bearishWords = ['dump', 'bear', 'sell', 'short', 'down', 'fall', 'crash'];
    
    const bullishCount = bullishWords.filter(word => textLower.includes(word)).length;
    const bearishCount = bearishWords.filter(word => textLower.includes(word)).length;

    let signalType = 'NEUTRE';
    let confidence = 50;
    let reasoning = 'IA RoBERTa';

    const sentimentWeight = sentiment.score * 40;
    const keywordWeight = (bullishCount - bearishCount) * 15;
    const finalScore = sentimentWeight + keywordWeight;

    if (finalScore > 20) {
      signalType = 'ACHAT';
      confidence = Math.min(95, 65 + Math.abs(finalScore));
      reasoning = `RoBERTa: ${sentiment.score.toFixed(2)} + ${bullishCount} bullish`;
    } else if (finalScore < -20) {
      signalType = 'VENTE';
      confidence = Math.min(95, 65 + Math.abs(finalScore));
      reasoning = `RoBERTa: ${sentiment.score.toFixed(2)} + ${bearishCount} bearish`;
    } else {
      confidence = Math.max(30, 50 - Math.abs(finalScore));
      reasoning = `RoBERTa neutre (${sentiment.score.toFixed(2)})`;
    }

    if (symbols.length > 0) {
      confidence += 15;
      reasoning += ` [${symbols.join(', ')}]`;
    }

    return {
      type: signalType,
      confidence: Math.round(confidence),
      reasoning: reasoning
    };
  }

  fallbackAnalysis(text) {
    console.log('Using fallback analysis...');
    const textLower = text.toLowerCase();
    const symbols = this.extractSymbols(text);
    
    const bullishWords = ['moon', 'pump', 'bull', 'buy', 'long', 'up'];
    const bearishWords = ['dump', 'bear', 'sell', 'short', 'down', 'crash'];
    
    const bullishCount = bullishWords.filter(word => textLower.includes(word)).length;
    const bearishCount = bearishWords.filter(word => textLower.includes(word)).length;

    let signal = 'NEUTRE';
    let confidence = 40;

    if (bullishCount > bearishCount) {
      signal = 'ACHAT';
      confidence = 50 + (bullishCount * 10);
    } else if (bearishCount > bullishCount) {
      signal = 'VENTE';
      confidence = 50 + (bearishCount * 10);
    }

    return {
      signal: signal,
      confidence: Math.min(confidence, 75),
      symbols: symbols,
      reasoning: `Fallback: ${bullishCount}B/${bearishCount}B`,
      sentiment_score: 0
    };
  }
}

// SERVICE TELEGRAM
class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    console.log('Telegram service initialized');
  }

  async sendSignal(signal) {
    const emoji = signal.signal_type === 'ACHAT' ? '🟢' : 
                  signal.signal_type === 'VENTE' ? '🔴' : '🟡';
    
    let message = `${emoji} ${signal.signal_type} - ${signal.confidence}%\n\n`;
    
    if (signal.symbols.length > 0) {
      message += `💰 Symboles: $${signal.symbols.join(' $')}\n`;
    }
    
    message += `💬 Tweet: ${signal.tweet_text.substring(0, 100)}...\n`;
    message += `🧠 Analyse: ${signal.reasoning}\n`;
    message += `🕐 ${new Date().toLocaleString('fr-FR')}`;

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message
      });
      
      console.log(`✅ Signal sent: ${signal.signal_type}`);
    } catch (error) {
      console.error('Telegram Error:', error.message);
    }
  }

  async sendStatus(message) {
    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: `🤖 ${message}`
      });
    } catch (error) {
      console.error('Status failed:', error.message);
    }
  }
}

console.log('🤖 Initializing TradingBot...');

// BOT PRINCIPAL
class TradingBot {
  constructor() {
    this.twitter = new TwitterService();
    this.ai = new AIService();
    this.telegram = new TelegramService();
    console.log('TradingBot created');
  }

  async start() {
    console.log('🤖 Bot started with RoBERTa AI!');
    
    try {
      await this.telegram.sendStatus('Bot démarré avec IA RoBERTa ! 🧠🚀');
      console.log('Startup message sent to Telegram');
    } catch (error) {
      console.error('Failed to send startup message:', error.message);
    }
    
    // Check immediately
    await this.checkTweets();
    
    // Then every 5 minutes
    setInterval(() => {
      this.checkTweets();
    }, CONFIG.CHECK_INTERVAL);
  }

  async checkTweets() {
    try {
      console.log('🔍 Checking tweets...');
      
      const newTweets = await this.twitter.getLatestTweets();
      
      if (newTweets.length === 0) {
        console.log('📭 No new tweets');
        return;
      }

      console.log(`📨 Found ${newTweets.length} new tweets`);

      for (const tweet of newTweets) {
        const analysis = await this.ai.analyzeText(tweet.text);
        
        const signal = {
          timestamp: new Date().toISOString(),
          tweet_id: tweet.id,
          tweet_text: tweet.text,
          signal_type: analysis.signal,
          confidence: analysis.confidence,
          symbols: analysis.symbols,
          reasoning: analysis.reasoning
        };

        signals.push(signal);

        if (signal.confidence >= CONFIG.CONFIDENCE_THRESHOLD) {
          await this.telegram.sendSignal(signal);
        } else {
          console.log(`⚠️ Low confidence: ${signal.confidence}%`);
        }
      }

    } catch (error) {
      console.error('💥 Error in checkTweets:', error.message);
    }
  }
}

console.log('🚀 Starting Express server...');

// DÉMARRAGE
const bot = new TradingBot();

app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  
  setTimeout(() => {
    console.log('⏰ Starting bot in 2 seconds...');
    bot.start();
  }, 2000);
});

console.log('✅ Setup complete, waiting for server start...');
