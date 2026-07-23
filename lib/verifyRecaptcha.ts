export async function verifyRecaptcha(token: string, action: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.warn('RECAPTCHA_SECRET_KEY not set, skipping verification');
    return true;
  }

  try {
    const response = await fetch('https://recaptchaenterprise.googleapis.com/v1/projects/qsis-arms/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        event: {
          token,
          siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
          expectedAction: action,
        },
      }),
    });

    if (!response.ok) {
      console.error('reCAPTCHA verification failed:', response.status);
      return false;
    }

    const data = await response.json();
    return data.score >= 0.5;
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return false;
  }
}
