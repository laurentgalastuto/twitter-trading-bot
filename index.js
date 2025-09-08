// SERVICE IA AVEC HUGGING FACE
class AIService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.sentimentModel = 'cardiffnlp/twitter-roberta-base-sentiment-latest';
  }

  async analyzeText(text) {
    try {
      // 1. Nettoyage du texte
      const cleanText = this.cleanText(text);
      
      // 2. Détection des symboles financiers
      const symbols = this.extractSymbols(text);
      
      // 3. Analyse du sentiment via Hugging Face RoBERTa
      const sentiment = await this.getSentimentHuggingFace(cleanText);
      
      // 4. Classification du signal basée sur IA + mots-clés
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
      
      // Fallback: analyse basique si Hugging Face échoue
      return this.fallbackAnalysis(text);
    }
  }

  cleanText(text) {
    return text
      .replace(/https?:\/\/[^\s]+/g, '') // URLs
      .replace(/@[^\s]+/g, '') // Mentions
      .replace(/#[^\s]+/g, '') // Hashtags
      .trim();
  }

  extractSymbols(text) {
    const symbolRegex = /\$([A-Z]{2,6})/g;
    const matches = [...text.matchAll(symbolRegex)];
    return [...new Set(matches.map(match => match[1]))];
  }

  async getSentimentHuggingFace(text) {
    try {
      console.log('🧠 Analyzing with RoBERTa...');
      
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${this.sentimentModel}`,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 secondes timeout
        }
      );

      const result = response.data[0];
      
      // Conversion des labels RoBERTa en score -1 à 1
      const sentimentMap = {
        'LABEL_0': -0.8, // Négatif
        'LABEL_1': 0,    // Neutre  
        'LABEL_2': 0.8   // Positif
      };

      return {
        label: result.label,
        score: sentimentMap[result.label] || 0,
        confidence: result.score
      };

    } catch (error) {
      console.error('Hugging Face API Error:', error.message);
      
      // Si erreur quota/API, utiliser analyse basique
      return { label: 'NEUTRAL', score: 0, confidence: 0.5 };
    }
  }

  classifySignal(text, sentiment, symbols) {
    const textLower = text.toLowerCase();
    
    // Mots-clés trading
    const bullishWords = [
      'moon', 'pump', 'bull', 'buy', 'long', 'up', 'rise', 'surge',
      'breakout', 'rally', 'bullish', 'calls', 'strength', 'momentum',
      'hodl', 'diamond hands', 'ath', 'rocket'
    ];
    
    const bearishWords = [
      'dump', 'bear', 'sell', 'short', 'down', 'fall', 'crash', 
      'drop', 'bearish', 'puts', 'weakness', 'correction',
      'rekt', 'paper hands', 'fud', 'panic'
    ];
    
    // Comptage mots-clés
    const bullishCount = bullishWords.filter(word => textLower.includes(word)).length;
    const bearishCount = bearishWords.filter(word => textLower.includes(word)).length;

    // Logique de classification combinée
    let signalType = 'NEUTRE';
    let confidence = 50;
    let reasoning = 'IA RoBERTa';

    // Score sentiment Hugging Face (poids 60%)
    let sentimentWeight = sentiment.score * 40;

    // Score mots-clés (poids 40%)  
    let keywordWeight = (bullishCount - bearishCount) * 15;

    // Score final combiné
    const finalScore = sentimentWeight + keywordWeight;

    if (finalScore > 20) {
      signalType = 'ACHAT';
      confidence = Math.min(95, 65 + Math.abs(finalScore));
      reasoning = `RoBERTa: ${sentiment.score.toFixed(2)} + ${bullishCount} mots bullish`;
    } else if (finalScore < -20) {
      signalType = 'VENTE';
      confidence = Math.min(95, 65 + Math.abs(finalScore));
      reasoning = `RoBERTa: ${sentiment.score.toFixed(2)} + ${bearishCount} mots bearish`;
    } else {
      confidence = Math.max(30, 50 - Math.abs(finalScore));
      reasoning = `RoBERTa neutre (${sentiment.score.toFixed(2)})`;
    }

    // Bonus confiance si symboles détectés
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
    // Analyse basique si Hugging Face échoue
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