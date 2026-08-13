import assert from "node:assert/strict";
import {
  getWorkDriveDirectDownloadUrl,
  getWorkDrivePreviewUrl,
  isWorkDrivePublicFileUrl,
} from "./workDrivePreviewUrl.mjs";

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

assert.equal(
  getWorkDriveDirectDownloadUrl("https://workdrive.zohopublic.com.au/external/pq1abc"),
  "https://workdrive.zohopublic.com.au/external/pq1abc/download?directDownload=true"
);
assert.equal(
  getWorkDriveDirectDownloadUrl(
    "https://workdrive.zohoexternal.com/external/pq1abc/download?directDownload=false"
  ),
  "https://workdrive.zohoexternal.com/external/pq1abc/download?directDownload=true"
);
assert.equal(getWorkDriveDirectDownloadUrl("https://example.com/file.pdf"), "");
assert.equal(
  isWorkDrivePublicFileUrl(
    "https://files.zohopublic.com.au/public/workdrive-public/download/file123"
  ),
  true
);
assert.equal(isWorkDrivePublicFileUrl("https://example.com/public/workdrive-public/file"), false);
