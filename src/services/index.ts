import { GoogleTranslate } from './google-translate';
import { DeepL } from './deepl';
import { DeepLFree } from './deepl-free';
import { DryRun } from './dry-run';
import { AzureTranslator } from './azure-translator';
import { ManualTranslation } from './manual';
import { Matcher } from '../matchers';
import { AmazonTranslate } from './amazon-translate';

export interface TranslationResult {
  key: string;
  value: string;
  translated: string;
}

export interface TString {
  key: string;
  value: string;
}
export interface TranslationService {
  name: string;
  initialize: (
    config?: string,
    interpolationMatcher?: Matcher,
    decodeEscapes?: boolean,
  ) => Promise<void>;
  supportsLanguage: (language: string) => boolean;
  translateStrings: (
    strings: TString[],
    from: string,
    to: string,
  ) => Promise<TranslationResult[]>;
}

export const serviceMap: {
  [k: string]: TranslationService;
} = {
  'google-translate': new GoogleTranslate(),
  deepl: new DeepL(),
  'deepl-free': new DeepLFree(),
  'dry-run': new DryRun(),
  azure: new AzureTranslator(),
  manual: new ManualTranslation(),
  'amazon-translate': new AmazonTranslate(),
};
