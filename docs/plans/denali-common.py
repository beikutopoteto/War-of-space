"""第6節の段階別作戦図。入力: denali-dump.cjs が取り出す denali.json。
ゲームは進めず、初期位置と計画進路を描く。交戦後の損耗・位置は仮定しない。
岩の周囲は7 px/単位、遠方の空白は圧縮（図中にも明記）。
北守備隊: sim.js umbrellaPack/umbrellaAI が start:'ignite' より先に適用される。
起爆後: nukeFire/stepNukes、packTurn、槍の breakOff は別々の条件。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import os, json, math, re
from functools import lru_cache
HERE=os.path.dirname(os.path.abspath(__file__))
J=json.load(open(os.path.join(HERE,'denali.json'))); O=J['operation']
MW,PW,H=1400,480,1800; W=MW+PW
FONT='/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'
BG=(10,16,28); PANEL=(16,20,30); WHITE=(235,240,245); TXT=(220,225,232); GREY=(155,165,180)
RED=(240,90,70); RL=(255,150,130); BLUE=(100,185,250); BL=(150,210,255)
GOLD=(255,210,115); GREEN=(90,190,155); GL=(150,235,200); OTHER=(155,165,190)
@lru_cache(None)
def F(n): return ImageFont.truetype(FONT,n)
def width(t,n): return F(n).getlength(t)
def fade(c,active): return c if active else tuple(round(v*.39) for v in c)
def X(x): return 700+math.copysign(7*min(abs(x),60)+1.6*max(0,abs(x)-60),x)
def Z(z): return 500+7*z if -55<=z<=60 else (115+(z+55)*1.3 if z< -55 else 920+(z-60)*1.5)
def P(x,z): return (X(x),Z(z))
def vec(f): return [f['pos'][0], f.get('alt',0), f['pos'][1]]
def center(fs):
 n=sum(f['n'] for f in fs)
 return tuple(sum(vec(f)[k]*f['n'] for f in fs)/n for k in range(3))
def comp(fs):
 out={}
 for f in fs:
  for k,n in f.get('comp',{f.get('type','?'):f['n']}).items(): out[k]=out.get(k,0)+n
 return out
CLASSES={'bb':'戦艦','cl':'巡洋','ff':'フリゲート','dd':'駆逐','cv':'コルベット','cvb':'戦闘母艦','mas':'突撃揚陸'}
def breakdown(fs): return '・'.join(CLASSES.get(k,k)+str(n) for k,n in comp(fs).items())
PACKS={p['name']:p for p in O['packs']}
EN={f['name']:f for f in O['enemies']}; ALLIES=O['allies']
def members(name): return [EN[n] for n in PACKS[name]['fleets']]
GROUPS={k:members(k) for k in ['西の拠点','中の拠点','東の拠点','西上守備隊','東下守備隊','北守備隊','霧と鎚']}
for name in ['槍1','槍2']:
 fs=members(name)
 for k in range(2): GROUPS[name+('左' if name=='槍1' and k==0 else '右' if name=='槍1' else '東下' if k==0 else '北上')]=fs[k*3:k*3+3]
for side in ['左上','右下']: GROUPS['陽動'+side]=[f for f in ALLIES if f.get('feint')==side]
GROUPS['第29支隊']=[f for f in ALLIES if f['name'].startswith('第29 ')]
GROUPS['第30支隊']=[f for f in ALLIES if f['name'].startswith('第30 ')]
GROUPS['本軍']=[f for f in ALLIES if f.get('nuke')]
assert sum(f['n'] for f in O['enemies'] if not f.get('fixed') and '砲台' not in f['name'])==74
SURFACE=[f for f in J['fleets'] if f.get('fixed')]
assert sum('砲台' in f['name'] for f in SURFACE)==10
assert sum('推進器' in f['name'] for f in SURFACE)==12
# 実メッシュの三角形を真上に投影して合成する。点の凸包や角度別の点列では、
# 鉱山の縁や同じ方位の三角形を拾って輪郭がギザギザになるため、面を使う。
BODY_MASK=Image.new('L',(500,500),0)
bd=ImageDraw.Draw(BODY_MASK)
for i in range(0,len(J['vertices']),3):
 tri=J['vertices'][i:i+3]
 if len(tri)==3: bd.polygon([(250+v[0]*7,250+v[2]*7) for v in tri],fill=255)
BODY_EDGE=ImageChops.subtract(BODY_MASK.filter(ImageFilter.MaxFilter(3)),BODY_MASK)

def wrap(text,n,mw):
 toks=re.findall(r'W\.A\.S\.|[A-Za-z0-9:.%＋−]+|.',text); lines=[]; line=''
 for t in toks:
  if width(line+t,n)>mw and line and t not in '、。）」』・': lines.append(line); line=t.lstrip()
  else: line+=t
 if line: lines.append(line)
 return lines

class Chart:
 def __init__(self,side,phase):
  self.side,self.phase=side,phase
  self.im=Image.new('RGB',(W,H),BG); self.d=ImageDraw.Draw(self.im,'RGBA'); self.boxes=[]
 def label(self,x,y,lines,c=TXT,n=16,anchor='l',bg=True,check=True):
  if isinstance(lines,str): lines=[lines]
  w=max(width(t,n) for t in lines); h=len(lines)*(n+6)
  if anchor=='r': x-=w
  if anchor=='m': x-=w/2
  box=(x-4,y-3,x+w+4,y+h+1)
  if check:
   assert box[0]>=0 and box[2]<MW and box[1]>=0 and box[3]<H, ('map label outside',lines,box)
   self.boxes.append((box,lines))
  if bg: self.d.rectangle(box,fill=(*BG,232))
  for i,t in enumerate(lines): self.d.text((x,y+i*(n+6)),t,font=F(n),fill=c)
  return box
 def leader(self,pt,xy,lines,c=TXT,n=16,anchor='l'):
  if isinstance(lines,str): lines=[lines]
  w=max(width(t,n) for t in lines); x,y=xy
  left=x-(w if anchor=='r' else w/2 if anchor=='m' else 0)
  dest=(max(left,min(left+w,pt[0])),y+9)
  self.d.line([pt,((pt[0]+dest[0])/2,dest[1]),dest],fill=(*c,140),width=1)
  return self.label(x,y,lines,c,n,anchor)
 def dash(self,a,b,c,w=2,on=10,off=7):
  L=math.dist(a,b)
  for t in range(0,math.ceil(L),on+off):
   u=min(L,t+on)
   if not L: continue
   self.d.line([(a[0]+(b[0]-a[0])*t/L,a[1]+(b[1]-a[1])*t/L),(a[0]+(b[0]-a[0])*u/L,a[1]+(b[1]-a[1])*u/L)],fill=c,width=w)
 def arrow(self,points,c,w=4,dash=False,hollow=False):
  # 刻みを入れて、空白を圧縮した座標系でも経由点を飛ばさない。
  pts=[]
  for a,b in zip(points,points[1:]):
   for k in range(17):
    t=k/16; pts.append(P(a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
  for a,b in zip(pts,pts[1:]):
   if dash: self.dash(a,b,(*c,220),w,on=5,off=4)
   else: self.d.line([a,b],fill=(*c,220),width=w)
  a,b=pts[-4],pts[-1]; ang=math.atan2(b[1]-a[1],b[0]-a[0]); s=16
  tri=[b,(b[0]-s*math.cos(ang-.4),b[1]-s*math.sin(ang-.4)),(b[0]-s*math.cos(ang+.4),b[1]-s*math.sin(ang+.4))]
  if hollow: self.d.line(tri+[tri[0]],fill=c,width=2)
  else: self.d.polygon(tri,fill=c)
 def dot(self,p,c,kind='tri',size=9):
  x,y=p; d=self.d
  if kind=='tri': d.polygon([(x-size,y-size*.65),(x+size,y-size*.65),(x,y+size)],fill=c)
  elif kind=='square': d.rectangle((x-size,y-size*.65,x+size,y+size*.65),fill=c,outline=(*WHITE,130),width=1)
  elif kind=='diamond': d.polygon([(x,y-size),(x+size,y),(x,y+size),(x-size,y)],fill=c,outline=GL)
  elif kind=='thr': d.ellipse((x-size,y-size,x+size,y+size),fill=c,outline=(*WHITE,150),width=1)
 def base(self):
  d=self.d
  # 円のゲーム座標を同じ写像で描く（遠方では空白を圧縮した外縁になる）。
  for z,c in [(300,(36,53,73)),(140,(49,77,103))]:
   points=[P(215*math.cos(a*math.pi/180),z+215*math.sin(a*math.pi/180)) for a in range(361)]
   d.line(points,fill=c,width=2)
  self.label(18,10,'↑ 北（デナリの裏）　南: 地球連合の来る側',WHITE,18)
  self.label(18,42,'真上から。岩の周囲を拡大し、遠方の空白を圧縮した模式図',GREY,15)
  self.label(18,66,'記号は初期位置・初期兵力。矢印は計画進路（交戦後は変動）',GREY,15)
  self.im.paste((48,52,61),(450,250),BODY_MASK)
  self.im.paste((120,134,150),(450,250),BODY_EDGE)
  self.label(665,372,'デナリ',GREY,19,anchor='m')
  # 出撃域はゲームの半径60。画面の圧縮に合わせた投影。
  cx,cz=O['deploy']; r=J.get('deployRadius',60)
  pts=[P(cx+r*math.cos(a*math.pi/180),cz+r*math.sin(a*math.pi/180)) for a in range(361)]
  d.polygon(pts,fill=(255,210,115,10)); d.line(pts,fill=(*GOLD,120),width=2)
  self.label(700,1540,['プレイヤーの出撃域（上限60隻）','中心 [0,330]・半径60。配置はプレイヤーが決める'],GOLD,16,anchor='m')
  self.leader(P(cx,cz),(700,1515),'出撃域',GOLD,14,'m')
  self.label(16,1598,'作戦フィールド: 暗い外縁＝開始 [0,300]／明るい外縁＝接近後 [0,140]（半径215）',GREY,14)
 def surface(self):
  # 砲台の番号は実名の第1〜6と宇宙港1〜4（図では⑦〜⑩）。
  gunlabels=[(360,620),(560,741),(390,343),(315,391),(922,405),(835,313),(905,740),(955,780),(1010,820),(1060,860)]
  thrlabels={'西1':(280,463),'西2':(280,503),'西3':(280,543), '西の上1':(575,426),'西の上2':(575,474),'西の上3':(575,522),
             '東1':(925,562),'東2':(925,602),'東3':(925,515), '北1':(602,250),'北2':(700,219),'北3':(790,250)}
  occupied=[]
  def symbol_pos(p):
   for dx,dy in [(0,0),(-13,-9),(13,9),(-13,12),(14,-13),(-24,0),(0,24),(25,10)]:
    q=(p[0]+dx,p[1]+dy)
    if all(math.dist(q,r)>=15 for r in occupied):
     occupied.append(q)
     if q!=p: self.d.line([p,q],fill=(*GREY,180),width=1)
     return q
   raise ValueError(('surface icons too close',p))
  guns=[f for f in SURFACE if '砲台' in f['name']]
  for i,(f,xy) in enumerate(zip(guns,gunlabels)):
   p=symbol_pos(P(f['pos'][0],f['pos'][2])); self.dot(p,GREEN,'diamond',6)
   self.leader(p,xy,'砲'+chr(0x2460+i),GL,15)
  for f in SURFACE:
   if '推進器 ' not in f['name']: continue
   n=f['name'].split(' ',1)[1]; restoring=n.startswith(('東','北')); c=GOLD if restoring else OTHER
   p=symbol_pos(P(f['pos'][0],f['pos'][2])); self.dot(p,c,'thr',6)
   self.leader(p,thrlabels[n],n.replace('西の上','西上'),c,14)
  mx,my,mz=J['mine']; p=P(mx,mz); x,y=p
  self.d.ellipse((x-15,y-15,x+15,y+15),outline=GOLD,width=2); self.d.ellipse((x-5,y-5,x+5,y+5),outline=GOLD,width=2)
  self.leader(p,(550,647),['鉱山の底 ◎','着底の輪: 半径6'],GOLD,15,'r')
  port=next(f for f in SURFACE if f['name']=='宇宙港'); p=P(port['pos'][0],port['pos'][2]); x,y=p
  self.d.rectangle((x-13,y-9,x+13,y+9),outline=BL,width=2)
  self.leader(p,(790,910),['宇宙港','W.A.S. 40機'],BL,16)
 def groups(self,active):
  placements={'北守備隊':(835,96),'槍2北上':(1050,199),'西上守備隊':(24,648),'東下守備隊':(1130,640),
   '槍2東下':(1145,442),'霧と鎚':(345,846),'西の拠点':(136,1017),'中の拠点':(700,1012),'東の拠点':(1150,1010),
   '槍1左':(24,1188),'槍1右':(1170,1193),'陽動左上':(24,1422),'陽動右下':(1130,1422),
   '第29支隊':(360,1230),'第30支隊':(960,1262),'本軍':(700,1451)}
  for name,fs in GROUPS.items():
   earth=fs[0] in ALLIES; basecol=BL if earth else RL; c=fade(basecol,name in active); textcol=basecol if name in active else tuple(round(v*.63) for v in basecol); x,y,z=center(fs); p=P(x,z)
   for f in fs:
    a,b=P(f['pos'][0],f['pos'][1]); self.d.ellipse((a-3,b-3,a+3,b+3),fill=c)
   self.dot(p,c,'square' if earth else 'tri',10 if name!='本軍' else 13)
   n=sum(f['n'] for f in fs)
   name0={'槍1左':'槍1（西・下）','槍1右':'槍1（東・上）','槍2東下':'槍2（東下）','槍2北上':'槍2（北・上）','陽動左上':'左上の陽動','陽動右下':'右下の陽動'}.get(name,name)
   text=[f'{name0}　{n}隻']
   if name=='本軍': text=['核を積む戦艦 5隻（第1:3／第2:2）','同隊の巡洋4・フリゲート4（計13隻）']
   elif name=='北守備隊': text+=['起爆前も砲台の傘内で迎撃']
   elif name=='霧と鎚': text+=['突撃揚陸6・重巡洋2']
   elif name.startswith('槍2'): text+=['フリゲート1・突撃揚陸3']
   elif name.startswith('槍1'): text+=['フリゲート2・突撃揚陸1・駆逐3']
   elif name.startswith('陽動'): text+=['巡洋12・駆逐12・護衛12・母艦4']
   elif name=='第29支隊': text+=['巡洋3・駆逐3']
   elif name=='第30支隊': text+=['フリゲート4・コルベット2']
   elif name.endswith('拠点'): text+=[breakdown(fs).replace('巡洋','重巡洋')]
   else: text+=['フリゲート3・重巡洋4・突撃揚陸2']
   anchor='m' if name in ['本軍','中の拠点','西の拠点','東の拠点'] else 'l'
   self.leader(p,placements[name],text,textcol,15,anchor)
 def legend(self):
  # februaria-mars と同じ2列。実際に描く記号・矢印と対応させる。
  sidecol=BL if self.side=='earth' else RL; other=RL if self.side=='earth' else BL
  rows=[('line',sidecol,'この段で動く隊'),('tri',fade(sidecol,False),'もう場にいる隊（▲共和国／■地球）'),('line',other,'相手の動き（予想）'),('dash',GOLD,'核を積む戦艦の道／条件分岐'),
        ('dia',GREEN,'新設砲台①〜⑩（⑦〜⑩は宇宙港砲台）'),('thr',GOLD,'戻せる推進器: 東・北 各3基'),('thr',OTHER,'他の推進器: 西・西上 各3基'),('hollow',GREY,'条件が成立したときの退き方')]
  for i,(kind,c,t) in enumerate(rows):
   x=18+(i//4)*690; y=1632+(i%4)*25
   if kind=='line': self.d.line((x,y+9,x+34,y+9),fill=c,width=5)
   elif kind=='dash': self.dash((x,y+9),(x+34,y+9),c,3)
   elif kind=='tri': self.dot((x+16,y+8),c,'tri',8)
   elif kind=='dia': self.dot((x+16,y+8),c,'diamond',6)
   elif kind=='thr': self.dot((x+16,y+8),c,'thr',6)
   else:
    self.d.line((x,y+9,x+27,y+9),fill=c,width=2); self.d.line([(x+20,y+3),(x+34,y+9),(x+20,y+15)],fill=c,width=2)
   self.d.text((x+44,y),t,font=F(15),fill=TXT)
  self.label(18,1737,'①〜⑧は出来事の順。応援（条件A）と核3隻喪失（条件B）は、時刻に関係なく発生する。',GREY,14)
  self.label(18,1762,'槍1・槍2・霧と鎚は資料上の呼び名。太線は計画の方向を示し、交戦中の航跡ではない。',GREY,14)
 def panel(self,title,when,sections):
  d=self.d; x=MW+22; y=18; mw=PW-44
  d.rectangle((MW,0,W,H),fill=PANEL); d.line((MW,0,MW,H),fill=(90,66,66),width=2)
  d.text((x,y),'地球連合　ウォン中将の作戦説明' if self.side=='earth' else '惑星共和国　守備の作戦説明',font=F(16),fill=BL if self.side=='earth' else RL); y+=31
  d.text((x,y),'第6節　デナリ破砕',font=F(16),fill=GREY); y+=31
  d.text((x,y),f'第{self.phase}段　{title}',font=F(29),fill=WHITE); y+=48
  for l in wrap(when,18,mw): d.text((x,y),l,font=F(18),fill=GOLD); y+=27
  y+=16
  cols=[(255,180,120),RL,GOLD,GL,(255,115,125),BL]
  assert len(sections)==6
  for (heading,items),c in zip(sections,cols):
   d.rectangle((x,y+4,x+6,y+22),fill=c); d.text((x+13,y),heading,font=F(20),fill=c); y+=32
   for it in items:
    literal=it.startswith('|'); it=it.lstrip('|')
    for i,l in enumerate(wrap(it,19,mw-24)):
     d.text((x+6 if i==0 else x+22,y),('' if literal or i else '・')+l,font=F(19),fill=TXT); y+=28
    y+=5
   y+=17
  assert y<1485, ('panel overflow',self.side,self.phase,y)
  self.clock_card()
  self.timeline()
  return y
 def clock_card(self):
  d=self.d; x=MW+22; y=1180; right=W-22
  d.rounded_rectangle((x-5,y-8,right+2,1468),radius=8,fill=(23,29,42),outline=(65,77,96),width=1)
  d.text((x+6,y+5),'この図の時計と合図',font=F(18),fill=GOLD)
  rows={
   1:[('①13:00／0分','陽動は両側へ。核の戦艦は後ろで待機。'),
      ('13:01／1分','作戦フィールドが北へ滑り始める。'),
      ('②14:00／60分','槍1が待機中の戦艦を狙う。'),
      ('③T／70〜120分','14:10〜15:00。条件成立か、時刻で移乗。')],
   2:[('③T／70〜120分','14:10〜15:00。移乗に8分かける。'),
      ('④T＋8／78〜128分','14:18〜15:08に降下開始（通常の枝）。'),
      ('⑤最初の着底／時刻不定','霧と鎚が動く。着底した艦は動けない。'),
      ('⑥全生存艦の着底＋15分','起爆は1回。降下中の艦が尽きてから数える。')],
   3:[('⑦起爆 F／時刻不定','3隻以上なら破砕して、その場で決着。'),
      ('条件B／起爆前の核3隻喪失','陽動と槍2が攻撃・守備へ切り替わる。'),
      ('18:30／330分','破砕も誘導推進器の全滅もなければ敗北。'),
      ('⑧21:00／480分','通常の陽動の離脱設定。現行期限の後。')]
  }[self.phase]
  yy=y+42
  for heading,desc in rows:
   d.text((x+7,yy),heading,font=F(16),fill=WHITE)
   for l in wrap(desc,14,PW-66):
    d.text((x+13,yy+25),l,font=F(14),fill=GREY)
   yy+=53
 def timeline(self):
  d=self.d;x=MW+22;y=1510;w=PW-44
  d.line((x,y-12,W-22,y-12),fill=(75,82,95),width=1)
  d.text((x,y),'時の流れ（13:00 起点／作戦の時計）',font=F(15),fill=TXT);y+=30
  names=['陽動','移乗 → 降下 → 起爆','起爆後']; lengths=[.28,.44,.28]; colors=[(90,160,220),(225,168,75),(170,75,85)]; xx=x
  for i,(nm,k,c) in enumerate(zip(names,lengths,colors)):
   ww=w*k; active=i+1==self.phase
   d.rectangle((xx,y,xx+ww-2,y+31),fill=c if active else fade(c,False),outline=WHITE if active else None,width=2)
   d.text((xx+(ww-width(nm,14))/2,y+7),nm,font=F(14),fill=(15,22,32) if active else TXT); xx+=ww
  y+=44
  for l in ['合図 T: 14:10〜15:00（70〜120分）','降下: T＋8分／起爆 F: 全生存艦着底＋15分','帯は段の順序。長さは所要時間を表さない。']:
   d.text((x,y),l,font=F(13),fill=GREY); y+=23
  y+=12
  d.line((x,y,x+w,y),fill=(90,115,145),width=2)
  for t,lab in [(0,'13:00'),(60,'14:00'),(120,'15:00'),(330,'18:30'),(480,'21:00')]:
   xx=x+t/480*w; d.line((xx,y-5,xx,y+5),fill=GOLD,width=2); tx=max(x,min(W-22-width(lab,12),xx-width(lab,12)/2));d.text((tx,y+9),lab,font=F(12),fill=TXT)
  d.text((x,y+41),'18:30＝勝敗の期限（330分）',font=F(14),fill=GOLD)
  d.text((x,y+64),'21:00＝通常の陽動の離脱（480分）',font=F(14),fill=GREY)
  d.text((x,y+86),'現行期限では18:30までに決着する。',font=F(13),fill=GREY)
 def finish(self,title,when,sections):
  self.legend(); py=self.panel(title,when,sections)
  # 図中の文字同士の衝突を検出。線と記号は別に目視する。
  overlaps=[]
  for i,(a,ta) in enumerate(self.boxes):
   for b,tb in self.boxes[i+1:]:
    if min(a[2],b[2])-max(a[0],b[0])>1 and min(a[3],b[3])-max(a[1],b[1])>1: overlaps.append((ta,tb))
  if overlaps: print('重なり候補',self.side,self.phase,overlaps)
  name=f'denali-{self.side}-{self.phase}.png'; self.im.save(os.path.join(HERE,name))
  print(f'{name} | {W}×{H} | 説明欄末尾 {py} | 文字重なり候補 {len(overlaps)}')

# 説明用の進路。戦艦の経由点・陽動の経由点・組の出発点は入力データから。
def pos2(name):
 x,y,z=center(GROUPS[name]); return (x,z)
def show_feints(c,bright=True):
 col=BL if bright else fade(BL,False)
 for side,key in [('左上','陽動左上'),('右下','陽動右下')]:
  Fd=O['feints'][side]
  # via の先の帯は方向の例。実際には砲台の傘の縁を連続して動く。
  post=J['feintPosts'][side]; tip=(post[0],post[2])
  c.arrow([pos2(key)]+[(p[0],p[1]) for p in Fd['via']]+[tip],col,5 if bright else 3)
 c.label(25,593,'陽動帯: 高さ＋74付近（交戦で変動）',col,14)
 c.label(1130,704,'陽動帯: 高さ−79付近',col,14)
 c.label(18,1290,['①13:00（0分） 左上へ','巡洋・駆逐・護衛・母艦、全隊が陽動'],col,15)
 c.label(1100,1324,['①13:00 右下へ','上: ＋高度／下: −高度'],col,15)

def spear1(c,bright=True):
 col=RL if bright else fade(RL,False)
 for key,dest in [('槍1左',(-14,328)),('槍1右',(14,334))]: c.arrow([pos2(key),dest],col,4)
 c.label(80,1134,'②14:00（60分） 槍1 → 待機する戦艦',col,15)

def route(c):
 pts=[(p[0],p[1]) for p in O['nukes']['route']]; mine=(J['mine'][0],J['mine'][2])
 c.arrow([(-14,328)]+pts+[mine],GOLD,5,dash=True)
 c.arrow([(14,334),pts[0]],fade(GOLD,False),3,dash=True)
 c.label(468,1180,'④降下 T＋8分 → 左上の道',GOLD,16)
 for p,xy,txt in zip(pts,[(478,1208),(26,910),(25,775)],['経由1 [-35,230] 高さ＋25','経由2 [-70,85] 高さ＋35','経由3 [-50,40] 高さ＋40']):
  x,y=P(*p); c.d.ellipse((x-4,y-4,x+4,y+4),outline=GOLD,width=2);c.leader((x,y),xy,txt,GOLD,14)
 c.label(497,1380,['③合図 T＝14:10〜15:00','その場で移乗8分（70〜120分から）'],GOLD,15)
 c.label(30,731,'⑤着底 → 全生存艦がそろって15分 → ⑥起爆',GOLD,15)
 # 第29・第30は戦艦と同じ道を護衛する。線を重ねすぎず、合流だけを描く。
 for key in ['第29支隊','第30支隊']: c.arrow([pos2(key),(-35,230)],BL,2,dash=True)

def attacks(c):
 # 組の向きはデータの from、終点は降下経路・鉱山の周辺を模式化。
 for key,dest in [('槍2東下',(-50,40)),('槍2北上',(-50,40))]: c.arrow([pos2(key),dest],RL,4)
 mine=(J['mine'][0],J['mine'][2])
 c.arrow([pos2('霧と鎚'),mine],RL,5)
 c.label(1030,320,['④降下開始で槍2','二方向から核の戦艦へ'],RL,15)
 c.label(25,840,['⑤最初の着底で霧と鎚','W.A.S. → 護衛／重巡洋 → 戦艦'],RL,15)

def screens(c):
 for key,tip in [('西上守備隊',(-110,40)),('東下守備隊',(110,40))]: c.arrow([pos2(key),tip],RL,4)
 c.label(28,950,['随時: 方角守備隊が陽動を追う','生きた砲台の傘の中だけで交戦'],RL,15)
 # 北の応援は起爆の有無と無関係、元の9隻が3以下のとき、左右各4隻。
 for dest in ['西上守備隊','東下守備隊']: c.arrow([pos2('北守備隊'),pos2(dest)],RL,3,dash=True)
 c.label(28,173,['条件A・時刻不定: 北から各4隻を応援','西上・東下の元の9隻が、各3隻以下で','起爆を待つ条件はない'],RL,15)
 # 正面からの移動は西・東の縁と予備、各4。元の隊の34%以上が持ち場外か沈没。
 for start,dest in [('西の拠点','西上守備隊'),('東の拠点','東下守備隊')]: c.arrow([pos2(start),pos2(dest)],fade(RL,False),2,dash=True)
 c.label(1060,922,['随時: 正面から各4隻も応援','元の側面9隻の34%以上が','持ち場外か沈没。壁は残す'],RL,14)

def after_blast(c):
 # 起爆による明示的な切り替えは霧と鎚のみ。
 start=pos2('霧と鎚')
 east=next(f for f in SURFACE if f['name']=='推進器 東2'); north=next(f for f in SURFACE if f['name']=='推進器 北2')
 for f in [east,north]: c.arrow([start,(f['pos'][0],f['pos'][2])],RL,4)
 c.label(25,180,['⑦起爆 F: 霧と鎚の残り → 推進器守備','北を優先し、残る東へ（岩の盾）'],RL,15)
 # 破砕できなければ本軍も宇宙港→誘導推進器の攻撃へ。
 port=next(f for f in SURFACE if f['name']=='宇宙港'); pp=(port['pos'][0],port['pos'][2])
 c.arrow([pos2('本軍'),pp],BL,4)
 for f in [east,north]: c.arrow([pp,(f['pos'][0],f['pos'][2])],BL,3)
 c.label(510,1135,['⑦破砕できなければ本軍も攻撃','宇宙港 → そばの砲台 → 東・北の推進器'],BL,15)
 # 核を3隻失った切り替えは起爆より早くても起きる。
 c.arrow([(-106,53),(-55,20),(20.9,3.7)],BL,4)
 c.arrow([(110,44),(50,15),(20.9,3.7)],BL,4)
 c.label(27,915,['条件B: 核を3隻失えば、陽動は攻撃へ','右下＝誘導推進器／左上＝右下の援護'],BL,15)
 # 槍は起爆の一斉撤退ではなく、型の退く条件が成立した場合だけ。
 for key in ['槍1左','槍1右']:
  c.arrow([pos2(key),(0,-70)],GREY,2,dash=True,hollow=True)
 c.label(1050,280,['条件付き: 槍の退く先は北','盾が半数未満、または','W.A.S. が3割未満のとき'],GREY,15)
 c.label(1060,355,['槍2は「核3隻喪失」で','東・北の推進器守備へ','起爆だけでは一律に切り替えない'],GREY,14)
 # 通常の陽動だけは end 480 で離脱（assault にはこの制限が適用されない）。
 for a,b in [((-106,53),(-145,150),),((110,44),(150,150))]: c.arrow([a,b,(b[0],375)],fade(BL,False),2,hollow=True)
 c.label(38,1310,['⑧21:00（480分） 通常の陽動は南へ離脱','攻撃へ切り替え済みなら、この時刻だけでは退かない'],BL,15)

ACTIVE={
 ('earth',1):{'陽動左上','陽動右下','本軍','第29支隊','第30支隊','西上守備隊','東下守備隊','槍1左','槍1右'},
 ('earth',2):{'本軍','第29支隊','第30支隊','槍2東下','槍2北上','霧と鎚'},
 ('earth',3):{'本軍','第29支隊','第30支隊','陽動左上','陽動右下','霧と鎚','北守備隊','東下守備隊'},
 ('mars',1):{'西の拠点','中の拠点','東の拠点','西上守備隊','東下守備隊','北守備隊'},
 ('mars',2):{'槍1左','槍1右','槍2東下','槍2北上','霧と鎚','西上守備隊','東下守備隊','北守備隊'},
 ('mars',3):{'霧と鎚','北守備隊','西上守備隊','東下守備隊','槍2東下','槍2北上','本軍','陽動左上','陽動右下'},
}

def render(side,phase,title,when,sections):
 c=Chart(side,phase);c.base()
 if phase==1:
  show_feints(c,side=='earth')
  if side=='earth':
   spear1(c)
   for f in GROUPS['本軍']:
    event=next(e['ai'] for e in O['phases'][1]['events'] if f['name'] in e['ai']['fleets'])
    target=event['post']; c.arrow([(f['pos'][0],f['pos'][1]),(target[0],target[1])],BL,3)
   for key,tip in [('第29支隊',(-20,328)),('第30支隊',(20,334))]: c.arrow([pos2(key),tip],BL,3)
   c.label(465,1305,'①13:01（1分） 本軍は待機位置へ',BL,14)
  else:
   for key,tip in [('西上守備隊',(-100,10)),('東下守備隊',(100,10)),('北守備隊',(25,-55))]: c.arrow([pos2(key),tip],RL,3)
   c.label(30,180,['①13:00（0分） 布陣して迎撃','北も起爆前から、砲台の傘の中で戦う'],RL,15)
   c.label(28,1138,'②14:00（60分） 槍1が出る（次図）',fade(RL,False),15)
 if phase==2:
  route(c); attacks(c)
  if side=='mars': spear1(c);screens(c)
  else:
   c.arrow([(-106,53),(-45,10)],fade(BL,False),3)
   c.arrow([(110,44),(43,7)],fade(BL,False),3)
   c.label(1045,925,['戦艦が道の半分を越えるか着底','陽動も一時、砲台の傘内へ攻める'],BL,14)
 if phase==3: after_blast(c)
 c.surface();c.groups(ACTIVE[(side,phase)]);c.finish(title,when,sections)
