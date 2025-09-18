import * as sdk from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== 'POST') return res.send('Method Not Allowed', 405);

    const {
      APPWRITE_API_KEY = 'standard_7f45fd9ace6a15afbd35b3a3a6e2fe26ff16d1ade18f3d79ae6b1060aa754eb70dff89f1e1553a12ddf52195ab4e2feebe86e131f13e0c57e1b281ac8ed1e7de8d9b14aae5233aaf72034854ac2d057f4bafe161ec545137df3f335741a51cf9460478e51758215076c25bdafeac372eed6d315490ef85424195bc6902520e86',
      BUCKET_ID = 'documents'
    } = process.env;

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT)
      .setKey(APPWRITE_API_KEY);

    const storage = new sdk.Storage(client);

    let body;
    try { body = JSON.parse(req.bodyRaw || '{}'); } catch { body = {}; }
    const { fileName, base64 } = body;
    if (!fileName || !base64) {
      return res.send(JSON.stringify({ error: 'Missing fileName/base64' }), 400);
    }

    const safe = fileName.replace(/[^A-Za-z0-9_.-]/g, '_');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      return res.send(JSON.stringify({ error: 'Empty file' }), 400);
    }

    // ¡Esta es la forma correcta!
    const inputFile = sdk.InputFile.fromBuffer(buffer, `${Date.now()}_${safe}`);
    const created = await storage.createFile(
      BUCKET_ID,
      sdk.ID.unique(),
      inputFile,
      [
        sdk.Permission.read(sdk.Role.any())
      ]
    );

    const url = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${created.$id}/view?project=${process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT}`;

    return res.send(JSON.stringify({ url, fileId: created.$id, size: buffer.length }));
  } catch (e) {
    error(e);
    return res.send(JSON.stringify({ error: String(e) }), 500);
  }
};