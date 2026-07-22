import type { ReactNode } from "react";

type AiroErrorBoundaryProps = {
  children: ReactNode;
};

export default function AiroErrorBoundary({ children }: AiroErrorBoundaryProps) {
  return <>{children}</>;
}
