// TEMPORARY mock auth. Replace the bodies of signIn/signUp with real API calls
// when the backend is ready — keep the SAME function names and signatures so
// the screens that call them never have to change.
//
// The mock throws an Error whose `message` is a machine-readable code
// ("invalid_credentials", "email_taken"); the screens map that code to a
// human message. A real backend would signal the same cases via HTTP status.

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function signIn(
  idOrEmail: string,
  password: string,
): Promise<void> {
  await delay(600); // pretend it's a network round-trip
  const ok =
    idOrEmail.trim().toLowerCase() === "hero@cosquest.com" &&
    password === "password123";
  if (!ok) throw new Error("invalid_credentials");
}

export async function signUp(
  idOrEmail: string,
  password: string,
): Promise<void> {
  await delay(600);
  // Pretend this one address is already taken, so we can test that path.
  if (idOrEmail.trim().toLowerCase() === "taken@cosquest.com") {
    throw new Error("email_taken");
  }
  // Any other input "succeeds" for now.
}

export async function resendCode(): Promise<void> {
  await delay(600);
  // succeeds for now; `throw new Error("resend_failed")` here to test the error path
}

export async function verifyCode(code: string): Promise<void> {
  await delay(600);
  if (code !== "123456") throw new Error("invalid_code");
}

export async function requestPasswordReset(email: string): Promise<void> {
  await delay(600);
  if (email.trim().toLowerCase() !== "hero@cosquest.com") {
    throw new Error("email_not_found");
  }
}
