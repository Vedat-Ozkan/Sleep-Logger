declare module "expo-document-picker" {
  export interface DocumentPickerAsset {
    uri: string;
    name?: string | null;
    size?: number | null;
    mimeType?: string | null;
  }

  export interface DocumentPickerOptions {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }

  export interface DocumentPickerResult {
    canceled: boolean;
    assets?: DocumentPickerAsset[];
  }

  export function getDocumentAsync(
    options?: DocumentPickerOptions
  ): Promise<DocumentPickerResult>;
}

declare module "expo-file-system" {
  export enum EncodingType {
    UTF8 = "utf8",
    Base64 = "base64",
  }

  export interface ReadOptions {
    encoding?: EncodingType;
  }

  export interface WriteOptions {
    encoding?: EncodingType;
  }

  export const cacheDirectory: string | null;
  export const documentDirectory: string | null;

  export function readAsStringAsync(
    uri: string,
    options?: ReadOptions
  ): Promise<string>;

  export function writeAsStringAsync(
    uri: string,
    data: string,
    options?: WriteOptions
  ): Promise<void>;
}

declare module "expo-sharing" {
  export interface ShareOptions {
    mimeType?: string;
    dialogTitle?: string;
    UTI?: string;
  }

  export function isAvailableAsync(): Promise<boolean>;

  export function shareAsync(
    url: string,
    options?: ShareOptions
  ): Promise<void>;
}
