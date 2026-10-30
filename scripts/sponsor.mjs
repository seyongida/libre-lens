// Build-time text only. Never embed advertiser scripts, pixels, or remote images.
export function renderSponsor(config) {
  const sponsor = config?.sponsor;
  if (!sponsor || typeof sponsor.enabled !== "boolean")
    throw new Error("monetization.json: sponsor.enabled must be a boolean");
  if (!sponsor.enabled) return "";
  for (const [key, max] of Object.entries({name: 60, headline: 100, description: 240, url: 2048})) {
    if (typeof sponsor[key] !== "string" || !sponsor[key].trim() || sponsor[key].length > max)
      throw new Error(`monetization.json: invalid sponsor.${key} (1–${max} characters)`);
  }
  const url = new URL(sponsor.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("monetization.json: sponsor.url must be HTTPS without credentials");
  const escape = (value) => value.replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  return `<aside class="sponsor-card" aria-label="후원 광고">
    <div class="sponsor-meta"><span>광고</span> ${escape(sponsor.name)}</div>
    <h2>${escape(sponsor.headline)}</h2>
    <p>${escape(sponsor.description)}</p>
    <a href="${escape(url.href)}" target="_blank" rel="sponsored noopener noreferrer" referrerpolicy="no-referrer">광고주 사이트 보기 ↗</a>
    <small>Libre Lens의 무료 운영을 후원합니다. 의료적 추천이나 보증을 뜻하지 않습니다.</small>
  </aside>`;
}
