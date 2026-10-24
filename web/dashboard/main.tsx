import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '../shared/styles.css';
import { App } from './app.js';

const element = document.getElementById('root');
if (!element) throw new Error('The application root is missing.');
createRoot(element).render(<App/>);
