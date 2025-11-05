"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGoogleClients = createGoogleClients;
const googleapis_1 = require("googleapis");
async function createGoogleClients(config) {
    const scopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
    ];
    const credentialJson = config.google.credentialsJson;
    const applicationCredentialsPath = config.google.applicationCredentialsPath;
    const auth = credentialJson
        ? new googleapis_1.google.auth.GoogleAuth({
            credentials: JSON.parse(credentialJson),
            scopes,
        })
        : new googleapis_1.google.auth.GoogleAuth({
            keyFile: applicationCredentialsPath,
            scopes,
        });
    const authClient = await auth.getClient();
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth: authClient });
    const drive = googleapis_1.google.drive({ version: 'v3', auth: authClient });
    return { sheets, drive };
}
