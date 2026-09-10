import type { BrandId, DriveFolderRole, DriveListedFile } from "@marketing-os/contracts";

/** Registered fixture folder for Villa Glory — not a live Drive id. */
export const VILLA_GLORY_FIXTURE_DRIVE_FOLDER_ID = "fixture-villa-glory-root";
export const VILLA_GLORY_FIXTURE_DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/fixture-villa-glory-root";

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

export const DEFAULT_DRIVE_FIXTURE_TREES: Record<string, DriveFixtureTree> = {
  VILLA_GLORY: VILLA_GLORY_FIXTURE_DRIVE_TREE,
};
