import { flatten } from 'flat';
import * as fs from 'fs';
import * as path from 'path';

export type FileType = 'key-based' | 'natural' | 'auto';

export type DirectoryStructure = 'default' | 'ngx-translate';

export interface TranslatableFile {
  name: string;
  originalContent: string;
  type: FileType;
  content: object;
}

export const getAvailableLanguages = (
  directory: string,
  directoryStructure: DirectoryStructure,
) => {
  const directoryContent = fs.readdirSync(directory);

  switch (directoryStructure) {
    case 'default':
      return directoryContent
        .map((d) => path.resolve(directory, d))
        .filter((d) => fs.statSync(d).isDirectory())
        .map((d) => path.basename(d));

    case 'ngx-translate':
      return directoryContent
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5));
  }
};

export const detectFileType = (json: any): FileType => {
  const invalidKeys = Object.keys(json).filter(
    (k) => typeof json[k] === 'string' && (k.includes('.') || k.includes(' ')),
  );

  return invalidKeys.length > 0 ? 'natural' : 'key-based';
};

export const loadTranslations = (
  directory: string,
  fileType: FileType = 'auto',
  withArrays = false,
) =>
  fs
    .readdirSync(directory)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const json = require(path.resolve(directory, f));
      const type = fileType === 'auto' ? detectFileType(json) : fileType;

      return {
        name: path.basename(f),
        originalContent: json,
        type,
        content:
          type === 'key-based'
            ? flatten(require(path.resolve(directory, f)), {
                safe: !withArrays,
              })
            : require(path.resolve(directory, f)),
      } as TranslatableFile;
    });

export const fixSourceInconsistencies = (
  directory: string,
  cacheDir: string,
) => {
  const files = loadTranslations(directory).filter((f) => f.type === 'natural');

  for (const file of files) {
    const fixedContent = Object.keys(file.content).reduce(
      (acc, cur) => ({ ...acc, [cur]: cur }),
      {} as { [k: string]: string },
    );

    fs.writeFileSync(
      path.resolve(directory, file.name),
      JSON.stringify(fixedContent, null, 2) + '\n',
    );

    fs.writeFileSync(
      path.resolve(cacheDir, file.name),
      JSON.stringify(fixedContent, null, 2) + '\n',
    );
  }
};

export const evaluateFilePath = (
  directory: string,
  dirStructure: DirectoryStructure,
  lang: string,
) => {
  switch (dirStructure) {
    case 'default':
      return path.resolve(directory, lang);

    case 'ngx-translate':
      return path.resolve(directory);
  }
};
