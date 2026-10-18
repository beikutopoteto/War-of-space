# 第5節「フェブルアーリア防衛戦」の布陣の案（地球側、真上から）。ユーザーが承認した図（2026-10-18）。
# 使い方: python3 docs/plans/februaria-earth.py docs/plans/februaria-earth.png（PIL と IPA ゴシックが要る）
from PIL import Image, ImageDraw, ImageFont
import math
F=lambda s: ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', s)
W,H=1400,1000; S=1.6; cx,cz=W/2, 700   # world (x,z) -> px: (cx + x*S, cz + (z-160)*S)... north up
def P(x,z): return (cx+x*S, 690+(z-160)*S)
im=Image.new('RGB',(W,H),(10,16,28)); d=ImageDraw.Draw(im)
# rock edge (approx z=100 cliff)
d.polygon([P(-420,110),P(420,110),P(420,330),P(-420,330)],fill=(52,52,58))
d.text(P(-410,250),'フェブルアーリアの岩（総基地）',font=F(20),fill=(170,170,170))
# field circle
r=480*S; c=P(0,120); d.ellipse([c[0]-r,c[1]-r,c[0]+r,c[1]+r],outline=(60,90,120),width=1)
# gates
gates=[(-159,164,'西ゲート'),(0,156,'中央ゲート'),(158,162,'東ゲート')]
for x,z,n in gates:
    a,b=P(x-10,z-7),P(x+10,z+7); d.rectangle([a,b],outline=(220,230,240),width=2); d.text(P(x-24,z+18),n,font=F(18),fill=(220,230,240))
# batteries (new): up/down/left/right (+ outer for W/E)
bat=[]
for gx,gz,n in gates:
    for dx,dz in [(0,-35),(0,35),(-35,0),(35,0)]: bat.append((gx+dx,gz+dz))
bat+= [(-229,164),(228,162)]
for x,z in bat:
    px,pz=P(x,z); s=7; d.polygon([(px,pz-s),(px+s,pz),(px,pz+s),(px-s,pz)],fill=(80,170,140),outline=(140,240,200))
# battery reach (horizontal ~130) faint
# ally main line (arc)
pts=[(-300,60),(-280,30),(-240,5),(-170,-15),(-80,-25),(0,-28),(80,-25),(170,-15),(240,5),(280,30),(300,60)]
d.line([P(*p) for p in pts],fill=(110,190,255),width=10,joint='curve')
d.text(P(-60,-75),'友軍の主力の戦線（約230隻）',font=F(22),fill=(140,205,255))
# enemy main
for x in [-230,-120,0,120,230]:
    a=P(x*1.25,-230); b=P(x*1.05,-70); d.line([a,b],fill=(240,90,70),width=6)
    ang=math.atan2(b[1]-a[1],b[0]-a[0]); 
    d.polygon([b,(b[0]-18*math.cos(ang-0.4),b[1]-18*math.sin(ang-0.4)),(b[0]-18*math.cos(ang+0.4),b[1]-18*math.sin(ang+0.4))],fill=(240,90,70))
d.text(P(-150,-250),'共和国の主力（重巡洋・駆逐・鹵獲戦艦 約105隻）',font=F(22),fill=(255,140,120))
# landers dashed curves to gates
def dash(pts,col):
    for i in range(len(pts)-1):
        a,b=P(*pts[i]),P(*pts[i+1]); n=int(math.dist(a,b)/14)
        for k in range(0,n,2):
            t0,t1=k/n,min(1,(k+1)/n); d.line([(a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0),(a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1)],fill=col,width=4)
dash([(-420,-60),(-330,80),(-170,145)],(255,170,90)); dash([(420,-60),(330,80),(165,145)],(255,170,90)); dash([(0,-300),(0,-120),(0,140)],(255,170,90))
d.text(P(-410,-95),'揚陸艦（W.A.S.）は戦線の外や隙間を抜けてゲートへ',font=F(18),fill=(255,190,120))
# player zone
d.rounded_rectangle([P(-250,40),P(250,115)],radius=12,outline=(255,220,120),width=2)
d.text(P(-235,45),'駐屯隊（プレイヤー）: 戦線の援護と、抜けてきた揚陸艦の迎撃',font=F(18),fill=(255,225,140))
# reserve
d.text(P(-90,205),'予備（ウォン中将の戦艦・ユーコン）',font=F(16),fill=(140,205,255))
# legend
d.text((20,20),'第5節の布陣の案（真上から。上が北＝共和国の来る側）',font=F(26),fill=(235,240,245))
px,pz=40,72; s=7; d.polygon([(px,pz-s),(px+s,pz),(px,pz+s),(px-s,pz)],fill=(80,170,140),outline=(140,240,200)); d.text((55,60),'地表の砲台（ゲートの上下左右に1基ずつ。西と東は外側にもう1基）',font=F(18),fill=(200,235,220))
d.rectangle([455,30,1000,62],fill=(10,16,28))
d.text((20,105),'↓ 共和国の主力（重巡洋・駆逐・鹵獲戦艦 約105隻）が北から来て、戦線で撃ち合う',font=F(20),fill=(255,140,120))
d.rectangle([10,12,760,52],fill=(10,16,28)); d.text((20,20),'第5節の布陣の案（真上から。上が北＝共和国の来る側）',font=F(26),fill=(235,240,245))
import sys; im.save(sys.argv[1] if len(sys.argv)>1 else 'februaria-earth.png'); print('ok')
