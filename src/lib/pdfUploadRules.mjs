const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function hasPdfHeader(buffer) {
  if (!buffer || typeof buffer.length !== "number") return false;

  return PDF_HEADER.every((byte, index) => buffer[index] === byte);
}

export function isPdfUpload(fileName, buffer) {
  return (
    typeof fileName === "string" &&
    fileName.trim().toLowerCase().endsWith(".pdf") &&
    hasPdfHeader(buffer)
  );
}
