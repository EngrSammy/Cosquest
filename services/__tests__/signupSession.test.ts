import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setSignupToken, signupToken, signupTokenFor } from "../signupSession.ts";

describe("sign-up token for onboarding calls", () => {
  it("goes only to the account's own /api/users/me routes", () => {
    setSignupToken("t1");
    assert.equal(signupTokenFor("/api/users/me/avatar"), "t1");
    assert.equal(signupTokenFor("/api/users/me?email=a%40b.c"), "t1");
    assert.equal(signupTokenFor("/api/chats"), undefined);
    assert.equal(signupTokenFor("/api/auth/login"), undefined);
  });
  it("is cleared, and an empty token is none", () => {
    setSignupToken(null);
    assert.equal(signupToken(), null);
    assert.equal(signupTokenFor("/api/users/me/profile"), undefined);
    setSignupToken("");
    assert.equal(signupToken(), null);
  });
});
