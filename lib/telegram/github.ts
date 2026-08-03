import { config } from '@/lib/config';
import { resolveGithubToken } from './api';

// ─── GitHub tree cache ────────────────────────────────────────────

let treeCache: { tree: any[]; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function getGithubTree(): Promise<any[]> {
  if (treeCache && Date.now() - treeCache.ts < CACHE_TTL) return treeCache.tree;

  const token = await resolveGithubToken();
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${config.branch}?recursive=1`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  treeCache = { tree: data.tree || [], ts: Date.now() };
  return treeCache.tree;
}