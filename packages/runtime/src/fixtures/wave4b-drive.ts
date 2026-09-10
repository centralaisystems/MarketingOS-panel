import type { BrandId, DriveFolderRole, DriveListedFile } from "@marketing-os/contracts";

/** Registered fixture folder for Villa Glory — not a live Drive id. */
export const VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID = "fixture-villa-glory-root";
export const VILLA_GLORY_FIXTURE_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/fixture-villa-glory-root";

/** Registered fixture folder for LOTIN — not a live Drive id. */
export const LOTIN_FIXTURE_DRIVE_FOLDER_ID = "fixture-lotin-root";
export const LOTIN_FIXTURE_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/fixture-lotin-root";

/** Test-only owner-review addresses. Do not add these to the committed LOTIN registry. */
export const LOTIN_FIXTURE_OWNER_EMAIL = "lotin-owner@example.test";
export const LOTIN_FIXTURE_OWNER_CC = "lotin-cc@example.test";

const FIXTURE_AT = "2026-09-10T09:00:00.000Z";

export type DriveFixtureTree = {
  brand_id: BrandId;
  folder_id: string;
  folder_url: string;
  folders: DriveFolderRole[];
  files: DriveListedFile[];
};

function file(
  role: DriveFolderRole,
  id: string,
  name: string,
  mime_type: string,
  checksum_sha256: string,
): DriveListedFile {
  return {
    drive_file_id: id,
    name,
    mime_type,
    path: `${role}/${name}`,
    folder_role: role,
    checksum_sha256,
    modified_at: FIXTURE_AT,
  };
}

/** Deterministic Villa Glory Drive tree — metadata only, no binaries. */
export const VILLA_GLORY_FIXTURE_DRIVE_TREE: DriveFixtureTree = {
  brand_id: "VILLA_GLORY",
  folder_id: VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID,
  folder_url: VILLA_GLORY_FIXTURE_DRIVE_FOLDER_URL,
  folders: [
    "brand-kit",
    "approved-stills",
    "approved-video",
    "raw-inbox",
    "generated",
  ],
  files: [
    file(
      "brand-kit",
      "vg-kit-logo",
      "villa-glory-logo.png",
      "image/png",
      "1111111111111111111111111111111111111111111111111111111111111111",
    ),
    file(
      "brand-kit",
      "vg-kit-colors",
      "brand-colors.pdf",
      "application/pdf",
      "2222222222222222222222222222222222222222222222222222222222222222",
    ),
    file(
      "approved-stills",
      "vg-still-living-a",
      "living-room-set-a.jpg",
      "image/jpeg",
      "3333333333333333333333333333333333333333333333333333333333333333",
    ),
    file(
      "approved-stills",
      "vg-still-terrace",
      "terrace-dusk.jpg",
      "image/jpeg",
      "4444444444444444444444444444444444444444444444444444444444444444",
    ),
    file(
      "approved-video",
      "vg-video-walkthrough",
      "villa-walkthrough.mp4",
      "video/mp4",
      "5555555555555555555555555555555555555555555555555555555555555555",
    ),
    file(
      "raw-inbox",
      "vg-inbox-drop",
      "photographer-drop-unreviewed.jpg",
      "image/jpeg",
      "6666666666666666666666666666666666666666666666666666666666666666",
    ),
  ],
};

/**
 * Deterministic LOTIN Drive tree — metadata only, no binaries.
 * File names are generic (no listings, prices, or developer partnerships).
 */
export const LOTIN_FIXTURE_DRIVE_TREE: DriveFixtureTree = {
  brand_id: "LOTIN",
  folder_id: LOTIN_FIXTURE_DRIVE_FOLDER_ID,
  folder_url: LOTIN_FIXTURE_DRIVE_FOLDER_URL,
  folders: [
    "brand-kit",
    "approved-stills",
    "approved-video",
    "raw-inbox",
    "generated",
  ],
  files: [
    file(
      "brand-kit",
      "lotin-kit-logo",
      "lotin-logo.png",
      "image/png",
      "7777777777777777777777777777777777777777777777777777777777777777",
    ),
    file(
      "brand-kit",
      "lotin-kit-colors",
      "brand-colors.pdf",
      "application/pdf",
      "8888888888888888888888888888888888888888888888888888888888888888",
    ),
    file(
      "approved-stills",
      "lotin-still-office",
      "office-exterior.jpg",
      "image/jpeg",
      "9999999999999999999999999999999999999999999999999999999999999999",
    ),
    file(
      "approved-stills",
      "lotin-still-street",
      "residential-streetscape.jpg",
      "image/jpeg",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ),
    file(
      "approved-video",
      "lotin-video-intro",
      "office-intro.mp4",
      "video/mp4",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    file(
      "raw-inbox",
      "lotin-inbox-drop",
      "photographer-drop-unreviewed.jpg",
      "image/jpeg",
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    ),
  ],
};

export const DEFAULT_DRIVE_FIXTURE_TREES: Record<string, DriveFixtureTree> = {
  VILLA_GLORY: VILLA_GLORY_FIXTURE_DRIVE_TREE,
  LOTIN: LOTIN_FIXTURE_DRIVE_TREE,
};
