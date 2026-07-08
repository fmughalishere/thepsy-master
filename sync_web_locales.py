
import os
import re
import json

def parse_block(text):
    """Parses a nested JS-like object string into a Python dict."""
    res = {}
    pos = 0
    while pos < len(text):
        # Find next "key":
        match = re.search(r'"([a-zA-Z0-9_]+)":\s*', text[pos:])
        if not match: break
        
        key = match.group(1)
        start_val = pos + match.end()
        
        if start_val < len(text) and text[start_val] == '{':
            # It's an object, find matching brace
            count = 1
            i = start_val + 1
            while i < len(text) and count > 0:
                if text[i] == '{': count += 1
                elif text[i] == '}': count -= 1
                i += 1
            res[key] = parse_block(text[start_val+1:i-1])
            pos = i
        elif start_val < len(text) and text[start_val] == '"':
            # It's a string, find ending quote (handle escaped)
            i = start_val + 1
            while i < len(text):
                if text[i] == '"' and text[i-1] != '\\':
                    break
                i += 1
            res[key] = text[start_val+1:i]
            pos = i + 1
        elif start_val < len(text) and text[start_val] == '[':
             # Handle arrays simply as strings for now
             count = 1
             i = start_val + 1
             while i < len(text) and count > 0:
                 if text[i] == '[': count += 1
                 elif text[i] == ']': count -= 1
                 i += 1
             res[key] = text[start_val:i]
             pos = i
        else:
            # Maybe a number or boolean
            match_val = re.search(r'([^,}]+)', text[start_val:])
            if match_val:
                val = match_val.group(1).strip()
                res[key] = val
                pos = start_val + match_val.end()
            else:
                pos = start_val + 1
                
        # Skip comma and whitespace
        while pos < len(text) and text[pos] in [',', ' ', '\n', '\t', '\r']:
            pos += 1
            
    return res

def sync_dicts(source, target):
    new_dict = {}
    for k, v in source.items():
        if k in target:
            if isinstance(v, dict) and isinstance(target[k], dict):
                new_dict[k] = sync_dicts(v, target[k])
            else:
                new_dict[k] = target[k]
        else:
            if isinstance(v, dict):
                new_dict[k] = sync_dicts(v, {})
            else:
                new_dict[k] = f"TODO: {v}"
    return new_dict

def dict_to_ts(obj, indent=1):
    items = sorted(obj.items())
    if not items: return "{}"
    
    lines = []
    for i, (k, v) in enumerate(items):
        prefix = "    " * (indent + 1) + f'"{k}": '
        suffix = "," if i < len(items) - 1 else ""
        if isinstance(v, dict):
            lines.append(prefix + dict_to_ts(v, indent + 1) + suffix)
        else:
            val_str = json.dumps(v, ensure_ascii=False)
            lines.append(prefix + val_str + suffix)
    
    return "{\n" + "\n".join(lines) + "\n" + "    " * indent + "}"

def process_file(lang, source_dict):
    path = f'c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/{lang}.ts'
    if not os.path.exists(path): return
    
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    start = content.find('{')
    end = content.rfind('}')
    if start == -1 or end == -1: return
    
    target_dict = parse_block(content[start+1:end])
    synced = sync_dicts(source_dict, target_dict)
    
    final_content = f"export const {lang} = {dict_to_ts(synced, 0)};"
    with open(path + '.new', 'w', encoding='utf-8') as f:
        f.write(final_content)
    print(f"Generated {lang}.ts.new")

# Load English
with open('c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/en.ts', 'r', encoding='utf-8') as f:
    en_content = f.read()

en_start = en_content.find('{')
en_end = en_content.rfind('}')
en_dict = parse_block(en_content[en_start+1:en_end])

for l in ['de', 'el', 'hr']:
    process_file(l, en_dict)
