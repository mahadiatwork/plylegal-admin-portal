import assert from "node:assert/strict";
import test from "node:test";
import { parseShareUrl, planResourceViewOnly, protectedResourceData } from "./resource-view-only-plan.mjs";

const firstUrl = "https://workdrive.zohopublic.com.au/external/first";
const secondUrl = "https://workdrive.zohoexternal.com/external/second";
const verified = (linkId, link) => ({ linkId, link, allowDownload: false });

test("all previous share aliases are restricted, including nested raw responses", () => {
  const original = {
    kind: "file",
    externalUrl: firstUrl,
    workDrivePublicLinkId: "first",
    downloadUrl: `${secondUrl}/download?directDownload=true`,
    workDrivePermalink: "https://workdrive.zoho.com.au/file/file-id",
    metadata: { label: "keep", raw: { attributes: { public_url: `${firstUrl}?signed=secret` } } },
    rawUrl: "https://files.zohopublic.com.au/public/workdrive-public/download/file-id",
    fileName: "Policy.docx",
  };
  const plan = planResourceViewOnly(original, "template");
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.linkIds, ["first", "second"]);
  const result = protectedResourceData(plan, new Map([
    ["first", verified("first", firstUrl)], ["second", verified("second", secondUrl)],
  ]));
  assert.deepEqual(result, {
    kind: "file", workDrivePublicLinkId: "first", metadata: { label: "keep" },
    fileName: "Policy.docx", externalUrl: firstUrl, downloadAllowed: false,
  });
  assert.equal(original.downloadUrl, `${secondUrl}/download?directDownload=true`);
});

test("recovers missing stored IDs from share URLs and preserves only schema viewer fields", () => {
  const plan = planResourceViewOnly({ type: "file", url: `${firstUrl}/download`, externalUrl: firstUrl }, "shared");
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(protectedResourceData(plan, new Map([["first", verified("first", firstUrl)]])), {
    type: "file", url: firstUrl, publicUrl: firstUrl, workDrivePublicLinkId: "first", downloadAllowed: false,
  });
});

test("matter files receive the same verified viewer-only fields as shared files", () => {
  const plan = planResourceViewOnly({
    type: "file",
    source: "resourceCenter",
    publicUrl: firstUrl,
    downloadUrl: `${firstUrl}/download`,
    fileName: "Matter guide.docx",
  }, "matter");
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(protectedResourceData(
    plan,
    new Map([["first", verified("first", firstUrl)]])
  ), {
    type: "file",
    source: "resourceCenter",
    fileName: "Matter guide.docx",
    publicUrl: firstUrl,
    url: firstUrl,
    workDrivePublicLinkId: "first",
    downloadAllowed: false,
  });
});

test("blocks unidentifiable shares, unsupported storage, or a resource with no previous share", () => {
  for (const data of [
    { externalUrl: "https://storage.example.com/private.pdf" },
    { workDrivePublicLinkId: "first", downloadUrl: "https://example.com/download" },
    { externalUrl: `${firstUrl}/unknown-path` },
    { workDrivePublicLinkId: "first", externalUrl: "https://workdrive.zoho.com.au/external/second/unknown-path" },
    { workDriveResourceId: "file-id", workDrivePermalink: "https://workdrive.zoho.com.au/file/file-id" },
    { workDrivePublicLinkId: "first/path", externalUrl: firstUrl },
  ]) assert.ok(planResourceViewOnly(data, "template").problems.length);
});

test("every old link must be verified and viewer URLs cannot fall back to downloads", () => {
  const plan = planResourceViewOnly({ externalUrl: firstUrl, downloadUrl: secondUrl }, "template");
  for (const second of [
    undefined,
    { linkId: "second", link: secondUrl, allowDownload: true },
    { linkId: "second", downloadUrl: `${secondUrl}/download`, allowDownload: false },
    { linkId: "second", link: `${secondUrl}/download`, allowDownload: false },
    { linkId: "second", link: `${secondUrl}?directDownload=true`, allowDownload: false },
    { linkId: "different", link: secondUrl, allowDownload: false },
  ]) {
    assert.throws(() => protectedResourceData(plan, new Map([
      ["first", verified("first", firstUrl)], ["second", second],
    ])));
  }
});

test("a repeated migration preserves the exact protected document", () => {
  const data = {
    type: "file", url: firstUrl, publicUrl: firstUrl, downloadAllowed: false,
    workDrivePublicLinkId: "first", fileSize: 100, updatedAt: new Date("2026-01-01"),
  };
  assert.deepEqual(protectedResourceData(planResourceViewOnly(data, "shared"),
    new Map([["first", verified("first", firstUrl)]])), data);
});

test("URL parsing rejects spoofed hosts and credentials and discards download parameters", () => {
  for (const url of [
    "http://workdrive.zohopublic.com.au/external/first",
    "https://workdrive.zohopublic.com.au.evil.com/external/first",
    "https://user:password@workdrive.zohopublic.com.au/external/first",
    "https://workdrive.zohopublic.com.au:444/external/first",
    "https://workdrive.zohopublic.com.au/external/first%2Fsecond",
  ]) assert.equal(parseShareUrl(url), null);
  assert.deepEqual(parseShareUrl(`${firstUrl}/download?directDownload=true#fragment`), {
    linkId: "first", viewerUrl: firstUrl,
  });
  assert.deepEqual(parseShareUrl("https://workdrive.zoho.com.au/external/first"), {
    linkId: "first", viewerUrl: "https://workdrive.zoho.com.au/external/first",
  });
});
