import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_ID!;
  const redirectUri = `${req.nextUrl.origin}/api/auth/github-callback`;
  const state = req.nextUrl.searchParams.get('email') || '';

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:follow&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return Response.redirect(url);
}
