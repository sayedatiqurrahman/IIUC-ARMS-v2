import crypto from 'crypto';

const GITHUB_API = 'https://api.github.com';

function getPrivateKey(): string {
  const key = process.env.GITHUB_PRIVATE_KEY || '';
  return key.replace(/\\n/g, '\n').replace(/"/g, '');
}

export function generateJWT(): string {
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 240,
    iss: process.env.GITHUB_ID!,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const base64url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${base64url(header)}.${base64url(payload)}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

export async function getAppInstallations() {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getInstallationInfo(installationId: number): Promise<{ accountLogin: string; accountId: number; avatarUrl: string } | null> {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return {
    accountLogin: data.account?.login || '',
    accountId: data.account?.id || 0,
    avatarUrl: data.account?.avatar_url || '',
  };
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to get installation token: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}

/**
 * Find the installation that actually has access to a given repo.
 * Unlike listing all app installations and picking [0], this resolves the
 * exact installation for the target repo — robust when the app is installed
 * on more than one account/org.
 */
export async function getRepoInstallation(owner: string, repo: string): Promise<number | null> {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/installation`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id || null;
}

/** Fresh installation access token scoped to the repo the app is installed on (or null). */
export async function getRepoBotToken(owner: string, repo: string): Promise<string | null> {
  try {
    const installationId = await getRepoInstallation(owner, repo);
    if (!installationId) return null;
    return await getInstallationAccessToken(installationId);
  } catch {
    return null;
  }
}

export async function getAppInfo() {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  return res.json();
}
