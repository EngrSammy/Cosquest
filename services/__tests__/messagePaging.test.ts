import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FIRST_PAGE, MESSAGE_PAGE_SIZE, mergeOlder, olderPageQuery, pageHasMore } from "../messagePaging.ts";

const ids = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => ({ id: `m${from - i}` }));

describe("message paging (audit B4)", () => {
  it("asks for the page older than the oldest loaded message, by cursor and by page", () => {
    assert.deepEqual(olderPageQuery("m51"), { before: "m51", page: 2, limit: MESSAGE_PAGE_SIZE });
    assert.deepEqual(olderPageQuery("m1", { ...FIRST_PAGE, page: 3 }), { before: "m1", page: 4, limit: 50 });
  });
  it("trusts the server's hasMore, else a full page means there may be more", () => {
    assert.equal(pageHasMore({ pagination: { hasMore: false } }, 50, 50), false);
    assert.equal(pageHasMore({ pagination: { hasMore: true } }, 10, 50), true);
    assert.equal(pageHasMore({ hasMore: false }, 50, 50), false);
    assert.equal(pageHasMore([], 50, 50), true);
    assert.equal(pageHasMore(null, 49, 50), false);
  });
  it("appends older messages after the loaded ones, dropping overlaps", () => {
    const loaded = ids(100, 51);
    const { merged, added } = mergeOlder(loaded, ids(53, 4)); // offset page shifted by 3 new messages
    assert.equal(added, 47);
    assert.equal(merged.length, 97);
    assert.equal(merged[0].id, "m100");
    assert.equal(merged[merged.length - 1].id, "m4");
  });
  it("a backend that ignores paging (same page again) adds nothing, so the screen stops asking", () => {
    const loaded = ids(100, 51);
    const { merged, added } = mergeOlder(loaded, ids(100, 51));
    assert.equal(added, 0);
    assert.equal(merged, loaded);
  });
});
