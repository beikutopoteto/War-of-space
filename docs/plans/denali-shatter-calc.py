import math
G=6.674e-11; GM=3.986e14; kt=4.184e12
M=1.5e13; a,b,c=1500,1200,1000; Req=(a*b*c)**(1/3); rho=M/(4/3*math.pi*a*b*c)
print("Req m",Req,"rho",rho)
vesc=math.sqrt(2*G*M/Req); g=G*M/Req**2; tff=math.sqrt(Req**3/(G*M))
print("vesc",vesc,"g",g,"tff s",tff, "bind J/kg",0.6*G*M/Req)
for n in [1,2,3,4,5]:
    W=280*n; E=W*kt; e=E/M
    Rc=(11*W**(1/3), 16*W**(1/3))
    print(n,"ships",W,"kt",round(e),"J/kg","cavity m",[round(x) for x in Rc],"fract(6-10Rc) km",round(6*Rc[0]/1e3,2),round(10*Rc[1]/1e3,2),
          "push m/s lo/mid",round(0.5e10*W/M,2),round(1.5e10*W/M,2))
# Benz&Asphaug 1999 basalt 3km/s (cgs)
def QD(Rcm,rho=2.7,Q0=3.5e7,aa=-0.38,B=0.3,bb=1.36): return (Q0*Rcm**aa, B*rho*Rcm**bb)
s,gr=QD(Req*100); print("Denali QD strength J/kg",s/1e4,"gravity",gr/1e4)
# ice
s,gr=QD(Req*100,rho=0.9,Q0=1.6e7,aa=-0.39,B=1.2,bb=1.26); print("ice",s/1e4,gr/1e4)
# Februaria
MF=1.8e16; ReqF=(20e3*10e3*8e3)**(1/3); s,gr=QD(ReqF*100); E=0.5*M*1070**2
print("Feb Req km",ReqF/1e3,"QD",(s+gr)/1e4,"impact E J",E,"Mt",E/4.184e15,"per kg Feb",E/MF, "Feb vesc",math.sqrt(2*G*MF/ReqF))
# hostage orbit: apo 5e8 circ, perigee 7000km
r0=5e8; rp=7e6; aorb=(r0+rp)/2; h=math.sqrt(GM*aorb*(1-((r0-rp)/(r0+rp))**2))
rF=3.8e8; vt=h/rF; v=math.sqrt(GM*(2/rF-1/aorb)); print("at Feb: v",v,"vt",vt,"vr",math.sqrt(v*v-vt*vt))
e=(r0-rp)/(r0+rp)
# max perp speed for hit (rp<6471km)
def hmax(rpm):
    # for orbit through rF with given energy: find h giving periapsis rpm: h^2 = 2 rpm^2 (GM/rpm + eps)
    eps=v*v/2-GM/rF; return math.sqrt(2*rpm**2*(GM/rpm+eps))
vtmax=hmax(6.471e6)/rF; print("vt max for hit",vtmax,"dv needed tang",vt-vtmax)
print("perigee km per m/s", (7e6-6.471e6)/1e3/(vt-vtmax))
dv=2*1070*math.sin(math.radians(5)); print("graze kick m/s",dv)
cth=(vt**2+dv**2-vtmax**2)/(2*vt*dv); print("cone half-angle deg",math.degrees(math.acos(cth)))
# main burn error
for f in [1e-4,3e-4]:
    print("burn err",f, "km", 750*f*83*3600/1e3)
# terminal guidance: walk 28 km by 21:00, graze 23:00, constant from 13:00
X=28e3; I=((10**2-2**2)/2)*3600**2; acc=X/I; print("acc",acc,"dv",acc*8*3600,"F tot",acc*M,"per thr",acc*M/6,"P TW",acc*M/6*2e4/2/1e12,"rock kg/s",acc*M/6/2e4)
# ramp: X(13)=28, X(18.5)=15, X(21)=0
a2=15/((4.5**2-2**2)/2); a1=13/((10**2-4.5**2)/2); print("ramp km/h2 early",a1,"late",a2, "late F/thr N",a2*1e3/3600**2*M/6)
# rubble spread / time to graze
for tig in [15.5,16.5,18.5]:
    T=(23-tig)*3600
    print("ignite",tig,"km per 0.1 m/s",0.1*T/1e3)
# 1.8 km chunk deflect at 79h
