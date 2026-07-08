
import os
import re

def analyze_keys(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all strings that look like "key": {
    # but only if they are preceded by ANY amount of whitespace and at the Start of Line
    matches = list(re.finditer(r'^\s+"([a-zA-Z0-9_]+)":\s*\{', content, re.MULTILINE))
    
    keys = {}
    for m in matches:
        k = m.group(1)
        keys[k] = keys.get(k, 0) + 1
    
    print(f"File: {file_path}")
    print(f"Total keys found: {len(matches)}")
    print(f"Unique keys: {len(keys)}")
    for k, count in sorted(keys.items()):
        if count > 1:
            print(f"  DUPLICATE: {k} (found {count} times)")

analyze_keys('c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/en.ts')
