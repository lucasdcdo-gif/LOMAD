const fs = require('fs');
let content = fs.readFileSync('help_content.html', 'utf8');

// 1. Remove doctype, html, head, body tags
content = content.replace(/<!DOCTYPE html>/i, '');
content = content.replace(/<html[^>]*>/i, '');
content = content.replace(/<\/html>/i, '');
content = content.replace(/<head>[\s\S]*?<\/head>/i, function (match) {
    const links = match.match(/<link[^>]*>/g) || [];
    const styles = match.match(/<style>[\s\S]*?<\/style>/i) || [''];
    return links.join('\n') + '\n' + styles[0];
});
content = content.replace(/<body>/i, '<div id="lomad-help-content-root" class="lomad-help-content">');
content = content.replace(/<\/body>/i, '</div>');

// 2. Wrap all CSS inside .lomad-help-content
let styleMatch = content.match(/<style>([\s\S]*?)<\/style>/i);
if (styleMatch) {
    let css = styleMatch[1];

    // Scoping simple selectors
    let rules = css.split('}');
    let scopedCss = '';

    for (let rule of rules) {
        if (!rule.trim()) continue;
        let parts = rule.split('{');
        if (parts.length === 2) {
            let selector = parts[0];
            let body = parts[1];

            // Skip @ rules
            if (selector.trim().startsWith('@')) {
                if (selector.trim().startsWith('@media')) {
                    // inside @media we need another level of parsing
                    body = body.replace(/nav\s*\{/g, '.lomad-help-content nav {');
                    body = body.replace(/\.hero\s*\{/g, '.lomad-help-content .hero {');
                    body = body.replace(/\.step-card\s*\{/g, '.lomad-help-content .step-card {');
                    body = body.replace(/\.step-info\s*\{/g, '.lomad-help-content .step-info {');
                    body = body.replace(/\.step-visual\s*\{/g, '.lomad-help-content .step-visual {');
                    body = body.replace(/\.pro-banner-inner\s*\{/g, '.lomad-help-content .pro-banner-inner {');
                    body = body.replace(/\.pro-cta\s*\{/g, '.lomad-help-content .pro-cta {');
                    body = body.replace(/footer\s*\{/g, '.lomad-help-content footer {');
                }
                scopedCss += selector + '{' + body + '}';
                continue;
            }

            if (selector.includes(':root') || selector.includes('body') && !selector.includes('body::before')) {
                scopedCss += selector.replace(':root', '.lomad-help-content').replace('body', '.lomad-help-content') + '{' + body + '}';
                continue;
            }

            if (selector.includes('body::before')) {
                scopedCss += selector.replace('body::before', '.lomad-help-content::before') + '{' + body + '}';
                continue;
            }

            if (selector.includes('html')) {
                continue; // Strip html {}
            }

            // Prepend .lomad-help-content to all other selectors
            let subSelectors = selector.split(',');
            let newSubSelectors = [];
            for (let sub of subSelectors) {
                let t = sub.trim();
                if (!t || t.startsWith('.lomad-help-content')) {
                    newSubSelectors.push(sub);
                    continue;
                }
                if (t.includes('*,') || t === '*' || t === '*::before' || t === '*::after') {
                    newSubSelectors.push('.lomad-help-content ' + t);
                    continue;
                }
                newSubSelectors.push('.lomad-help-content ' + t);
            }
            scopedCss += newSubSelectors.join(', ') + ' {' + body + '}';
        } else {
            scopedCss += rule + '}';
        }
    }

    // Some additional manual fixes because `body` replaced above might miss padding
    scopedCss += `
  .lomad-help-content {
      position: relative;
  }
  `;

    content = content.replace(/<style>([\s\S]*?)<\/style>/i, '<style>\n' + scopedCss + '\n</style>');
}

// 3. Fix the IntersectionObserver in script
content = content.replace(/document\.querySelectorAll\('\\\.reveal'\)/g, "document.querySelectorAll('#lomad-help-content-root .reveal')");

fs.writeFileSync('help_content_fixed.html', content);
console.log('Fixed HTML generated');
