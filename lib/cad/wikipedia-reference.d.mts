export type WikipediaReference = {
  title: string;
  url: string;
  extract: string;
  infoboxTitle?: string;
  infobox: Array<[string, string]>;
  image?: { mimeType: string; data: string; url: string };
};
export function cleanQuery(prompt: string): string;
export function getWikipediaReference(prompt: string, options?: { fetchImage?: boolean }): Promise<WikipediaReference | null>;
export function formatWikipediaBlock(reference: WikipediaReference): string;
export const _internals: Record<string, (...args: any[]) => any>;
