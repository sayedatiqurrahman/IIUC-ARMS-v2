export interface CertThemeColors {
  background: [number, number, number];
  primary: [number, number, number];
  secondary: [number, number, number];
  accent: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
  headerBg: [number, number, number];
  headerText: [number, number, number];
  border: [number, number, number];
  borderAccent: [number, number, number];
}

export interface CertThemeBorder {
  style: 'double' | 'single' | 'ornamental' | 'rope' | 'none';
  width: number;
  accentWidth: number;
  cornerRadius: number;
  cornerOrnaments: boolean;
}

export interface CertThemeHeader {
  style: 'banner' | 'centered' | 'minimal' | 'regal';
  showAbbreviation: boolean;
  showLocation: boolean;
}

export interface CertThemeTitle {
  fontSize: number;
  subtitle: string;
  subtitleFontSize: number;
  decoration: 'line' | 'diamond' | 'dots' | 'flourish' | 'none';
}

export interface CertThemeSignatures {
  style: 'line' | 'boxed' | 'underline';
  count: number;
}

export interface CertThemeFooter {
  qrSize: number;
  verifiedText: string;
  showScanHint: boolean;
}

// ── Rich design configuration (all fields optional for backward compatibility) ──

export interface CertTextConfig {
  mainTitle?: string;      // e.g. "CERTIFICATE"
  subtitle?: string;       // e.g. "OF APPRECIATION"
  intro?: string;          // e.g. "This is to certify that"
  closing?: string;        // e.g. "THANK YOU FOR YOUR VALUABLE CONTRIBUTION"
  institutionName?: string;// overrides the header university line
  tagline?: string;        // subtitle under the university name
}

export interface CertFontConfig {
  titleFontSize?: number;      // "CERTIFICATE"
  subtitleFontSize?: number;
  titleLetterSpacing?: number; // character spacing for the subtitle
  bodySize?: number;           // body / intro font size
  nameSize?: number;           // serif fallback recipient size
  nameScriptFont?: string;     // calligraphy family, e.g. "Great Vibes"
}

export interface CertBismillahConfig {
  enabled?: boolean;
  text?: string;
  fontSize?: number;
  color?: [number, number, number];
}

export interface CertSignatureLineConfig {
  enabled?: boolean;
  thickness?: number;
  color?: [number, number, number];
}

export interface CertLogoConfig {
  width?: number;   // mm, drawn box width (aspect preserved via image natural ratio)
  height?: number;  // mm, drawn box height
  opacity?: number; // 0..1
}

export interface CertQrConfig {
  enabled?: boolean;
}

export interface CertDesignConfig {
  text?: CertTextConfig;
  fonts?: CertFontConfig;
  bismillah?: CertBismillahConfig;
  signatureLine?: CertSignatureLineConfig;
  qr?: CertQrConfig;
  logo?: CertLogoConfig;
}

export interface CertSignatory {
  name: string;
  designation: string;
  title: string;
  signatureUrl?: string;
  autoSignature?: boolean;
}

export interface CertTheme {
  name: string;
  displayName: string;
  published: boolean;
  publishedBy?: string;
  colors: CertThemeColors;
  border: CertThemeBorder;
  header: CertThemeHeader;
  title: CertThemeTitle;
  signatures: CertThemeSignatures;
  footer: CertThemeFooter;
  design?: CertDesignConfig;
}

export const DESIGN_DEFAULTS: Required<CertDesignConfig> = {
  text: {
    mainTitle: 'CERTIFICATE',
    subtitle: 'OF APPRECIATION',
    intro: 'This is to certify that',
    closing: 'THANK YOU FOR YOUR VALUABLE CONTRIBUTION',
    institutionName: 'INTERNATIONAL ISLAMIC UNIVERSITY CHITTAGONG',
    tagline: 'An International Centre for Higher Education and Research',
  },
  fonts: {
    titleFontSize: 30,
    subtitleFontSize: 10,
    titleLetterSpacing: 3.4,
    bodySize: 9.5,
    nameSize: 20,
    nameScriptFont: 'Great Vibes',
  },
  bismillah: { enabled: true, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', fontSize: 9, color: [60, 60, 60] },
  signatureLine: { enabled: true, thickness: 0.28, color: [100, 100, 100] },
  qr: { enabled: true },
  logo: { width: 20, height: 14, opacity: 1 },
};

// Merge a partially-specified design config onto defaults (deep-ish merge per group).
export function resolveDesign(design?: CertDesignConfig): Required<CertDesignConfig> {
  const d = design || {};
  return {
    text: { ...DESIGN_DEFAULTS.text, ...(d.text || {}) },
    fonts: { ...DESIGN_DEFAULTS.fonts, ...(d.fonts || {}) },
    bismillah: { ...DESIGN_DEFAULTS.bismillah, ...(d.bismillah || {}) },
    signatureLine: { ...DESIGN_DEFAULTS.signatureLine, ...(d.signatureLine || {}) },
    qr: { ...DESIGN_DEFAULTS.qr, ...(d.qr || {}) },
    logo: { ...DESIGN_DEFAULTS.logo, ...(d.logo || {}) },
  };
}

export const DEFAULT_THEME: CertTheme = {
  name: 'iiuc-classic',
  displayName: 'IIUC Classic (Default)',
  published: true,
  publishedBy: 'system',
  colors: {
    background: [255, 252, 245],
    primary: [0, 80, 40],
    secondary: [180, 140, 50],
    accent: [140, 100, 20],
    text: [40, 40, 40],
    muted: [100, 100, 100],
    headerBg: [0, 80, 40],
    headerText: [230, 210, 150],
    border: [0, 80, 40],
    borderAccent: [180, 140, 50],
  },
  border: {
    style: 'double',
    width: 1.2,
    accentWidth: 0.3,
    cornerRadius: 0,
    cornerOrnaments: true,
  },
  header: {
    style: 'banner',
    showAbbreviation: true,
    showLocation: true,
  },
  title: {
    fontSize: 26,
    subtitle: 'OF APPRECIATION',
    subtitleFontSize: 12,
    decoration: 'line',
  },
  signatures: {
    style: 'line',
    count: 3,
  },
  footer: {
    qrSize: 22,
    verifiedText: '',
    showScanHint: false,
  },
  design: DESIGN_DEFAULTS,
};

export const THEME_PRESETS: CertTheme[] = [
  {
    ...DEFAULT_THEME,
  },
  {
    name: 'royal-blue',
    displayName: 'Royal Blue',
    published: true,
    publishedBy: 'system',
    colors: {
      background: [245, 248, 255],
      primary: [20, 60, 140],
      secondary: [180, 160, 80],
      accent: [40, 80, 160],
      text: [30, 30, 50],
      muted: [90, 100, 130],
      headerBg: [20, 50, 120],
      headerText: [220, 210, 180],
      border: [20, 60, 140],
      borderAccent: [180, 160, 80],
    },
    border: { style: 'double', width: 1.0, accentWidth: 0.3, cornerRadius: 0, cornerOrnaments: true },
    header: { style: 'banner', showAbbreviation: true, showLocation: true },
    title: { fontSize: 26, subtitle: 'OF APPRECIATION', subtitleFontSize: 12, decoration: 'diamond' },
    signatures: { style: 'line', count: 3 },
    footer: { qrSize: 22, verifiedText: '', showScanHint: false },
  },
  {
    name: 'crimson-royal',
    displayName: 'Crimson Royal',
    published: true,
    publishedBy: 'system',
    colors: {
      background: [255, 248, 248],
      primary: [140, 20, 30],
      secondary: [180, 150, 60],
      accent: [160, 30, 40],
      text: [40, 20, 20],
      muted: [120, 90, 90],
      headerBg: [130, 20, 30],
      headerText: [240, 220, 180],
      border: [140, 20, 30],
      borderAccent: [180, 150, 60],
    },
    border: { style: 'ornamental', width: 1.0, accentWidth: 0.4, cornerRadius: 0, cornerOrnaments: true },
    header: { style: 'regal', showAbbreviation: true, showLocation: true },
    title: { fontSize: 26, subtitle: 'OF APPRECIATION', subtitleFontSize: 12, decoration: 'flourish' },
    signatures: { style: 'line', count: 3 },
    footer: { qrSize: 22, verifiedText: '', showScanHint: false },
  },
  {
    name: 'midnight-gold',
    displayName: 'Midnight Gold',
    published: true,
    publishedBy: 'system',
    colors: {
      background: [25, 25, 35],
      primary: [210, 180, 80],
      secondary: [180, 150, 60],
      accent: [230, 200, 100],
      text: [220, 220, 230],
      muted: [140, 140, 160],
      headerBg: [15, 15, 25],
      headerText: [210, 180, 80],
      border: [210, 180, 80],
      borderAccent: [180, 150, 60],
    },
    border: { style: 'double', width: 1.2, accentWidth: 0.4, cornerRadius: 0, cornerOrnaments: true },
    header: { style: 'banner', showAbbreviation: true, showLocation: true },
    title: { fontSize: 26, subtitle: 'OF APPRECIATION', subtitleFontSize: 12, decoration: 'dots' },
    signatures: { style: 'line', count: 3 },
    footer: { qrSize: 22, verifiedText: '', showScanHint: false },
  },
  {
    name: 'emerald-islamic',
    displayName: 'Emerald Islamic',
    published: true,
    publishedBy: 'system',
    colors: {
      background: [245, 255, 248],
      primary: [10, 100, 60],
      secondary: [160, 130, 50],
      accent: [20, 120, 70],
      text: [20, 40, 30],
      muted: [80, 110, 90],
      headerBg: [10, 90, 55],
      headerText: [220, 210, 170],
      border: [10, 100, 60],
      borderAccent: [160, 130, 50],
    },
    border: { style: 'rope', width: 1.0, accentWidth: 0.3, cornerRadius: 0, cornerOrnaments: true },
    header: { style: 'regal', showAbbreviation: true, showLocation: true },
    title: { fontSize: 26, subtitle: 'OF APPRECIATION', subtitleFontSize: 12, decoration: 'flourish' },
    signatures: { style: 'line', count: 3 },
    footer: { qrSize: 22, verifiedText: '', showScanHint: false },
  },
  {
    name: 'minimalist-gray',
    displayName: 'Minimalist Gray',
    published: true,
    publishedBy: 'system',
    colors: {
      background: [252, 252, 252],
      primary: [50, 50, 50],
      secondary: [100, 100, 100],
      accent: [70, 70, 70],
      text: [30, 30, 30],
      muted: [130, 130, 130],
      headerBg: [50, 50, 50],
      headerText: [240, 240, 240],
      border: [50, 50, 50],
      borderAccent: [100, 100, 100],
    },
    border: { style: 'single', width: 0.8, accentWidth: 0, cornerRadius: 0, cornerOrnaments: false },
    header: { style: 'minimal', showAbbreviation: true, showLocation: false },
    title: { fontSize: 24, subtitle: 'OF APPRECIATION', subtitleFontSize: 11, decoration: 'line' },
    signatures: { style: 'underline', count: 3 },
    footer: { qrSize: 20, verifiedText: 'VERIFIED BY IIUC-ARMS', showScanHint: false },
  },
];

export function getThemePreset(name: string): CertTheme {
  return THEME_PRESETS.find(t => t.name === name) || DEFAULT_THEME;
}

export function getRoleRecognition(post: string): string {
  const role = (post || '').toLowerCase().trim();
  if (role.includes('president') && !role.includes('vice'))
    return 'leadership, strategic direction, organizational development, and overall contribution to the club and department';
  if (role.includes('vice president') || role === 'vp')
    return 'leadership support, coordination of organizational activities, and dedicated contribution to the club and department';
  if (role.includes('general secretary') && !role.includes('assistant'))
    return 'administrative excellence, coordination, organizational responsibilities, and departmental club development';
  if (role.includes('assistant general secretary') || role === 'ags')
    return 'assistance in administration, coordination, organizational support, and valuable contribution to club activities';
  if (role.includes('office secretary'))
    return 'dedicated administrative support, organizational coordination, and contribution to the smooth operation of club activities';
  if (role.includes('treasurer') || role.includes('finance'))
    return 'financial management, accountability, responsible handling of club resources, and transparent financial operations';
  if (role.includes('event secretary') || role.includes('cultural'))
    return 'event planning, execution, coordination, and successful organization of departmental and club programs';
  if (role.includes('publication') || role.includes('it') || role.includes('media'))
    return 'creative contribution, media management, publication efforts, and strengthening the digital presence of the club';
  if (role.includes('advisor') || role.includes('coordinator'))
    return 'mentorship, academic guidance, supervision, and continuous support for the development of the club and its members';
  if (role.includes('member') || role.includes('executive'))
    return 'active participation, teamwork, support for club programs, and contribution to departmental activities';
  return 'active participation, dedication, and invaluable contribution to the club and department';
}
