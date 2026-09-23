"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const ALLOWED_LINK_PATTERN = /^(?:https?:\/\/|mailto:|tel:)[^\s]+$/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function plainTextToRichTextHtml(value) {
  const text = String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (!text) return "";
  return `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
}

function getEditorContent(value, fallbackText) {
  return typeof value === "string" && value.trim()
    ? value
    : plainTextToRichTextHtml(fallbackText);
}

function isAllowedLink(value) {
  if (typeof value !== "string" || !ALLOWED_LINK_PATTERN.test(value)) return false;

  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeLinkInput(value) {
  const input = String(value ?? "").trim();
  if (!input) return null;

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const candidate = hasScheme
    ? input
    : input.startsWith("//")
      ? `https:${input}`
      : /^[^\s/]+\.[^\s]+$/.test(input)
        ? `https://${input}`
        : null;

  if (!candidate || !isAllowedLink(candidate)) return null;

  const parsed = new URL(candidate);
  return ["http:", "https:"].includes(parsed.protocol)
    ? parsed.toString()
    : candidate;
}

function ToolbarButton({ label, pressed, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed
          ? "border-[#4F726B] bg-[#4F726B] text-white"
          : "border-[#d7e4de] bg-white text-[#315249] hover:bg-[#edf7f2]"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-[#d7e4de]" />;
}

export function RichTextEditor({
  value = "",
  fallbackText = "",
  onChange,
  id,
  ariaLabelledBy,
  placeholder = "Write your note…",
}) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: {
            autolink: true,
            defaultProtocol: "https",
            linkOnPaste: true,
            openOnClick: false,
            protocols: ["http", "https", "mailto", "tel"],
            isAllowedUri: isAllowedLink,
            HTMLAttributes: {
              rel: "noopener noreferrer",
              target: "_blank",
            },
          },
        }),
        Highlight,
        TextAlign.configure({
          alignments: ["left", "center", "right", "justify"],
          types: ["heading", "paragraph"],
        }),
      ],
      content: getEditorContent(value, fallbackText),
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          ...(ariaLabelledBy
            ? { "aria-labelledby": ariaLabelledBy }
            : { "aria-label": "Rich text note editor" }),
          "aria-multiline": "true",
          "aria-placeholder": placeholder,
          class: "rich-text-content",
          role: "textbox",
          ...(id ? { id } : {}),
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        onChangeRef.current?.(
          currentEditor.isEmpty ? "" : currentEditor.getHTML(),
          currentEditor.getText({ blockSeparator: "\n" }),
        );
      },
    },
    [ariaLabelledBy, id, placeholder],
  );

  useEffect(() => {
    if (!editor) return;
    const nextContent = getEditorContent(value, fallbackText);
    const currentContent = editor.isEmpty ? "" : editor.getHTML();
    if (currentContent !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, fallbackText, value]);

  if (!editor) {
    return (
      <div
        className="min-h-40 rounded-md border border-[#d7e4de] bg-white px-4 py-3 text-sm text-[#71857d]"
        role="status"
      >
        Loading editor…
      </div>
    );
  }

  const promptForLink = () => {
    const entered = window.prompt(
      "Enter a link (http, https, mailto or tel)",
      editor.getAttributes("link").href || "",
    );
    if (entered === null) return;

    const href = normalizeLinkInput(entered);
    if (!href) {
      window.alert("Enter a valid http, https, mailto or tel link.");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const isLeftAligned =
    !editor.isActive({ textAlign: "center" }) &&
    !editor.isActive({ textAlign: "right" });

  return (
    <div className="rich-text-editor overflow-hidden rounded-md border border-[#d7e4de] bg-white focus-within:ring-2 focus-within:ring-[#4F726B] focus-within:ring-offset-1">
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-1 border-b border-[#e4ece8] bg-[#f8fbf9] p-2"
      >
        <ToolbarButton
          label="Paragraph"
          pressed={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        {[
          [1, Heading1],
          [2, Heading2],
          [3, Heading3],
          [4, Heading4],
        ].map(([level, Icon]) => (
          <ToolbarButton
            key={level}
            label={`Heading ${level}`}
            pressed={editor.isActive("heading", { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            <Icon className="h-4 w-4" />
          </ToolbarButton>
        ))}

        <ToolbarDivider />

        <ToolbarButton
          label="Bold"
          pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          pressed={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          pressed={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Highlight"
          pressed={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          pressed={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Bullet list"
          pressed={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Ordered list"
          pressed={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Blockquote"
          pressed={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="Add or edit link" pressed={editor.isActive("link")} onClick={promptForLink}>
          <Link className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Align left"
          pressed={isLeftAligned}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          pressed={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          pressed={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Justify"
          pressed={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Undo"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          disabled={editor.isEmpty}
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()
          }
        >
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div className="relative">
        {editor.isEmpty ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-3 z-10 text-sm text-[#83978f]"
          >
            {placeholder}
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function RichTextContent({ html = "", fallbackText = "", className = "" }) {
  const content = getEditorContent(html, fallbackText);
  if (!content) return null;

  return (
    <div
      className={`rich-text-content ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
