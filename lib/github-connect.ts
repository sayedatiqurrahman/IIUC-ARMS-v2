export function connectGitHubPopup(userEmail: string): Promise<{ connected: boolean; token: string }> {
  return new Promise((resolve) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/api/auth/github-connect?email=${encodeURIComponent(userEmail)}`,
      'github-connect',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    function handler(e: MessageEvent) {
      if (e.data?.type === 'github-connected') {
        window.removeEventListener('message', handler);
        resolve({ connected: e.data.connected, token: e.data.token || '' });
      }
    }
    window.addEventListener('message', handler);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        resolve({ connected: false, token: '' });
      }
    }, 500);
  });
}
