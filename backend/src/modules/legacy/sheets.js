const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const TOKEN_MARGIN_MS = 60_000;

// Read-only Google Drive client: refreshes an access token from a stored refresh token
// and exports a Google Sheet (first tab) as CSV. Error messages carry the HTTP status
// only, never tokens or response bodies.
export function createSheetsClient({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  let cached = { token: '', expiresAt: 0 };

  async function accessToken() {
    if (cached.token && Date.now() < cached.expiresAt - TOKEN_MARGIN_MS) return cached.token;
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Google token refresh failed (HTTP ${response.status})`);
    const body = await response.json();
    if (!body.access_token) throw new Error('Google token refresh returned no access token');
    cached = {
      token: body.access_token,
      expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
    };
    return cached.token;
  }

  return {
    async exportCsv(fileId) {
      const url = `${DRIVE_FILES}/${encodeURIComponent(fileId)}/export?mimeType=text%2Fcsv`;
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`Google Sheet export failed (HTTP ${response.status})`);
      return response.text();
    },
  };
}
