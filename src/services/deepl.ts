import { decode } from 'html-entities';
import fetch from 'node-fetch';

import { TranslationService, TranslationResult } from '.';
import {
  replaceInterpolations,
  reInsertInterpolations,
  Matcher,
} from '../matchers';

const API_ENDPOINT = 'https://api.deepl.com/v2';

export class DeepL implements TranslationService {
  public name = 'DeepL';
  private apiKey: string;
  /**
   * Number to tokens to translate at once
   */
  private batchSize: number = 1000;
  private supportedLanguages: Set<string>;
  private formalityLanguages: Set<string>;
  private interpolationMatcher: Matcher;
  private decodeEscapes: boolean;
  private formality: 'default' | 'less' | 'more';

  async initialize(
    config?: string,
    interpolationMatcher?: Matcher,
    decodeEscapes?: boolean,
  ) {
    if (!config) {
      throw new Error(`Please provide an API key for DeepL.`);
    }
    const [apiKey, formality, batchSize] = config.split(',');
    this.apiKey = apiKey;
    this.formality =
      formality === 'less' || formality === 'more' ? formality : 'default';
    this.batchSize = isNaN(parseInt(batchSize)) ? 1000 : parseInt(batchSize);
    this.interpolationMatcher = interpolationMatcher;
    const languages = await this.fetchLanguages();
    this.supportedLanguages = this.formatLanguages(languages);
    this.formalityLanguages = this.getFormalityLanguages(languages);
    this.decodeEscapes = decodeEscapes;
  }

  async fetchLanguages() {
    const url = new URL(`${API_ENDPOINT}/languages`);
    url.searchParams.append('auth_key', this.apiKey);
    url.searchParams.append('type', 'target');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error('Could not fetch supported languages from DeepL');
    }

    const languages: Array<{
      language: string;
      name: string;
      supports_formality: boolean;
    }> = await response.json();
    return languages;
  }

  getFormalityLanguages(
    languages: Array<{
      language: string;
      name: string;
      supports_formality: boolean;
    }>,
  ) {
    const supportedLangauges = languages.filter((l) => l.supports_formality);
    return this.formatLanguages(supportedLangauges);
  }

  formatLanguages(
    languages: Array<{
      language: string;
      name: string;
      supports_formality: boolean;
    }>,
  ) {
    // DeepL supports e.g. either EN-US or EN as language code, but only returns EN-US
    // so we add both variants to the array and filter duplicates later.
    const languageCodes = languages.flatMap((l) => [
      l.language,
      l.language.split('-')[0],
    ]);
    return new Set(languageCodes.map((l) => l.toLowerCase()));
  }

  supportsLanguage(language: string) {
    return this.supportedLanguages.has(language.toLowerCase());
  }

  supportsFormality(language: string) {
    return this.formalityLanguages.has(language.toLowerCase());
  }

  async translateStrings(
    strings: { key: string; value: string }[],
    from: string,
    to: string,
  ) {
    const responses: TranslationResult[] = [];
    // Split the translation requests into batches
    // This is done because the DeepL API prevents the body of a request to be larger than 128 KiB (128 · 1024 bytes)
    // The default batch size is 1000 tokens, as this was found to almost always fit in the limit
    for (let i = 0; i < strings.length; i += this.batchSize) {
      const chunk = strings.slice(i, i + this.batchSize);

      responses.push(...(await this.runTranslation(chunk, from, to)));
    }
    return responses;
  }

  async runTranslation(
    strings: { key: string; value: string }[],
    from: string,
    to: string,
    triesLeft: number = 5,
  ): Promise<TranslationResult[]> {
    const cleaned = strings.map((s) =>
      replaceInterpolations(s.value, this.interpolationMatcher),
    );

    const body = {
      text: cleaned.map((c) => c.clean),
      source_lang: from.toUpperCase(),
      target_lang: to.toUpperCase(),
    };
    if (this.supportsFormality(to)) {
      // only append formality to avoid bad request error from deepl for languages with unsupported formality
      body['formality'] = this.formality;
    }

    // send request as a POST request, with all the tokens as separate texts in the body
    const response = await fetch(`${API_ENDPOINT}/translate`, {
      body: JSON.stringify(body),
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // automatically retry the translation if DeepL rate-limits us
      // see https://support.deepl.com/hc/en-us/articles/360020710619-Error-code-429
      if (response.status === 429 && triesLeft > 0) {
        return this.runTranslation(strings, from, to, triesLeft - 1);
      }

      throw new Error(
        `[${response.status} ${response.statusText}]: ${
          (await response.text()) || 'Empty body'
        }`,
      );
    }
    // the response is indexed similarly to the texts parameter in the body
    const responseTranslations = (await response.json()).translations;

    const translated = cleaned.map(async (c, index) =>
      reInsertInterpolations(responseTranslations[index].text, c.replacements),
    );

    const result: TranslationResult[] = [];

    // match the strings to be translated with their retrieved translations
    for (let index = 0; index < strings.length; index++) {
      const string = strings[index];
      const t = await translated[index];
      result.push({
        key: string.key,
        value: string.value,
        translated: this.decodeEscapes ? decode(t) : t,
      });
    }
    return result;
  }
}
