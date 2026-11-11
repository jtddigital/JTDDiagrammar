/** Failure codes the API maps to HTTP statuses. Validation problems are diagnostics, not errors. */
export type AiErrorCode =
  | 'ai.input' // nothing to work from, unreadable file, unknown type
  | 'ai.media-type'
  | 'limit.files'
  | 'limit.file'
  | 'limit.tokens'
  | 'limit.pages'
  | 'ai.refusal'
  | 'ai.truncated'
  | 'ai.config' // credentials rejected
  | 'ai.rate-limit'
  | 'ai.upstream';

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
