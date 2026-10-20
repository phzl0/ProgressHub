"""Build selected CC0 cosmetics from a local source cache; see docs/COSMETICS.md."""
import copy,hashlib,json,re,sys,xml.etree.ElementTree as E
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
cache=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/ph-assets')
out=ROOT/'client/public/cosmetics';out.mkdir(parents=True,exist_ok=True)
E.register_namespace('','http://www.w3.org/2000/svg');E.register_namespace('xlink','http://www.w3.org/1999/xlink')
NS='{http://www.w3.org/2000/svg}';XL='{http://www.w3.org/1999/xlink}'
library={'frames':[],'cards':[],'chats':[]};provenance=[]
def save(name,data,source):
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 provenance.append({'file':name,'source':source,'sha256':hashlib.sha256(data).hexdigest()})
 return '/cosmetics/'+name
materials={'Wood':'Madeira','Stone':'Pedra','Marble':'Mármore','Metal':'Metal','Plastic':'Resina'}
styles=['Clássica','Esculpida','Dupla','Facetada','Entalhada','Relevo']
for material,label in materials.items():
 for i,style in enumerate('ABCDEF'):
  source=next((cache/'portrait').rglob(f'Frame_{style}-{material}_01-256x256.png'))
  im=Image.open(source).convert('RGBA');pixels=im.load()
  for y in range(im.height):
   for x in range(im.width):
    r,g,b,a=pixels[x,y]
    if r>200 and b>200 and g<60:pixels[x,y]=(0,0,0,0)
  import io
  stream=io.BytesIO();im.save(stream,format='PNG',optimize=True)
  id=f'portrait-{material.lower()}-{style.lower()}'
  asset=save(f'frames/{id}.png',stream.getvalue(),'Screaming Brain Studios / '+source.name)
  library['frames'].append({'id':id,'name':f'{label} · {styles[i]}','collection':label,'asset':asset,'source':'portrait'})
# Retain only referenced definitions and one shape from Kenney's SVG atlas.
atlas=E.parse(cache/'fantasy.svg').getroot();byid={n.get('id'):n for n in atlas.iter() if n.get('id')};defs=atlas.find(NS+'defs')
for index in range(30):
 key=f'panel_border_{index:03d}';group=copy.deepcopy(byid[key]);group.attrib.pop('transform',None)
 used=set()
 def dependencies(node):
  for n in node.iter():
   for value in n.attrib.values():
    for id in re.findall(r'(?:^#|url\(#)([\w.-]+)',value):
     if id not in used:
      used.add(id)
      if id in byid:dependencies(byid[id])
 dependencies(group)
 svg=E.Element(NS+'svg',{'viewBox':'-24 -24 48 48','width':'48','height':'48','preserveAspectRatio':'none'})
 d=E.SubElement(svg,NS+'defs')
 for definition in defs:
  if definition.get('id') in used:d.append(copy.deepcopy(definition))
 svg.append(group)
 asset=save(f'panels/fantasy-{index:02d}.svg',E.tostring(svg,encoding='utf-8'),'Kenney Fantasy UI Borders / '+key)
 category='cards' if index<20 else 'chats'
 library[category].append({'id':f'fantasy-{index:02d}','name':f'Arcano {index+1:02d}','collection':'Fantasia','asset':asset,'slice':12,'source':'fantasy'})
card_names=['panel_border_brown','panel_border_brown_detail','panel_border_grey','panel_border_grey_detail','panel_brown_arrows','panel_brown_corners_a','panel_brown_corners_b','panel_brown_damaged','panel_grey_bolts_detail_a','panel_grey_bolts_detail_b']
chat_names=['banner_classic_curtain','banner_hanging','banner_modern','panel_brown_arrows_dark_detail','panel_grey_bolts','panel_grey_bolts_dark']+card_names[:6]
labels={'panel_border_brown':'Madeira robusta','panel_border_brown_detail':'Madeira entalhada','panel_border_grey':'Aço polido','panel_border_grey_detail':'Aço gravado','panel_brown_arrows':'Guia do viajante','panel_brown_corners_a':'Cantos de carvalho','panel_brown_corners_b':'Carvalho reforçado','panel_brown_damaged':'Madeira antiga','panel_grey_bolts_detail_a':'Oficina de aço','panel_grey_bolts_detail_b':'Fortaleza','banner_classic_curtain':'Estandarte clássico','banner_hanging':'Estandarte suspenso','banner_modern':'Estandarte moderno','panel_brown_arrows_dark_detail':'Diário de expedição','panel_grey_bolts':'Painel rebitado','panel_grey_bolts_dark':'Aço noturno'}
for category,names in [('cards',card_names),('chats',chat_names)]:
 for name in names:
  source=cache/f'ui/ui-pack-adventure/Vector/{name}.svg';svg=E.parse(source).getroot();w=float(svg.get('width'));h=float(svg.get('height'));svg.set('viewBox',f'0 0 {w:g} {h:g}');svg.set('preserveAspectRatio','none')
  asset=save(f'panels/adventure-{name}.svg',E.tostring(svg,encoding='utf-8'),'Kenney UI Pack Adventure / '+name)
  library[category].append({'id':'adventure-'+name,'name':labels[name],'collection':'Aventura' if 'brown' in name or 'banner' in name else 'Industrial','asset':asset,'slice':12,'source':'adventure'})
for style,label in [('blade','Lâmina'),('large','Comando'),('notch','Encaixe'),('small','Terminal')]:
 for screws in ['', '_screws']:
  name=f'button_square_header_{style}_rectangle{screws}';source=cache/f'ui/ui-pack-sci-fi/Vector/Grey/{name}.svg';svg=E.parse(source).getroot();svg.set('viewBox','0 0 192 64');svg.set('preserveAspectRatio','none')
  asset=save(f'panels/scifi-{name}.svg',E.tostring(svg,encoding='utf-8'),'Kenney UI Pack Sci-Fi / Grey / '+name)
  library['chats'].append({'id':'scifi-'+style+screws,'name':label+(' · Rebites' if screws else ' · Liso'),'collection':'Tecnológica','asset':asset,'slice':'20 24','source':'scifi'})
assert all(len(items)==30 for items in library.values())
for path in [ROOT/'client/src/components/Community/cosmeticLibrary.json',ROOT/'server/services/community/cosmetic-library.json']:
 path.write_text(json.dumps(library,ensure_ascii=False,indent=2)+'\n')
(out/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
licenses=out/'licenses';licenses.mkdir(exist_ok=True)
for name,source in [('portrait',cache/'portrait/License.txt'),('fantasy',cache/'fantasy-ui-borders-license.txt'),('adventure',cache/'ui/ui-pack-adventure/License.txt'),('scifi',cache/'ui-pack-sci-fi-license.txt')]:
 (licenses/f'{name}.txt').write_text(source.read_text())
print({key:len(value) for key,value in library.items()});print('Assets bytes:',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()))
