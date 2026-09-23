import { TextSelection } from "@tiptap/pm/state";
import { canSplit, Transform } from "@tiptap/pm/transform";

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

  return text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function blockPosition($position) {
  return $position.parent.isTextblock
    ? $position.before($position.depth)
    : null;
}

function describeBlock(doc, node, position) {
  const hardBreaks = [];
  const segmentSizes = [0];
  let offset = 0;

  node.forEach((child) => {
    if (child.type.name === "hardBreak") {
      hardBreaks.push({
        offset,
        position: position + 1 + offset,
      });
      segmentSizes.push(0);
    } else {
      segmentSizes[segmentSizes.length - 1] += child.nodeSize;
    }
    offset += child.nodeSize;
  });

  const $inside = doc.resolve(position + 1);
  let insideListItem = false;
  for (let depth = $inside.depth; depth > 0; depth -= 1) {
    if ($inside.node(depth).type.name === "listItem") {
      insideListItem = true;
      break;
    }
  }

  return {
    hardBreaks,
    insideListItem,
    node,
    position,
    segmentSizes,
  };
}

function selectedTextblocks(doc, selection) {
  const blocks = new Map();
  const addBlock = (node, position) => {
    if (!node?.isTextblock || blocks.has(position)) return;
    blocks.set(position, describeBlock(doc, node, position));
  };
  const addEndpointBlock = ($position) => {
    const position = blockPosition($position);
    if (position !== null) addBlock($position.parent, position);
  };

  addEndpointBlock(selection.$anchor);
  addEndpointBlock(selection.$head);

  if (!selection.empty) {
    doc.nodesBetween(selection.from, selection.to, (node, position) => {
      if (!node.isTextblock) return true;
      addBlock(node, position);
      return false;
    });
  }

  return [...blocks.values()].sort(
    (left, right) => left.position - right.position,
  );
}

function endpointBookmark($position, blocksByPosition) {
  const position = blockPosition($position);
  const block = position === null ? null : blocksByPosition.get(position);
  if (!block?.hardBreaks.length) {
    return { position: $position.pos };
  }

  let segmentIndex = 0;
  let segmentStart = 0;
  for (const hardBreak of block.hardBreaks) {
    if (hardBreak.offset >= $position.parentOffset) break;
    segmentIndex += 1;
    segmentStart = hardBreak.offset + 1;
  }

  return {
    block,
    offset: Math.min(
      Math.max($position.parentOffset - segmentStart, 0),
      block.segmentSizes[segmentIndex],
    ),
    position: $position.pos,
    segmentIndex,
  };
}

function mappedEndpoint(bookmark, transaction, mappingStart, splitBlocks) {
  const mapping = transaction.mapping.slice(mappingStart);
  if (!bookmark.block || !splitBlocks.has(bookmark.block.position)) {
    return mapping.map(bookmark.position, 1);
  }

  const blockStart = mapping.map(bookmark.block.position, 1);
  const precedingContentSize = bookmark.block.segmentSizes
    .slice(0, bookmark.segmentIndex)
    .reduce((total, size) => total + size, 0);

  return (
    blockStart +
    1 +
    precedingContentSize +
    bookmark.segmentIndex * 2 +
    bookmark.offset
  );
}

function splitHardBreakBlocks(transaction, blocks) {
  const blocksWithBreaks = blocks.filter((block) => block.hardBreaks.length);
  if (!blocksWithBreaks.length) return new Set();

  const hardBreakPositions = blocksWithBreaks
    .flatMap((block) => block.hardBreaks.map(({ position }) => position))
    .sort((left, right) => right - left);

  // Verify every split against a throwaway transform so the real transaction is
  // either changed completely or not at all.
  const probe = new Transform(transaction.doc);
  for (const position of hardBreakPositions) {
    probe.delete(position, position + 1);
    if (!canSplit(probe.doc, position)) return null;
    probe.split(position);
  }

  for (const position of hardBreakPositions) {
    transaction.delete(position, position + 1);
    transaction.split(position);
  }

  return new Set(blocksWithBreaks.map((block) => block.position));
}

function nodeMatches(node, type, attributes) {
  return (
    node.type === type &&
    Object.entries(attributes).every(([name, value]) => node.attrs[name] === value)
  );
}

function compatibleAttributes(type, ...attributeSets) {
  const attributes = {};
  for (const values of attributeSets) {
    for (const [name, value] of Object.entries(values ?? {})) {
      if (name in type.attrs) attributes[name] = value;
    }
  }
  return attributes;
}

function applyVisualBlockType(transaction, requestedType, requestedAttributes, toggle) {
  const originalSelection = transaction.selection;
  const originalStoredMarks = transaction.storedMarks;
  const blocks = selectedTextblocks(transaction.doc, originalSelection);
  if (!blocks.length) return false;

  if (requestedType.name === "heading" && blocks.some((block) => block.insideListItem)) {
    return false;
  }

  const allRequested = blocks.every((block) =>
    nodeMatches(block.node, requestedType, requestedAttributes),
  );
  const targetType = toggle && allRequested
    ? transaction.doc.type.schema.nodes.paragraph
    : requestedType;
  const targetAttributes = toggle && allRequested ? {} : requestedAttributes;

  // Paragraph-on-paragraph must remain a true no-op so a deliberate Shift+Enter
  // line break is not silently changed into a new paragraph.
  if (blocks.every((block) => nodeMatches(block.node, targetType, targetAttributes))) {
    return true;
  }

  const blocksToSplit = originalSelection instanceof TextSelection
    ? blocks.filter(
        (block) => !nodeMatches(block.node, targetType, targetAttributes),
      )
    : [];
  const blocksByPosition = new Map(
    blocks.map((block) => [block.position, block]),
  );
  const anchorBookmark = endpointBookmark(originalSelection.$anchor, blocksByPosition);
  const headBookmark = endpointBookmark(originalSelection.$head, blocksByPosition);
  const mappingStart = transaction.mapping.maps.length;
  const splitBlocks = splitHardBreakBlocks(transaction, blocksToSplit);
  if (splitBlocks === null) return false;

  if (splitBlocks.size && originalSelection instanceof TextSelection) {
    const anchor = mappedEndpoint(
      anchorBookmark,
      transaction,
      mappingStart,
      splitBlocks,
    );
    const head = mappedEndpoint(
      headBookmark,
      transaction,
      mappingStart,
      splitBlocks,
    );
    transaction.setSelection(TextSelection.create(transaction.doc, anchor, head));
  }

  const copiedAttributes = originalSelection.$anchor.sameParent(
    originalSelection.$head,
  )
    ? originalSelection.$anchor.parent.attrs
    : {};
  transaction.setBlockType(
    transaction.selection.from,
    transaction.selection.to,
    targetType,
    compatibleAttributes(targetType, copiedAttributes, targetAttributes),
  );
  if (originalSelection.empty && originalStoredMarks !== null) {
    transaction.setStoredMarks(originalStoredMarks);
  }

  return true;
}

export function selectionHasListItem(state) {
  return selectedTextblocks(state.doc, state.selection).some(
    (block) => block.insideListItem,
  );
}

export function setVisualParagraph(transaction) {
  return applyVisualBlockType(
    transaction,
    transaction.doc.type.schema.nodes.paragraph,
    {},
    false,
  );
}

export function toggleVisualHeading(transaction, level) {
  const heading = transaction.doc.type.schema.nodes.heading;
  if (!heading || ![1, 2, 3, 4].includes(level)) return false;
  return applyVisualBlockType(transaction, heading, { level }, true);
}

export function setVisualParagraphCommand({ tr }) {
  return setVisualParagraph(tr);
}

export function toggleVisualHeadingCommand(level) {
  return ({ tr }) => toggleVisualHeading(tr, level);
}

export function visualHeadingKeyboardShortcuts(editor) {
  return Object.fromEntries(
    [1, 2, 3, 4].map((level) => [
      `Mod-Alt-${level}`,
      () => {
        if (selectionHasListItem(editor.state)) return true;
        return editor.commands.command(toggleVisualHeadingCommand(level));
      },
    ]),
  );
}
