declare module 'react-file-viewer' {
  import type { ComponentType, ReactNode } from 'react';

  interface FileViewerProps {
    fileType: string;
    filePath: string;
    onError?: (error: unknown) => void;
    errorComponent?: ReactNode;
    unsupportedComponent?: ReactNode;
  }

  const FileViewer: ComponentType<FileViewerProps>;
  export default FileViewer;
}
