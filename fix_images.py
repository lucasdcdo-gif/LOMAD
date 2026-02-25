import re
with open('help_content_original.html', 'r', encoding='utf-8') as f:
    orig = f.read()
with open('help_content.html', 'r', encoding='utf-8') as f:
    fixed = f.read()
orig_images = re.findall(r'src="data:image/png;base64,([^\"]+)"', orig)
fixed_images = re.findall(r'src="data:image/png;base64,([^\"]+)"', fixed)
for i in range(min(len(orig_images), len(fixed_images))):
    if orig_images[i] != fixed_images[i]:
        fixed = fixed.replace(fixed_images[i], orig_images[i])
with open('help_content.html', 'w', encoding='utf-8') as f:
    f.write(fixed)
print('done')
