import { auth, drive, drive_v3 } from "@googleapis/drive";
import * as fs from "fs";
import { Logger } from "../common/logger";

const logger = Logger.getLogger("Upload");

const driveFolderId = process.env.drive_folder_id;

// Google Drive connection
let driveService: drive_v3.Drive;

// Google Drive login
const driveAuth = new auth.GoogleAuth({
  credentials: {
    client_email: process.env.client_email,
    private_key: process.env.private_key,
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});

export async function connectDrive() {
  logger.info("Connecting to Google Drive");
  driveService = drive({ version: "v3", auth: driveAuth });
}

// Upload file to Google Drive
export async function uploadFile(
  fileName: string,
  filePath: string,
  fileMimeType: string
) {
  const list = await driveService.files.list({
    q: `name = "${fileName}" and "${driveFolderId}" in parents`,
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
  });

  const files = list.data.files;
  if (files.length) {
    logger.info(`Overwriting ${fileName} in Drive`);
    await driveService.files.update({
      fileId: files[0].id,
      media: {
        mimeType: fileMimeType,
        body: fs.createReadStream(filePath),
      },
    });
  } else {
    logger.info(`Uploading ${fileName} to Drive`);
    await driveService.files.create({
      requestBody: {
        name: fileName,
        mimeType: fileMimeType,
        parents: driveFolderId ? [driveFolderId] : [],
      },
      media: {
        mimeType: fileMimeType,
        body: fs.createReadStream(filePath),
      },
    });
  }
}
