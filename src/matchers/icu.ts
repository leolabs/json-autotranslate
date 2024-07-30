import { parse } from 'messageformat-parser';
import type { Matcher } from '.';

type Plural = {
  cases: [
    {
      tokens: string[];
    },
  ];
};

type ICUMatch = Plural | string;

export const matchIcu: Matcher = (
  input: string,
  replacer: (i: number) => string,
) => {
  const writeTokens = (part: ICUMatch) => {
    if (typeof part !== 'string' && part?.cases?.length) {
      return part.cases
        .map((partCase) => {
          return partCase.tokens.length
            ? `(.*)${nestedIcuMatcher(partCase.tokens)}(.*)`
            : '';
        })
        .join('');
    } else {
      return '(.*)';
    }
  };
  const nestedIcuMatcher = (parts: ICUMatch[]): string => {
    return (
      parts
        .map((part) =>
          typeof part === 'string'
            ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            : writeTokens(part),
        )
        .join('')
        // reduce replacement noise between replacements from nested tokens i.e. back to back (.*)(.*)
        .replace(/(\(\.\*\)){2,}/g, '(.*)')
    );
  };
  const parts = parse(input);
  const regex = new RegExp(nestedIcuMatcher(parts));

  const matches = input.match(regex);

  return (matches || []).slice(1).map((match, index) => ({
    from: match,
    to: replacer(index),
  }));
};
