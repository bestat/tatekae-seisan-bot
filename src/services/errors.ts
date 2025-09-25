export class SubmissionValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super('Submission validation failed');
  }
}
