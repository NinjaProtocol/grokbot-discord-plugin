const secretPatterns = [
  /cursor_[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[MN][A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}\b/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /ghs_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /api-key=[^&\s"]+/gi,
  /"(?:stamperKey|privateKey|secretKey|sessionToken|refreshToken|DISCORD_TOKEN)"\s*:\s*"[^"]+"/gi,
  /Bot\s+[A-Za-z0-9._-]{50,}/g,
];

export function redactSecrets(text: string): string {
  let next = text;
  for (const pattern of secretPatterns) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}
