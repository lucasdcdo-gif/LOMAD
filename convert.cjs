const fs = require('fs');

let html = fs.readFileSync('help_content_New.html', 'utf8');

// Extract CSS
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const cssContent = styleMatch ? styleMatch[1] : '';

// Extract Body
let bodyMatch = html.match(/<body>([\s\S]*?)<script>/);
let bodyContent = bodyMatch ? bodyMatch[1] : '';

// Convert classes
bodyContent = bodyContent.replace(/class=/g, 'className=');

// Convert inline styles to React style objects
bodyContent = bodyContent.replace(/style="([^"]*)"/g, (m, p1) => {
  if (!p1.trim()) return m;
  const obj = {};
  p1.split(';').forEach(rule => {
    if (!rule.trim()) return;
    const parts = rule.split(':');
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join(':').trim();
      const camelK = k.replace(/-([a-z])/g, g => g[1].toUpperCase());
      obj[camelK] = v;
    }
  });
  return 'style={' + JSON.stringify(obj) + '}';
});

// Convert SVG self-closing tags and attributes
bodyContent = bodyContent.replace(/stroke-width/g, 'strokeWidth');
bodyContent = bodyContent.replace(/stroke-linecap/g, 'strokeLinecap');
bodyContent = bodyContent.replace(/viewBox/g, 'viewBox');

// Close any open img tags or br tags if they exist
bodyContent = bodyContent.replace(/<img(.*?)>/g, (m, p1) => {
  if (p1.endsWith('/')) return m;
  return `<img${p1} />`;
});
bodyContent = bodyContent.replace(/<br>/g, '<br />');


const componentCode = `import React, { useEffect } from 'react';

export const HelpGuide = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    
    reveals.forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = (i * 0.06) + 's';
      io.observe(el);
    });

    const bar = document.getElementById('progressBar');
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const scrolled = target.scrollTop;
      const total = target.scrollHeight - target.clientHeight;
      if (bar) bar.style.width = (scrolled / total * 100) + '%';
    };
    
    const scrollContainer = document.getElementById('help-scroll-container');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    const tabs = document.querySelectorAll('.nav-tab');
    const sections = ['sec-manual','sec-bot','sec-rename','sec-chat','sec-auto'];

    function updateActiveTabs() {
      if (!scrollContainer) return;
      let current = sections[0];
      sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Adjust offset based on container position
          const containerRect = scrollContainer.getBoundingClientRect();
          if (rect.top - containerRect.top <= 140) current = id;
        }
      });
      tabs.forEach(tab => {
        const sec = tab.getAttribute('data-section');
        tab.classList.toggle('active', sec === current);
      });
    }

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', updateActiveTabs, { passive: true });
      updateActiveTabs();
    }
    
    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
        scrollContainer.removeEventListener('scroll', updateActiveTabs);
      }
      io.disconnect();
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#070c18', color: '#e2e8f0', fontFamily: "'Sora', system-ui, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: \`
        ${cssContent}
        
        .nav-close-btn {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }
        .nav-close-btn:hover {
          background: rgba(255,255,255,0.2);
        }
      \` }} />
      
      <div id="help-scroll-container" style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth' }}>
        ${bodyContent}
      </div>
      
      <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 10000 }}>
        <button className="nav-close-btn" onClick={onClose} aria-label="Fechar">
           ✕
        </button>
      </div>
    </div>
  );
};
`;

fs.writeFileSync('components/NewHelpGuide.tsx', componentCode);
console.log('Conversion successful!');
