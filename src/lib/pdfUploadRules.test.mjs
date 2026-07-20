import assert from "node:assert/strict";
import { isPdfUpload } from "./pdfUploadRules.mjs";

assert.equal(isPdfUpload("visa.pdf", Buffer.from("%PDF-1.7")), true);
assert.equal(isPdfUpload("visa.pdf", Buffer.from("not a pdf")), false);
assert.equal(isPdfUpload("visa.txt", Buffer.from("%PDF-1.7")), false);
