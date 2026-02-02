import { decode } from 'html-entities';
import fetch from 'node-fetch';
import * as path from 'path';
import * as fs from 'fs';

import { TranslationService, TranslationResult, DeepLGlossary } from '.';
import {
  replaceInterpolations,
  reInsertInterpolations,
  Matcher,
} from '../matchers';

export class DeepL implements TranslationService {
  public name: string;
  private apiEndpoint: string;
  private glossariesDir?: string;
  private automaticGlossary?: boolean;
  private appName?: string;
  private context?: string;
  private apiKey?: string;
  /**
   * Number to tokens to translate at once
   */
  private batchSize = 1000;
  private supportedLanguages?: Set<string>;
  private formalityLanguages?: Set<string>;
  private interpolationMatcher?: Matcher;
  private decodeEscapes?: boolean;
  private formality?: 'default' | 'less' | 'more';

  /**
   * Creates a new instance of the DeepL translation service
   * @param useFreeApi Use the free vs paid api
   */
  constructor(useFreeApi: boolean) {
    if (useFreeApi) {
      this.name = 'DeepL Free';
      this.apiEndpoint = 'https://api-free.deepl.com/v2';
    } else {
      this.name = 'DeepL';
      this.apiEndpoint = 'https://api.deepl.com/v2';
    }
  }

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
    this.glossariesDir =
      typeof glossariesDir === 'string' ? glossariesDir : undefined;
    this.automaticGlossary = glossariesDir === true;
    this.appName = appName;
    this.context = context;
  }

  async fetchLanguages() {
    if (!this.apiKey) {
      throw new Error('Missing API key');
    }

    const url = new URL(`${this.apiEndpoint}/languages`);
    url.searchParams.append('type', 'target');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
      },
    });

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
    const supportedLanguages = languages.filter((l) => l.supports_formality);
    return this.formatLanguages(supportedLanguages);
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
    return !!this.supportedLanguages?.has(language.toLowerCase());
  }

  supportsFormality(language: string) {
    return !!this.formalityLanguages?.has(language.toLowerCase());
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

  /**
   * Delete a glossary.
   */
  async deleteGlossary(glossary_id: string) {
    console.log(`Deleting glossary ${glossary_id}`);
    const response = await fetch(
      `${this.apiEndpoint}/glossaries/${glossary_id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `The request to delete ${glossary_id} failed with error code: ${response.status} : ${response.statusText}`,
      );
    }
    return response;
  }

  async listGlossaries() {
    const response = await fetch(`${this.apiEndpoint}/glossaries`, {
      method: 'GET',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(
        `The request to list glossaries failed with error code: ${response.status} : ${response.statusText}`,
      );
    }
    const { glossaries } = await response.json();
    return glossaries as DeepLGlossary[];
  }

  /**
   * https://www.deepl.com/docs-api/glossaries/create-glossary
   */
  async createGlossaryFromFile(filePath: string) {
    // Extract source and target language from the file name
    const fileName = path.basename(filePath, '.json');
    const [sourceLang, targetLang] = fileName.split('-');
    console.log(`Creating ${sourceLang}-${targetLang} glossary`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // Create TSV file:
    let entries = '';
    for (const [sourceEntry, targetEntry] of Object.entries(
      JSON.parse(fileContent),
    )) {
      entries += `${sourceEntry}\t${targetEntry}\n`;
    }
    // Abort if the glossary JSON is empty.
    if (!entries.length) {
      console.log('Cannot use glossary because it is empty.');
      return;
    }
    // Create the request body:
    const body = {
      name: this.appName,
      source_lang: sourceLang.toLowerCase(),
      target_lang: targetLang.toLowerCase(),
      entries: entries,
      entries_format: 'tsv',
    };
    // Add the glossary:
    const response = await fetch(`${this.apiEndpoint}/glossaries`, {
      body: JSON.stringify(body),
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(
        `The request to create glossaries failed with error code: ${response.status} : ${response.statusText}`,
      );
    }
    const glossary = await response.json();
    return glossary as DeepLGlossary;
  }

  async getGlossary(from: string, to: string, recreate: boolean) {
    const allGlossaries = await this.listGlossaries();
    let glossary = allGlossaries
      .filter((g) => (!!this.appName ? g.name === this.appName : true)) // Only of this app, if defined
      .find(
        (g) =>
          g.source_lang === from.toLowerCase() &&
          g.target_lang === to.toLowerCase(), // Only of this translation.
      );

    if (recreate && this.glossariesDir) {
      if (glossary) {
        await this.deleteGlossary(glossary.glossary_id);
      }

      // Add the glossary:
      const filePath = path.join(this.glossariesDir, `${from}-${to}.json`);
      glossary = await this.createGlossaryFromFile(filePath);
    }

    return glossary;
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
      // see https://developers.deepl.com/docs/xml-and-html-handling/html
      // set in order to indicate to DeepL that the interpolated strings that the matcher
      // replaced with `<span translate="no">${index}</span> should not be translated
      tag_handling: 'html',
      // set to 1, because all newlines in the source text should be preserved
      split_sentences: '1',
    };

    // Should a glossary be used?
    const hasGlossaryFile =
      this.glossariesDir &&
      fs.existsSync(path.join(this.glossariesDir, `${from}-${to}.json`));
    if (hasGlossaryFile || this.automaticGlossary) {
      // Find the glossary that matches the source and target language:
      const glossary = await this.getGlossary(
        from,
        to,
        !this.automaticGlossary,
      );
      if (glossary) {
        // Add it to the options body:
        body['glossary_id'] = glossary.glossary_id;
      }
    }

    if (this.supportsFormality(to)) {
      // only append formality to avoid bad request error from deepl for languages with unsupported formality
      body['formality'] = this.formality;
    }

    if (this.context) {
      // context is only added if it has been provided by as a command line argument
      body['context'] = this.context;
    }

    // send request as a POST request, with all the tokens as separate texts in the body
    const response = await fetch(`${this.apiEndpoint}/translate`, {
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
