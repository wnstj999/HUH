export interface TournamentProviderInput { region: 'KR'; callbackUrl: string }
export interface TournamentCodeInput { tournamentId: number; metadata: string }

export interface TournamentAdapter {
  createProvider(input: TournamentProviderInput): Promise<number>;
  createTournament(providerId: number, name: string): Promise<number>;
  createCode(input: TournamentCodeInput): Promise<string>;
}

export class DisabledTournamentAdapter implements TournamentAdapter {
  private unavailable(): never { throw new Error('Tournament API 권한 대기 상태입니다.'); }
  createProvider(): Promise<number> { return Promise.reject(this.unavailable()); }
  createTournament(): Promise<number> { return Promise.reject(this.unavailable()); }
  createCode(): Promise<string> { return Promise.reject(this.unavailable()); }
}
