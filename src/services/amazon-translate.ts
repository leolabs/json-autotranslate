import { Translate } from '@aws-sdk/client-translate';
import { decode } from 'html-entities';
import { TranslationService, TString } from '.';
import {
  Matcher, reInsertInterpolations, replaceInterpolations
} from '../matchers';
import fs from 'fs';

// Contains replacements for language codes
const codeMap = {
  'zh-tw': 'zh-TW',
  'fa-af': 'fa-AF',
  'fr-ca': 'fr-CA',
  'pt-pt': 'pt-PT',
  'es-mx': 'es-MX',
};

const supportedLanguages = [
  'af',
  'sq',
  'am',
  'ar',
  'hy',
  'az',
  'bn',
  'bs',
  'bg',
  'ca',
  'zh',
  'zh-tw',
  'hr',
  'cs',
  'da',
  'fa-af',
  'nl',
  'en',
  'et',
  'fa',
  'tl',
  'fi',
  'fr',
  'fr-ca',
  'ka',
  'de',
  'el',
  'gu',
  'ht',
  'ha',
  'he',
  'hi',
  'hu',
  'is',
  'id',
  'ga',
  'it',
  'ja',
  'kn',
  'kk',
  'ko',
  'lv',
  'lt',
  'mk',
  'ms',
  'ml',
  'mt',
  'mr',
  'mn',
  'no',
  'ps',
  'pl',
  'pt',
  'pt-pt',
  'pa',
  'ro',
  'ru',
  'sr',
  'si',
  'sk',
  'sl',
  'so',
  'es',
  'es-mx',
  'sw',
  'sv',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'uz',
  'vi',
  'cy',
]

export class AmazonTranslate implements TranslationService {
  private translate: Translate;
  private interpolationMatcher: Matcher;
  private supportedLanguages: string[] = [];
  private decodeEscapes: boolean;

  public name = 'Amazon Translate';

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
    const configJson = config ? JSON.parse(fs.readFileSync(config).toString()) : {};
    this.translate = new Translate(configJson);

    this.interpolationMatcher = interpolationMatcher;
    this.supportedLanguages = supportedLanguages;
    this.decodeEscapes = decodeEscapes;
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
        const { clean, replacements } = replaceInterpolations(
          value,
          this.interpolationMatcher,
        );

        // After translation, a space is removed before escaped tags.
        // I don't know why this happens, but this fixes it.
        replacements.forEach(replacement => replacement.from = ` ${replacement.from}`)

        const { TranslatedText } = await this.translate.translateText({
          Text: clean,
          SourceLanguageCode: this.cleanLanguageCode(from),
          TargetLanguageCode: this.cleanLanguageCode(to),
        });

        return {
          key: key,
          value: value,
          translated: this.cleanResponse(
            reInsertInterpolations(TranslatedText, replacements),
          ),
        };
      }),
    );
  }
}
