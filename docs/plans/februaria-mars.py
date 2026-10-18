# 第5節「フェブルアーリア防衛戦」共和国側の作戦説明（段階別、5枚）。februaria-earth.py の絵柄と座標を下敷きにした。
# 地図は februaria-earth と同じ縮尺・向き（1.6 px / 単位、北が上、x=0 が横 700px）。北の雲と出発点（z=-330）を入れるため上へ160px足し、
# 右に説明の欄（480px）を足した。位置・隻数・時刻は data/operations.js の februaria（2026-10-18 時点）から。wos-strategy が作った（2026-10-18）。
# 砲台の傘と友軍の位置は februaria-mars.json（februaria-mars-dump.cjs でゲームから取り出した。高さ -20/0/30/60 のどれかで砲台が届く所）。
# 使い方: python3 docs/plans/februaria-mars.py（同じフォルダに februaria-mars.json が要る）
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, json, os, re
HERE=os.path.dirname(os.path.abspath(__file__))
FONT='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
_fc={}
def F(s):
    if s not in _fc: _fc[s]=ImageFont.truetype(FONT,s)
    return _fc[s]
MW,PW=1400,480; W,H=MW+PW,1150; S=1.6; OY=850
def P(x,z): return (700+x*S, OY+(z-160)*S)
DUMP=json.load(open(os.path.join(HERE,'februaria-mars.json')))
BG=(10,16,28); ROCK=(52,52,58); LBG=(10,16,28,200); RBG=(44,44,50,230)
RED=(240,90,70); RED_L=(255,140,120); ORG=(255,170,90); ORG_L=(255,190,120)
ACE=(255,40,80); ACE_L=(255,150,170); YC=(255,215,120)
BLUE_L=(140,205,255); GRN=(80,170,140); GRN_L=(140,240,200); YEL_L=(255,225,140); WHITE=(235,240,245); GREY=(150,155,165); TXT=(225,228,232)

GATES=[(-159,164,'西ゲート'),(0,156,'中央ゲート'),(158,162,'東ゲート')]
BATS=[(b['pos'][0],b['pos'][2]) for b in DUMP['bat']]

# ---------- 小さな道具 ----------
def tw(t,f): return f.getlength(t)
def wrap(text,f,maxw):   # 字ごとに折る。W.A.S. や 07:44 のような英数字の並びは切らない。行頭に句読点を出さない
    toks=re.findall(r'W\.A\.S\.|[0-9A-Za-z.:%]+|.',text); out=[]; line=''
    for t in toks:
        if tw(line+t,f)>maxw and line.strip():
            if t in '、。）」』・': line+=t; out.append(line); line=''; continue
            out.append(line); line=t.lstrip()
        else: line+=t
    if line: out.append(line)
    return out
def label(d,xy,text,size=15,col=WHITE,bg=LBG,pad=3,anchor='la'):
    f=F(size); w=tw(text,f); h=size; x,y=xy
    if anchor[0]=='m': x-=w/2
    elif anchor[0]=='r': x-=w
    if anchor[1]=='m': y-=h/2
    elif anchor[1]=='b': y-=h
    if bg: d.rectangle([x-pad,y-pad+1,x+w+pad,y+h+pad],fill=bg)
    d.text((x,y),text,font=f,fill=col)
def seg_dash(d,a,b,col,width,on=14,off=10):
    L=math.dist(a,b); t=0
    if L<1: return
    while t<L:
        t1=min(L,t+on); d.line([(a[0]+(b[0]-a[0])*t/L,a[1]+(b[1]-a[1])*t/L),(a[0]+(b[0]-a[0])*t1/L,a[1]+(b[1]-a[1])*t1/L)],fill=col,width=width); t=t1+off
def head(d,a,b,col,size=16,hollow=False):
    ang=math.atan2(b[1]-a[1],b[0]-a[0])
    pts=[b,(b[0]-size*math.cos(ang-0.42),b[1]-size*math.sin(ang-0.42)),(b[0]-size*math.cos(ang+0.42),b[1]-size*math.sin(ang+0.42))]
    if hollow: d.polygon(pts,outline=col,width=3)
    else: d.polygon(pts,fill=col)
def arrow(d,wpts,col,width=5,dash=False,hsize=16,hollow=False,on=14,off=10):
    pts=[P(*p) for p in wpts]
    for i in range(len(pts)-1):
        a,b=pts[i],pts[i+1]
        if i==len(pts)-2:
            L=math.dist(a,b); k=max(0,(L-hsize*.7)/L) if L>0 else 0; b=(a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k)
        if dash: seg_dash(d,a,b,col,width,on,off)
        else: d.line([a,b],fill=col,width=width)
    head(d,pts[-2],pts[-1],col,hsize,hollow)
def tri(d,x,z,n,col,out=None):   # 持ち場の隊: 南（基地の方）を向いた三角。大きさは隻数
    px,py=P(x,z); s=5+n*1.3
    d.polygon([(px-s,py-s*.7),(px+s,py-s*.7),(px,py+s*.8)],fill=col,outline=out)
def diamond(d,x,z,s=7,fill=GRN,out=GRN_L):
    px,py=P(x,z); d.polygon([(px,py-s),(px+s,py),(px,py+s),(px-s,py)],fill=fill,outline=out)
def cross(d,x,z,col=RED,r=13,w=3):
    px,py=P(x,z); d.ellipse([px-r,py-r,px+r,py+r],outline=col,width=w)
    for a,b in [((px-r-5,py),(px-r+5,py)),((px+r-5,py),(px+r+5,py)),((px,py-r-5),(px,py-r+5)),((px,py+r-5),(px,py+r+5))]: d.line([a,b],fill=col,width=w)
def clip_to_map(a,b):   # 枠の外の点 a を、b へ向かう線が枠（|x|<=436）に入る所へ寄せる
    (x0,z0),(x1,z1)=a,b
    if abs(x0)<=436: return a
    t=(abs(x0)-436)/abs(x0-x1); return (x0+(x1-x0)*t, z0+(z1-z0)*t)
def qmark(d,x,z,col=YC):
    px,py=P(x,z); d.ellipse([px-14,py-14,px+14,py+14],outline=col,width=2); d.text((px-tw('?',F(20))/2,py-11),'?',font=F(20),fill=col)

# ---------- 下地（februaria-earth と同じ絵柄） ----------
def base():
    im=Image.new('RGB',(W,H),BG)
    r=480*S; c=P(0,120); ImageDraw.Draw(im).ellipse([c[0]-r,c[1]-r,c[0]+r,c[1]+r],outline=(60,90,120),width=1)
    # 排気の雲（北、z -300〜-320）
    cl=Image.new('RGBA',(W,H),(0,0,0,0)); cd=ImageDraw.Draw(cl)
    for x,z,rr in [(-150,-300,42),(0,-320,46),(150,-300,42)]:
        px,py=P(x,z); R=rr*S*1.15; cd.ellipse([px-R*1.25,py-R*.62,px+R*1.25,py+R*.62],fill=(150,120,140,70))
    cl=cl.filter(ImageFilter.GaussianBlur(14)); im.paste(cl,(0,0),cl)
    # 砲台の傘（ゲームから取り出した届く所）
    cov=DUMP['cov']; um=Image.new('L',(W,H),0); ud=ImageDraw.Draw(um)
    for i in range(len(cov['0'])):
        z=-300+i*5
        for j in range(len(cov['0'][0])):
            if any(cov[a][i][j]=='1' for a in cov):
                px,py=P(-440+j*5,z); ud.rectangle([px-4.5,py-4.5,px+4.5,py+4.5],fill=255)
    um=um.filter(ImageFilter.GaussianBlur(5))
    g=Image.new('RGBA',(W,H),(80,170,140,0)); g.putalpha(um.point(lambda v:int(v*.10))); im.paste(g,(0,0),g)
    e=Image.new('RGBA',(W,H),(110,200,160,0)); e.putalpha(um.point(lambda v:77 if 90<v<150 else 0)); im.paste(e,(0,0),e)
    d=ImageDraw.Draw(im,'RGBA')
    d.polygon([P(-440,110),P(440,110),P(440,340),P(-440,340)],fill=ROCK)
    d.text(P(-425,186),'フェブルアーリアの岩（地球の総基地）',font=F(18),fill=(170,170,170))
    for x,z,n in GATES:
        a,b=P(x-10,z-7),P(x+10,z+7); d.rectangle([a,b],outline=(220,230,240),width=2)
        label(d,P(x,z+17),n,17,(220,230,240),bg=None,anchor='ma')
    for x,z in BATS: diamond(d,x,z,6,(80,170,140,210),(140,240,200,230))
    return im,d

def earth(d,alpha=1.0,lab=None):
    al=DUMP['al']; front=sorted([a for a in al if a['pos'][2]<100],key=lambda a:a['pos'][0]); back=[a for a in al if a['pos'][2]>=100]
    A=int(150*alpha)
    d.line([P(a['pos'][0],a['pos'][2]) for a in front],fill=(110,190,255,A),width=7,joint='curve')
    for a in front:
        px,py=P(a['pos'][0],a['pos'][2]); s=3+a['n']*.25; d.ellipse([px-s,py-s,px+s,py+s],fill=(150,210,255,A+40))
    for a in back:
        px,py=P(a['pos'][0],a['pos'][2]); s=6 if a['n']>1 else 5; d.rectangle([px-s,py-s*.7,px+s,py+s*.7],outline=(140,205,255,A+40),width=2)
    c=P(0,110); r=60*S
    for k in range(0,360,12): d.arc([c[0]-r,c[1]-r,c[0]+r,c[1]+r],k,k+7,fill=(255,220,120,int(170*alpha)),width=2)
    L=dict(line=(-150,4),mid=(62,6),play=(-64,58),playa='ra',bb=None)
    if lab: L.update(lab)
    label(d,P(*L['line']),'地球の戦線（予想 約230隻）',15,BLUE_L,anchor='ma')
    label(d,P(-300,72),'西の端 約90',13,BLUE_L,anchor='ma'); label(d,P(300,72),'東の端 約95',13,BLUE_L,anchor='ma')
    label(d,P(*L['mid']),'真上 約45',13,BLUE_L,anchor='ma')
    label(d,P(*L['play']),L.get('playt','即応部隊（予想 60〜100隻。持ち場なし）'),14,YEL_L,anchor=L['playa'])
    label(d,P(0,199),'戦艦の予備・母艦（予想 約45隻）',14,BLUE_L,bg=(52,52,58,200),anchor='ma')
    if L['bb']: label(d,P(0,214),L['bb'],14,BLUE_L,bg=(52,52,58,200),anchor='ma')

def legend(d,extra=()):
    rows=[('line',RED,'共和国（この段で動く隊）'),('tri',(240,90,70,110),'共和国（もう場にいる隊）'),('dash',ORG,'突撃揚陸艦（W.A.S. を積む）'),
          ('line',(110,190,255,170),'地球（予想）'),('dia',GRN,'地表の砲台'),('area',(80,170,140,90),'砲台の傘（届く所の目安）'),('arc',(255,220,120),'地球の即応部隊（予想）')]+list(extra)
    per=math.ceil(len(rows)/2); y0=H-12-per*22
    for i,(k,c,t) in enumerate(rows):
        x=18+(i//per)*300; yy=y0+(i%per)*22; cx=x+16
        if k=='line': d.line([(x,yy+8),(x+32,yy+8)],fill=c,width=5)
        elif k=='dash': seg_dash(d,(x,yy+8),(x+34,yy+8),c,4,8,6)
        elif k=='tri': d.polygon([(cx-8,yy+2),(cx+8,yy+2),(cx,yy+15)],fill=c)
        elif k=='dia': d.polygon([(cx,yy+1),(cx+7,yy+8),(cx,yy+15),(cx-7,yy+8)],fill=GRN,outline=GRN_L)
        elif k=='area': d.rectangle([x,yy+1,x+32,yy+15],fill=c)
        elif k=='arc': seg_dash(d,(x,yy+8),(x+34,yy+8),c,2,5,4)
        elif k=='ace': d.line([(x,yy+8),(x+32,yy+8)],fill=c,width=8)
        elif k=='hollow': d.line([(x,yy+8),(x+20,yy+8)],fill=c,width=3); head(d,(x,yy+8),(x+32,yy+8),c,14,True)
        elif k=='thin': seg_dash(d,(x,yy+8),(x+34,yy+8),c,3,7,5)
        elif k=='band': d.rectangle([x,yy+3,x+32,yy+13],fill=c)
        d.text((x+44,yy),t,font=F(15),fill=(210,215,222))

# ---------- 説明の欄 ----------
PLAN=[('前衛',0,100,(200,110,100)),('全線',100,160,(220,95,75)),('揚陸の波',160,450,(255,165,90)),('総攻撃',450,600,(255,60,90)),('退き際',600,720,(150,120,130))]
ACT=[('前衛',0,100,(200,110,100)),('全線',100,160,(220,95,75)),('揚陸',160,246,(255,165,90)),('総攻撃',246,378,(255,60,90)),('退',378,392,(150,120,130))]
def timeline(d,y,cur):
    x0,x1=MW+24,W-24; k=(x1-x0)/720
    d.line([(MW+16,y-10),(W-16,y-10)],fill=(70,70,85),width=1)
    d.text((x0,y),'時の流れ（作戦の時計 06:00〜18:00 ＝ 1倍速で17.5分）',font=F(14),fill=(200,200,210)); y+=22
    def bar(yy,segs,hl,lab):
        d.text((x0,yy),lab,font=F(13),fill=(190,190,200)); yy+=17
        for nm,a,b,col in segs:
            on=(nm==hl); c=col if on else tuple(int(v*.45) for v in col)
            d.rectangle([x0+a*k,yy,x0+b*k-1,yy+18],fill=c,outline=(255,255,255) if on else None,width=2 if on else 1)
            f=F(12)
            if tw(nm,f)<(b-a)*k-4: d.text((x0+(a+b)/2*k-tw(nm,f)/2,yy+3),nm,font=f,fill=(20,20,25) if on else (200,200,205))
        return yy+18
    yy=bar(y,PLAN,cur,'計画（この作戦説明）。総攻撃は 13:30 か本隊の3割で')
    for h in range(6,19,2):
        xx=x0+(h-6)*60*k; d.line([(xx,yy),(xx,yy+5)],fill=(160,160,170)); d.text((xx-tw(f'{h}',F(11))/2,yy+6),f'{h}',font=F(11),fill=(160,160,170))
    yy+=22
    yy=bar(yy,ACT,{'前衛':'前衛','全線':'全線','揚陸の波':'揚陸','総攻撃':'総攻撃','退き際':'退'}[cur],'早送りの実際（全研究・即応・駐屯隊80隻）')
    d.text((x0,yy+4),'3回とも本隊の3割で総攻撃（09:54〜10:26）、6割で退却',font=F(12),fill=(170,170,180))
    d.text((x0,yy+20),'（11:38〜12:51）。13:30 の総攻撃と 18:00 には届かない',font=F(12),fill=(170,170,180))

def panel(d,no,title,when,real,sections):
    d.rectangle([MW,0,W,H],fill=(16,20,30)); d.line([(MW,0),(MW,H)],fill=(90,60,60),width=2)
    x=MW+22; y=16; mw=PW-44
    d.text((x,y),'惑星自治軍 地球方面の戦線　作戦オリンポス',font=F(15),fill=(255,150,130)); y+=22
    d.text((x,y),'作戦説明（作戦参謀 → 各エスカドラ）',font=F(14),fill=(200,170,165)); y+=26
    d.text((x,y),f'第{no}段　{title}',font=F(30),fill=WHITE); y+=42
    for l in wrap(when,F(18),mw): d.text((x,y),l,font=F(18),fill=(255,205,140)); y+=24
    for l in wrap(real,F(13),mw): d.text((x,y),l,font=F(13),fill=GREY); y+=18
    y+=10
    for hd,items,col in sections:
        d.rectangle([x,y+3,x+6,y+19],fill=col)
        for l in wrap(hd,F(19),mw-14): d.text((x+12,y),l,font=F(19),fill=col); y+=25
        y+=4
        for it in items:
            if it.startswith('|'): d.text((x+6,y),it[1:],font=F(16),fill=TXT); y+=22; continue
            ls=wrap(it,F(17),mw-24)
            if len(ls)>1 and len(ls[-1].strip())<=3: print('  short last line:',repr(it[:30]),repr(ls[-1]))
            for i,l in enumerate(ls):
                d.text((x+4,y) if i==0 else (x+22,y),('・'+l) if i==0 else l,font=F(17),fill=TXT); y+=23
            y+=4
        y+=8
    return y

def finish(im,d,no,cur,fname,sections,title,when,real):
    y=panel(d,no,title,when,real,sections)
    if y>H-178: print('!! panel overflow',fname,y)
    timeline(d,H-168,cur)
    d.text((14,8),'↑ 北（火星側。共和国の来る側）　真上から見た図',font=F(16),fill=(200,205,215))
    im.save(os.path.join(HERE,fname)); print('saved',fname,'panel y',y)

# ---------- 共和国の隊（data/operations.js の februaria、全線の出来事） ----------
# (名前, 艦種, 隻数, 出る所[x,z], 持ち場 postAt[x,z], 高さ, 軸, 砲台狩り)
LINE=[('第15 重巡','重巡',3,(115,-330),(100,-51),5,'E',0),('第22 重巡','重巡',3,(150,-330),(130,-47),-15,'E',0),
      ('第1 鹵獲戦艦','戦艦',5,(184,-330),(160,-44),-10,'E',0),('第16 重巡','重巡',3,(285,-330),(248,-50),10,'E',1),
      ('第20 重巡','重巡',3,(298,-330),(259,-43),-20,'E',1),('第3 駆逐','駆逐',3,(218,-330),(190,-37),-10,'E',0),
      ('第7 駆逐','駆逐',3,(253,-330),(220,-29),30,'E',0),('第24 駆逐','駆逐',3,(288,-330),(250,-17),15,'E',0),
      ('第8 駆逐','駆逐',3,(322,-330),(280,2),-35,'E',0),
      ('第19 重巡','重巡',3,(-92,-330),(-80,-53),45,'C',0),('第3 重巡','重巡',3,(25,-330),(22,-87),55,'C',1),
      ('第2 鹵獲戦艦','戦艦',5,(-46,-330),(-40,-54),60,'C',0),('第27 重巡','重巡',3,(0,-330),(0,-56),42,'C',0),
      ('第10 駆逐','駆逐',3,(46,-330),(40,-54),42,'C',0),('第23 駆逐','駆逐',3,(92,-330),(80,-53),50,'C',0),
      ('第18 重巡','重巡',3,(-322,-330),(-280,2),5,'W',0),('第25 重巡','重巡',3,(-288,-330),(-250,-17),-15,'W',0),
      ('第3 鹵獲戦艦','戦艦',5,(-253,-330),(-220,-29),-10,'W',0),('第17 重巡','重巡',3,(-285,-330),(-248,-50),10,'W',1),
      ('第5 重巡','重巡',3,(-298,-330),(-259,-43),-20,'W',1),('第21 駆逐','駆逐',3,(-218,-330),(-190,-37),-10,'W',0),
      ('第4 駆逐','駆逐',3,(-184,-330),(-160,-44),30,'W',0),('第6 駆逐','駆逐',3,(-150,-330),(-130,-47),15,'W',0),
      ('第9 駆逐','駆逐',3,(-115,-330),(-100,-51),-35,'W',0)]
# 砲台狩りの順（時刻、隊、狙う砲台）。狙いは pickFoe で持ち場からいちばん近い砲台（北側の砲台、2隊目はゲートの外側）を見積もった
HUNT=[('07:55','第16 重巡',(158,127),'①'),('08:10','第17 重巡',(-159,129),'②'),('09:00','第3 重巡',(0,121),'③'),('09:40','第20 重巡',(193,162),'④'),('10:20','第5 重巡',(-194,164),'⑤')]
def line_faint(d,alpha=110):
    for nm,k,n,sp,po,alt,ax,hunt in LINE: tri(d,po[0],po[1],n,(240,90,70,alpha))
def reserve_note(d,x=670):
    label(d,(x,82),'予備オリンポス（幕の陰）: 重巡洋12・揚陸艦6',15,(255,150,130),anchor='ra')
    label(d,(x,102),'第4段まで雲から出さない',13,(255,150,130),anchor='ra')

# =====================================================================
def phase1():
    im,d=base(); earth(d); reserve_note(d)
    for x in (-150,150): label(d,P(x,-282),'排気の幕',13,(200,180,195),bg=None,anchor='ma')
    W2=(255,120,95)
    arrow(d,[(300,-330),(261,4)],RED,6); arrow(d,[(-10,-330),(-10,-42)],RED,6)
    arrow(d,[(-300,-330),(-261,4)],W2,5,dash=True,on=18,off=8); arrow(d,[(12,-330),(12,-42)],W2,5,dash=True,on=18,off=8)
    arrow(d,[(330,-330),(287,10)],W2,5,dash=True,on=18,off=8)
    label(d,P(282,-262),'① 06:10 第4 重巡洋 3隻',15,RED_L,anchor='ra'); label(d,P(282,-246),'東の端の戦線へ',14,RED_L,anchor='ra')
    label(d,P(338,-182),'② 06:57',15,(255,160,130)); label(d,P(338,-166),'第5 駆逐 3隻',14,(255,160,130)); label(d,P(338,-150),'低く（岩すれすれ）',14,(255,160,130))
    label(d,P(-22,-250),'① 06:12 第2 駆逐 3隻',15,RED_L,anchor='ra'); label(d,P(-22,-234),'高く（真上の空）',14,RED_L,anchor='ra')
    label(d,P(24,-196),'② 06:55 第6 重巡洋 3隻',15,(255,160,130)); label(d,P(24,-180),'高く、同じ所へ',14,(255,160,130))
    label(d,P(-270,-262),'② 06:55 第7 重巡洋 3隻',15,(255,160,130)); label(d,P(-270,-246),'西の端の戦線へ',14,(255,160,130))
    for x,z in [(-261,4),(261,4),(0,-42)]:
        px,py=P(x,z); d.ellipse([px-26,py-26,px+26,py+26],outline=(255,200,120),width=2)
    label(d,P(-26,-122),'測る: 戦線の位置と厚さ・砲台の傘の縁',16,(255,215,150),anchor='ra')
    label(d,P(-26,-106),'即応部隊がどこへ来るか',16,(255,215,150),anchor='ra')
    arrow(d,[(232,-2),(236,-78)],(110,190,255,190),3,dash=True,hsize=12,on=8,off=6)
    label(d,P(226,-82),'地球が追ってくれば傘の外',14,BLUE_L,anchor='ra')
    legend(d,[('thin',(255,120,95),'② 2回目の前衛（06:55）')])
    sec=[('狙い',['地球の戦線の位置と厚さ、砲台の傘の縁を測る','即応部隊がどこへ駆けつけるかを見る',
               '東の端の戦線を北へ引き出しておく（本隊の東軸が 07:40 に当たる）'],(255,170,120)),
         ('動き（前衛 計15隻。本隊に数えない）',['|06:10　東の端へ 重巡洋3','|06:12　真上の高い所へ 駆逐3','|06:55　西の端へ 重巡洋3／真上へ 重巡洋3','|06:57　東の端の低い所へ 駆逐3',
               '前衛は戻らない。撃ち続け、見たものを本隊へ送れ','予備オリンポスは幕の陰から出さない'],(255,150,130)),
         ('勝ち筋',['地球が傘から出て前衛を追えば、傘の外で削れる'],(140,230,170)),
         ('危険',['地球の戦線は前衛の約15倍。前衛は沈む前提','西の端の厚さは 06:55 まで分からない'],(255,120,120)),
         ('地球の出方（予想）',['戦線は傘の中で受け、持ち場から遠くへは追わない','即応部隊は押された所へ来る','戦艦の予備と母艦はゲートの後ろで動かない'],(140,205,255))]
    finish(im,d,1,'前衛','februaria-mars-1.png',sec,'前衛の探り','06:00〜07:40（作戦の時計）','1倍速で約2.4分（戦闘の1秒＝作戦の約0.7分）')

def phase2():
    im,d=base(); earth(d,lab=dict(play=(-62,92),playt='即応部隊（予想）')); reserve_note(d)
    band=Image.new('L',(W,H),0); bd=ImageDraw.Draw(band)
    for ax in 'WCE':   # 軸ごとの進路の帯（北ほど薄い）
        u=[p for p in LINE if p[6]==ax]; sx=[p[3][0] for p in u]; px_=[p[4][0] for p in u]
        bd.polygon([P(min(sx),-330),P(max(sx),-330),P(max(px_)+8,-60),P(min(px_)-8,-60)],fill=255)
    grad=Image.linear_gradient('L').resize((W,H)); band=Image.composite(grad.point(lambda v:int(4+v*.10)),Image.new('L',(W,H),0),band)
    lay=Image.new('RGBA',(W,H),(240,90,70,0)); lay.putalpha(band); im.paste(lay,(0,0),lay); d=ImageDraw.Draw(im,'RGBA')
    for ax in 'WCE':
        u=[p for p in LINE if p[6]==ax]; sx=[p[3][0] for p in u]; px_=[p[4][0] for p in u]
        arrow(d,[((min(sx)+max(sx))/2,-300),((min(px_)+max(px_))/2,-138)],(240,90,70,210),10,hsize=26)
    for nm,k,n,sp,po,alt,ax,hunt in LINE: tri(d,po[0],po[1],n,(255,60,60) if hunt else RED,out=(255,235,210) if hunt else None)
    for a,b in [((-185,-20),(-170,95)),((0,-35),(0,95)),((185,-20),(170,95))]:
        arrow(d,[a,b],(255,140,120,120),12,hsize=26)
    label(d,P(-14,30),'押し込み（ゆっくり）',14,RED_L,anchor='ra')
    for t,u,(bx,bz),mk in HUNT:
        src=[p for p in LINE if p[0]==u][0][4]
        arrow(d,[src,(bx,bz-14)],(255,80,80),3,dash=True,hsize=13,on=7,off=6); cross(d,bx,bz,(255,90,90),12,3)
    for t,u,(bx,bz),mk in HUNT:
        off={'①':(16,-34),'②':(-16,-34),'③':(16,-36),'④':(18,-10),'⑤':(-18,-10)}[mk]
        label(d,P(bx+off[0],bz+off[1]),f'{mk}{t}',15,(255,205,195),anchor='la' if off[0]>0 else 'ra')
    label(d,P(-250,-172),'西軸 アルシア 29隻',17,RED_L,anchor='ma'); label(d,P(-250,-156),'07:50〜07:54',14,RED_L,anchor='ma')
    label(d,P(0,-172),'真上軸 パヴォニス 20隻',17,RED_L,anchor='ma'); label(d,P(0,-156),'07:44〜07:48・高く',14,RED_L,anchor='ma')
    label(d,P(250,-172),'東軸 アスクレウス 29隻',17,RED_L,anchor='ma'); label(d,P(250,-156),'07:40〜07:44',14,RED_L,anchor='ma')
    for nm,k,n,sp,po,alt,ax,hunt in LINE:
        if k=='戦艦': label(d,P(po[0],po[1]-13),'鹵獲戦艦5',12,(255,215,200),anchor='mb')
    label(d,P(22,-101),'砲台狩り',12,(255,215,200),anchor='mb')
    label(d,P(-262,-64),'砲台狩り2隊',12,(255,215,200),anchor='mb'); label(d,P(262,-64),'砲台狩り2隊',12,(255,215,200),anchor='mb')
    label(d,P(0,-124),'列は傘の縁（地球の戦線の約30北）に並ぶ',15,(170,235,200),anchor='ma')
    legend(d,[('tri',(255,60,60),'砲台狩り（重巡洋3隻）'),('thin',(255,80,80),'①〜⑤ 砲台狩りの順と時刻')])
    sec=[('狙い',['三軸を14分のうちに傘の縁へ並べる（東 07:40、真上 07:44、西 07:50）','列は縁からゲートへ少しずつ寄る。地球の戦線に手を空けさせない',
               '砲台狩りは縁で待ち、合図で1隊ずつ、北側の砲台から沈める'],(255,170,120)),
         ('兵力（本隊78隻。予備の重巡洋12と合わせて90）',['|東軸　重巡洋6・鹵獲戦艦5・駆逐12・狩り6','|真上　重巡洋6・鹵獲戦艦5・駆逐6・狩り3','|西軸　東軸と同じ（29隻）'],(255,150,130)),
         ('決まり',['傘の届く所はゆっくり、傘が欠けた所は速く寄る','地球が1.5倍で囲む所では止まる','砲台狩りは待つあいだも、60以内に来た艦を撃つ'],(255,200,150)),
         ('勝ち筋',['砲台が沈むごとに傘が欠け、そこから列が速くなる'],(140,230,170)),
         ('危険',['縁は傘の届く所。砲台は約30分ごとに斉射し、1発で小型艦が1隻沈む','地球の戦線は各軸で2.5〜3倍。列は止められやすい'],(255,120,120)),
         ('地球の出方（予想）',['戦線は持ち場を守り、傘から大きくは出ない','即応部隊は押されている方面へ来る'],(140,205,255))]
    finish(im,d,2,'全線','februaria-mars-2.png',sec,'全線の展開と砲台狩り','07:40〜08:40（砲台狩りは 10:20 まで）','1倍速で約1.5分（砲台狩りの終わりまで約3.9分）')

def phase3():
    im,d=base(); earth(d); line_faint(d,120); reserve_note(d,1388)
    G={'W':(-162,150),'C':(3,146),'E':(161,150)}
    for sp,g in [((520,60),'E'),((520,130),'E'),((-520,60),'W'),((-520,130),'W')]:
        arrow(d,[clip_to_map(sp,G[g]),G[g]],ORG,5,dash=True,hsize=16)
    label(d,P(434,36),'東の外から 08:40・11:20',15,ORG_L,anchor='ra'); label(d,P(434,52),'10:00 は低く（岩すれすれ）',14,ORG_L,anchor='ra')
    label(d,P(-434,36),'西の外から 09:20・10:40',15,ORG_L); label(d,P(-434,52),'12:00 は低く（岩すれすれ）',14,ORG_L)
    arrow(d,[(0,-232),(0,-60),(3,140)],ORG,5,dash=True,hsize=16)
    label(d,P(8,-232),'真上の高い所から',15,ORG_L); label(d,P(8,-216),'08:40・10:00・11:20',14,ORG_L)
    for cx,cz,ex,t in [(-150,-290,-150,'09:23'),(150,-290,150,'10:43'),(-60,-322,-60,'12:03')]:
        arrow(d,[(cx,cz),(ex,-206)],YC,4,dash=True,hsize=13,on=6,off=6); qmark(d,ex,-190); label(d,P(ex+14,-212),t,14,YC,anchor='la')
    label(d,P(-150,-164),'北の雲から: 出るときに、地球の艦が',15,YC,anchor='ma'); label(d,P(-150,-148),'いちばん少ないゲートへ（行き先は前もって決めない）',14,YC,anchor='ma')
    for x,z,n in GATES:   # シールド（ゲートの上の弧）
        px,py=P(x,z); d.arc([px-30,py-26,px+30,py+22],200,340,fill=(255,200,120),width=3)
    label(d,P(0,236),'シールドを削りきる → 2つは中を爆破して塞がれる → 最後のゲートの輪に揚陸艦を止め、W.A.S. を中へ',15,(255,215,160),bg=RBG,anchor='ma')
    legend(d,[('thin',YC,'北の雲から、守りの薄いゲートへ'),('band',(255,200,120),'ゲートのシールド（弧）')])
    sec=[('狙い',['地球の即応部隊は一つ。毎回2か所へ同時に出し、どちらかを通す','揚陸艦は戦線の外（両端の外側、岩すれすれ）と真上の高い所を抜ける',
               '全艦、手が空いたらゲートのシールドを撃て。2つを塞がせ、最後のゲートで W.A.S. を降ろす'],(255,170,120)),
         ('波（40分おきに2組）',['|各組 揚陸艦3隻・W.A.S. 18機','|08:40　東の外→東ゲート／真上→中央','|09:20　西の外→西ゲート／北の雲→薄い所','|10:00　東の外（低く）→東／真上→中央',
               '|10:40　西の外→西／北の雲→薄い所','|11:20　東の外→東／真上→中央','|12:00　西の外（低く）→西／北の雲→薄い所'],(255,190,120)),
         ('勝ち筋',['最後のゲートの輪に残った揚陸艦は、1隻で2分ごとに W.A.S. を1機降ろす','守備隊は W.A.S. 200機で尽きる'],(140,230,170)),
         ('危険',['砲台と強化歩兵は揚陸艦を先に撃つ','揚陸艦を失うほど W.A.S. が減る（第5段の退く合図）'],(255,120,120)),
         ('地球の出方（予想）',['即応部隊は護衛より揚陸艦を先に狙う','塞がれたゲートの前の戦線は、残りのゲートへ移る'],(140,205,255))]
    finish(im,d,3,'揚陸の波','februaria-mars-3.png',sec,'揚陸の波','08:40〜13:30（6回。12組・36隻）','1倍速で約7分（計画どおりなら）')

def phase4():
    im,d=base(); earth(d,lab=dict(line=(-285,40),mid=(100,8),play=(-62,92),playt='即応部隊（予想）',bb='→ 総攻撃で中央の前へ出る（予想）。修理を終えたフリゲートも加わる')); line_faint(d,90)
    for a,b in [((-210,-40),(-170,118)),((-120,-50),(-152,114)),((-70,-56),(-30,115)),((210,-40),(170,118)),((120,-50),(152,114)),((70,-56),(30,115))]:
        arrow(d,[a,b],RED,6,hsize=18)
    label(d,P(-262,-112),'西軸と砲台狩り 全部前へ',15,RED_L,anchor='ma'); label(d,P(262,-112),'東軸と砲台狩り 全部前へ',15,RED_L,anchor='ma')
    arrow(d,[(-40,-92),(-8,140)],ACE,8,hsize=20); arrow(d,[(40,-92),(8,140)],ACE,8,hsize=20)
    label(d,P(0,-136),'アルバレス隊（局地強襲 第7・第8、4隻ずつ・W.A.S. 40機ずつ）',16,ACE_L,anchor='ma')
    label(d,P(0,-120),'真上の高い所から中央ゲートへ。W.A.S. は並の3倍の強さ',14,ACE_L,anchor='ma')
    for cx,cz in [(-150,-290),(0,-310),(150,-290)]:
        arrow(d,[(cx,cz),(cx,-212)],YC,6,hsize=18); qmark(d,cx,-194)
    label(d,(16,44),'＋20分 予備オリンポス（重巡洋12・揚陸艦6 W.A.S. 36）',16,YC)
    label(d,(16,64),'地球の予備が動いたあと、守りの薄いゲートへ',14,YC)
    for x,z in [(-25,165),(25,165),(-60,175),(60,175)]:
        arrow(d,[(x,z),(x+(-5 if x<0 else 5),z-45)],(140,205,255,210),3,dash=True,hsize=11,on=6,off=5)
    legend(d,[('ace',ACE,'アルバレス隊（赤い隊）'),('line',YC,'予備オリンポス（＋20分）')])
    sec=[('合図',['13:30 か、本隊の3割（27隻）を失ったときの、早いほう。待つほど削られる'],(255,200,150)),
         ('狙い',['列も砲台狩りも全部前へ。押し込みをやめ、ゲートへ','アルバレス隊は真上の高い所から中央ゲートへ',
               '地球は戦艦の予備（約40隻）を中央の前へ出すと読む。その20分後、予備オリンポスを守りの薄いゲートへ'],(255,170,120)),
         ('勝ち筋',['地球の予備を引き出し、その空いた所へ予備を当てる','アルバレス隊の W.A.S. 80機で、守備隊を4割削れる'],(140,230,170)),
         ('危険',['全部を前に出すので、ここで失う数がいちばん多い','傘の中へ入る。残った砲台はこの段で全部撃ってくる','本隊の6割を失えば退く（第5段）'],(255,120,120)),
         ('地球の出方（予想）',['戦艦の予備が中央の前へ。修理を終えたフリゲートが即応部隊に入る'],(140,205,255))]
    finish(im,d,4,'総攻撃','februaria-mars-4.png',sec,'総攻撃','13:30（または本隊の3割を失ったとき）','1倍速で約2.5〜3.5分（早送りの総攻撃〜退却）。予備は＋20分＝約30秒後')

def phase5():
    im,d=base(); earth(d,lab=dict(line=(-100,4))); line_faint(d,70)
    for a,b in [((-200,40),(-230,-250)),((0,40),(0,-250)),((200,40),(230,-250)),((-340,90),(-380,-200)),((340,90),(380,-200))]:
        arrow(d,[a,b],(255,140,120),4,hsize=22,hollow=True)
    label(d,P(0,-280),'撃つのをやめ、W.A.S. を戻して北の幕へ',17,RED_L,anchor='ma')
    label(d,P(-110,-150),'地球は岩から離れない（追ってこない）と読む',15,BLUE_L,anchor='ma')
    gx,gy=560,P(0,232)[1]-28; gw=822
    d.rounded_rectangle([gx,gy,gx+gw,gy+176],radius=10,fill=(36,36,42,240),outline=(120,100,100))
    d.text((gx+14,gy+8),'退く合図の数え方（左から、失った数）',font=F(16),fill=WHITE)
    X=gx+130; BW=420
    def gauge(y,lab,total,mark,col,mlab,right,note):
        d.text((gx+14,y),lab,font=F(15),fill=TXT)
        k=BW/total; d.rectangle([X,y,X+BW,y+18],outline=(200,200,210)); d.rectangle([X+1,y+1,X+mark*k,y+17],fill=col)
        d.line([(X+mark*k,y-6),(X+mark*k,y+24)],fill=WHITE,width=2)
        d.text((X+mark*k-tw(mlab,F(13))/2,y-22),mlab,font=F(13),fill=WHITE)
        d.text((X+BW+12,y+1),right,font=F(14),fill=(255,200,190))
        d.text((X,y+24),note,font=F(12),fill=GREY)
    gauge(gy+58,'本隊 90隻',90,54,(240,90,70,210),'54隻（6割）','ここまで失えば退く','列78（東29・真上20・西29）＋予備の重巡洋12。前衛15と揚陸艦は数えない')
    gauge(gy+124,'W.A.S. 332機',332,133,(255,170,90,210),'133機（残り199）','ここまで失えば退く','揚陸艦42隻×6機＝252＋アルバレス隊80。133機は揚陸艦なら約22隻ぶん。守備隊を削ったぶん、失ってよい数は増える')
    legend(d,[('hollow',(255,140,120),'退く向き')])
    sec=[('退く合図（どれか一つ）',['本隊90隻の6割、54隻を失った（前衛と揚陸艦の損害は数えない）',
               'W.A.S. の残り（載っている分・飛んでいる分・これから出す分）が、基地守備隊を削りきる数を切った（はじめ200機。守備隊が減れば、その数も減る）','18:00 になった'],(255,200,150)),
         ('退き方',['撃つのをやめ、W.A.S. を戻して北の幕へ','輪の中の揚陸艦も降ろすのをやめる','地球は岩から離れない。追ってこないと読む'],(255,170,120)),
         ('次',['予備の案（別紙）に切り替える'],(200,180,200)),
         ('この作戦の勘定',['勝つには、W.A.S. 200機を最後のゲートへ入れること','砲台と揚陸艦の損害が先に積もれば、取れない'],(140,230,170))]
    finish(im,d,5,'退き際','februaria-mars-5.png',sec,'退き際','退く合図が出たとき（遅くとも 18:00）','合図から約20秒（1倍速）で戦場を離れる')

if __name__=='__main__':
    os.chdir(HERE)
    phase1(); phase2(); phase3(); phase4(); phase5()
