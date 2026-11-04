"""Inspect local font names only; never copy installed fonts into public assets."""
import os, struct, json
from pathlib import Path
roots = ['C:/Windows/Fonts', 'C:/Program Files', 'C:/Program Files (x86)', 'C:/Users/Aestus', 'D:/']
skip = {'node_modules', '.git', 'WinSxS', 'Temp', 'Code Cache', 'GPUCache'}
seen=set(); hits=[]; count=0
def names(data, base=0):
    if data[base:base+4] not in (b'\x00\x01\x00\x00', b'OTTO', b'true'): return []
    for i in range(struct.unpack_from('>H',data,base+4)[0]):
        record=base+12+i*16
        if data[record:record+4] != b'name': continue
        offset=struct.unpack_from('>I',data,record+8)[0]
        _,n,start=struct.unpack_from('>HHH',data,offset)
        result=[]
        for j in range(n):
            platform,encoding,language,kind,length,where=struct.unpack_from('>HHHHHH',data,offset+6+j*12)
            if kind in (1,4,6,16):
                raw=data[offset+start+where:offset+start+where+length]
                result.append(raw.decode('utf-16-be' if platform in (0,3) else 'latin1',errors='replace'))
        return sorted(set(result))
    return []
for root in roots:
    for directory, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in skip and not os.path.islink(os.path.join(directory,d))]
        for f in files:
            if Path(f).suffix.lower() not in ('.ttf','.otf','.ttc','.hft'): continue
            path=Path(directory)/f
            key=str(path).lower()
            if key in seen: continue
            seen.add(key); count+=1
            try:
                data=path.read_bytes()
                bases=[struct.unpack_from('>I',data,12+i*4)[0] for i in range(struct.unpack_from('>I',data,8)[0])] if data[:4]==b'ttcf' else [0]
                ns=[data[44:104].split(b'\0')[0].decode('johab',errors='replace')] if path.suffix.lower()=='.hft' else sorted(set(n for base in bases for n in names(data,base)))
                if any(term in (' '.join(ns)+' '+f).lower() for term in ('신명','디나루','견명조','태고딕','hwp','batang','sinmy','dinar','myeong','h2mj','hymj')):
                    hits.append({'path':str(path),'names':ns,'format':path.suffix.lower()})
            except (OSError,struct.error,IndexError): pass
Path('analysis').mkdir(exist_ok=True)
Path('analysis/font-search.json').write_text(json.dumps({'scanned':count,'hits':hits},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'scanned':count,'matches':len(hits),'report':'analysis/font-search.json'},ensure_ascii=False))
