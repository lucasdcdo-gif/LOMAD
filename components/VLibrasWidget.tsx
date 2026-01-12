import React, { useEffect } from 'react';

declare global {
    interface Window {
        VLibras: any;
    }
}

export const VLibrasWidget: React.FC = () => {
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
        script.async = true;
        script.onload = () => {
            // @ts-ignore
            new window.VLibras.Widget('https://vlibras.gov.br/app');
        };
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    return (
        <div className="vlibras-widget-wrapper">
            <div dangerouslySetInnerHTML={{
                __html: `
        <div enabled="true" src="https://vlibras.gov.br/app" class="vlibras-widget">
          <div class="vlibras-widget-button"></div>
        </div>
      `}} />
        </div>
    );
};
