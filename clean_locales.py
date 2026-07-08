
import os
import re

def clean_file(path):
    print(f"Cleaning {path}...")
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    start_idx = content.find('"translation": {')
    if start_idx == -1: start_idx = content.find('translation: {')
    if start_idx == -1: 
        print(f"No translation block found in {path}")
        return
    
    start_idx += content[start_idx:].find('{') + 1
    
    # Brace counting to find where translation block ends
    count = 1
    end_idx = -1
    for j in range(start_idx, len(content)):
        if content[j] == '{': count += 1
        elif content[j] == '}': 
            count -= 1
            if count == 0:
                end_idx = j
                break
    
    if end_idx == -1:
        print(f"Unbalanced braces in {path}")
        return
        
    body = content[start_idx:end_idx]
    
    blocks = {}
    pos = 0
    while pos < len(body):
        # Match "key": {
        match = re.search(r'"([a-zA-Z0-9_]+)":\s*\{', body[pos:])
        if not match: break
        
        key = match.group(1)
        match_start = pos + match.start()
        brace_start = pos + match.end() - 1
        
        # Count braces for this block
        b_count = 1
        b_pos = brace_start + 1
        while b_pos < len(body) and b_count > 0:
            if body[b_pos] == '{': b_count += 1
            elif body[b_pos] == '}': b_count -= 1
            b_pos += 1
        
        match_end = b_pos
        # Look for comma
        while match_end < len(body) and body[match_end] in [' ', ',', '\n', '\t']:
            if body[match_end] == ',':
                match_end += 1
                break
            match_end += 1
            
        block_text = body[match_start:match_end].strip()
        if key not in blocks or len(block_text) > len(blocks[key]):
            blocks[key] = block_text
        
        pos = match_end
        
    lang = os.path.basename(path).split('.')[0]
    final = f"export const {lang} = {{\n    \"translation\": {{\n"
    for k in sorted(blocks.keys()):
        val = blocks[k]
        if not val.endswith(','): val += ','
        final += "        " + val + "\n"
    final += "    }\n};"
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(final)
    print(f"Successfully cleaned {path}. Keys found: {len(blocks)}")

base_path = 'c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/'
for lang in ['en', 'de', 'el', 'hr']:
    p = os.path.join(base_path, f'{lang}.ts')
    if os.path.exists(p):
        clean_file(p)
