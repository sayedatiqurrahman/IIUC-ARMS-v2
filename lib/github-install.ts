export function installGitHubApp(): Promise<{ token: string; login: string; installationId: string; avatarUrl: string; error?: string }> {
  return new Promise((resolve) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      '/api/github/install',
      'github-install',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    function handler(e: MessageEvent) {
      if (e.data?.type === 'github-install-done') {
        window.removeEventListener('message', handler);
        if (e.data.error) {
          resolve({ token: '', login: '', installationId: '', avatarUrl: '', error: e.data.error });
        } else {
          resolve({ token: e.data.token, login: e.data.login, installationId: e.data.installationId || '', avatarUrl: e.data.avatarUrl || '' });
        }
      }
    }
    window.addEventListener('message', handler);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        resolve({ token: '', login: '', installationId: '', avatarUrl: '', error: 'Popup closed' });
      }
    }, 500);
  });
}
