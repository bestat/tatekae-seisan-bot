import { google, sheets_v4, drive_v3 } from 'googleapis';
import { AppConfig } from '../config';

export interface GoogleClients {
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
}

export async function createGoogleClients(config: AppConfig): Promise<GoogleClients> {
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
  ];

  const credentialJson = config.google.credentialsJson;
  const applicationCredentialsPath = config.google.applicationCredentialsPath;

  const auth = credentialJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(credentialJson),
        scopes,
      })
    : new google.auth.GoogleAuth({
        keyFile: applicationCredentialsPath,
        scopes,
      });

  const authClient = await auth.getClient();

  const sheets = google.sheets({ version: 'v4', auth: authClient as any });
  const drive = google.drive({ version: 'v3', auth: authClient as any });

  return { sheets, drive };
}
