import test from "node:test";
import assert from "node:assert/strict";
import { renderSponsor } from "../scripts/sponsor.mjs";
const config = (changes = {}) => ({sponsor: {enabled: true, name: "Example", headline: "A free tool", description: "Independent sponsor", url: "https://example.com/", ...changes}});
test("disabled ads produce no slot or network integrations", () => {
  assert.equal(renderSponsor({sponsor: {enabled: false}}), "");
  assert.throws(() => renderSponsor({sponsor: {enabled: "false"}}));
});
test("advertiser content is escaped and links do not send a referrer", () => {
  const html = renderSponsor(config({headline: '<script>alert("x")</script>', url: 'https://example.com/?a=1&b=2'}));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a=1&amp;b=2"));
  assert.ok(html.includes('rel="sponsored noopener noreferrer"'));
  assert.ok(html.includes('referrerpolicy="no-referrer"'));
});
test("active ads reject executable URLs, credentials and incomplete copy", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "data:text/html,x", "https://user:pass@example.com", "not a url"]) {
    assert.throws(() => renderSponsor(config({url})));
  }
  assert.throws(() => renderSponsor(config({headline: " "})));
  assert.throws(() => renderSponsor(config({description: "x".repeat(241)})));
});
