import React from 'react';
import ReactDOM from 'react-dom/client';

// Dynamic root mounting
const rootElement = document.getElementById('react-root');
if (rootElement) {
    const ComponentName = rootElement.getAttribute('data-component');

    console.log(`⚛️ React mounting requested for: ${ComponentName}`);

    // Lazy load components based on data attribute
    const components = {
        // 'AboutPage': () => import('./pages/AboutPage'),
        // 'CheckoutForm': () => import('./components/checkout/CheckoutForm'),
    };

    if (components[ComponentName]) {
        components[ComponentName]().then(({ default: Component }) => {
            ReactDOM.createRoot(rootElement).render(
                <React.StrictMode>
                    <Component />
                </React.StrictMode>
            );
            console.log(`✅ React mounted: ${ComponentName}`);
        }).catch(err => {
            console.error(`❌ Failed to load component: ${ComponentName}`, err);
        });
    } else {
        console.warn(`⚠️ Unknown component requested: ${ComponentName}`);
    }
} else {
    console.log('ℹ️ No react-root found on this page.');
}
