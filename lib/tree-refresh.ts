// After creating a course folder on GitHub the recursive-tree API is only
// eventually consistent, so an immediate reload can still miss the new course
// (the user then has to hard-refresh). This helper reloads the tree a few times
// until the expected course folder actually appears — retrying the GitHub fetch
// until the folder shows up instead of settling for a stale snapshot.

import { useAppStore } from '@/lib/store';

const RETRY_DELAY_MS = 1200;
const MAX_ATTEMPTS = 4;

export async function refreshTreeUntilVisible(expectedFolder: string, token: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    useAppStore.getState().invalidateTreeCache();
    await useAppStore.getState().loadTree(token);
    const tree = useAppStore.getState().getUploadTree();
    const found = tree.some((item: any) => {
      const gp = String(item.githubPath || item.path || '');
      return gp === expectedFolder || gp.startsWith(expectedFolder + '/');
    });
    if (found) return true;
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return false;
}
