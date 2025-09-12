import { TranslationService, TranslationResult } from '.';
import {
  Matcher,
  replaceInterpolations,
  reInsertInterpolations,
} from '../matchers';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { decode } from 'html-entities';
import _ from 'lodash';
import chalk from 'chalk';

export class OpenAITranslator implements TranslationService {
  public name = 'OpenAI';
  private apiKey?: string;
  private systemPrompt?: string;
  private model?: string;
  private context?: { [key: string]: string };
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

    const [apiKey, systemPrompt, model] = config.split(',');
    this.apiKey = apiKey;
    this.model = model || 'gpt-5';
    console.log(chalk`├── using {green.bold ${String(this.model)}}`);
    this.systemPrompt =
      this.loadSystemPrompt(systemPrompt) ||
      `
You are an expert linguistic translator specializing in {sourceLang} to {targetLang} (ISO 639-1) translations. Your task is to provide accurate, contextually appropriate, and natural-sounding translations while adhering to the following guidelines:
- Preserve the original meaning: Ensure that the core message and nuances of the source text are accurately conveyed in the target language.
- Maintain context: If provided, use the given context to inform your translation choices and ensure cultural appropriateness.
- Handle placeholders: Preserve all placeholders surrounded by angle brackets (such as <0 />) in their original form. Its position within the translated text can be adjusted as needed.
- Match text length: Strive to keep the translated text similar in length to the original, adjusting only when necessary to maintain natural language flow.
- Adapt idioms and expressions: Translate idiomatic expressions to their closest equivalents in the target language, preserving the intended meaning and tone.
- Use appropriate formality: Match the level of formality in the source text, considering cultural norms of the target language.
- Handle ambiguity: If a word or phrase has multiple possible translations, choose the most appropriate one based on context. If context is insufficient, provide the most likely translation and note any potential alternatives.

ISO to Language:
{
  "aa": "Afar",
  "ab": "Abkhazian",
  "ae": "Avestan",
  "af": "Afrikaans",
  "ak": "Akan",
  "am": "Amharic",
  "an": "Aragonese",
  "ar": "Arabic",
  "as": "Assamese",
  "av": "Avaric",
  "ay": "Aymara",
  "az": "Azerbaijani",
  "ba": "Bashkir",
  "be": "Belarusian",
  "bg": "Bulgarian",
  "bh": "Bihari languages",
  "bi": "Bislama",
  "bm": "Bambara",
  "bn": "Bengali",
  "bo": "Tibetan",
  "br": "Breton",
  "bs": "Bosnian",
  "ca": "Catalan; Valencian",
  "ce": "Chechen",
  "ch": "Chamorro",
  "co": "Corsican",
  "cr": "Cree",
  "cs": "Czech",
  "cu": "Church Slavic; Old Slavonic; Church Slavonic; Old Bulgarian; Old Church Slavonic",
  "cv": "Chuvash",
  "cy": "Welsh",
  "da": "Danish",
  "de": "German",
  "dv": "Divehi; Dhivehi; Maldivian",
  "dz": "Dzongkha",
  "ee": "Ewe",
  "el": "Greek, Modern (1453-)",
  "en": "English",
  "eo": "Esperanto",
  "es": "Spanish; Castilian",
  "et": "Estonian",
  "eu": "Basque",
  "fa": "Persian",
  "ff": "Fulah",
  "fi": "Finnish",
  "fj": "Fijian",
  "fo": "Faroese",
  "fr": "French",
  "fy": "Western Frisian",
  "ga": "Irish",
  "gd": "Gaelic; Scomttish Gaelic",
  "gl": "Galician",
  "gn": "Guarani",
  "gu": "Gujarati",
  "gv": "Manx",
  "ha": "Hausa",
  "he": "Hebrew",
  "hi": "Hindi",
  "ho": "Hiri Motu",
  "hr": "Croatian",
  "ht": "Haitian; Haitian Creole",
  "hu": "Hungarian",
  "hy": "Armenian",
  "hz": "Herero",
  "ia": "Interlingua (International Auxiliary Language Association)",
  "id": "Indonesian",
  "ie": "Interlingue; Occidental",
  "ig": "Igbo",
  "ii": "Sichuan Yi; Nuosu",
  "ik": "Inupiaq",
  "io": "Ido",
  "is": "Icelandic",
  "it": "Italian",
  "iu": "Inuktitut",
  "ja": "Japanese",
  "jv": "Javanese",
  "ka": "Georgian",
  "kg": "Kongo",
  "ki": "Kikuyu; Gikuyu",
  "kj": "Kuanyama; Kwanyama",
  "kk": "Kazakh",
  "kl": "Kalaallisut; Greenlandic",
  "km": "Central Khmer",
  "kn": "Kannada",
  "ko": "Korean",
  "kr": "Kanuri",
  "ks": "Kashmiri",
  "ku": "Kurdish",
  "kv": "Komi",
  "kw": "Cornish",
  "ky": "Kirghiz; Kyrgyz",
  "la": "Latin",
  "lb": "Luxembourgish; Letzeburgesch",
  "lg": "Ganda",
  "li": "Limburgan; Limburger; Limburgish",
  "ln": "Lingala",
  "lo": "Lao",
  "lt": "Lithuanian",
  "lu": "Luba-Katanga",
  "lv": "Latvian",
  "mg": "Malagasy",
  "mh": "Marshallese",
  "mi": "Maori",
  "mk": "Macedonian",
  "ml": "Malayalam",
  "mn": "Mongolian",
  "mr": "Marathi",
  "ms": "Malay",
  "mt": "Maltese",
  "my": "Burmese",
  "na": "Nauru",
  "nb": "Bokmål, Norwegian; Norwegian Bokmål",
  "nd": "Ndebele, North; North Ndebele",
  "ne": "Nepali",
  "ng": "Ndonga",
  "nl": "Dutch; Flemish",
  "nn": "Norwegian Nynorsk; Nynorsk, Norwegian",
  "no": "Norwegian",
  "nr": "Ndebele, South; South Ndebele",
  "nv": "Navajo; Navaho",
  "ny": "Chichewa; Chewa; Nyanja",
  "oc": "Occitan (post 1500)",
  "oj": "Ojibwa",
  "om": "Oromo",
  "or": "Oriya",
  "os": "Ossetian; Ossetic",
  "pa": "Panjabi; Punjabi",
  "pi": "Pali",
  "pl": "Polish",
  "ps": "Pushto; Pashto",
  "pt": "Portuguese",
  "qu": "Quechua",
  "rm": "Romansh",
  "rn": "Rundi",
  "ro": "Romanian; Moldavian; Moldovan",
  "ru": "Russian",
  "rw": "Kinyarwanda",
  "sa": "Sanskrit",
  "sc": "Sardinian",
  "sd": "Sindhi",
  "se": "Northern Sami",
  "sg": "Sango",
  "si": "Sinhala; Sinhalese",
  "sk": "Slovak",
  "sl": "Slovenian",
  "sm": "Samoan",
  "sn": "Shona",
  "so": "Somali",
  "sq": "Albanian",
  "sr": "Serbian",
  "ss": "Swati",
  "st": "Sotho, Southern",
  "su": "Sundanese",
  "sv": "Swedish",
  "sw": "Swahili",
  "ta": "Tamil",
  "te": "Telugu",
  "tg": "Tajik",
  "th": "Thai",
  "ti": "Tigrinya",
  "tk": "Turkmen",
  "tl": "Tagalog",
  "tn": "Tswana",
  "to": "Tonga (Tonga Islands)",
  "tr": "Turkish",
  "ts": "Tsonga",
  "tt": "Tatar",
  "tw": "Twi",
  "ty": "Tahitian",
  "ug": "Uighur; Uyghur",
  "uk": "Ukrainian",
  "ur": "Urdu",
  "uz": "Uzbek",
  "ve": "Venda",
  "vi": "Vietnamese",
  "vo": "Volapük",
  "wa": "Walloon",
  "wo": "Wolof",
  "xh": "Xhosa",
  "yi": "Yiddish",
  "yo": "Yoruba",
  "za": "Zhuang; Chuang",
  "zh": "Chinese",
  "zu": "Zulu"
}
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

      if (!this.systemPrompt) {
        throw new Error('Missing system prompt');
      }

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

      // Re-insert interpolations
      const finalTranslation = await reInsertInterpolations(
        translatedText,
        replaced.replacements,
      );

      results.push({
        key,
        value,
        translated: this.decodeEscapes
          ? decode(finalTranslation)
          : finalTranslation,
      });
    }

    return results;
  }

  private async callOpenAIChatCompletion(
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const apiKey = this.apiKey;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    const requestBody = {
      model: this.model,
      messages,
      temperature: this.model === 'gpt-4o' ? 0.3 : 1, // gpt-5 has no temperature
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const responseData = await response.json();
    const assistantMessage = responseData.choices[0].message.content.trim();

    return assistantMessage;
  }

  private loadSystemPrompt(systemPrompt: string | undefined) {
    if (!systemPrompt) {
      console.log(chalk`├── using default system prompt`);
      return undefined;
    }

    const systemPromptFilePath = path.resolve(process.cwd(), systemPrompt);
    if (fs.existsSync(systemPromptFilePath)) {
      console.log(chalk`├── using system prompt from file: {green.bold ${systemPromptFilePath}}`);
      return fs.readFileSync(systemPromptFilePath, 'utf-8');
    }

    console.log(chalk`├── using system prompt from string`);
    return systemPrompt;
  }
}
