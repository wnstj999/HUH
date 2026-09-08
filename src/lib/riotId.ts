export class RiotIdParseError extends Error {
  constructor() {
    super('Riot ID는 GameName#TagLine 형식이어야 합니다.');
    this.name = 'RiotIdParseError';
  }
}

export function parseRiotId(value: string): { gameName: string; tagLine: string; riotId: string } {
  const trimmed = value.trim();
  const separator = trimmed.lastIndexOf('#');
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new RiotIdParseError();
  }
  const gameName = trimmed.slice(0, separator).trim();
  const tagLine = trimmed.slice(separator + 1).trim();
  if (!gameName || !tagLine) throw new RiotIdParseError();
  return { gameName, tagLine, riotId: `${gameName}#${tagLine}` };
}

export function normalizeRiotId(value: string): string {
  const { gameName, tagLine } = parseRiotId(value);
  return `${gameName.toLocaleLowerCase()}#${tagLine.toLocaleLowerCase()}`;
}
