import React from 'react';

function AiroErrorBoundary({ children }: { children?: React.ReactNode; captureGlobalErrors?: boolean }) {
  return <>{children}</>;
}

export default AiroErrorBoundary;
