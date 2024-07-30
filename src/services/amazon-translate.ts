import { Translate } from '@aws-sdk/client-translate';
import { decode } from 'html-entities';
import type { TranslationService, TString } from '.';
import {
  type Matcher, reInsertInterpolations, replaceInterpolations
} from '../matchers';
import fs from 'node:fs';
export class AmazonTranslate implements TranslationService {
  private translate: Translate;
  private interpolationMatcher: Matcher;
  private supportedLanguages: object = {
    'af': 'af',
    'sq': 'sq',
    'am': 'am',
    'ar': 'ar',
    'hy': 'hy',
    'az': 'az',
    'bn': 'bn',
    'bs': 'bs',
    'bg': 'bg',
    'ca': 'ca',
    'zh': 'zh',
    'zh-tw': 'zh-TW',
    'hr': 'hr',
    'cs': 'cs',
    'da': 'da',
    'fa-af': 'fa-AF',
    'nl': 'nl',
    'en': 'en',
    'et': 'et',
    'fa': 'fa',
    'tl': 'tl',
    'fi': 'fi',
    'fr': 'fr',
    'fr-ca': 'fr-CA',
    'ka': 'ka',
    'de': 'de',
    'el': 'el',
    'gu': 'gu',
    'ht': 'ht',
    'ha': 'ha',
    'he': 'he',
    'hi': 'hi',
    'hu': 'hu',
    'is': 'is',
    'id': 'id',
    'ga': 'ga',
    'it': 'it',
    'ja': 'ja',
    'kn': 'kn',
    'kk': 'kk',
    'ko': 'ko',
    'lv': 'lv',
    'lt': 'lt',
    'mk': 'mk',
    'ms': 'ms',
    'ml': 'ml',
    'mt': 'mt',
    'mr': 'mr',
    'mn': 'mn',
    'no': 'no',
    'ps': 'ps',
    'pl': 'pl',
    'pt': 'pt',
    'pt-pt': 'pt-PT',
    'pa': 'pa',
    'ro': 'ro',
    'ru': 'ru',
    'sr': 'sr',
    'si': 'si',
    'sk': 'sk',
    'sl': 'sl',
    'so': 'so',
    'es': 'es',
    'es-mx': 'es-MX',
    'sw': 'sw',
    'sv': 'sv',
    'ta': 'ta',
    'te': 'te',
    'th': 'th',
    'tr': 'tr',
    'uk': 'uk',
    'ur': 'ur',
    'uz': 'uz',
    'vi': 'vi',
    'cy': 'cy',
  };
  private decodeEscapes: boolean;

  public name = 'Amazon Translate';

  async initialize(
    config?: string,
    interpolationMatcher?: Matcher,
    decodeEscapes?: boolean,
  ) {
    const configJson = config ? JSON.parse(fs.readFileSync(config).toString()) : {};
    this.translate = new Translate(configJson);

    this.interpolationMatcher = interpolationMatcher;
    this.decodeEscapes = decodeEscapes;
  }

  supportsLanguage(language: string) {
    return Object.keys(this.supportedLanguages).includes(language.toLowerCase());
  }

  async translateStrings(strings: TString[], from: string, to: string) {
    return Promise.all(
      strings.map(async ({ key, value }) => {
        const { clean, replacements } = replaceInterpolations(
          value,
          this.interpolationMatcher,
        );

        const { TranslatedText } = await this.translate.translateText({
          Text: clean,
          SourceLanguageCode: this.supportedLanguages[from.toLowerCase()],
          TargetLanguageCode: this.supportedLanguages[to.toLowerCase()],
        });

        const reInsterted = reInsertInterpolations(TranslatedText, replacements);

        return {
          key: key,
          value: value,
          translated: this.decodeEscapes ? decode(reInsterted) : reInsterted,
        };
      }),
    );
  }
}
