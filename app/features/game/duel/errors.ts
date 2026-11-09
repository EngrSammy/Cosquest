// The C# engine's exceptions, as named errors.

/** C# ArgumentException: a setup the engine refuses. */
export class DuelSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuelSetupError";
  }
}

/** C# FormatException: malformed wire data (a setup JSON or an input log). */
export class DuelFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuelFormatError";
  }
}
