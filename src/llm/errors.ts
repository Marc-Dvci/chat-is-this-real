export class ModelProviderError extends Error {
  constructor(readonly reason: 'quota' | 'provider' | 'invalid_output' | 'timeout' | 'unsafe', readonly code: string, readonly strictUnsupported = false) {
    super(`Model Studio ${reason.replace('_', ' ')} (${code}).`);
    this.name = 'ModelProviderError';
  }
}
