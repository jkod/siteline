/** Escapes text for HTML. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The HTML part of an email, from its plain text (PRD section 6): paragraphs, line breaks and
 * links, in a simple readable layout. The plain text stays the main part.
 */
export function htmlEmail(text: string, lang: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) =>
      escape(block)
        .replace(
          /https?:\/\/[^\s<]+/g,
          (url) => `<a href="${url}" style="color:#0b5c4e">${url}</a>`,
        )
        .replace(/\n/g, '<br>'),
    )
    .map((html) => `<p style="margin:0 0 16px">${html}</p>`)
    .join('');
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f7f5f0"><div style="max-width:560px;margin:0 auto;padding:24px;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1f26">${paragraphs}</div></body></html>`;
}
