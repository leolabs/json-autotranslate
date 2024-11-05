
import { TranslationService, TranslationResult } from '.';
import { Matcher, replaceInterpolations, reInsertInterpolations } from '../matchers';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { decode } from 'html-entities';
import _ from 'lodash';

export class OpenAITranslator implements TranslationService {
  public name = 'OpenAI';
  private apiKey: string;
  private systemPrompt: string;
  private context: { [key: string]: string };
  private interpolationMatcher?: Matcher;
  private decodeEscapes?: boolean;

  async initialize(
    config?: string,
    interpolationMatcher?: Matcher,
    decodeEscapes?: boolean,
    glossariesDir?: string | boolean,
    appName?: string,
    context?: string,
  ) {
    if (!config) {
      throw new Error(`Please provide an API key for ${this.name}.`);
    }

    const [apiKey, systemPrompt] = config.split(',');
    this.apiKey = apiKey;
    this.systemPrompt = systemPrompt || `
You are an expert linguistic translator specializing in {sourceLang} to {targetLang} (ISO 639-1) translations. Your task is to provide accurate, contextually appropriate, and natural-sounding translations while adhering to the following guidelines:
- Preserve the original meaning: Ensure that the core message and nuances of the source text are accurately conveyed in the target language.
- Maintain context: If provided, use the given context to inform your translation choices and ensure cultural appropriateness.
- Handle placeholders: Preserve all placeholders surrounded by angle brackets (such as <0 />) in their original form. Its position within the translated text can be adjusted as needed.
- Match text length: Strive to keep the translated text similar in length to the original, adjusting only when necessary to maintain natural language flow.
- Adapt idioms and expressions: Translate idiomatic expressions to their closest equivalents in the target language, preserving the intended meaning and tone.
- Use appropriate formality: Match the level of formality in the source text, considering cultural norms of the target language.
- Handle ambiguity: If a word or phrase has multiple possible translations, choose the most appropriate one based on context. If context is insufficient, provide the most likely translation and note any potential alternatives.
    `;

    this.interpolationMatcher = interpolationMatcher;
    this.decodeEscapes = decodeEscapes;

    // Load context file if provided
    if (context) {
      const contextFilePath = path.resolve(process.cwd(), context);
      if (fs.existsSync(contextFilePath)) {
        const contextContent = fs.readFileSync(contextFilePath, 'utf-8');
        this.context = JSON.parse(contextContent);
      } else {
        throw new Error(`Context file not found at: ${contextFilePath}`);
      }
    } else {
      this.context = {};
    }
  }

  supportsLanguage(language: string): boolean {
    // OpenAI supports a wide range of languages
    return true;
  }

  async translateStrings(
    strings: { key: string; value: string }[],
    from: string,
    to: string,
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const stringItem of strings) {
      const { key, value } = stringItem;

      // Replace interpolations
      const replaced = replaceInterpolations(value, this.interpolationMatcher);

      // Get context for the key
      const contextForKey = _.get(this.context, key) || '';

      // Prepare the messages for OpenAI API
      const systemPromptFilled = this.systemPrompt
        .replace('{sourceLang}', from)
        .replace('{targetLang}', to);

      const userPrompt = contextForKey
        ? `Translation context: ${contextForKey}\n\nTranslate the following text: ${replaced.clean}`
        : `Translate the following text: ${replaced.clean}`;

      const messages = [
        { role: 'system', content: systemPromptFilled },
        { role: 'user', content: userPrompt },
      ];

      // Make the API call to OpenAI
      const translatedText = await this.callOpenAIChatCompletion(messages);

      console.log(`Context: ${contextForKey}`);
      console.log(`OpenAI output: ${translatedText}`);

      // Re-insert interpolations
      const finalTranslation = await reInsertInterpolations(
        translatedText,
        replaced.replacements,
      );

      results.push({
        key,
        value,
        translated: this.decodeEscapes ? decode(finalTranslation) : finalTranslation,
      });
    }

    return results;
  }

  private async callOpenAIChatCompletion(messages: { role: string; content: string }[]): Promise<string> {
    const apiKey = this.apiKey;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    const requestBody = {
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const responseData = await response.json();
    const assistantMessage = responseData.choices[0].message.content.trim();

    return assistantMessage;
  }
}
