import { Buffer } from "node:buffer";
import sanitizeHtml from "sanitize-html";

// This module deliberately depends on a Node built-in and must only be imported
// by server routes/data modules. Browser rendering should consume its sanitized
// output, never run this persistence-boundary sanitizer itself.

export const MAX_NOTE_CONTENT_BYTES = 100 * 1024;

// Keep raw-text and SVG elements (notably textarea, xmp, svg, animate, and set)
// outside this allowlist. The regression suite covers the sanitizer bypasses
// that depend on those elements, so any future schema expansion must update
// the sanitizer version and tests together.
export const RICH_TEXT_ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "hr",
  "mark",
  "a",
];

const TEXT_ALIGN_TAGS = ["p", "h1", "h2", "h3", "h4"];
const BLOCK_END_TAGS = ["p", "h1", "h2", "h3", "h4", "li", "blockquote", "pre"];
const ALLOWED_LINK_PATTERN = /^(?:https?:\/\/|mailto:|tel:)[^\s]+$/i;
const TEXT_ALIGN_PATTERN = /^(?:left|right|center|justify)$/;

function normalizeLink(href) {
  const value = typeof href === "string" ? href.trim() : "";
  return ALLOWED_LINK_PATTERN.test(value) ? value : "";
}

const SANITIZE_OPTIONS = {
  allowedTags: RICH_TEXT_ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "target", "rel"],
    ...Object.fromEntries(TEXT_ALIGN_TAGS.map((tag) => [tag, ["style"]])),
  },
  allowedStyles: Object.fromEntries(
    TEXT_ALIGN_TAGS.map((tag) => [tag, { "text-align": [TEXT_ALIGN_PATTERN] }])
  ),
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  nestingLimit: 16,
  transformTags: {
    a(_tagName, attribs) {
      const href = normalizeLink(attribs.href);
      return {
        tagName: "a",
        attribs: href
          ? {
              href,
              target: "_blank",
              rel: "noopener noreferrer",
            }
          : {},
      };
    },
  },
  exclusiveFilter(frame) {
    return frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false;
  },
};

function decodePlainTextEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, named) => {
    if (decimal) {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    return namedEntities[named.toLowerCase()] ?? entity;
  });
}

function normalizePlainText(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasVisiblePlainText(value) {
  return value
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/\p{Mark}/gu, "")
    .trim().length > 0;
}

function inputSizeError(value) {
  if (typeof value !== "string") {
    return "Note content must be text";
  }

  if (Buffer.byteLength(value, "utf8") > MAX_NOTE_CONTENT_BYTES) {
    return "Note content must be 100 KB or less";
  }

  return null;
}

function firstPlainText(record) {
  for (const key of ["noteText", "content", "description"]) {
    if (typeof record?.[key] === "string" && record[key].trim()) {
      return normalizePlainText(record[key]);
    }
  }

  return "";
}

export function sanitizeRichTextHtml(value) {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, SANITIZE_OPTIONS).trim();
}

export function richTextToPlainText(value) {
  const safeHtml = sanitizeRichTextHtml(value);
  const withLineBreaks = safeHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n")
    .replace(new RegExp(`</(?:${BLOCK_END_TAGS.join("|")})\\s*>`, "gi"), "\n");
  const encodedText = sanitizeHtml(withLineBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });

  return normalizePlainText(decodePlainTextEntities(encodedText));
}

export function validateNoteContent(value, { format = "html" } = {}) {
  const sizeError = inputSizeError(value);
  if (sizeError) return { valid: false, error: sizeError };

  if (format === "plain") {
    const noteText = normalizePlainText(value);
    return noteText && hasVisiblePlainText(noteText)
      ? { valid: true, noteText }
      : { valid: false, error: "Note text is required" };
  }

  if (format !== "html") {
    return { valid: false, error: "Note content format is invalid" };
  }

  const noteHtml = sanitizeRichTextHtml(value);
  const noteText = richTextToPlainText(noteHtml);
  return noteText && hasVisiblePlainText(noteText)
    ? { valid: true, noteHtml, noteText }
    : { valid: false, error: "Note text is required" };
}

export function buildNoteFields(value, { format = "html" } = {}) {
  const validation = validateNoteContent(value, { format });
  if (!validation.valid) return validation;

  if (format === "html") {
    return {
      ...validation,
      fields: {
        noteHtml: validation.noteHtml,
        noteText: validation.noteText,
        content: validation.noteText,
        contentFormat: "html",
      },
    };
  }

  return {
    ...validation,
    fields: {
      noteText: validation.noteText,
      content: validation.noteText,
    },
  };
}

export function serializeNoteFields(record) {
  const plainFallback = firstPlainText(record);
  const hasExplicitNoteHtml = Object.prototype.hasOwnProperty.call(record || {}, "noteHtml");

  // The presence of legacy noteText/content never opts a record into HTML.
  if (!hasExplicitNoteHtml) {
    return plainFallback
      ? { noteText: plainFallback, content: plainFallback }
      : {};
  }

  if (typeof record.noteHtml !== "string") {
    return {
      noteHtml: undefined,
      contentFormat: undefined,
      noteText: plainFallback,
      content: plainFallback,
    };
  }

  const richText = buildNoteFields(record.noteHtml, { format: "html" });
  if (richText.valid) return richText.fields;

  return {
    noteHtml: undefined,
    contentFormat: undefined,
    noteText: plainFallback,
    content: plainFallback,
  };
}

export function serializeStoredNoteFields(record, { isNote = false } = {}) {
  const hasExplicitNoteHtml = Object.prototype.hasOwnProperty.call(record || {}, "noteHtml");

  if (!isNote) {
    return hasExplicitNoteHtml
      ? { noteHtml: undefined, contentFormat: undefined }
      : {};
  }

  return serializeNoteFields(record);
}
