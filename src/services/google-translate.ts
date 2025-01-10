import { v2 } from '@google-cloud/translate';
import { decode } from 'html-entities';
import {
  replaceInterpolations,
  reInsertInterpolations,
  Matcher,
} from '../matchers';
import { TranslationService, TString } from '.';

// Contains replacements for language codes
const codeMap = {
  'zh-tw': 'zh-TW',
  'zh-cn': 'zh-CN',
};

export class GoogleTranslate implements TranslationService {
  private translate?: v2.Translate;
  private interpolationMatcher?: Matcher;
  private supportedLanguages: string[] = [];
  private decodeEscapes?: boolean;

  public name = 'Google Translate';

  cleanResponse(response: string) {
    const translated = response.replace(
      /\<(.+?)\s*\>\s*(.+?)\s*\<\/\s*(.+?)>/g,
      '<$1>$2</$3>',
    );
    return this.decodeEscapes ? decode(translated) : translated;
  }

  async initialize(
    config?: string,
    interpolationMatcher?: Matcher,
    decodeEscapes?: boolean,
  ) {
    this.translate = new v2.Translate({
      autoRetry: true,
      keyFilename: config || undefined,
    });

    this.interpolationMatcher = interpolationMatcher;
    this.supportedLanguages = await this.getAvailableLanguages();
    this.decodeEscapes = decodeEscapes;
  }

  async getAvailableLanguages() {
    if (!this.translate) {
      throw new Error("Google Translate hasn't been initialized yet.");
    }

    const [languages] = await this.translate.getLanguages();
    return languages.map((l) => l.code.toLowerCase());
  }

  supportsLanguage(language: string) {
    return this.supportedLanguages.includes(language.toLowerCase());
  }

  cleanLanguageCode(languageCode: string) {
    const lowerCaseCode = languageCode.toLowerCase();

    if (codeMap[lowerCaseCode]) {
      return codeMap[lowerCaseCode];
    }

    return lowerCaseCode.split('-')[0];
  }

  async translateStrings(strings: TString[], from: string, to: string) {
    return Promise.all(
      strings.map(async ({ key, value }) => {
        if (!this.translate) {
          throw new Error("Google Translate hasn't been initialized yet.");
        }

        const { clean, replacements } = replaceInterpolations(
          value,
          this.interpolationMatcher,
        );

        const [translationResult] = await this.translate.translate(clean, {
          from: this.cleanLanguageCode(from),
          to: this.cleanLanguageCode(to),
        });

        return {
          key: key,
          value: value,
          translated: this.cleanResponse(
            reInsertInterpolations(translationResult, replacements),
          ),
        };
      }),
    );
  }
}
