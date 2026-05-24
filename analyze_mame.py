import re

with open('public/wasm/mame.js', 'r', encoding='utf-8') as f:
    content = f.read()

print(f'mame.js size: {len(content)} chars')

# Find exported functions (Emscripten style)
# Pattern: "_funcname" as string key
pattern = re.compile(r'"(_[a-zA-Z][a-zA-Z0-9_]{2,60})"')
found = set(pattern.findall(content))
print(f'\nExported symbol names found: {len(found)}')

# Filter interesting ones
keywords = ['lua', 'script', 'manager', 'machine', 'memory', 'read', 'write', 
            'cpu', 'device', 'space', 'ram', 'apple', 'text', 'screen', 'buf',
            'heap', 'ptr', 'addr', 'bridge', 'js_']
interesting = sorted(f for f in found if any(k in f.lower() for k in keywords))
print('Interesting exported symbols:')
for f in interesting[:40]:
    print(' ', f)

# Look for cwrap usage
cwrap_calls = re.findall(r'cwrap\(["\']([^"\']+)["\']', content)
print(f'\ncwrap calls: {len(cwrap_calls)}')
for c in cwrap_calls[:20]:
    print(' ', c)

# Look for Module.asm exports
asm_exports = re.findall(r'b\["(_[a-z][A-Za-z0-9_]{2,40})"\]', content)
unique_asm = sorted(set(asm_exports))
print(f'\nModule.asm exported functions: {len(unique_asm)}')
for f in unique_asm[:30]:
    print(' ', f)

# Look for any EM_JS or EMSCRIPTEN_KEEPALIVE style functions
keepalive = re.findall(r'"(_[a-z][A-Za-z0-9_]{2,60})":\s*function', content)
print(f'\nInline function exports: {len(keepalive)}')
for f in keepalive[:20]:
    print(' ', f)

# Look for 'manager' or 'lua' strings in the file
manager_hits = [m.start() for m in re.finditer(r'manager|lua_|luaL_|LUA', content)]
print(f'\nHits for manager/lua: {len(manager_hits)}')
if manager_hits:
    for pos in manager_hits[:5]:
        print(f'  At {pos}: {repr(content[max(0,pos-20):pos+80])}')
