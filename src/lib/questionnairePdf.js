import { readFileSync } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { normalizeSkillsInDemandTypeLabel } from "./visaDisplay.js";

const UNICODE_FONT_FILE = "PlyLegalQuestionnaireUnicode-Regular.ttf";
const UNICODE_FONT_FAMILY = "PlyLegalQuestionnaireUnicode";
const UNICODE_FONT_READY = Symbol("questionnaireUnicodeFontReady");
let unicodeFontBase64;

const COLOR = {
  accent: [56, 102, 87],
  answer: [248, 250, 249],
  ink: [32, 55, 49],
  line: [220, 229, 224],
  muted: [98, 115, 108],
  text: [45, 62, 55],
  tint: [243, 247, 244],
};

const PAGE = {
  bottom: 278,
  contentTop: 24,
  continuationTableTop: 34,
  footerY: 289,
  left: 16,
  right: 194,
  tableWidth: 178,
};

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function printableText(value) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    // The bundled text font has broad language coverage but no emoji glyphs.
    // Preserve supplementary emoji unambiguously instead of dropping them.
    .replace(/[\u{1f000}-\u{1faff}]/gu, (character) => (
      `[U+${character.codePointAt(0).toString(16).toUpperCase()}]`
    ));
}

function requiresUnicodeFont(value) {
  return /[^\u0000-\u00ff]/.test(printableText(value));
}

function containsUnicodeText(value, visited = new WeakSet()) {
  if (typeof value === "string") return requiresUnicodeFont(value);
  if (!value || typeof value !== "object") return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) => containsUnicodeText(item, visited));
}

function registerUnicodeFont(document) {
  if (!unicodeFontBase64) {
    unicodeFontBase64 = readFileSync(
      path.join(process.cwd(), "public", "fonts", UNICODE_FONT_FILE),
    ).toString("base64");
  }
  document.addFileToVFS(UNICODE_FONT_FILE, unicodeFontBase64);
  document.addFont(UNICODE_FONT_FILE, UNICODE_FONT_FAMILY, "normal");
  document[UNICODE_FONT_READY] = true;
}

function setFontForText(document, value, style = "normal") {
  const useUnicode = document[UNICODE_FONT_READY] && requiresUnicodeFont(value);
  document.setFont(useUnicode ? UNICODE_FONT_FAMILY : "helvetica", useUnicode ? "normal" : style);
}

function profileName(profile) {
  if (!profile || typeof profile !== "object") return "";
  return [profile.given_names, profile.family_name].filter(hasText).join(" ").trim()
    || [profile.givenNames, profile.familyName].filter(hasText).join(" ").trim()
    || (hasText(profile.name) ? profile.name.trim() : "");
}

function primaryApplicantName(application = {}, questionnaire = {}) {
  const profiles = Array.isArray(questionnaire.profiles) ? questionnaire.profiles : [];
  const primary = profiles.find((profile) => profile?.relationship === "main_applicant") || profiles[0];
  const fromProfile = profileName(primary);
  if (fromProfile) return fromProfile;

  const direct = [application.applicantName, application.clientName, application.name, application.Name]
    .find(hasText);
  if (direct) return direct.trim();

  const reference = hasText(application.reference) ? application.reference.trim() : "";
  return reference.split(/\s+-\s+/)[0] || "Applicant";
}

function visaLabel(application = {}, questionnaire = {}, definition = {}) {
  const rawValue = [application.type, application.visaType, application.Visa_Type]
    .find(hasText)?.trim();
  const raw = normalizeSkillsInDemandTypeLabel(rawValue);
  if (raw && !/^(?:partner|protection|temporary-work)$/i.test(raw)) return raw;

  const context = String(questionnaire.visaContext || application.visaContext || definition.visaContext || "");
  if (context === "186") return "Employer Nomination Scheme (Subclass 186)";
  if (context === "482") return "Skills in Demand (Subclass 482)";

  const type = String(definition.visaType || application.visaTypeCode || raw || "").toLowerCase();
  if (type === "protection" || /866|protection/.test(String(application.reference || "").toLowerCase())) {
    return "Protection Visa (Subclass 866)";
  }
  if (type === "temporary-work") return "Skills in Demand (Subclass 482)";
  if (type === "partner") return "Partner Visa";
  return "Visa application";
}

function eyebrow(label) {
  return printableText(label)
    .replace(/\s*\((subclass\s+[^)]+)\)/i, " / $1")
    .toUpperCase();
}

function safeFilenameStem(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableFilenameSuffix(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function utf8Filename(applicantName) {
  const safeName = String(applicantName || "Applicant")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "Applicant";
  return `${safeName}-questionnaire-answers.pdf`;
}

export function getQuestionnairePdfMetadata({ application = {}, questionnaire = {}, definition = {} } = {}) {
  const applicantName = primaryApplicantName(application, questionnaire);
  const applicationType = visaLabel(application, questionnaire, definition);
  const asciiName = safeFilenameStem(applicantName);
  const containsNonAscii = /[^\x20-\x7e]/.test(applicantName);
  const applicationId = [
    application.id,
    application.applicationId,
    application.Application_ID,
    application.dealId,
    application.Deal_ID,
    questionnaire.id,
  ].find(hasText);
  const uniquePart = safeFilenameStem(applicationId)
    || `applicant-${stableFilenameSuffix(applicantName)}`;
  const stem = containsNonAscii
    ? [asciiName, uniquePart, "questionnaire-answers"].filter(Boolean).join("-")
    : `${asciiName || uniquePart}-questionnaire-answers`;
  return {
    applicantName,
    applicationType,
    eyebrow: eyebrow(applicationType),
    filename: `${stem}.pdf`,
    utf8Filename: utf8Filename(applicantName),
    title: `Questionnaire answers - ${applicantName}`,
  };
}

function drawPageHeader(document) {
  document.setFont("helvetica", "bold");
  document.setFontSize(8.5);
  document.setTextColor(...COLOR.accent);
  document.text("PLY LEGAL", PAGE.left, 10.8);

  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.setTextColor(...COLOR.muted);
  document.text("QUESTIONNAIRE  /  RECORDED RESPONSES", PAGE.right, 10.8, { align: "right" });

  document.setDrawColor(...COLOR.accent);
  document.setLineWidth(0.25);
  document.line(PAGE.left, 14, PAGE.right, 14);
}

function drawPageFooter(document, metadata, pageNumber, pageCount) {
  const footerText = printableText(`${metadata.applicantName} | ${metadata.applicationType}`);
  setFontForText(document, footerText);
  document.setFontSize(7.2);
  document.setTextColor(...COLOR.muted);
  document.text(footerText, PAGE.left, PAGE.footerY);
  document.setFont("helvetica", "normal");
  document.text(`${pageNumber} / ${pageCount}`, PAGE.right, PAGE.footerY, { align: "right" });
}

function addPage(document) {
  document.addPage("a4", "portrait");
  return PAGE.contentTop;
}

function headingHeight(document, text, fontSize, width = PAGE.tableWidth) {
  setFontForText(document, text, "bold");
  document.setFontSize(fontSize);
  return document.splitTextToSize(printableText(text), width).length * fontSize * 0.38;
}

function ensureSpace(document, y, required) {
  return y + required > PAGE.bottom ? addPage(document) : y;
}

function drawHeading(document, text, y, { size, color = COLOR.ink, spacingAfter = 4.5 } = {}) {
  setFontForText(document, text, "bold");
  const lines = document.splitTextToSize(printableText(text), PAGE.tableWidth);
  document.setFontSize(size);
  document.setTextColor(...color);
  document.text(lines, PAGE.left, y);
  return y + (lines.length * size * 0.38) + spacingAfter;
}

function estimatedTableHeight(document, answers = []) {
  return answers.reduce((height, item) => {
    setFontForText(document, item.question);
    document.setFontSize(8.8);
    const questionLines = document.splitTextToSize(printableText(item.question), 118).length;
    setFontForText(document, item.answer, "bold");
    const answerLines = document.splitTextToSize(printableText(item.answer), 48).length;
    return height + 4.4 + (Math.max(questionLines, answerLines, 1) * 3.7);
  }, 8.2);
}

function estimatedSectionHeight(document, section, showTitle) {
  const titleHeight = showTitle ? headingHeight(document, section.title, 10.5) + 3.4 : 0;
  return titleHeight + estimatedTableHeight(document, section.answers) + 6;
}

function minimumSectionHeight(document, section, showTitle) {
  const titleHeight = showTitle ? headingHeight(document, section.title, 10.5) + 3.4 : 0;
  return titleHeight + Math.min(estimatedTableHeight(document, section.answers), 28) + 6;
}

function drawTableContinuation(document, context) {
  setFontForText(document, context.eyebrow, "bold");
  document.setFontSize(7.2);
  document.setTextColor(...COLOR.accent);
  document.text(printableText(context.eyebrow), PAGE.left, 20);

  setFontForText(document, context.title);
  document.setFontSize(8.2);
  const lines = document
    .splitTextToSize(printableText(context.title), PAGE.tableWidth)
    .slice(0, 2);
  document.setTextColor(...COLOR.ink);
  document.text(lines, PAGE.left, 26);
}

function drawQuestionTable(document, answers, startY, continuationContext) {
  const rows = answers.map((item) => [
    printableText(item.question),
    printableText(item.answer),
  ]);
  const tableFitsFreshPage = estimatedTableHeight(document, answers)
    <= PAGE.bottom - PAGE.contentTop;

  autoTable(document, {
    startY,
    margin: {
      top: tableFitsFreshPage ? PAGE.contentTop : PAGE.continuationTableTop,
      right: 16,
      bottom: 21,
      left: PAGE.left,
    },
    tableWidth: PAGE.tableWidth,
    theme: "plain",
    showHead: "everyPage",
    pageBreak: tableFitsFreshPage ? "avoid" : "auto",
    rowPageBreak: "avoid",
    didParseCell: ({ cell, section }) => {
      if (section === "body" && document[UNICODE_FONT_READY] && requiresUnicodeFont(cell.raw)) {
        cell.styles.font = UNICODE_FONT_FAMILY;
        cell.styles.fontStyle = "normal";
      }
    },
    willDrawPage: ({ pageNumber }) => {
      if (!tableFitsFreshPage && pageNumber > 1 && continuationContext) {
        drawTableContinuation(document, continuationContext);
      }
    },
    head: [["QUESTION", "RECORDED ANSWER"]],
    body: rows,
    styles: {
      font: "helvetica",
      fontSize: 8.8,
      textColor: COLOR.text,
      cellPadding: { top: 2.2, right: 2.6, bottom: 2.2, left: 2.6 },
      lineColor: COLOR.line,
      lineWidth: { top: 0, right: 0, bottom: 0.18, left: 0 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: COLOR.tint,
      textColor: COLOR.accent,
      fontSize: 7.2,
      fontStyle: "bold",
      cellPadding: { top: 2.1, right: 2.6, bottom: 2.1, left: 2.6 },
      lineColor: COLOR.line,
      lineWidth: { top: 0.18, right: 0, bottom: 0.18, left: 0 },
    },
    columnStyles: {
      0: { cellWidth: 124, fontStyle: "normal" },
      1: { cellWidth: 54, fillColor: COLOR.answer, fontStyle: "bold", textColor: COLOR.ink },
    },
  });

  return (document.lastAutoTable?.finalY || startY) + 6;
}

function isOverviewGroup(group) {
  return group.key === "getting-started" || group.key === "included-applicants"
    || /^(?:getting started|included applicants)$/i.test(group.title);
}

/** Create the exact bytes returned by the authenticated PDF download route. */
export function createQuestionnairePdf({
  application = {},
  questionnaire = {},
  definition = {},
  groups = [],
} = {}) {
  const metadata = getQuestionnairePdfMetadata({ application, questionnaire, definition });
  const document = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });

  if (containsUnicodeText([metadata, groups])) {
    registerUnicodeFont(document);
  }

  document.setProperties({
    title: metadata.title,
    subject: "Questionnaire recorded responses",
    author: "PLY LEGAL",
    creator: "PLY LEGAL Admin Portal",
  });

  let y = PAGE.contentTop;
  setFontForText(document, metadata.eyebrow, "bold");
  document.setFontSize(7.5);
  document.setTextColor(...COLOR.accent);
  document.text(metadata.eyebrow, PAGE.left, y);
  y += 8.5;

  y = drawHeading(document, "Questionnaire answers", y, { size: 23, spacingAfter: 3.5 });
  setFontForText(document, metadata.applicantName);
  document.setFontSize(10.5);
  document.setTextColor(...COLOR.muted);
  document.text(printableText(metadata.applicantName), PAGE.left, y);
  y += 8;
  document.setFont("helvetica", "normal");
  document.setFontSize(8.8);
  document.text("Original question wording and recorded answers retained. Layout changes only.", PAGE.left, y);
  y += 12;

  let applicationOverviewDrawn = false;
  let applicantNumber = 0;

  for (const group of groups) {
    const overview = isOverviewGroup(group);
    if (overview && !applicationOverviewDrawn) {
      y = ensureSpace(document, y, 18);
      y = drawHeading(document, "Application overview", y, { size: 15.5, spacingAfter: 5.5 });
      applicationOverviewDrawn = true;
    } else if (!overview) {
      const numbered = group.type === "applicant" || group.type === "nonMigrating";
      if (numbered) applicantNumber += 1;
      const groupTitle = numbered
        ? `${String(applicantNumber).padStart(2, "0")}  ${group.title}`
        : group.title;
      const firstSection = group.sections?.[0];
      const firstShowsTitle = firstSection
        && (firstSection.title !== group.title || group.sections.length > 1);
      const firstSectionHeight = firstSection
        ? Math.min(
          estimatedSectionHeight(document, firstSection, firstShowsTitle),
          minimumSectionHeight(document, firstSection, firstShowsTitle),
        )
        : 0;
      const required = headingHeight(document, groupTitle, 15.5)
        + (group.subtitle ? 8 : 5.5)
        + firstSectionHeight;
      y = ensureSpace(document, y, required);
      y = drawHeading(document, groupTitle, y, { size: 15.5, spacingAfter: group.subtitle ? 2.5 : 5.5 });
      if (group.subtitle) {
        setFontForText(document, group.subtitle);
        document.setFontSize(8.5);
        document.setTextColor(...COLOR.muted);
        document.text(printableText(group.subtitle), PAGE.left, y);
        y += 5.5;
      }
    }

    for (const [sectionIndex, section] of (group.sections || []).entries()) {
      const showSectionTitle = overview || section.title !== group.title || group.sections.length > 1;
      const previousPageCount = document.getNumberOfPages();
      y = ensureSpace(
        document,
        y,
        Math.min(
          estimatedSectionHeight(document, section, showSectionTitle),
          minimumSectionHeight(document, section, showSectionTitle),
        ),
      );
      if (
        sectionIndex > 0
        && document.getNumberOfPages() > previousPageCount
        && (group.type === "applicant" || group.type === "nonMigrating")
      ) {
        document.setFont("helvetica", "bold");
        document.setFontSize(7.5);
        document.setTextColor(...COLOR.accent);
        document.text(`APPLICANT ${String(applicantNumber).padStart(2, "0")} / CONTINUED`, PAGE.left, y);
        y += 8.5;
        y = drawHeading(document, group.title, y, { size: 20, spacingAfter: 5.5 });
      }
      if (showSectionTitle) {
        y = drawHeading(document, section.title, y, { size: 10.5, spacingAfter: 3.4 });
      }
      if (section.answers?.length) {
        const numberedGroup = group.type === "applicant" || group.type === "nonMigrating";
        y = drawQuestionTable(document, section.answers, y, {
          eyebrow: numberedGroup
            ? `APPLICANT ${String(applicantNumber).padStart(2, "0")} / CONTINUED`
            : `${group.title.toUpperCase()} / CONTINUED`,
          title: showSectionTitle ? `${group.title} / ${section.title}` : group.title,
        });
      }
    }
  }

  if (!groups.some((group) => group.sections?.some((section) => section.answers?.length))) {
    y = ensureSpace(document, y, 18);
    document.setFont("helvetica", "normal");
    document.setFontSize(9.5);
    document.setTextColor(...COLOR.muted);
    document.text("No recorded answers are available yet.", PAGE.left, y);
  }

  const pageCount = document.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    document.setPage(pageNumber);
    drawPageHeader(document);
    drawPageFooter(document, metadata, pageNumber, pageCount);
  }

  return { document, metadata };
}

export function createQuestionnairePdfBytes(input) {
  const { document, metadata } = createQuestionnairePdf(input);
  return { bytes: new Uint8Array(document.output("arraybuffer")), metadata };
}
