declare module 'qrcode' {
  interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    color?: { dark?: string; light?: string };
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCodeToDataURLOptions): Promise<void>;
  export function toString(text: string, options?: QRCodeToDataURLOptions & { type?: 'utf8' | 'svg' }): Promise<string>;
}
