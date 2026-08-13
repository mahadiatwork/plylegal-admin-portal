import assert from "node:assert/strict";
import { getWorkDrivePreviewUrl } from "./workDrivePreviewUrl.mjs";

assert.equal(
  getWorkDrivePreviewUrl("https://workdrive.zohopublic.com.au/external/pq1abc?foo=bar"),
  "https://workdrive.zohopublic.com.au/external/pq1abc?foo=bar"
);
assert.equal(
  getWorkDrivePreviewUrl(
    "https://workdrive.zohoexternal.com/external/pq1abc/download?directDownload=true"
  ),
  "https://workdrive.zohoexternal.com/external/pq1abc"
);
assert.equal(getWorkDrivePreviewUrl("https://example.com/file.pdf"), "");
