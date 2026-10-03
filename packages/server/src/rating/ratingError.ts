export class RatingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
