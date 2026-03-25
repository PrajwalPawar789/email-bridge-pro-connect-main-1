import { createRoot } from 'react-dom/client';
import CustomDomainApp from '@/custom-domain/CustomDomainApp';

export const mount = (element: HTMLElement) => {
  createRoot(element).render(<CustomDomainApp />);
};
