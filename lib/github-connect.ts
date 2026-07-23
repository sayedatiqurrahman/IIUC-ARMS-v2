export function connectGitHubPopup(userEmail: string): Promise<boolean> {
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
        resolve(true);
      }
    }
    window.addEventListener('message', handler);

    // Fallback: if popup closes without message
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        resolve(false);
      }
    }, 500);
  });
}
