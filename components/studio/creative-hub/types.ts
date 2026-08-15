// Shared Creative Hub types.

export interface FieldSpec {
  type: string; // data-field-type value, e.g. "student_name"
  label: string;
}

export interface HubTheme {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  language: string;
  categories: string[];
  preview: string; // full image URL (repo raw or bundled fallback)
  html: string; // raw design HTML with data-field-type attributes
  pageSize: string;
  dir?: 'ltr' | 'rtl';
  source: 'repo' | 'fallback' | 'community';
  fields: FieldSpec[];
  // community-only
  author?: string;
  designSn?: string;
  folder?: string;
  publishedAt?: string;
}

export interface IucdProject {
  version: '1.0';
  kind: 'creative-hub';
  id: string;
  name: string;
  templateId: string;
  mode: 'form-fill' | 'auto-fill' | 'manual';
  pageSize: string;
  fields: Record<string, string>;
  layers: unknown;
  fieldMappings?: Record<string, string>;
  html: string;
  metadata: Record<string, string>;
  exportedAt: string;
}
