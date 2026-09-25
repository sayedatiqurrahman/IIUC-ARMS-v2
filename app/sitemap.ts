import { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net').replace(/\/+$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/contributors`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/faculty`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/notices`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/routine`,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/blog`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/history`,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/clubs`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/studio`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/support`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
