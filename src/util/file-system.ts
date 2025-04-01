import { flatten } from 'flat';
import { globSync } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

export type FileType = 'key-based' | 'natural' | 'auto';

export type DirectoryStructure = 'default' | 'ngx-translate';

export interface TranslatableFile {
  relativePath: string;
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
  exclude: string | undefined,
  fileType: FileType = 'auto',
  withArrays = false,
  recursive = false
) =>
  globSync(`${directory}${recursive ? '/**' : ''}/*.json`, { ignore: exclude }).map((f) => {
    const json = require(path.resolve(directory, f));
    const type = fileType === 'auto' ? detectFileType(json) : fileType;

    return {
      relativePath: recursive ? path.relative(directory, f) : path.basename(f),
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

export const ensureDirectoryExists = (filePath: string) => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive:true });
  }
}

export const fixSourceInconsistencies = (
  directory: string,
  cacheDir: string,
  exclude: string | undefined,
  fileType: FileType = 'auto',
  withArrays = false,
  recursive = false
) => {
  const files = loadTranslations(
    directory,
    exclude,
    fileType,
    withArrays,
    recursive
  ).filter((f) => f.type === 'natural');

  for (const file of files) {
    const fixedContent = Object.keys(file.content).reduce(
      (acc, cur) => ({ ...acc, [cur]: cur }),
      {} as { [k: string]: string },
    );

    const outPath = path.resolve(directory, file.relativePath);
    const cachePath = path.resolve(cacheDir, file.relativePath);
    ensureDirectoryExists(outPath)
    ensureDirectoryExists(cachePath)

    fs.writeFileSync(
      outPath,
      JSON.stringify(fixedContent, null, 2) + '\n'
    );

    fs.writeFileSync(
      cachePath,
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
