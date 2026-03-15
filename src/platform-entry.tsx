import { createRoot } from 'react-dom/client';
import App from './App';

export const mount = (element: HTMLElement) => {
  createRoot(element).render(<App />);
};
