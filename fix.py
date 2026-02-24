import re

with open('help_content.html', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Strip the HTML boilerplate
part = text.split('<link href="https://fonts.googleapis.com/css2')
if len(part) == 2:
    text = '<link href="https://fonts.googleapis.com/css2' + part[1]

text = text.replace('</head>', '')
text = text.replace('<body>', '<div id="lomad-help-content-root" class="lomad-help-content">')
text = text.replace('</body>', '</div>')
text = text.replace('</html>', '')

# 2. Scope the CSS
def modify_css(match):
    css = match.group(1)
    
    # Clean up the :root, html, body
    css = css.replace(':root', '.lomad-help-content')
    css = css.replace('html {\n      scroll-behavior: smooth;\n    }', '')
    
    # Change body to .lomad-help-content
    css = css.replace('body {', '.lomad-help-content {')
    css = css.replace('body::before', '.lomad-help-content::before')
    
    lines = css.split('\n')
    out = []
    in_media = False
    
    for line in lines:
        stripped = line.strip()
        
        if stripped.startswith('@media'):
            in_media = True
            out.append(line)
            continue
            
        if in_media and stripped == '}':
            in_media = False
            out.append(line)
            continue
            
        # If it's a selector line
        if '{' in line and not stripped.startswith('@') and not stripped.startswith('.lomad-help-content'):
            # It could be a simple selector like `.blob {` or `nav {`
            # Need to prefix with .lomad-help-content
            # It could be multiple selectors separated by comma
            parts = line.split('{')
            selector_str = parts[0]
            brace_and_after = '{' + parts[1]
            
            selectors = [s.strip() for s in selector_str.split(',')]
            new_selectors = []
            for s in selectors:
                if not s:
                    continue
                if s == '*' or s == '*::before' or s == '*::after':
                    new_selectors.append(f'.lomad-help-content {s}')
                elif s.startswith('.lomad-help-content'):
                    new_selectors.append(s)
                else:
                    new_selectors.append(f'.lomad-help-content {s}')
            out.append('    ' + ', '.join(new_selectors) + ' ' + brace_and_after)
        elif stripped.endswith(',') and not in_media:
            # Multi-line selector
            s = stripped[:-1].strip()
            if s == '*' or s == '*::before' or s == '*::after':
                out.append(f'    .lomad-help-content {s},')
            elif s.startswith('.lomad-help-content'):
                out.append(line)
            else:
                out.append(f'    .lomad-help-content {s},')
        else:
            if in_media and '{' in line:
                # Selector inside media query
                parts = line.split('{')
                selector_str = parts[0]
                brace_and_after = '{' + parts[1]
                selectors = [s.strip() for s in selector_str.split(',')]
                new_selectors = []
                for s in selectors:
                    if not s:
                        continue
                    if s.startswith('.lomad-help-content'):
                        new_selectors.append(s)
                    else:
                        new_selectors.append(f'.lomad-help-content {s}')
                out.append('      ' + ', '.join(new_selectors) + ' ' + brace_and_after)
            else:
                out.append(line)
            
    return '<style>\n' + '\n'.join(out) + '\n</style>'

text = re.sub(r'<style>([\s\S]*?)</style>', modify_css, text)

# 3. Fix the observer script
text = text.replace("document.querySelectorAll('.reveal')", "document.querySelectorAll('#lomad-help-content-root .reveal')")

with open('help_content.html', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
