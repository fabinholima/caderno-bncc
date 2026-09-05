import cv2,json,sys
im=cv2.imread(sys.argv[1]);gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);payload,_,_=cv2.QRCodeDetector().detectAndDecode(im)
if not payload: raise ValueError('QR Code não localizado')
c=cv2.HoughCircles(cv2.GaussianBlur(gray,(5,5),1.2),cv2.HOUGH_GRADIENT,1.2,18,param1=100,param2=24,minRadius=7,maxRadius=25);found=[]
if c is not None:
 for x,y,r in c[0]:
  if y>im.shape[0]*.2 and r>=8: found.append((int(x),int(y),int(r)))
found.sort(key=lambda q:(q[1],q[0]));rows=[]
for q in found:
 row=next((a for a in rows if abs(a[0][1]-q[1])<12),None)
 if row is None: rows.append([q])
 else: row.append(q)
answers=[]
valid=[]
for row in rows:
 row=sorted(row)
 # Um cartão compacto possui vários grupos A-E na mesma linha. Cada grupo
 # tem exatamente cinco círculos consecutivos; o cartão clássico é um grupo.
 groups=[row[i:i+5] for i in range(0,len(row),5)]
 for group in groups:
  if len(group)==5:
   gaps=[group[i+1][0]-group[i][0] for i in range(4)]
   if max(gaps)-min(gaps)<12: valid.append(group)
# Numeração do simulado é por coluna (1-15, 16-30...), não por linha visual.
valid.sort(key=lambda row:(sum(q[0] for q in row)//5,row[0][1]))
for n,row in enumerate(valid,1):
 ratios=[]
 for x,y,r in row:
  mask=gray.copy()*0;cv2.circle(mask,(x,y),max(3,int(r*.58)),255,-1);ratios.append(float((gray[mask==255]<130).mean()))
 marked=[chr(65+i) for i,v in enumerate(ratios) if v>.45];status='recognized' if len(marked)==1 else ('blank' if not marked else 'multiple');answers.append({'questionNumber':n,'selectedLabels':marked,'status':status,'fillRatios':[round(v,3) for v in ratios]})
print(json.dumps({'qrPayload':payload,'answers':answers,'requiresReview':not answers or any(a['status']!='recognized' for a in answers)}))
